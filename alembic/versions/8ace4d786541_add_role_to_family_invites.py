"""add_role_to_family_invites

Revision ID: 8ace4d786541
Revises: 6f9b7d2a1c3e
Create Date: 2026-05-19 08:50:30.295940

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8ace4d786541'
down_revision: Union[str, None] = '6f9b7d2a1c3e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "family_invites",
        sa.Column("role", sa.String(length=20), nullable=False, server_default="child"),
    )


def downgrade() -> None:
    op.drop_column("family_invites", "role")
