"""remove_family_challenges

Revision ID: f1a2b3c4d5e6
Revises: e5f6a7b8c9d0
Create Date: 2026-05-21 17:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    if _has_table("family_mood_checkins"):
        with op.batch_alter_table("family_mood_checkins") as batch_op:
            batch_op.alter_column("mood", existing_type=sa.String(length=20), type_=sa.String(length=255))

    if not _has_table("family_challenges"):
        return
    for index_name in [
        "ix_family_challenges_is_active",
        "ix_family_challenges_family_id",
        "ix_family_challenges_ends_at",
        "ix_family_challenges_created_by_user_id",
    ]:
        op.drop_index(index_name, table_name="family_challenges")
    op.drop_table("family_challenges")


def downgrade() -> None:
    if _has_table("family_mood_checkins"):
        with op.batch_alter_table("family_mood_checkins") as batch_op:
            batch_op.alter_column("mood", existing_type=sa.String(length=255), type_=sa.String(length=20))

    if _has_table("family_challenges"):
        return
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
    op.create_index("ix_family_challenges_created_by_user_id", "family_challenges", ["created_by_user_id"], unique=False)
    op.create_index("ix_family_challenges_ends_at", "family_challenges", ["ends_at"], unique=False)
    op.create_index("ix_family_challenges_family_id", "family_challenges", ["family_id"], unique=False)
    op.create_index("ix_family_challenges_is_active", "family_challenges", ["is_active"], unique=False)
