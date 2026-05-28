"""add_performance_indexes_for_p1_queries

Revision ID: 1c6e9a4b7d8f
Revises: ab12cd34ef56
Create Date: 2026-05-28 23:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = "1c6e9a4b7d8f"
down_revision: Union[str, None] = "ab12cd34ef56"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(table_name: str) -> bool:
    return table_name in inspect(op.get_bind()).get_table_names()


def _has_index(table_name: str, index_name: str) -> bool:
    if not _has_table(table_name):
        return False
    indexes = inspect(op.get_bind()).get_indexes(table_name)
    return any(index.get("name") == index_name for index in indexes)


def _create_index_if_missing(index_name: str, table_name: str, columns: list[str]) -> None:
    if _has_table(table_name) and not _has_index(table_name, index_name):
        op.create_index(index_name, table_name, columns, unique=False)


def _drop_index_if_exists(index_name: str, table_name: str) -> None:
    if _has_index(table_name, index_name):
        op.drop_index(index_name, table_name=table_name)


def upgrade() -> None:
    # Activity list (family + audit flag + cursor/order path).
    _create_index_if_missing(
        "ix_activity_log_family_audit_created_id",
        "activity_log",
        ["family_id", "is_audit", "created_at", "id"],
    )

    # Quest list pagination and batched latest-cycle assignment lookups.
    _create_index_if_missing(
        "ix_quests_family_created_id",
        "quests",
        ["family_id", "created_at", "id"],
    )
    _create_index_if_missing(
        "ix_quest_assignments_family_user_quest_cycle",
        "quest_assignments",
        ["family_id", "user_id", "quest_id", "cycle_index"],
    )
    _create_index_if_missing(
        "ix_quest_assignments_quest_cycle",
        "quest_assignments",
        ["quest_id", "cycle_index"],
    )

    # Test list pagination, batched assignment status, and reopen request grouping.
    _create_index_if_missing(
        "ix_video_tests_family_created_id",
        "video_tests",
        ["family_id", "created_at", "id"],
    )
    _create_index_if_missing(
        "ix_test_assignments_family_test_user",
        "test_assignments",
        ["family_id", "test_id", "user_id"],
    )
    _create_index_if_missing(
        "ix_test_attempts_assignment_submitted_id",
        "test_attempts",
        ["assignment_id", "submitted_at", "id"],
    )
    _create_index_if_missing(
        "ix_test_reopen_requests_status_attempt",
        "test_reopen_requests",
        ["status", "attempt_id"],
    )

    # Dashboard feed and wall interaction aggregations.
    _create_index_if_missing(
        "ix_family_wall_posts_family_created_id",
        "family_wall_posts",
        ["family_id", "created_at", "id"],
    )
    _create_index_if_missing(
        "ix_family_wall_reactions_post_emoji",
        "family_wall_reactions",
        ["post_id", "emoji"],
    )

    # Pins active listing (family + expiry filter).
    _create_index_if_missing(
        "ix_family_pins_family_expires_at",
        "family_pins",
        ["family_id", "expires_at"],
    )

    # Dashboard stats over recent xp events.
    _create_index_if_missing(
        "ix_xp_events_family_created_at",
        "xp_events",
        ["family_id", "created_at"],
    )


def downgrade() -> None:
    _drop_index_if_exists("ix_xp_events_family_created_at", "xp_events")
    _drop_index_if_exists("ix_family_pins_family_expires_at", "family_pins")
    _drop_index_if_exists("ix_family_wall_reactions_post_emoji", "family_wall_reactions")
    _drop_index_if_exists("ix_family_wall_posts_family_created_id", "family_wall_posts")
    _drop_index_if_exists("ix_test_reopen_requests_status_attempt", "test_reopen_requests")
    _drop_index_if_exists("ix_test_attempts_assignment_submitted_id", "test_attempts")
    _drop_index_if_exists("ix_test_assignments_family_test_user", "test_assignments")
    _drop_index_if_exists("ix_video_tests_family_created_id", "video_tests")
    _drop_index_if_exists("ix_quest_assignments_quest_cycle", "quest_assignments")
    _drop_index_if_exists("ix_quest_assignments_family_user_quest_cycle", "quest_assignments")
    _drop_index_if_exists("ix_quests_family_created_id", "quests")
    _drop_index_if_exists("ix_activity_log_family_audit_created_id", "activity_log")
