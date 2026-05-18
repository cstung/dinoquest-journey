"""add_reward_thumbnail_url

Revision ID: 6f9b7d2a1c3e
Revises: 986862169f88
Create Date: 2026-05-18 23:35:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = "6f9b7d2a1c3e"
down_revision: Union[str, None] = "986862169f88"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("reward_items")}
    if "thumbnail_url" not in columns:
        op.add_column("reward_items", sa.Column("thumbnail_url", sa.Text(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("reward_items")}
    if "thumbnail_url" in columns:
        op.drop_column("reward_items", "thumbnail_url")
