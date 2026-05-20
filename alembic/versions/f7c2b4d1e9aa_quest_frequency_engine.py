"""quest_frequency_engine

Revision ID: f7c2b4d1e9aa
Revises: d3b8f4d2a1b0
Create Date: 2026-05-20 12:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = "f7c2b4d1e9aa"
down_revision: Union[str, None] = "d3b8f4d2a1b0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    quest_cols = {col["name"] for col in inspector.get_columns("quests")}
    if "frequency" not in quest_cols:
        op.add_column("quests", sa.Column("frequency", sa.Text(), nullable=False, server_default="once"))
    if "next_occurrence_at" not in quest_cols:
        op.add_column("quests", sa.Column("next_occurrence_at", sa.DateTime(timezone=True), nullable=True))
    if "recurrence_end_at" not in quest_cols:
        op.add_column("quests", sa.Column("recurrence_end_at", sa.DateTime(timezone=True), nullable=True))

    if "is_recurring" in quest_cols:
        op.execute(
            """
            UPDATE quests
            SET frequency = CASE
                WHEN is_recurring = 1 THEN 'daily'
                ELSE 'once'
            END
            """
        )
        with op.batch_alter_table("quests") as batch_op:
            batch_op.drop_column("is_recurring")

    qa_cols = {col["name"] for col in inspector.get_columns("quest_assignments")}
    if "cycle_index" not in qa_cols:
        op.add_column("quest_assignments", sa.Column("cycle_index", sa.Integer(), nullable=False, server_default="1"))
    if "cycle_due_at" not in qa_cols:
        op.add_column("quest_assignments", sa.Column("cycle_due_at", sa.DateTime(timezone=True), nullable=True))
    if "cycle_start_at" not in qa_cols:
        op.add_column(
            "quest_assignments",
            sa.Column("cycle_start_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        )
    op.execute("UPDATE quest_assignments SET cycle_start_at = COALESCE(cycle_start_at, created_at)")

    unique_constraints = {uc["name"] for uc in inspector.get_unique_constraints("quest_assignments") if uc.get("name")}
    with op.batch_alter_table("quest_assignments") as batch_op:
        if "uq_quest_assignment" in unique_constraints:
            batch_op.drop_constraint("uq_quest_assignment", type_="unique")
        if "uq_quest_assignment_cycle" not in unique_constraints:
            batch_op.create_unique_constraint(
                "uq_quest_assignment_cycle",
                ["quest_id", "user_id", "cycle_index"],
            )

    ufl_cols = {col["name"] for col in inspector.get_columns("user_family_levels")}
    if "current_streak" not in ufl_cols:
        op.add_column("user_family_levels", sa.Column("current_streak", sa.Integer(), nullable=False, server_default="0"))
    if "best_streak" not in ufl_cols:
        op.add_column("user_family_levels", sa.Column("best_streak", sa.Integer(), nullable=False, server_default="0"))
    if "last_completed_date" not in ufl_cols:
        op.add_column("user_family_levels", sa.Column("last_completed_date", sa.Date(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    quest_cols = {col["name"] for col in inspector.get_columns("quests")}
    if "is_recurring" not in quest_cols:
        with op.batch_alter_table("quests") as batch_op:
            batch_op.add_column(sa.Column("is_recurring", sa.Boolean(), nullable=False, server_default=sa.false()))
        op.execute("UPDATE quests SET is_recurring = CASE WHEN frequency = 'once' THEN 0 ELSE 1 END")

    quest_cols = {col["name"] for col in inspector.get_columns("quests")}
    with op.batch_alter_table("quests") as batch_op:
        if "recurrence_end_at" in quest_cols:
            batch_op.drop_column("recurrence_end_at")
        if "next_occurrence_at" in quest_cols:
            batch_op.drop_column("next_occurrence_at")
        if "frequency" in quest_cols:
            batch_op.drop_column("frequency")

    qa_cols = {col["name"] for col in inspector.get_columns("quest_assignments")}
    unique_constraints = {uc["name"] for uc in inspector.get_unique_constraints("quest_assignments") if uc.get("name")}
    with op.batch_alter_table("quest_assignments") as batch_op:
        if "uq_quest_assignment_cycle" in unique_constraints:
            batch_op.drop_constraint("uq_quest_assignment_cycle", type_="unique")
        if "uq_quest_assignment" not in unique_constraints:
            batch_op.create_unique_constraint("uq_quest_assignment", ["quest_id", "user_id"])
        if "cycle_start_at" in qa_cols:
            batch_op.drop_column("cycle_start_at")
        if "cycle_due_at" in qa_cols:
            batch_op.drop_column("cycle_due_at")
        if "cycle_index" in qa_cols:
            batch_op.drop_column("cycle_index")

    ufl_cols = {col["name"] for col in inspector.get_columns("user_family_levels")}
    with op.batch_alter_table("user_family_levels") as batch_op:
        if "last_completed_date" in ufl_cols:
            batch_op.drop_column("last_completed_date")
        if "best_streak" in ufl_cols:
            batch_op.drop_column("best_streak")
        if "current_streak" in ufl_cols:
            batch_op.drop_column("current_streak")
