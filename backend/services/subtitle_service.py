from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass
from urllib.parse import parse_qs, urlparse

from backend.config import get_settings

try:
    from youtube_transcript_api import YouTubeTranscriptApi  # type: ignore
except Exception:  # pragma: no cover - optional dependency fallback
    YouTubeTranscriptApi = None  # type: ignore


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


def _normalize_transcript_segments(items: list[dict]) -> str:
    parts = []
    for row in items:
        text = str(row.get("text", "")).strip()
        if text:
            parts.append(text.replace("\n", " "))
    return " ".join(parts).strip()


def _fetch_transcript_sync(video_id: str) -> tuple[str, str]:
    if YouTubeTranscriptApi is None:
        raise RuntimeError("youtube-transcript-api is not installed")

    # Prefer manual English captions, then generated/translated english.
    api = YouTubeTranscriptApi
    try:
        transcript_list = api.list_transcripts(video_id)
        try:
            manual = transcript_list.find_manually_created_transcript(["en"])
            return _normalize_transcript_segments(manual.fetch()), "youtube_manual"
        except Exception:
            pass
        try:
            generated = transcript_list.find_generated_transcript(["en"])
            return _normalize_transcript_segments(generated.fetch()), "youtube_auto"
        except Exception:
            pass
        try:
            translated = transcript_list.find_transcript(["vi", "es", "fr", "de", "ja", "ko"])
            return _normalize_transcript_segments(translated.translate("en").fetch()), "youtube_translated"
        except Exception:
            pass
    except Exception:
        pass

    # Compatibility fallback for older API surface.
    try:
        rows = api.get_transcript(video_id, languages=["en"])
        return _normalize_transcript_segments(rows), "youtube_auto"
    except Exception as exc:
        raise RuntimeError("Unable to fetch transcript from YouTube") from exc


async def build_subtitle_payload(youtube_url: str) -> SubtitlePayload:
    settings = get_settings()
    video_id = extract_video_id(youtube_url)
    title = _fallback_title(video_id)
    thumbnail_url = f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg"
    transcript = ""
    subtitle_source = "fallback_local"
    try:
        transcript, subtitle_source = await asyncio.to_thread(_fetch_transcript_sync, video_id)
    except Exception:
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
