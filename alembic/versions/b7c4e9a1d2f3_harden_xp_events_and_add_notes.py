"""harden_xp_events_and_add_notes

Revision ID: b7c4e9a1d2f3
Revises: a9d4e6f1b2c3
Create Date: 2026-05-22 10:40:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = "b7c4e9a1d2f3"
down_revision: Union[str, None] = "a9d4e6f1b2c3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("xp_events")}
    index_names = {idx["name"] for idx in inspector.get_indexes("xp_events")}

    if "note" not in columns:
        op.add_column("xp_events", sa.Column("note", sa.String(length=500), nullable=True))

    # Keep the earliest row per (family, user, reason, source) when source_id is present,
    # then enforce uniqueness to make award writes idempotent.
    op.execute(
        """
        DELETE FROM xp_events
        WHERE id IN (
            SELECT e1.id
            FROM xp_events e1
            JOIN xp_events e2
              ON e1.family_id = e2.family_id
             AND e1.user_id = e2.user_id
             AND e1.reason = e2.reason
             AND e1.source_id = e2.source_id
             AND e1.id > e2.id
            WHERE e1.source_id IS NOT NULL
        )
        """
    )

    if "uq_xp_events_family_user_reason_source" not in index_names:
        op.create_index(
            "uq_xp_events_family_user_reason_source",
            "xp_events",
            ["family_id", "user_id", "reason", "source_id"],
            unique=True,
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("xp_events")}
    index_names = {idx["name"] for idx in inspector.get_indexes("xp_events")}

    if "uq_xp_events_family_user_reason_source" in index_names:
        op.drop_index("uq_xp_events_family_user_reason_source", table_name="xp_events")
    if "note" in columns:
        op.drop_column("xp_events", "note")
