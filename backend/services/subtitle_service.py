from __future__ import annotations

import asyncio
import json
import logging
import re
from dataclasses import dataclass
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import urlopen

from backend.config import get_settings

try:
    from youtube_transcript_api import YouTubeTranscriptApi  # type: ignore
except Exception:  # pragma: no cover - optional dependency fallback
    YouTubeTranscriptApi = None  # type: ignore

logger = logging.getLogger(__name__)


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


def _fetch_transcript_sync(video_id: str) -> tuple[str, str]:
    if YouTubeTranscriptApi is None:
        raise RuntimeError("youtube-transcript-api is not installed")

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
        logger.warning("youtube transcript list failed for %s: %s", video_id, exc)

    if transcript_list is not None:
        try:
            manual = transcript_list.find_manually_created_transcript(["en"])
            return _fetch_from_transcript_obj(manual, "youtube_manual")
        except Exception:
            pass
        try:
            generated = transcript_list.find_generated_transcript(["en"])
            return _fetch_from_transcript_obj(generated, "youtube_auto")
        except Exception:
            pass
        try:
            preferred = transcript_list.find_transcript(["en"])
            src = "youtube_auto" if getattr(preferred, "is_generated", False) else "youtube_manual"
            return _fetch_from_transcript_obj(preferred, src)
        except Exception:
            pass
        try:
            translated = transcript_list.find_transcript(["vi", "es", "fr", "de", "ja", "ko"])
            return _fetch_from_transcript_obj(translated.translate("en"), "youtube_translated")
        except Exception:
            pass

    # v1.x direct API.
    try:
        if hasattr(api, "fetch"):
            fetched = api.fetch(video_id, languages=["en"])
            text = _normalize_transcript_segments(fetched)
            if text:
                return text, "youtube_auto"
    except Exception as exc:
        logger.warning("youtube transcript fetch() failed for %s: %s", video_id, exc)

    # Compatibility fallback for older API surface.
    try:
        rows = api.get_transcript(video_id, languages=["en"])  # type: ignore[attr-defined]
        return _normalize_transcript_segments(rows), "youtube_auto"
    except Exception as exc:
        raise RuntimeError("Unable to fetch transcript from YouTube") from exc


async def build_subtitle_payload(youtube_url: str) -> SubtitlePayload:
    settings = get_settings()
    video_id = extract_video_id(youtube_url)
    title = await asyncio.to_thread(_fetch_video_title, youtube_url)
    if not title:
        title = _fallback_title(video_id)
    thumbnail_url = f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg"
    transcript = ""
    subtitle_source = "fallback_local"
    try:
        transcript, subtitle_source = await asyncio.to_thread(_fetch_transcript_sync, video_id)
    except Exception as exc:
        logger.warning("subtitle fetch failed for %s (%s): %s", youtube_url, video_id, exc)
        transcript = ""

    if not transcript:
        # Deterministic fallback keeps preview flow available offline.
        transcript = (
            f"{title} explains a science concept in short steps. "
            "The presenter introduces the main topic, gives examples, and summarizes key facts. "
            "Children are encouraged to observe, predict outcomes, and explain what they learned. "
            "Important terms are repeated to improve memory and build confidence."
        )
        subtitle_source = "fallback_local"

    transcript = transcript[: settings.test_transcript_max_chars].strip()

    return SubtitlePayload(
        title=title,
        youtube_url=youtube_url.strip(),
        video_id=video_id,
        thumbnail_url=thumbnail_url,
        subtitle_source=subtitle_source,
        raw_transcript=transcript,
    )
