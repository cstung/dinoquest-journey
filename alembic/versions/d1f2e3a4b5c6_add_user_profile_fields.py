"""add_user_profile_fields

Revision ID: d1f2e3a4b5c6
Revises: c9e1f7a2b3d4
Create Date: 2026-05-24 17:20:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = "d1f2e3a4b5c6"
down_revision: Union[str, None] = "c9e1f7a2b3d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(inspector, table: str, column: str) -> bool:
    return column in {col["name"] for col in inspector.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    with op.batch_alter_table("users") as batch_op:
        if not _has_column(inspector, "users", "nickname"):
            batch_op.add_column(sa.Column("nickname", sa.String(length=50), nullable=True))
        if not _has_column(inspector, "users", "avatar_url"):
            batch_op.add_column(sa.Column("avatar_url", sa.String(length=500), nullable=True))
        if not _has_column(inspector, "users", "birthday"):
            batch_op.add_column(sa.Column("birthday", sa.DateTime(timezone=True), nullable=True))
        if not _has_column(inspector, "users", "height_cm"):
            batch_op.add_column(sa.Column("height_cm", sa.Float(), nullable=True))
        if not _has_column(inspector, "users", "weight_kg"):
            batch_op.add_column(sa.Column("weight_kg", sa.Float(), nullable=True))
        if not _has_column(inspector, "users", "gender"):
            batch_op.add_column(sa.Column("gender", sa.String(length=30), nullable=True))
        if not _has_column(inspector, "users", "school_grade"):
            batch_op.add_column(sa.Column("school_grade", sa.String(length=30), nullable=True))
        if not _has_column(inspector, "users", "favorite_dino"):
            batch_op.add_column(sa.Column("favorite_dino", sa.String(length=100), nullable=True))
        if not _has_column(inspector, "users", "catchphrase"):
            batch_op.add_column(sa.Column("catchphrase", sa.String(length=200), nullable=True))
        if not _has_column(inspector, "users", "favorite_subject"):
            batch_op.add_column(
                sa.Column(
                    "favorite_subject",
                    sa.String(length=50),
                    nullable=False,
                    server_default="Other",
                )
            )
        if not _has_column(inspector, "users", "fun_fact"):
            batch_op.add_column(sa.Column("fun_fact", sa.Text(), nullable=True))
        if not _has_column(inspector, "users", "bio"):
            batch_op.add_column(sa.Column("bio", sa.Text(), nullable=True))

    op.execute("UPDATE users SET favorite_subject = 'Other' WHERE favorite_subject IS NULL")

    with op.batch_alter_table("users") as batch_op:
        if _has_column(inspector, "users", "favorite_subject"):
            batch_op.alter_column("favorite_subject", server_default=None)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    with op.batch_alter_table("users") as batch_op:
        if _has_column(inspector, "users", "bio"):
            batch_op.drop_column("bio")
        if _has_column(inspector, "users", "fun_fact"):
            batch_op.drop_column("fun_fact")
        if _has_column(inspector, "users", "favorite_subject"):
            batch_op.drop_column("favorite_subject")
        if _has_column(inspector, "users", "catchphrase"):
            batch_op.drop_column("catchphrase")
        if _has_column(inspector, "users", "favorite_dino"):
            batch_op.drop_column("favorite_dino")
        if _has_column(inspector, "users", "school_grade"):
            batch_op.drop_column("school_grade")
        if _has_column(inspector, "users", "gender"):
            batch_op.drop_column("gender")
        if _has_column(inspector, "users", "weight_kg"):
            batch_op.drop_column("weight_kg")
        if _has_column(inspector, "users", "height_cm"):
            batch_op.drop_column("height_cm")
        if _has_column(inspector, "users", "birthday"):
            batch_op.drop_column("birthday")
        if _has_column(inspector, "users", "avatar_url"):
            batch_op.drop_column("avatar_url")
        if _has_column(inspector, "users", "nickname"):
            batch_op.drop_column("nickname")
