from __future__ import annotations

from enum import Enum

from sqlalchemy import func, select, update
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models import UserFamilyLevel, XpEvent


class XpReason(str, Enum):
    QUEST_COMPLETE = "quest_complete"
    TEST_SUBMIT = "test_submit"
    REWARD_CLAIM = "reward_claim"
    TEST_REOPEN = "test_reopen_revoke"
    LEVEL_UP = "level_up"
    PARENT_REWARD = "parent_reward"


def xp_cost_for_level_up(current_level: int) -> int:
    return 50 * max(current_level, 1)


async def ensure_level_row(*, family_id: int, user_id: int, db: AsyncSession) -> None:
    await db.execute(
        sqlite_insert(UserFamilyLevel)
        .values(family_id=family_id, user_id=user_id, xp_balance=0, level=1, current_streak=0, best_streak=0)
        .on_conflict_do_nothing(index_elements=["family_id", "user_id"])
    )


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

    await ensure_level_row(family_id=family_id, user_id=user_id, db=db)
    # Single UPDATE so concurrent awards cannot overwrite each other's balance.
    await db.execute(
        update(UserFamilyLevel)
        .where(UserFamilyLevel.family_id == family_id, UserFamilyLevel.user_id == user_id)
        .values(
            xp_balance=func.max(UserFamilyLevel.xp_balance + delta, 0),
            level=func.max(UserFamilyLevel.level, 1),
        )
        .execution_options(synchronize_session=False)
    )
    return (
        await db.execute(
            select(UserFamilyLevel)
            .where(UserFamilyLevel.family_id == family_id, UserFamilyLevel.user_id == user_id)
            .execution_options(populate_existing=True)
        )
    ).scalar_one()
