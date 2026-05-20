from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models import UserFamilyLevel

TZ = ZoneInfo("Asia/Ho_Chi_Minh")


async def update_streak(
    user_id: int,
    family_id: int,
    completed_on_time: bool,
    db: AsyncSession,
    completed_at: datetime | None = None,
) -> None:
    row = (
        await db.execute(
            select(UserFamilyLevel).where(
                UserFamilyLevel.user_id == user_id,
                UserFamilyLevel.family_id == family_id,
            )
        )
    ).scalar_one_or_none()
    if not row:
        return

    base_dt = completed_at if completed_at is not None else datetime.now(TZ)
    if base_dt.tzinfo is None:
        base_dt = base_dt.replace(tzinfo=TZ)
    today_vn = base_dt.astimezone(TZ).date()

    if not completed_on_time:
        row.current_streak = 0
        await db.flush()
        return

    if row.last_completed_date is None:
        row.current_streak = 1
    elif row.last_completed_date == today_vn - timedelta(days=1):
        row.current_streak += 1
    elif row.last_completed_date == today_vn:
        pass
    else:
        row.current_streak = 1

    row.last_completed_date = today_vn
    row.best_streak = max(row.best_streak, row.current_streak)
    await db.flush()
