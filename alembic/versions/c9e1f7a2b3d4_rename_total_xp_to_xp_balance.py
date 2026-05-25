"""rename_total_xp_to_xp_balance

Revision ID: c9e1f7a2b3d4
Revises: b7c4e9a1d2f3
Create Date: 2026-05-22 22:10:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = "c9e1f7a2b3d4"
down_revision: Union[str, None] = "b7c4e9a1d2f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("user_family_levels")}
    if "total_xp" in columns and "xp_balance" not in columns:
        with op.batch_alter_table("user_family_levels") as batch_op:
            batch_op.alter_column(
                "total_xp",
                new_column_name="xp_balance",
                existing_type=sa.Integer(),
                existing_nullable=False,
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("user_family_levels")}
    if "xp_balance" in columns and "total_xp" not in columns:
        with op.batch_alter_table("user_family_levels") as batch_op:
            batch_op.alter_column(
                "xp_balance",
                new_column_name="total_xp",
                existing_type=sa.Integer(),
                existing_nullable=False,
            )
