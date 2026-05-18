from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, Depends, HTTPException, Response, status

from backend.database import get_db
from backend.dependencies import get_active_membership, get_current_user, require_parent
from backend.models import ActivityLog, Family, FamilyMember, User
from backend.schemas.family import FamilyCreate, FamilyOut, FamilyUpdate, FamilyWithRoleOut
from backend.services.family_service import soft_delete_family

router = APIRouter()


async def _family_out(family: Family, member_count: int, my_role: str | None = None) -> FamilyOut | FamilyWithRoleOut:
    base = FamilyOut(
        id=family.id,
        name=family.name,
        motto=family.motto,
        avatar_url=family.avatar_url,
        color_hex=family.color_hex,
        owner_id=family.owner_id,
        member_count=member_count,
        created_at=family.created_at,
    )
    if my_role is None:
        return base
    return FamilyWithRoleOut(**base.model_dump(), my_role=my_role)


@router.get("", response_model=list[FamilyWithRoleOut])
async def list_families(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[FamilyWithRoleOut]:
    rows = await db.execute(
        select(Family, FamilyMember.role, func.count(FamilyMember.user_id).over(partition_by=Family.id).label("member_count"))
        .join(FamilyMember, FamilyMember.family_id == Family.id)
        .where(
            FamilyMember.user_id == current_user.id,
            Family.is_deleted.is_(False),
        )
        .order_by(Family.created_at.desc())
    )
    result: list[FamilyWithRoleOut] = []
    seen: set[int] = set()
    for family, role, member_count in rows.all():
        if family.id in seen:
            continue
        seen.add(family.id)
        result.append(
            await _family_out(family, int(member_count), role)  # type: ignore[arg-type]
        )
    return result


@router.post("", response_model=FamilyOut, status_code=status.HTTP_201_CREATED)
async def create_family(
    body: FamilyCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FamilyOut:
    family = Family(
        owner_id=current_user.id,
        name=body.name,
        motto=body.motto,
        color_hex=body.color_hex,
    )
    db.add(family)
    await db.flush()
    db.add(
        FamilyMember(
            family_id=family.id,
            user_id=current_user.id,
            role="parent",
        )
    )
    db.add(
        ActivityLog(
            family_id=family.id,
            user_id=current_user.id,
            event_type="family_created",
            payload={"name": family.name},
            is_audit=True,
        )
    )
    await db.commit()
    await db.refresh(family)
    return await _family_out(family, 1)


@router.get("/{family_id}", response_model=FamilyWithRoleOut)
async def get_family(
    membership: FamilyMember = Depends(get_active_membership),
    db: AsyncSession = Depends(get_db),
) -> FamilyWithRoleOut:
    family = await db.get(Family, membership.family_id)
    if not family or family.is_deleted:
        raise HTTPException(status_code=404, detail="Family not found")
    member_count = (
        await db.execute(
            select(func.count(FamilyMember.user_id)).where(FamilyMember.family_id == membership.family_id)
        )
    ).scalar_one()
    return await _family_out(family, int(member_count), membership.role)  # type: ignore[arg-type]


@router.patch("/{family_id}", response_model=FamilyOut)
async def update_family(
    body: FamilyUpdate,
    parent_member: FamilyMember = Depends(require_parent),
    db: AsyncSession = Depends(get_db),
) -> FamilyOut:
    family = await db.get(Family, parent_member.family_id)
    if not family or family.is_deleted:
        raise HTTPException(status_code=404, detail="Family not found")

    if body.name is not None:
        family.name = body.name.strip()
    if body.motto is not None:
        family.motto = body.motto.strip() or None
    if body.color_hex is not None:
        family.color_hex = body.color_hex

    db.add(
        ActivityLog(
            family_id=family.id,
            user_id=parent_member.user_id,
            event_type="family_updated",
            payload={"name": family.name, "motto": family.motto, "color_hex": family.color_hex},
            is_audit=True,
        )
    )
    await db.commit()
    await db.refresh(family)

    member_count = (
        await db.execute(
            select(func.count(FamilyMember.user_id)).where(FamilyMember.family_id == family.id)
        )
    ).scalar_one()
    return await _family_out(family, int(member_count))


@router.delete(
    "/{family_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    response_model=None,
)
async def delete_family(
    membership: FamilyMember = Depends(get_active_membership),
    db: AsyncSession = Depends(get_db),
) -> Response:
    family = await db.get(Family, membership.family_id)
    if not family or family.is_deleted:
        raise HTTPException(status_code=404, detail="Family not found")
    if family.owner_id != membership.user_id:
        raise HTTPException(status_code=403, detail="Only the family owner can delete the family")

    await soft_delete_family(family, db)
    db.add(
        ActivityLog(
            family_id=family.id,
            user_id=membership.user_id,
            event_type="family_deleted",
            payload=None,
            is_audit=True,
        )
    )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
