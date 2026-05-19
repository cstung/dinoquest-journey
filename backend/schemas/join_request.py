from __future__ import annotations

from datetime import datetime

from pydantic import model_validator

from backend.base_schema import APIModel


class JoinByCodeRequest(APIModel):
    code: str | None = None
    qr_token: str | None = None

    @model_validator(mode="after")
    def validate_one_selector(self) -> "JoinByCodeRequest":
        if not (self.code or self.qr_token):
            raise ValueError("Either code or qrToken is required")
        return self


class JoinRequestOut(APIModel):
    id: int
    family_id: int
    user_id: int
    username: str
    status: str
    requested_at: datetime


class JoinDecision(APIModel):
    status: str


class JoinBody(APIModel):
    code: str | None = None
    qr_token: str | None = None


class JoinResult(APIModel):
    family_id: int
    family_name: str
    role: str
