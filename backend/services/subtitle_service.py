from __future__ import annotations

import asyncio
import html
import json
import logging
import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import urlopen
import xml.etree.ElementTree as ET

from backend.config import get_settings

try:
    from youtube_transcript_api import YouTubeTranscriptApi  # type: ignore
except Exception:  # pragma: no cover - optional dependency fallback
    YouTubeTranscriptApi = None  # type: ignore

logger = logging.getLogger(__name__)


class SubtitleUnavailableError(RuntimeError):
    def __init__(self, message: str, *, code: str = "subtitle_unavailable"):
        super().__init__(message)
        self.code = code


@dataclass(slots=True)
class SubtitlePayload:
    title: str
    youtube_url: str
    video_id: str
    thumbnail_url: str
    subtitle_source: str
    raw_transcript: str


def extract_video_id(youtube_url: str) -> str:
    parsed = urlparse(youtube_url.strip())
    host = parsed.netloc.lower()

    if "youtu.be" in host:
        candidate = parsed.path.strip("/").split("/")[0]
    elif "youtube.com" in host:
        query = parse_qs(parsed.query)
        candidate = query.get("v", [""])[0]
        if not candidate and "/shorts/" in parsed.path:
            candidate = parsed.path.split("/shorts/", 1)[1].split("/", 1)[0]
    else:
        candidate = ""

    if not re.fullmatch(r"[A-Za-z0-9_-]{6,20}", candidate):
        raise ValueError("Invalid YouTube URL")
    return candidate


def _fallback_title(video_id: str) -> str:
    return f"Learning Video {video_id[:6].upper()}"


def _fetch_video_title(youtube_url: str) -> str | None:
    endpoint = f"https://www.youtube.com/oembed?{urlencode({'url': youtube_url.strip(), 'format': 'json'})}"
    try:
        with urlopen(endpoint, timeout=5) as response:
            payload = json.loads(response.read().decode("utf-8"))
            title = str(payload.get("title", "")).strip()
            return title or None
    except Exception as exc:
        logger.warning("oembed title lookup failed for %s: %s", youtube_url, exc)
        return None


def _normalize_transcript_segments(items) -> str:
    parts = []
    for row in items:
        text = ""
        if isinstance(row, dict):
            text = str(row.get("text", ""))
        else:
            text = str(getattr(row, "text", ""))
        text = text.strip()
        if text:
            parts.append(text.replace("\n", " "))
    return " ".join(parts).strip()


def _normalize_timedtext_xml(xml_payload: str) -> str:
    xml_payload = (xml_payload or "").strip()
    if not xml_payload:
        return ""
    try:
        root = ET.fromstring(xml_payload)
    except Exception:
        return ""
    parts: list[str] = []
    for node in root.findall(".//text"):
        text = "".join(node.itertext()).strip()
        if text:
            parts.append(html.unescape(text).replace("\n", " "))
    return " ".join(parts).strip()


def _fetch_timedtext_transcript(video_id: str) -> tuple[str, str]:
    candidates = (
        f"https://www.youtube.com/api/timedtext?lang=en&v={video_id}",
        f"https://www.youtube.com/api/timedtext?lang=en&kind=asr&v={video_id}",
        f"https://www.youtube.com/api/timedtext?lang=en-US&kind=asr&v={video_id}",
        f"https://video.google.com/timedtext?lang=en&v={video_id}",
        f"https://video.google.com/timedtext?lang=en&kind=asr&v={video_id}",
    )
    for endpoint in candidates:
        try:
            with urlopen(endpoint, timeout=5) as response:
                body = response.read().decode("utf-8", errors="ignore")
            text = _normalize_timedtext_xml(body)
            if text:
                return text, "youtube_auto"
        except Exception:
            continue
    raise SubtitleUnavailableError("No subtitles are available for this video.", code="no_subtitles")


def _iter_transcripts(transcript_list: Any) -> list[Any]:
    try:
        return list(transcript_list)
    except Exception:
        return []


def _api_client():
    # v1.x exposes an instance API, older versions used class/static methods.
    try:
        return YouTubeTranscriptApi()  # type: ignore[misc]
    except Exception:
        return YouTubeTranscriptApi  # type: ignore[return-value]


def _fetch_from_transcript_obj(transcript_obj, source: str) -> tuple[str, str]:
    fetched = transcript_obj.fetch()
    text = _normalize_transcript_segments(fetched)
    if not text:
        raise RuntimeError("Transcript fetch returned empty content")
    return text, source


def _fetch_generated_transcript_any_language(transcript_list: Any) -> tuple[str, str]:
    generated_tracks = [
        transcript
        for transcript in _iter_transcripts(transcript_list)
        if bool(getattr(transcript, "is_generated", False))
    ]

    # First prefer direct english generated captions.
    for transcript in generated_tracks:
        if str(getattr(transcript, "language_code", "")).lower() == "en":
            try:
                return _fetch_from_transcript_obj(transcript, "youtube_auto")
            except Exception:
                continue

    # Then generated captions translated to english where supported.
    for transcript in generated_tracks:
        if bool(getattr(transcript, "is_translatable", False)):
            try:
                translated = transcript.translate("en")
                return _fetch_from_transcript_obj(translated, "youtube_translated")
            except Exception:
                continue

    # Finally, accept non-english generated captions as-is.
    for transcript in generated_tracks:
        try:
            return _fetch_from_transcript_obj(transcript, "youtube_auto")
        except Exception:
            continue

    raise SubtitleUnavailableError(
        "Auto-generated subtitles are not available for this video.",
        code="no_subtitles",
    )


def _classify_caption_error(exc: Exception) -> SubtitleUnavailableError:
    name = exc.__class__.__name__.lower()
    message = str(exc or "").strip()
    text = f"{name} {message}".lower()

    if "invalid youtube url" in text or "invalidvideoid" in text:
        return SubtitleUnavailableError("Invalid YouTube URL.", code="invalid_url")
    if "youtube-transcript-api is not installed" in text or "modulenotfounderror" in text:
        return SubtitleUnavailableError(
            "Subtitle service is not configured on the server (missing youtube-transcript-api). Please contact admin.",
            code="dependency_missing",
        )
    if "timeout" in text:
        return SubtitleUnavailableError(
            "Subtitle fetch timed out. Check network connectivity and retry.",
            code="network_timeout",
        )

    network_markers = (
        "requestblocked",
        "ipblocked",
        "too many requests",
        "rate limit",
        "forbidden",
        "http error 403",
        "http error 429",
        "proxy",
        "connection refused",
        "name or service not known",
        "temporary failure in name resolution",
        "connection reset",
        "certificate verify failed",
    )
    if any(marker in text for marker in network_markers):
        return SubtitleUnavailableError(
            "Could not fetch YouTube subtitles from this server. The video may have captions, but outbound access may be blocked by firewall/proxy/network policy or cloud-IP restrictions.",
            code="network_policy_blocked",
        )

    subtitle_missing_markers = (
        "transcriptsdisabled",
        "notranscriptfound",
        "nosubtitles",
        "no subtitles",
        "video unavailable",
        "videounavailable",
        "videounplayable",
        "age restricted",
    )
    if any(marker in text for marker in subtitle_missing_markers):
        return SubtitleUnavailableError("No subtitles are available for this video.", code="no_subtitles")

    return SubtitleUnavailableError("No subtitles are available for this video.", code="subtitle_unavailable")


def _fetch_transcript_sync(video_id: str) -> tuple[str, str]:
    last_error: Exception | None = None

    if YouTubeTranscriptApi is None:
        last_error = RuntimeError("youtube-transcript-api is not installed")
    else:
        # Prefer manual English captions, then generated/translated english.
        api = _api_client()

        # New/legacy listing APIs.
        transcript_list = None
        try:
            if hasattr(api, "list"):
                transcript_list = api.list(video_id)
            elif hasattr(api, "list_transcripts"):
                transcript_list = api.list_transcripts(video_id)
        except Exception as exc:
            last_error = exc
            logger.warning("youtube transcript list failed for %s: %s", video_id, exc)

        if transcript_list is not None:
            try:
                manual = transcript_list.find_manually_created_transcript(["en"])
                return _fetch_from_transcript_obj(manual, "youtube_manual")
            except Exception as exc:
                last_error = exc
            try:
                generated = transcript_list.find_generated_transcript(["en"])
                return _fetch_from_transcript_obj(generated, "youtube_auto")
            except Exception as exc:
                last_error = exc
            try:
                preferred = transcript_list.find_transcript(["en"])
                src = "youtube_auto" if getattr(preferred, "is_generated", False) else "youtube_manual"
                return _fetch_from_transcript_obj(preferred, src)
            except Exception as exc:
                last_error = exc
            try:
                translated = transcript_list.find_transcript(["vi", "es", "fr", "de", "ja", "ko"])
                return _fetch_from_transcript_obj(translated.translate("en"), "youtube_translated")
            except Exception as exc:
                last_error = exc
            try:
                return _fetch_generated_transcript_any_language(transcript_list)
            except Exception as exc:
                last_error = exc

        # v1.x direct API.
        try:
            if hasattr(api, "fetch"):
                fetched = api.fetch(video_id, languages=["en"])
                text = _normalize_transcript_segments(fetched)
                if text:
                    return text, "youtube_auto"
        except Exception as exc:
            last_error = exc
            logger.warning("youtube transcript fetch() failed for %s: %s", video_id, exc)

        # Compatibility fallback for older API surface.
        try:
            rows = api.get_transcript(video_id, languages=["en"])  # type: ignore[attr-defined]
            text = _normalize_transcript_segments(rows)
            if text:
                return text, "youtube_auto"
        except Exception as exc:
            last_error = exc

    try:
        return _fetch_timedtext_transcript(video_id)
    except Exception as exc:
        if last_error is None:
            last_error = exc

    raise _classify_caption_error(last_error or RuntimeError("subtitle unavailable"))


async def _run_in_thread_with_timeout(func, timeout_seconds: float, *args):
    return await asyncio.wait_for(
        asyncio.to_thread(func, *args),
        timeout=timeout_seconds,
    )


async def build_subtitle_payload(youtube_url: str) -> SubtitlePayload:
    settings = get_settings()
    try:
        video_id = extract_video_id(youtube_url)
    except ValueError as exc:
        raise SubtitleUnavailableError("Invalid YouTube URL.", code="invalid_url") from exc

    try:
        title = await _run_in_thread_with_timeout(
            _fetch_video_title,
            settings.subtitle_title_timeout_seconds,
            youtube_url,
        )
    except asyncio.TimeoutError:
        logger.warning(
            "subtitle title lookup timed out for %s after %.1fs",
            youtube_url,
            settings.subtitle_title_timeout_seconds,
        )
        title = None
    if not title:
        title = _fallback_title(video_id)
    thumbnail_url = f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg"

    try:
        transcript, subtitle_source = await _run_in_thread_with_timeout(
            _fetch_transcript_sync,
            settings.subtitle_fetch_timeout_seconds,
            video_id,
        )
    except asyncio.TimeoutError as exc:
        raise SubtitleUnavailableError(
            "Subtitle fetch timed out. Check network connectivity and retry.",
            code="network_timeout",
        ) from exc
    except SubtitleUnavailableError:
        raise
    except Exception as exc:
        logger.warning("subtitle fetch failed for %s (%s): %s", youtube_url, video_id, exc)
        raise _classify_caption_error(exc) from exc

    transcript = transcript[: settings.test_transcript_max_chars].strip()
    if not transcript:
        raise SubtitleUnavailableError("No subtitles are available for this video.", code="no_subtitles")

    return SubtitlePayload(
        title=title,
        youtube_url=youtube_url.strip(),
        video_id=video_id,
        thumbnail_url=thumbnail_url,
        subtitle_source=subtitle_source,
        raw_transcript=transcript,
    )
