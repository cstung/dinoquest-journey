from __future__ import annotations

from datetime import datetime

from backend.base_schema import APIModel


class InviteOut(APIModel):
    id: int
    code: str
    qr_token: str
    expires_at: datetime
    revoked: bool
    created_at: datetime

