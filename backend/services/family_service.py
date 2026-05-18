from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models import Family, FamilyMember


async def soft_delete_family(family: Family, db: AsyncSession) -> None:
    family.is_deleted = True
    family.deleted_at = datetime.now(timezone.utc)
    await db.flush()


async def auto_promote_or_delete(
    family: Family,
    leaving_user_id: int,
    db: AsyncSession,
) -> None:
    if family.owner_id != leaving_user_id:
        return

    next_parent = (
        await db.execute(
            select(FamilyMember)
            .where(
                FamilyMember.family_id == family.id,
                FamilyMember.role == "parent",
                FamilyMember.user_id != leaving_user_id,
            )
            .order_by(FamilyMember.joined_at.asc())
            .limit(1)
        )
    ).scalar_one_or_none()

    if next_parent:
        family.owner_id = next_parent.user_id
        await db.flush()
        return

    await soft_delete_family(family, db)

