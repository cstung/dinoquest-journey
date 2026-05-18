from __future__ import annotations

from datetime import datetime

from pydantic import Field, field_validator

from backend.base_schema import APIModel


class PetCreate(APIModel):
    name: str
    species: str = "Unknown"

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Pet name is required")
        return cleaned


class PetUpdate(APIModel):
    name: str | None = None
    is_active: bool | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str | None) -> str | None:
        if value is None:
            return value
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Pet name cannot be empty")
        return cleaned


class PetFeedOut(APIModel):
    pet_id: int
    gained_xp: int
    level_up: bool
    level: int
    xp: int
    stage: str
    next_feed_at: datetime


class PetOut(APIModel):
    id: int
    user_id: int
    username: str
    name: str
    species: str
    stage: str
    level: int
    xp: int
    xp_to_next: int
    is_active: bool
    last_fed_at: datetime | None
    created_at: datetime


class PetPageOut(APIModel):
    items: list[PetOut]
    total: int = Field(ge=0)
