from __future__ import annotations

from datetime import date, datetime
from enum import Enum

from pydantic import Field, field_validator

from backend.base_schema import APIModel
from backend.datetime_utils import VN_TZ, ensure_utc, vn_end_of_day_utc, vn_today


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
    xp_reward: int = Field(default=10, ge=1)
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
        due_local_date = ensure_utc(value).astimezone(VN_TZ).date()
        if due_local_date < vn_today():
            raise ValueError("Due date cannot be in the past.")
        return ensure_utc(value)

    @field_validator("due_date", mode="before")
    @classmethod
    def parse_due_date(cls, value: object) -> object:
        if value is None or value == "":
            return None
        if isinstance(value, datetime):
            return ensure_utc(value)
        if isinstance(value, date):
            return vn_end_of_day_utc(value)
        if isinstance(value, str):
            raw = value.strip()
            if not raw:
                return None
            if "T" not in raw and " " not in raw:
                return vn_end_of_day_utc(date.fromisoformat(raw))
            parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            return ensure_utc(parsed)
        raise ValueError("due_date must be a valid ISO date or datetime")


class QuestUpdate(APIModel):
    title: str | None = None
    description: str | None = None
    category: str | None = None
    difficulty: str | None = None
    thumbnail_url: str | None = None
    xp_reward: int | None = Field(default=None, ge=1)
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

    @field_validator("due_date", mode="before")
    @classmethod
    def parse_update_due_date(cls, value: object) -> object:
        return QuestCreate.parse_due_date(value)


class QuestCompleteOut(APIModel):
    quest_id: int
    assignment_id: int
    xp_awarded: int
    xp_balance: int
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
