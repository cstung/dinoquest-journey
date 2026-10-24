from __future__ import annotations

import base64
import binascii
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import select

from backend.config import get_settings

# Raster types only: SVG stays inline because serving it same-origin could run scripts.
_DATA_URL_EXT = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
}


def data_dir() -> Path:
    db_path = Path(get_settings().db_path).expanduser()
    return Path("./data").resolve() if db_path == Path(":memory:") else db_path.resolve().parent


def store_thumbnail(value: str | None) -> str | None:
    """Write a base64 image data URL to /uploads/thumbnails and return its URL; pass anything else through."""
    if not value or not value.startswith("data:image/"):
        return value
    header, _, payload = value.partition(",")
    mime = header[len("data:"):].split(";")[0].lower()
    ext = _DATA_URL_EXT.get(mime)
    if ext is None or ";base64" not in header:
        return value
    try:
        raw = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=422, detail="thumbnailUrl is not valid base64") from exc

    folder = data_dir() / "thumbnails"
    folder.mkdir(parents=True, exist_ok=True)
    name = f"{uuid4().hex}.{ext}"
    (folder / name).write_bytes(raw)
    return f"/uploads/thumbnails/{name}"


async def migrate_inline_thumbnails() -> int:
    """Move legacy base64 thumbnails out of the DB. Idempotent; safe to run on every startup."""
    from backend.database import SessionLocal
    from backend.models import Quest, RewardItem

    moved = 0
    async with SessionLocal() as db:
        for model in (Quest, RewardItem):
            rows = (
                await db.execute(select(model).where(model.thumbnail_url.like("data:image/%")))
            ).scalars().all()
            for row in rows:
                new_url = store_thumbnail(row.thumbnail_url)
                if new_url != row.thumbnail_url:
                    row.thumbnail_url = new_url
                    moved += 1
        await db.commit()
    return moved
