from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.dependencies import get_current_user, require_parent
from backend.models import ActivityLog, Family, FamilyInvite, FamilyMember, JoinRequest, User
from backend.realtime import emit_family_event
from backend.schemas.join_request import (
    JoinBody,
    JoinDecision,
    JoinRequestOut,
    JoinResult,
)

router = APIRouter()
legacy_router = APIRouter()


@router.post("/join", response_model=JoinResult)
async def join_family(
    body: JoinBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JoinResult:
    code = body.code.replace(" ", "") if body.code else None
    token = body.qr_token.strip() if body.qr_token else None
    if bool(code) == bool(token):
        raise HTTPException(status_code=400, detail="Provide either code or qr_token")

    invite_lookup = code if code else token
    if code:
        invite = (
            await db.execute(select(FamilyInvite).where(FamilyInvite.code == invite_lookup))
        ).scalar_one_or_none()
    else:
        invite = (
            await db.execute(select(FamilyInvite).where(FamilyInvite.qr_token == invite_lookup))
        ).scalar_one_or_none()

    if not invite:
        raise HTTPException(status_code=404, detail="Invalid invite code")
    if invite.revoked:
        raise HTTPException(status_code=400, detail="This invite code has been revoked")
    invite_expires_at = invite.expires_at
    if invite_expires_at.tzinfo is None:
        invite_expires_at = invite_expires_at.replace(tzinfo=timezone.utc)
    if invite_expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="This invite code has expired")
    if invite.used_by is not None:
        raise HTTPException(status_code=400, detail="This invite code has already been used")

    family = await db.get(Family, invite.family_id)
    if not family or family.is_deleted:
        raise HTTPException(status_code=404, detail="Family not found")

    existing_member = (
        await db.execute(
            select(FamilyMember).where(
                FamilyMember.family_id == invite.family_id,
                FamilyMember.user_id == current_user.id,
            )
        )
    ).scalar_one_or_none()
    if existing_member:
        raise HTTPException(status_code=400, detail="You are already a member of this family")

    joined_at = datetime.now(timezone.utc)
    db.add(
        FamilyMember(
            family_id=invite.family_id,
            user_id=current_user.id,
            role=invite.role,
            joined_at=joined_at,
        )
    )

    invite.used_by = current_user.id
    invite.used_at = joined_at

    db.add(
        ActivityLog(
            family_id=invite.family_id,
            user_id=current_user.id,
            event_type="member_joined",
            payload={"role": invite.role, "via": "invite_code"},
            is_audit=False,
        )
    )

    await db.commit()

    await emit_family_event(
        invite.family_id,
        "member_joined",
        {
            "userId": current_user.id,
            "username": current_user.username,
            "role": invite.role,
        },
    )
    return JoinResult(
        family_id=family.id,
        family_name=family.name,
        role=invite.role,
    )


@legacy_router.get("/families/{family_id}/join-requests", response_model=list[JoinRequestOut])
async def list_join_requests(
    parent_member: FamilyMember = Depends(require_parent),
    db: AsyncSession = Depends(get_db),
) -> list[JoinRequestOut]:
    rows = await db.execute(
        select(JoinRequest, User)
        .join(User, User.id == JoinRequest.user_id)
        .where(
            JoinRequest.family_id == parent_member.family_id,
            JoinRequest.status == "pending",
        )
        .order_by(JoinRequest.requested_at.asc())
    )
    return [
        JoinRequestOut(
            id=req.id,
            family_id=req.family_id,
            user_id=req.user_id,
            username=user.username,
            status=req.status,
            requested_at=req.requested_at,
        )
        for req, user in rows.all()
    ]


@legacy_router.patch("/families/{family_id}/join-requests/{join_request_id}", response_model=JoinRequestOut)
async def decide_join_request(
    join_request_id: int,
    body: JoinDecision,
    parent_member: FamilyMember = Depends(require_parent),
    db: AsyncSession = Depends(get_db),
) -> JoinRequestOut:
    decision = body.status.lower().strip()
    if decision not in {"approved", "rejected"}:
        raise HTTPException(status_code=400, detail='Status must be "approved" or "rejected"')

    row = (
        await db.execute(
            select(JoinRequest, User)
            .join(User, User.id == JoinRequest.user_id)
            .where(
                JoinRequest.id == join_request_id,
                JoinRequest.family_id == parent_member.family_id,
            )
        )
    ).one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Join request not found")

    req, user = row
    if req.status != "pending":
        raise HTTPException(status_code=400, detail="Join request already resolved")

    req.status = decision
    req.resolved_by = parent_member.user_id
    req.resolved_at = datetime.now(timezone.utc)

    if decision == "approved":
        db.add(
            FamilyMember(
                family_id=req.family_id,
                user_id=req.user_id,
                role="child",
            )
        )
        db.add(
            ActivityLog(
                family_id=req.family_id,
                user_id=parent_member.user_id,
                event_type="member_joined",
                payload={"user_id": req.user_id},
                is_audit=False,
            )
        )

    db.add(
        ActivityLog(
            family_id=req.family_id,
            user_id=parent_member.user_id,
            event_type="join_request_resolved",
            payload={"join_request_id": req.id, "status": decision, "user_id": req.user_id},
            is_audit=True,
        )
    )

    await db.commit()
    await db.refresh(req)
    return JoinRequestOut(
        id=req.id,
        family_id=req.family_id,
        user_id=req.user_id,
        username=user.username,
        status=req.status,
        requested_at=req.requested_at,
    )
