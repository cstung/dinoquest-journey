from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base


class FamilyWallPost(Base):
    __tablename__ = "family_wall_posts"

    id: Mapped[int] = mapped_column(primary_key=True)
    family_id: Mapped[int] = mapped_column(ForeignKey("families.id"), nullable=False, index=True)
    author_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    post_type: Mapped[str] = mapped_column(String(30), nullable=False, default="shoutout", index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    sticker_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    tagged_user_ids: Mapped[list[int]] = mapped_column(JSON, nullable=False, default=list)
    is_boosted: Mapped[bool] = mapped_column(nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class FamilyWallReaction(Base):
    __tablename__ = "family_wall_reactions"
    __table_args__ = (UniqueConstraint("post_id", "user_id", name="uq_family_wall_reaction_user"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("family_wall_posts.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    emoji: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class FamilyWallComment(Base):
    __tablename__ = "family_wall_comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("family_wall_posts.id"), nullable=False, index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class FamilyMoodCheckin(Base):
    __tablename__ = "family_mood_checkins"
    __table_args__ = (UniqueConstraint("family_id", "user_id", "checkin_date", name="uq_family_mood_day"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    family_id: Mapped[int] = mapped_column(ForeignKey("families.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    mood: Mapped[str | None] = mapped_column(String(20), nullable=True)
    shared: Mapped[bool] = mapped_column(nullable=False, default=False)
    checkin_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class FamilyPin(Base):
    __tablename__ = "family_pins"

    id: Mapped[int] = mapped_column(primary_key=True)
    family_id: Mapped[int] = mapped_column(ForeignKey("families.id"), nullable=False, index=True)
    created_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    message: Mapped[str] = mapped_column(String(500), nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class FamilyPinAcknowledgement(Base):
    __tablename__ = "family_pin_acknowledgements"
    __table_args__ = (UniqueConstraint("pin_id", "user_id", name="uq_family_pin_ack_user"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    pin_id: Mapped[int] = mapped_column(ForeignKey("family_pins.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class FamilyChallenge(Base):
    __tablename__ = "family_challenges"

    id: Mapped[int] = mapped_column(primary_key=True)
    family_id: Mapped[int] = mapped_column(ForeignKey("families.id"), nullable=False, index=True)
    created_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    goal_type: Mapped[str] = mapped_column(String(30), nullable=False)
    goal_value: Mapped[int] = mapped_column(nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    prize_reward_id: Mapped[int | None] = mapped_column(ForeignKey("reward_items.id"), nullable=True)
    is_active: Mapped[bool] = mapped_column(nullable=False, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
