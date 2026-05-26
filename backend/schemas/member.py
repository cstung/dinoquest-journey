from __future__ import annotations

from datetime import datetime

from pydantic import Field
from pydantic import field_validator

from backend.base_schema import APIModel


class MemberOut(APIModel):
    user_id: int
    username: str
    role: str
    nickname: str | None
    avatar_color: str | None
    joined_at: datetime


class MemberRoleUpdate(APIModel):
    role: str

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str) -> str:
        role = value.lower().strip()
        if role not in {"parent", "child"}:
            raise ValueError("Role must be parent or child")
        return role


class LevelUpOut(APIModel):
    new_level: int
    xp_spent: int
    xp_balance: int


class ParentRewardIn(APIModel):
    xp: int = Field(ge=1, le=10_000_000)
    reason: str | None = Field(default=None, max_length=100)

    @field_validator("reason")
    @classmethod
    def normalize_reason(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class ParentRewardOut(APIModel):
    child_user_id: int
    child_username: str
    xp_awarded: int
    xp_balance: int
    level: int
    label: str
