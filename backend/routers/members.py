from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, Depends, HTTPException, Response, status

from backend.database import get_db
from backend.dependencies import get_active_membership, require_parent
from backend.models import ActivityLog, Family, FamilyMember, User
from backend.schemas.member import MemberOut, MemberRoleUpdate
from backend.services.family_service import auto_promote_or_delete

router = APIRouter()


@router.get("/{family_id}/members", response_model=list[MemberOut])
async def list_members(
    membership: FamilyMember = Depends(get_active_membership),
    db: AsyncSession = Depends(get_db),
) -> list[MemberOut]:
    rows = await db.execute(
        select(FamilyMember, User)
        .join(User, User.id == FamilyMember.user_id)
        .where(FamilyMember.family_id == membership.family_id)
        .order_by(FamilyMember.joined_at.asc())
    )
    return [
        MemberOut(
            user_id=member.user_id,
            username=user.username,
            role=member.role,
            nickname=member.nickname,
            avatar_color=member.avatar_color,
            joined_at=member.joined_at,
        )
        for member, user in rows.all()
    ]


@router.patch("/{family_id}/members/{user_id}/role", response_model=MemberOut)
async def update_member_role(
    user_id: int,
    body: MemberRoleUpdate,
    parent_member: FamilyMember = Depends(require_parent),
    db: AsyncSession = Depends(get_db),
) -> MemberOut:
    target = (
        await db.execute(
            select(FamilyMember, User)
            .join(User, User.id == FamilyMember.user_id)
            .where(
                FamilyMember.family_id == parent_member.family_id,
                FamilyMember.user_id == user_id,
            )
        )
    ).one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")

    member_row, user_row = target
    family = await db.get(Family, parent_member.family_id)
    if family and family.owner_id == user_id and body.role != "parent":
        raise HTTPException(status_code=400, detail="Family owner must remain a parent")

    member_row.role = body.role
    db.add(
        ActivityLog(
            family_id=parent_member.family_id,
            user_id=parent_member.user_id,
            event_type="role_changed",
            payload={"target_user_id": user_id, "role": body.role},
            is_audit=True,
        )
    )
    await db.commit()
    await db.refresh(member_row)
    return MemberOut(
        user_id=member_row.user_id,
        username=user_row.username,
        role=member_row.role,
        nickname=member_row.nickname,
        avatar_color=member_row.avatar_color,
        joined_at=member_row.joined_at,
    )


@router.delete(
    "/{family_id}/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    response_model=None,
)
async def remove_member(
    user_id: int,
    parent_member: FamilyMember = Depends(require_parent),
    db: AsyncSession = Depends(get_db),
) -> Response:
    target = (
        await db.execute(
            select(FamilyMember).where(
                FamilyMember.family_id == parent_member.family_id,
                FamilyMember.user_id == user_id,
            )
        )
    ).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")

    family = await db.get(Family, parent_member.family_id)
    if not family or family.is_deleted:
        raise HTTPException(status_code=404, detail="Family not found")

    await db.delete(target)

    if user_id == family.owner_id:
        await auto_promote_or_delete(family, user_id, db)

    db.add(
        ActivityLog(
            family_id=parent_member.family_id,
            user_id=parent_member.user_id,
            event_type="member_removed",
            payload={"target_user_id": user_id},
            is_audit=True,
        )
    )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
