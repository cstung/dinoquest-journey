from __future__ import annotations

from datetime import datetime

from pydantic import Field, field_validator

from backend.base_schema import APIModel


def _normalize_thumbnail_url(value: str | None) -> str | None:
    if value is None:
        return value
    cleaned = value.strip()
    if not cleaned:
        return None
    if not (
        cleaned.startswith("data:image/")
        or cleaned.startswith("http://")
        or cleaned.startswith("https://")
    ):
        raise ValueError("thumbnailUrl must be an image data URL or http(s) URL")
    if len(cleaned) > 3_000_000:
        raise ValueError("thumbnailUrl is too large")
    return cleaned


class RewardCreate(APIModel):
    title: str
    description: str | None = None
    thumbnail_url: str | None = None
    xp_cost: int = Field(ge=1)

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Reward title is required")
        return cleaned

    @field_validator("thumbnail_url")
    @classmethod
    def validate_thumbnail_url(cls, value: str | None) -> str | None:
        return _normalize_thumbnail_url(value)


class RewardUpdate(APIModel):
    title: str | None = None
    description: str | None = None
    thumbnail_url: str | None = None
    xp_cost: int | None = Field(default=None, ge=1)
    is_active: bool | None = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str | None) -> str | None:
        if value is None:
            return value
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Reward title cannot be empty")
        return cleaned

    @field_validator("thumbnail_url")
    @classmethod
    def validate_update_thumbnail_url(cls, value: str | None) -> str | None:
        return _normalize_thumbnail_url(value)


class RewardOut(APIModel):
    id: int
    title: str
    description: str | None
    thumbnail_url: str | None
    xp_cost: int
    is_active: bool
    created_at: datetime
    created_by: int


class RewardClaimOut(APIModel):
    id: int
    reward_id: int
    reward_title: str
    family_id: int
    user_id: int
    username: str
    status: str
    requested_at: datetime
    resolved_at: datetime | None
    resolved_by: int | None


class RewardClaimResolveIn(APIModel):
    decision: str

    @field_validator("decision")
    @classmethod
    def validate_decision(cls, value: str) -> str:
        lowered = value.strip().lower()
        if lowered not in {"approved", "rejected"}:
            raise ValueError("decision must be approved or rejected")
        return lowered
