from __future__ import annotations

from backend.base_schema import APIModel


class LeaderboardEntryOut(APIModel):
    rank: int
    user_id: int
    username: str
    avatar_color: str | None
    level: int
    xp: int
    coins: int = 0
    current_streak: int = 0
    is_you: bool


class LeaderboardPageOut(APIModel):
    scope: str
    items: list[LeaderboardEntryOut]
