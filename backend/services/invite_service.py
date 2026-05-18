from __future__ import annotations

import random
import uuid
from datetime import datetime, timedelta, timezone
from io import BytesIO

import qrcode
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models import FamilyInvite


async def generate_unique_invite_code(db: AsyncSession) -> str:
    for _ in range(20):
        code = str(random.randint(0, 999999)).zfill(6)
        existing = (
            await db.execute(select(FamilyInvite.id).where(FamilyInvite.code == code))
        ).scalar_one_or_none()
        if not existing:
            return code
    raise RuntimeError("Unable to generate unique invite code")


def generate_qr_token() -> str:
    return uuid.uuid4().hex


def build_expiry(days: int = 7) -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=days)


def build_qr_png(join_url: str) -> bytes:
    img = qrcode.make(join_url)
    buffer = BytesIO()
    img.save(buffer, format="PNG")
    return buffer.getvalue()

