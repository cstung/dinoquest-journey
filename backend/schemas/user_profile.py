from __future__ import annotations

from datetime import datetime

from pydantic import Field, field_validator

from backend.base_schema import APIModel

ALLOWED_SUBJECTS = {"Math", "Science", "Reading", "Art", "Music", "PE", "Other"}
ALLOWED_GENDERS = {"Boy", "Girl", "Prefer not to say"}


class UserProfileOut(APIModel):
    id: int
    username: str
    nickname: str
    avatar_url: str | None
    birthday: datetime | None
    height_cm: float | None
    weight_kg: float | None
    gender: str | None
    school_grade: str | None
    favorite_dino: str
    catchphrase: str
    favorite_subject: str
    fun_fact: str
    joined_at: datetime
    total_xp: int = 0
    quests_completed: int = 0
    current_streak: int = 0


class UserProfileUpdateIn(APIModel):
    nickname: str | None = Field(default=None, max_length=30)
    birthday: datetime | None = None
    height_cm: float | None = Field(default=None, gt=0, lt=300)
    weight_kg: float | None = Field(default=None, gt=0, lt=500)
    gender: str | None = Field(default=None, max_length=30)
    school_grade: str | None = Field(default=None, max_length=30)
    favorite_dino: str | None = Field(default=None, max_length=100)
    catchphrase: str | None = Field(default=None, max_length=200)
    favorite_subject: str | None = Field(default=None, max_length=50)
    fun_fact: str | None = Field(default=None, max_length=1000)
    bio: str | None = Field(default=None, max_length=1000)

    @field_validator("gender")
    @classmethod
    def validate_gender(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if normalized == "":
            return None
        if normalized not in ALLOWED_GENDERS:
            raise ValueError("Gender must be Boy, Girl, or Prefer not to say")
        return normalized

    @field_validator("favorite_subject")
    @classmethod
    def validate_subject(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if normalized == "":
            return "Other"
        if normalized not in ALLOWED_SUBJECTS:
            raise ValueError("Favorite subject is invalid")
        return normalized
