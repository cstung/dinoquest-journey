from __future__ import annotations

import re
from datetime import datetime

from pydantic import EmailStr, field_validator

from backend.base_schema import APIModel


class RegisterRequest(APIModel):
    username: str
    password: str
    email: EmailStr | None = None
    invite_code: str | None = None

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        if not re.match(r"^[a-zA-Z0-9_]{3,30}$", value):
            raise ValueError("Username must be 3-30 alphanumeric chars or underscores")
        return value

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        if len(value) < 12:
            raise ValueError("Password must be at least 12 characters")
        return value


class LoginRequest(APIModel):
    username: str
    password: str


class UserOut(APIModel):
    id: int
    username: str
    email: str | None
    global_role: str
    created_at: datetime
    active_family_id: int | None = None
    active_family_name: str | None = None
    role: str | None = None


class WsTokenOut(APIModel):
    ws_token: str
    expires_in_seconds: int
