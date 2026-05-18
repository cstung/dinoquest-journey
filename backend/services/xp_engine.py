from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models import UserFamilyLevel, XpEvent


def level_from_total_xp(total_xp: int) -> int:
    # Level progression: level-up threshold increases linearly:
    # L1 starts at 0 XP; to reach next level requires 100*current_level XP.
    level = 1
    remaining = max(total_xp, 0)
    threshold = 100
    while remaining >= threshold:
        remaining -= threshold
        level += 1
        threshold = 100 * level
    return level


async def award_xp(
    *,
    family_id: int,
    user_id: int,
    delta: int,
    reason: str,
    db: AsyncSession,
    source_id: int | None = None,
) -> UserFamilyLevel:
    event = XpEvent(
        family_id=family_id,
        user_id=user_id,
        delta=delta,
        reason=reason,
        source_id=source_id,
    )
    db.add(event)

    level_row = (
        await db.execute(
            select(UserFamilyLevel).where(
                UserFamilyLevel.family_id == family_id,
                UserFamilyLevel.user_id == user_id,
            )
        )
    ).scalar_one_or_none()

    if not level_row:
        level_row = UserFamilyLevel(family_id=family_id, user_id=user_id, total_xp=0, level=1)
        db.add(level_row)

    level_row.total_xp = max(level_row.total_xp + delta, 0)
    level_row.level = level_from_total_xp(level_row.total_xp)
    await db.flush()
    return level_row

