from __future__ import annotations

from datetime import datetime

from pydantic import Field, field_validator

from backend.base_schema import APIModel


class QuestCreate(APIModel):
    title: str
    description: str | None = None
    category: str = "Daily"
    difficulty: str = "Easy"
    xp_reward: int = Field(default=10, ge=1, le=10000)
    due_date: datetime | None = None
    is_recurring: bool = False
    assigned_user_ids: list[int] | None = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Quest title is required")
        return value.strip()


class QuestUpdate(APIModel):
    title: str | None = None
    description: str | None = None
    category: str | None = None
    difficulty: str | None = None
    xp_reward: int | None = Field(default=None, ge=1, le=10000)
    due_date: datetime | None = None
    is_recurring: bool | None = None


class QuestCompleteOut(APIModel):
    quest_id: int
    assignment_id: int
    xp_awarded: int
    total_xp: int
    level: int
    status: str


class QuestAssignedMemberOut(APIModel):
    user_id: int
    username: str
    avatar_color: str | None
    status: str
    completed_at: datetime | None


class QuestItemOut(APIModel):
    id: int
    title: str
    description: str | None
    category: str
    difficulty: str
    xp_reward: int
    due_date: datetime | None
    is_recurring: bool
    status: str
    assigned_members: list[QuestAssignedMemberOut]
    created_at: datetime


class QuestPageOut(APIModel):
    items: list[QuestItemOut]
    next_cursor: str | None
    total: int

