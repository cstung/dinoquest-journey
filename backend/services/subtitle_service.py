from __future__ import annotations

import asyncio
import json
import logging
import random
import re
import threading
from dataclasses import dataclass
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import urlopen

try:
    from cachetools import TTLCache
except Exception:  # pragma: no cover - optional dependency guard
    TTLCache = None  # type: ignore[assignment]

try:
    from youtube_transcript_api import YouTubeTranscriptApi
    from youtube_transcript_api._errors import NoTranscriptFound, TranscriptsDisabled, VideoUnplayable
except Exception:  # pragma: no cover - optional dependency guard
    YouTubeTranscriptApi = None  # type: ignore[assignment]
    NoTranscriptFound = RuntimeError  # type: ignore[assignment]
    TranscriptsDisabled = RuntimeError  # type: ignore[assignment]
    VideoUnplayable = RuntimeError  # type: ignore[assignment]

from backend.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_ytt = None
if YouTubeTranscriptApi is not None:
    try:
        _ytt = YouTubeTranscriptApi()
    except Exception:  # pragma: no cover - runtime init guard
        _ytt = None

if TTLCache is not None:
    _subtitle_cache = TTLCache(
        maxsize=settings.subtitle_cache_max_size,
        ttl=settings.subtitle_cache_ttl_seconds,
    )
else:
    _subtitle_cache = {}
_cache_lock = threading.Lock()

_PERMANENT_ERRORS = (TranscriptsDisabled, NoTranscriptFound, VideoUnplayable)


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
        with urlopen(endpoint, timeout=settings.subtitle_title_timeout_seconds) as response:
            payload = json.loads(response.read().decode("utf-8"))
            title = str(payload.get("title", "")).strip()
            return title or None
    except Exception as exc:
        logger.warning("oembed title lookup failed for %s: %s", youtube_url, exc)
        return None


def _classify_caption_error(exc: Exception) -> SubtitleUnavailableError:
    if isinstance(exc, TranscriptsDisabled):
        return SubtitleUnavailableError("No subtitles are available for this video.", code="no_subtitles")
    if isinstance(exc, NoTranscriptFound):
        return SubtitleUnavailableError("No subtitles are available for this video.", code="no_subtitles")
    if isinstance(exc, VideoUnplayable):
        return SubtitleUnavailableError("This YouTube video is unplayable from the server.", code="video_unplayable")

    text = f"{exc.__class__.__name__} {exc}".lower()
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

    return SubtitleUnavailableError("No subtitles are available for this video.", code="subtitle_unavailable")


async def _fetch_subtitles(video_id: str) -> str:
    if _ytt is None:
        raise RuntimeError("youtube-transcript-api is not installed or failed to initialize")
    fetched = await asyncio.to_thread(
        _ytt.fetch,
        video_id,
        languages=["en", "en-US", "en-GB", "a.en"],
    )
    raw = fetched.to_raw_data()
    text = " ".join(str(t.get("text", "")).strip() for t in raw if str(t.get("text", "")).strip())
    if not text:
        raise RuntimeError("Transcript fetch returned empty content")
    return text


async def _fetch_with_backoff(video_id: str, max_attempts: int = 3) -> str:
    last_exc: Exception | None = None
    for attempt in range(max_attempts):
        try:
            return await asyncio.wait_for(
                _fetch_subtitles(video_id),
                timeout=settings.subtitle_fetch_timeout_per_attempt_seconds,
            )
        except _PERMANENT_ERRORS:
            raise
        except Exception as exc:
            last_exc = exc
            if attempt == max_attempts - 1:
                break
            wait_seconds = (2**attempt) + random.uniform(0, 0.5)
            logger.warning(
                "Subtitle fetch attempt %d failed for video_id=%s, retrying in %.1fs: %s",
                attempt + 1,
                video_id,
                wait_seconds,
                exc,
            )
            await asyncio.sleep(wait_seconds)

    if last_exc is None:
        raise RuntimeError("subtitle fetch failed")
    raise last_exc


async def get_subtitles(video_id: str) -> str:
    with _cache_lock:
        cached = _subtitle_cache.get(video_id)
    if isinstance(cached, str) and cached.strip():
        logger.info("[subtitle_cache] HIT video_id=%s", video_id)
        return cached
    if cached is not None:
        logger.warning("[subtitle_cache] CORRUPT_EMPTY video_id=%s evicting", video_id)
        with _cache_lock:
            _subtitle_cache.pop(video_id, None)

    logger.info("[subtitle_cache] MISS video_id=%s", video_id)

    async with asyncio.timeout(settings.subtitle_fetch_total_timeout_seconds):
        result = await _fetch_with_backoff(video_id)

    normalized = result.strip()
    if not normalized:
        raise RuntimeError("Subtitle fetch returned empty content")

    with _cache_lock:
        _subtitle_cache[video_id] = normalized

    return normalized


async def build_subtitle_payload(youtube_url: str) -> SubtitlePayload:
    try:
        video_id = extract_video_id(youtube_url)
    except ValueError as exc:
        raise SubtitleUnavailableError("Invalid YouTube URL.", code="invalid_url") from exc

    try:
        title = await asyncio.wait_for(
            asyncio.to_thread(_fetch_video_title, youtube_url),
            timeout=settings.subtitle_title_timeout_seconds,
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

    try:
        transcript = await get_subtitles(video_id)
    except asyncio.TimeoutError as exc:
        raise SubtitleUnavailableError(
            "Subtitle fetch timed out. Check network connectivity and retry.",
            code="network_timeout",
        ) from exc
    except Exception as exc:
        raise _classify_caption_error(exc) from exc

    transcript = transcript[: settings.test_transcript_max_chars].strip()
    if not transcript:
        raise SubtitleUnavailableError("No subtitles are available for this video.", code="no_subtitles")

    return SubtitlePayload(
        title=title,
        youtube_url=youtube_url.strip(),
        video_id=video_id,
        thumbnail_url=f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg",
        subtitle_source="youtube_auto",
        raw_transcript=transcript,
    )
