from __future__ import annotations

from datetime import datetime

from pydantic import Field, field_validator

from backend.base_schema import APIModel


class ReactionOut(APIModel):
    emoji: str
    count: int
    reacted_by_me: bool


class TagOut(APIModel):
    user_id: int
    nickname: str


class WallPostOut(APIModel):
    id: int
    author_id: int | None
    author_nickname: str | None
    author_color: str | None = None
    author_emoji: str | None = None
    post_type: str
    content: str
    image_url: str | None
    sticker_url: str | None
    is_boosted: bool
    tags: list[TagOut]
    reaction_counts: list[ReactionOut]
    comment_count: int
    created_at: datetime


class WallFeedOut(APIModel):
    posts: list[WallPostOut]
    has_more: bool


class WallPostCreate(APIModel):
    post_type: str = "shoutout"
    content: str = ""
    sticker_url: str | None = None
    tagged_user_ids: list[int] = Field(default_factory=list)


class ReactionCreate(APIModel):
    emoji: str

    @field_validator("emoji")
    @classmethod
    def validate_emoji(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned or len(cleaned) > 20:
            raise ValueError("Invalid reaction")
        return cleaned


class CommentCreate(APIModel):
    text: str

    @field_validator("text")
    @classmethod
    def validate_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Comment is required")
        return cleaned[:500]


class CommentOut(APIModel):
    id: int
    post_id: int
    author_id: int
    author_nickname: str
    author_color: str
    text: str
    created_at: datetime


class CommentsOut(APIModel):
    comments: list[CommentOut]


class BoostCreate(APIModel):
    xp: int = Field(ge=1, le=1000)
    message: str = ""


class MoodCreate(APIModel):
    mood: str
    shared: bool = False


class MoodCheckinOut(APIModel):
    user_id: int
    mood: str | None


class MoodTodayOut(APIModel):
    checkins: list[MoodCheckinOut]


class PinCreate(APIModel):
    message: str
    expires_at: datetime | None = None

    @field_validator("message")
    @classmethod
    def validate_message(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Pin message is required")
        return cleaned[:500]


class PinAcknowledgementOut(APIModel):
    user_id: int
    nickname: str


class PinOut(APIModel):
    id: int
    message: str
    created_by: str
    expires_at: datetime | None
    acknowledgements: list[PinAcknowledgementOut]
    total_members: int


class PinsOut(APIModel):
    pins: list[PinOut]


class DashboardStatsOut(APIModel):
    quests_completed_this_week: int = 0
    family_xp_this_week: int = 0
    best_streak_active: int = 0
    tests_taken_this_week: int = 0


class ReactionUsersOut(APIModel):
    nicknames: list[str]
