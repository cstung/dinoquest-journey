from __future__ import annotations

from datetime import datetime

from pydantic import field_validator

from backend.base_schema import APIModel


class FamilyCreate(APIModel):
    name: str
    motto: str | None = None
    color_hex: str = "#ffdb33"

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Family name is required")
        return value.strip()


class FamilyUpdate(APIModel):
    name: str | None = None
    motto: str | None = None
    color_hex: str | None = None


class FamilyOut(APIModel):
    id: int
    name: str
    motto: str | None
    avatar_url: str | None
    color_hex: str
    owner_id: int
    member_count: int
    created_at: datetime


class FamilyWithRoleOut(FamilyOut):
    my_role: str

