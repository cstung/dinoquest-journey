from __future__ import annotations

import secrets
import time
from collections import deque
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models import Family, FamilyInvite

# ponytail: process-wide failure window (single uvicorn worker). Behind a proxy every client
# shares one IP, so this is global on purpose; move to per-IP/Redis if it blocks real users.
_INVITE_FAIL_WINDOW_SEC = 600
_INVITE_FAIL_LIMIT = 20
_invite_failures: deque[float] = deque()

INVALID_INVITE_DETAIL = "Invalid or expired invite code"


def _invite_rate_limited(now: float) -> bool:
    while _invite_failures and now - _invite_failures[0] > _INVITE_FAIL_WINDOW_SEC:
        _invite_failures.popleft()
    return len(_invite_failures) >= _INVITE_FAIL_LIMIT


async def resolve_invite(
    db: AsyncSession,
    *,
    code: str | None = None,
    qr_token: str | None = None,
) -> tuple[FamilyInvite, Family]:
    """Return a usable invite + family, or raise one uniform error (no enumeration hints)."""
    now = time.monotonic()
    if _invite_rate_limited(now):
        raise HTTPException(status_code=429, detail="Too many invalid invite attempts. Try again later.")

    column = FamilyInvite.code if code else FamilyInvite.qr_token
    invite = (await db.execute(select(FamilyInvite).where(column == (code or qr_token)))).scalar_one_or_none()
    family = await db.get(Family, invite.family_id) if invite else None

    usable = False
    if invite and family and not family.is_deleted and not invite.revoked and invite.used_by is None:
        expires_at = invite.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        usable = expires_at >= datetime.now(timezone.utc)

    if not usable:
        _invite_failures.append(now)
        raise HTTPException(status_code=400, detail=INVALID_INVITE_DETAIL)
    return invite, family  # type: ignore[return-value]


async def claim_invite(db: AsyncSession, invite: FamilyInvite, user_id: int) -> None:
    """Atomically mark the invite used so two concurrent sign-ups cannot share one code."""
    used_at = datetime.now(timezone.utc)
    result = await db.execute(
        update(FamilyInvite)
        .where(FamilyInvite.id == invite.id, FamilyInvite.used_by.is_(None))
        .values(used_by=user_id, used_at=used_at)
        .execution_options(synchronize_session=False)
    )
    if result.rowcount != 1:
        raise HTTPException(status_code=400, detail=INVALID_INVITE_DETAIL)
    invite.used_by = user_id
    invite.used_at = used_at


async def generate_unique_invite_code(db: AsyncSession) -> str:
    for _ in range(20):
        code = f"{secrets.randbelow(1_000_000):06d}"
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
