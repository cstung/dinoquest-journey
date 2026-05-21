"""add_video_test_difficulty

Revision ID: a9d4e6f1b2c3
Revises: 986862169f88
Create Date: 2026-05-21 22:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = "a9d4e6f1b2c3"
down_revision: Union[str, None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("video_tests")}
    if "difficulty" not in columns:
        op.add_column(
            "video_tests",
            sa.Column("difficulty", sa.String(length=20), nullable=False, server_default="medium"),
        )
        op.execute("UPDATE video_tests SET difficulty = 'medium' WHERE difficulty IS NULL")
        op.alter_column("video_tests", "difficulty", server_default=None)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("video_tests")}
    if "difficulty" in columns:
        op.drop_column("video_tests", "difficulty")
