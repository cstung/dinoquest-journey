"""harden_quest_recurrence_anchor

Revision ID: c4a8e1f9b2d7
Revises: b1a7c9d4e2f1
Create Date: 2026-05-21 10:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = "c4a8e1f9b2d7"
down_revision: Union[str, None] = "b1a7c9d4e2f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    quest_cols = {col["name"] for col in inspector.get_columns("quests")}

    if "recurrence_anchor_day" not in quest_cols:
        op.add_column("quests", sa.Column("recurrence_anchor_day", sa.Integer(), nullable=True))

    # Preserve monthly recurrence anchor day across short months.
    op.execute(
        """
        UPDATE quests
        SET recurrence_anchor_day = COALESCE(
            (
                SELECT CAST(strftime('%d', qa.cycle_start_at, '+7 hours') AS INTEGER)
                FROM quest_assignments AS qa
                WHERE qa.quest_id = quests.id
                ORDER BY qa.cycle_index ASC, qa.id ASC
                LIMIT 1
            ),
            CAST(strftime('%d', next_occurrence_at, '+7 hours') AS INTEGER),
            CAST(strftime('%d', created_at, '+7 hours') AS INTEGER)
        )
        WHERE frequency = 'monthly'
          AND recurrence_anchor_day IS NULL
        """
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    quest_cols = {col["name"] for col in inspector.get_columns("quests")}
    if "recurrence_anchor_day" in quest_cols:
        with op.batch_alter_table("quests") as batch_op:
            batch_op.drop_column("recurrence_anchor_day")
