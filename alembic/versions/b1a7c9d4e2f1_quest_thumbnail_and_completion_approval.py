"""quest_thumbnail_and_completion_approval

Revision ID: b1a7c9d4e2f1
Revises: f7c2b4d1e9aa
Create Date: 2026-05-20 16:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = "b1a7c9d4e2f1"
down_revision: Union[str, None] = "f7c2b4d1e9aa"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    quest_cols = {col["name"] for col in inspector.get_columns("quests")}
    if "thumbnail_url" not in quest_cols:
        op.add_column("quests", sa.Column("thumbnail_url", sa.Text(), nullable=True))

    qa_cols = {col["name"] for col in inspector.get_columns("quest_assignments")}
    if "completion_requested_at" not in qa_cols:
        op.add_column("quest_assignments", sa.Column("completion_requested_at", sa.DateTime(timezone=True), nullable=True))
    if "reviewed_at" not in qa_cols:
        op.add_column("quest_assignments", sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True))
    if "reviewed_by" not in qa_cols:
        op.add_column("quest_assignments", sa.Column("reviewed_by", sa.Integer(), nullable=True))

    fk_names = {fk["name"] for fk in inspector.get_foreign_keys("quest_assignments") if fk.get("name")}
    with op.batch_alter_table("quest_assignments") as batch_op:
        if "fk_quest_assignments_reviewed_by_users" not in fk_names:
            batch_op.create_foreign_key(
                "fk_quest_assignments_reviewed_by_users",
                "users",
                ["reviewed_by"],
                ["id"],
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    qa_cols = {col["name"] for col in inspector.get_columns("quest_assignments")}
    fk_names = {fk["name"] for fk in inspector.get_foreign_keys("quest_assignments") if fk.get("name")}
    with op.batch_alter_table("quest_assignments") as batch_op:
        if "fk_quest_assignments_reviewed_by_users" in fk_names:
            batch_op.drop_constraint("fk_quest_assignments_reviewed_by_users", type_="foreignkey")
        if "reviewed_by" in qa_cols:
            batch_op.drop_column("reviewed_by")
        if "reviewed_at" in qa_cols:
            batch_op.drop_column("reviewed_at")
        if "completion_requested_at" in qa_cols:
            batch_op.drop_column("completion_requested_at")

    quest_cols = {col["name"] for col in inspector.get_columns("quests")}
    if "thumbnail_url" in quest_cols:
        op.drop_column("quests", "thumbnail_url")
