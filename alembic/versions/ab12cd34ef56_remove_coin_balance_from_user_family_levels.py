"""remove_coin_balance_from_user_family_levels

Revision ID: ab12cd34ef56
Revises: 9a8b7c6d5e4f
Create Date: 2026-05-26 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = "ab12cd34ef56"
down_revision: Union[str, None] = "9a8b7c6d5e4f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(inspector: sa.Inspector, table_name: str, column_name: str) -> bool:
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if _has_column(inspector, "user_family_levels", "coin_balance"):
        with op.batch_alter_table("user_family_levels") as batch_op:
            batch_op.drop_column("coin_balance")


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not _has_column(inspector, "user_family_levels", "coin_balance"):
        with op.batch_alter_table("user_family_levels") as batch_op:
            batch_op.add_column(
                sa.Column("coin_balance", sa.Integer(), nullable=False, server_default="0")
            )
        with op.batch_alter_table("user_family_levels") as batch_op:
            batch_op.alter_column("coin_balance", server_default=None)
