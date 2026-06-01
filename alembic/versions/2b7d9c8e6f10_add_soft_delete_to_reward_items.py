"""add_soft_delete_to_reward_items

Revision ID: 2b7d9c8e6f10
Revises: 1c6e9a4b7d8f
Create Date: 2026-06-01 10:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = "2b7d9c8e6f10"
down_revision: Union[str, None] = "1c6e9a4b7d8f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table_name: str, column_name: str) -> bool:
    columns = inspect(op.get_bind()).get_columns(table_name)
    return any(column.get("name") == column_name for column in columns)


def upgrade() -> None:
    if not _has_column("reward_items", "is_deleted"):
        op.add_column(
            "reward_items",
            sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        )


def downgrade() -> None:
    if _has_column("reward_items", "is_deleted"):
        op.drop_column("reward_items", "is_deleted")
