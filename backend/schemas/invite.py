from __future__ import annotations

from datetime import datetime
from typing import Literal

from backend.base_schema import APIModel


class InviteCreate(APIModel):
    role: Literal["parent", "child"]


class InviteOut(APIModel):
    id: int
    family_id: int
    family_name: str | None = None
    role: str
    code: str
    qr_token: str
    expires_at: datetime
    used_by: int | None
    revoked: bool
    created_at: datetime
