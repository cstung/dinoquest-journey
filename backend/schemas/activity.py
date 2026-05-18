from __future__ import annotations

from datetime import datetime

from backend.base_schema import APIModel


class ActivityItemOut(APIModel):
    id: int
    family_id: int
    user_id: int | None
    username: str | None
    event_type: str
    payload: dict | None
    is_audit: bool
    created_at: datetime


class ActivityPageOut(APIModel):
    items: list[ActivityItemOut]
    next_cursor: str | None
    total: int

