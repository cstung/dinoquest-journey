"""add_coin_balance_to_user_family_levels

Revision ID: 9a8b7c6d5e4f
Revises: d1f2e3a4b5c6
Create Date: 2026-05-26 09:10:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = "9a8b7c6d5e4f"
down_revision: Union[str, None] = "d1f2e3a4b5c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(inspector, table: str, column: str) -> bool:
    return column in {col["name"] for col in inspector.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if not _has_column(inspector, "user_family_levels", "coin_balance"):
        with op.batch_alter_table("user_family_levels") as batch_op:
            batch_op.add_column(
                sa.Column("coin_balance", sa.Integer(), nullable=False, server_default="0")
            )
        with op.batch_alter_table("user_family_levels") as batch_op:
            batch_op.alter_column("coin_balance", server_default=None)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if _has_column(inspector, "user_family_levels", "coin_balance"):
        with op.batch_alter_table("user_family_levels") as batch_op:
            batch_op.drop_column("coin_balance")
