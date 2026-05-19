"""make_family_invite_qr_token_nullable

Revision ID: d3b8f4d2a1b0
Revises: 8ace4d786541
Create Date: 2026-05-19 10:25:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d3b8f4d2a1b0"
down_revision: Union[str, None] = "8ace4d786541"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("family_invites") as batch_op:
        batch_op.alter_column(
            "qr_token",
            existing_type=sa.String(length=64),
            nullable=True,
        )


def downgrade() -> None:
    with op.batch_alter_table("family_invites") as batch_op:
        batch_op.alter_column(
            "qr_token",
            existing_type=sa.String(length=64),
            nullable=False,
        )
