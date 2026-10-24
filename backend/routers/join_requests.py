from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.dependencies import get_current_user, require_parent
from backend.models import ActivityLog, FamilyMember, JoinRequest, User
from backend.realtime import emit_family_event
from backend.services.invite_service import claim_invite, resolve_invite
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

    invite, family = await resolve_invite(db, code=code, qr_token=token)

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

    await claim_invite(db, invite, current_user.id)

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
