from __future__ import annotations

from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


def ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def ensure_utc_optional(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return ensure_utc(dt)


def vn_today() -> date:
    return datetime.now(VN_TZ).date()


def vn_end_of_day_utc(day: date) -> datetime:
    return datetime(
        day.year,
        day.month,
        day.day,
        23,
        59,
        59,
        999999,
        tzinfo=VN_TZ,
    ).astimezone(timezone.utc)
