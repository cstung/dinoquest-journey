"""add_family_dashboard_tables

Revision ID: e5f6a7b8c9d0
Revises: c4a8e1f9b2d7
Create Date: 2026-05-21 16:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, None] = "c4a8e1f9b2d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    if not _has_table("family_wall_posts"):
        op.create_table(
            "family_wall_posts",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("family_id", sa.Integer(), nullable=False),
            sa.Column("author_id", sa.Integer(), nullable=True),
            sa.Column("post_type", sa.String(length=30), nullable=False),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("image_url", sa.Text(), nullable=True),
            sa.Column("sticker_url", sa.String(length=500), nullable=True),
            sa.Column("tagged_user_ids", sa.JSON(), nullable=False),
            sa.Column("is_boosted", sa.Boolean(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
            sa.ForeignKeyConstraint(["author_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["family_id"], ["families.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_family_wall_posts_author_id"), "family_wall_posts", ["author_id"], unique=False)
        op.create_index(op.f("ix_family_wall_posts_created_at"), "family_wall_posts", ["created_at"], unique=False)
        op.create_index(op.f("ix_family_wall_posts_family_id"), "family_wall_posts", ["family_id"], unique=False)
        op.create_index(op.f("ix_family_wall_posts_post_type"), "family_wall_posts", ["post_type"], unique=False)

    if not _has_table("family_wall_reactions"):
        op.create_table(
            "family_wall_reactions",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("post_id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("emoji", sa.String(length=20), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
            sa.ForeignKeyConstraint(["post_id"], ["family_wall_posts.id"]),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("post_id", "user_id", name="uq_family_wall_reaction_user"),
        )
        op.create_index(op.f("ix_family_wall_reactions_post_id"), "family_wall_reactions", ["post_id"], unique=False)
        op.create_index(op.f("ix_family_wall_reactions_user_id"), "family_wall_reactions", ["user_id"], unique=False)

    if not _has_table("family_wall_comments"):
        op.create_table(
            "family_wall_comments",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("post_id", sa.Integer(), nullable=False),
            sa.Column("author_id", sa.Integer(), nullable=False),
            sa.Column("text", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
            sa.ForeignKeyConstraint(["author_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["post_id"], ["family_wall_posts.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_family_wall_comments_author_id"), "family_wall_comments", ["author_id"], unique=False)
        op.create_index(op.f("ix_family_wall_comments_created_at"), "family_wall_comments", ["created_at"], unique=False)
        op.create_index(op.f("ix_family_wall_comments_post_id"), "family_wall_comments", ["post_id"], unique=False)

    if not _has_table("family_mood_checkins"):
        op.create_table(
            "family_mood_checkins",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("family_id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("mood", sa.String(length=20), nullable=True),
            sa.Column("shared", sa.Boolean(), nullable=False),
            sa.Column("checkin_date", sa.Date(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
            sa.ForeignKeyConstraint(["family_id"], ["families.id"]),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("family_id", "user_id", "checkin_date", name="uq_family_mood_day"),
        )
        op.create_index(op.f("ix_family_mood_checkins_checkin_date"), "family_mood_checkins", ["checkin_date"], unique=False)
        op.create_index(op.f("ix_family_mood_checkins_family_id"), "family_mood_checkins", ["family_id"], unique=False)
        op.create_index(op.f("ix_family_mood_checkins_user_id"), "family_mood_checkins", ["user_id"], unique=False)

    if not _has_table("family_pins"):
        op.create_table(
            "family_pins",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("family_id", sa.Integer(), nullable=False),
            sa.Column("created_by_user_id", sa.Integer(), nullable=False),
            sa.Column("message", sa.String(length=500), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
            sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["family_id"], ["families.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_family_pins_created_at"), "family_pins", ["created_at"], unique=False)
        op.create_index(op.f("ix_family_pins_created_by_user_id"), "family_pins", ["created_by_user_id"], unique=False)
        op.create_index(op.f("ix_family_pins_family_id"), "family_pins", ["family_id"], unique=False)

    if not _has_table("family_pin_acknowledgements"):
        op.create_table(
            "family_pin_acknowledgements",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("pin_id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
            sa.ForeignKeyConstraint(["pin_id"], ["family_pins.id"]),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("pin_id", "user_id", name="uq_family_pin_ack_user"),
        )
        op.create_index(op.f("ix_family_pin_acknowledgements_pin_id"), "family_pin_acknowledgements", ["pin_id"], unique=False)
        op.create_index(op.f("ix_family_pin_acknowledgements_user_id"), "family_pin_acknowledgements", ["user_id"], unique=False)

    if not _has_table("family_challenges"):
        op.create_table(
            "family_challenges",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("family_id", sa.Integer(), nullable=False),
            sa.Column("created_by_user_id", sa.Integer(), nullable=False),
            sa.Column("title", sa.String(length=80), nullable=False),
            sa.Column("description", sa.String(length=500), nullable=True),
            sa.Column("goal_type", sa.String(length=30), nullable=False),
            sa.Column("goal_value", sa.Integer(), nullable=False),
            sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("prize_reward_id", sa.Integer(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
            sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["family_id"], ["families.id"]),
            sa.ForeignKeyConstraint(["prize_reward_id"], ["reward_items.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_family_challenges_created_by_user_id"), "family_challenges", ["created_by_user_id"], unique=False)
        op.create_index(op.f("ix_family_challenges_ends_at"), "family_challenges", ["ends_at"], unique=False)
        op.create_index(op.f("ix_family_challenges_family_id"), "family_challenges", ["family_id"], unique=False)
        op.create_index(op.f("ix_family_challenges_is_active"), "family_challenges", ["is_active"], unique=False)


def downgrade() -> None:
    for index_name, table_name in [
        ("ix_family_challenges_is_active", "family_challenges"),
        ("ix_family_challenges_family_id", "family_challenges"),
        ("ix_family_challenges_ends_at", "family_challenges"),
        ("ix_family_challenges_created_by_user_id", "family_challenges"),
        ("ix_family_pin_acknowledgements_user_id", "family_pin_acknowledgements"),
        ("ix_family_pin_acknowledgements_pin_id", "family_pin_acknowledgements"),
        ("ix_family_pins_family_id", "family_pins"),
        ("ix_family_pins_created_by_user_id", "family_pins"),
        ("ix_family_pins_created_at", "family_pins"),
        ("ix_family_mood_checkins_user_id", "family_mood_checkins"),
        ("ix_family_mood_checkins_family_id", "family_mood_checkins"),
        ("ix_family_mood_checkins_checkin_date", "family_mood_checkins"),
        ("ix_family_wall_comments_post_id", "family_wall_comments"),
        ("ix_family_wall_comments_created_at", "family_wall_comments"),
        ("ix_family_wall_comments_author_id", "family_wall_comments"),
        ("ix_family_wall_reactions_user_id", "family_wall_reactions"),
        ("ix_family_wall_reactions_post_id", "family_wall_reactions"),
        ("ix_family_wall_posts_post_type", "family_wall_posts"),
        ("ix_family_wall_posts_family_id", "family_wall_posts"),
        ("ix_family_wall_posts_created_at", "family_wall_posts"),
        ("ix_family_wall_posts_author_id", "family_wall_posts"),
    ]:
        if _has_table(table_name):
            op.drop_index(index_name, table_name=table_name)

    for table_name in [
        "family_challenges",
        "family_pin_acknowledgements",
        "family_pins",
        "family_mood_checkins",
        "family_wall_comments",
        "family_wall_reactions",
        "family_wall_posts",
    ]:
        if _has_table(table_name):
            op.drop_table(table_name)
