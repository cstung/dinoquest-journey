from __future__ import annotations

import random
import secrets
from datetime import datetime, timedelta, timezone

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


async def generate_unique_qr_token(db: AsyncSession) -> str:
    for _ in range(20):
        token = secrets.token_urlsafe(24)
        existing = (
            await db.execute(select(FamilyInvite.id).where(FamilyInvite.qr_token == token))
        ).scalar_one_or_none()
        if not existing:
            return token
    raise RuntimeError("Unable to generate unique QR token")


def build_expiry(days: int = 7) -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=days)
