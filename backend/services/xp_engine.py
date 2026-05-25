from __future__ import annotations

from enum import Enum

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models import UserFamilyLevel, XpEvent


class XpReason(str, Enum):
    QUEST_COMPLETE = "quest_complete"
    TEST_SUBMIT = "test_submit"
    REWARD_CLAIM = "reward_claim"
    TEST_REOPEN = "test_reopen_revoke"
    LEVEL_UP = "level_up"


def xp_cost_for_level_up(current_level: int) -> int:
    return 50 * max(current_level, 1)


async def award_xp(
    *,
    family_id: int,
    user_id: int,
    delta: int,
    reason: XpReason,
    db: AsyncSession,
    source_id: int | None = None,
    note: str | None = None,
) -> UserFamilyLevel:
    event = XpEvent(
        family_id=family_id,
        user_id=user_id,
        delta=delta,
        reason=reason.value,
        source_id=source_id,
        note=note,
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
        level_row = UserFamilyLevel(family_id=family_id, user_id=user_id, xp_balance=0, level=1)
        db.add(level_row)

    level_row.xp_balance = max(level_row.xp_balance + delta, 0)
    if level_row.level < 1:
        level_row.level = 1
    await db.flush()
    return level_row
