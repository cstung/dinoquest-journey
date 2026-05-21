from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from zoneinfo import ZoneInfo

from pydantic import Field, field_validator

from backend.base_schema import APIModel


class QuestFrequency(str, Enum):
    once = "once"
    daily = "daily"
    weekly = "weekly"
    monthly = "monthly"


class QuestCreate(APIModel):
    title: str
    description: str | None = None
    category: str = "learning"
    difficulty: str = "Easy"
    thumbnail_url: str | None = None
    xp_reward: int = Field(default=10, ge=1, le=10000)
    due_date: datetime | None = None
    recurrence_end_at: datetime | None = None
    frequency: QuestFrequency = QuestFrequency.once
    assigned_user_ids: list[int] = Field(default_factory=list)

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Quest title is required")
        return value.strip()

    @field_validator("thumbnail_url")
    @classmethod
    def validate_thumbnail_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            return None
        lowered = normalized.lower()
        if lowered.startswith("data:image/") or lowered.startswith("http://") or lowered.startswith("https://"):
            if len(normalized) > 3_000_000:
                raise ValueError("thumbnailUrl is too large")
            return normalized
        raise ValueError("thumbnailUrl must be an image data URL or http(s) URL")

    @field_validator("due_date")
    @classmethod
    def validate_due_date_not_past(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        due = value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
        now_local_date = datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")).date()
        due_local_date = due.astimezone(ZoneInfo("Asia/Ho_Chi_Minh")).date()
        if due_local_date < now_local_date:
            raise ValueError("Due date cannot be in the past.")
        return due


class QuestUpdate(APIModel):
    title: str | None = None
    description: str | None = None
    category: str | None = None
    difficulty: str | None = None
    thumbnail_url: str | None = None
    xp_reward: int | None = Field(default=None, ge=1, le=10000)
    due_date: datetime | None = None
    recurrence_end_at: datetime | None = None
    frequency: QuestFrequency | None = None

    @field_validator("thumbnail_url")
    @classmethod
    def validate_update_thumbnail_url(cls, value: str | None) -> str | None:
        return QuestCreate.validate_thumbnail_url(value)

    @field_validator("due_date")
    @classmethod
    def validate_update_due_date_not_past(cls, value: datetime | None) -> datetime | None:
        return QuestCreate.validate_due_date_not_past(value)


class QuestCompleteOut(APIModel):
    quest_id: int
    assignment_id: int
    xp_awarded: int
    total_xp: int
    level: int
    status: str


class QuestResolveIn(APIModel):
    decision: str

    @field_validator("decision")
    @classmethod
    def validate_decision(cls, value: str) -> str:
        lowered = value.strip().lower()
        if lowered not in {"approve", "reject"}:
            raise ValueError("decision must be approve or reject")
        return lowered


class QuestAssignedMemberOut(APIModel):
    assignment_id: int
    user_id: int
    username: str
    avatar_color: str | None
    status: str
    completion_requested_at: datetime | None
    completed_at: datetime | None
    cycle_index: int
    cycle_due_at: datetime | None
    cycle_start_at: datetime


class QuestItemOut(APIModel):
    id: int
    title: str
    description: str | None
    category: str
    difficulty: str
    thumbnail_url: str | None
    xp_reward: int
    due_date: datetime | None
    frequency: QuestFrequency
    next_occurrence_at: datetime | None
    recurrence_end_at: datetime | None
    status: str
    assigned_members: list[QuestAssignedMemberOut]
    created_at: datetime


class QuestPageOut(APIModel):
    items: list[QuestItemOut]
    next_cursor: str | None
    total: int


class QuestAssignmentHistoryOut(APIModel):
    assignment_id: int
    quest_id: int
    user_id: int
    username: str
    status: str
    completed_at: datetime | None
    cycle_due_at: datetime | None
    cycle_start_at: datetime
    cycle_index: int
