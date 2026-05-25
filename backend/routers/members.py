from __future__ import annotations

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, Depends, HTTPException, Response, status

from backend.database import get_db
from backend.dependencies import get_active_membership, require_parent_or_superadmin
from backend.models import ActivityLog, Family, FamilyMember, User, UserFamilyLevel, XpEvent
from backend.realtime import emit_family_event
from backend.schemas.member import LevelUpOut, MemberOut, MemberRoleUpdate
from backend.services.family_service import auto_promote_or_delete
from backend.services.xp_engine import XpReason, xp_cost_for_level_up

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
    family_id: int,
    user_id: int,
    body: MemberRoleUpdate,
    current_user: User = Depends(require_parent_or_superadmin),
    db: AsyncSession = Depends(get_db),
) -> MemberOut:
    target = (
        await db.execute(
            select(FamilyMember, User)
            .join(User, User.id == FamilyMember.user_id)
            .where(
                FamilyMember.family_id == family_id,
                FamilyMember.user_id == user_id,
            )
        )
    ).one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")

    member_row, user_row = target
    family = await db.get(Family, family_id)
    if family and family.owner_id == user_id and body.role != "parent":
        raise HTTPException(status_code=400, detail="Family owner must remain a parent")

    member_row.role = body.role
    db.add(
        ActivityLog(
            family_id=family_id,
            user_id=current_user.id,
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
    family_id: int,
    user_id: int,
    current_user: User = Depends(require_parent_or_superadmin),
    db: AsyncSession = Depends(get_db),
) -> Response:
    target = (
        await db.execute(
            select(FamilyMember).where(
                FamilyMember.family_id == family_id,
                FamilyMember.user_id == user_id,
            )
        )
    ).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")

    family = await db.get(Family, family_id)
    if not family or family.is_deleted:
        raise HTTPException(status_code=404, detail="Family not found")

    await db.delete(target)

    if user_id == family.owner_id:
        await auto_promote_or_delete(family, user_id, db)

    db.add(
        ActivityLog(
            family_id=family_id,
            user_id=current_user.id,
            event_type="member_removed",
            payload={"target_user_id": user_id},
            is_audit=True,
        )
    )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{family_id}/members/me/level-up", response_model=LevelUpOut)
async def level_up_me(
    membership: FamilyMember = Depends(get_active_membership),
    db: AsyncSession = Depends(get_db),
) -> LevelUpOut:
    level_row = (
        await db.execute(
            select(UserFamilyLevel).where(
                UserFamilyLevel.family_id == membership.family_id,
                UserFamilyLevel.user_id == membership.user_id,
            )
        )
    ).scalar_one_or_none()
    if not level_row:
        level_row = UserFamilyLevel(
            family_id=membership.family_id,
            user_id=membership.user_id,
            xp_balance=0,
            level=1,
        )
        db.add(level_row)
        await db.flush()

    current_level = max(level_row.level, 1)
    current_balance = max(level_row.xp_balance, 0)
    cost = xp_cost_for_level_up(current_level)
    if current_balance < cost:
        raise HTTPException(
            status_code=400,
            detail={"msg": "Not enough XP to level up.", "code": "insufficient_xp"},
        )

    applied = await db.execute(
        update(UserFamilyLevel)
        .where(
            UserFamilyLevel.id == level_row.id,
            UserFamilyLevel.level == current_level,
            UserFamilyLevel.xp_balance == current_balance,
        )
        .values(
            xp_balance=current_balance - cost,
            level=current_level + 1,
        )
    )
    if applied.rowcount != 1:
        raise HTTPException(
            status_code=409,
            detail={"msg": "Level changed during request. Please try again.", "code": "level_conflict"},
        )

    db.add(
        XpEvent(
            family_id=membership.family_id,
            user_id=membership.user_id,
            delta=-cost,
            reason=XpReason.LEVEL_UP.value,
            source_id=None,
        )
    )
    db.add(
        ActivityLog(
            family_id=membership.family_id,
            user_id=membership.user_id,
            event_type="level_up",
            payload={"xp_spent": cost, "new_level": current_level + 1},
            is_audit=False,
        )
    )
    await db.commit()

    await emit_family_event(
        membership.family_id,
        "xp_earned",
        {"userId": membership.user_id, "delta": -cost, "reason": XpReason.LEVEL_UP.value},
    )
    await emit_family_event(
        membership.family_id,
        "leaderboard_update",
        {"userId": membership.user_id},
    )

    return LevelUpOut(
        new_level=current_level + 1,
        xp_spent=cost,
        xp_balance=current_balance - cost,
    )
