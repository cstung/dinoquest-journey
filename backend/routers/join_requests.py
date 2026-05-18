from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.dependencies import get_current_user, require_parent
from backend.models import ActivityLog, FamilyInvite, FamilyMember, JoinRequest, User
from backend.schemas.join_request import JoinByCodeRequest, JoinDecision, JoinRequestOut

router = APIRouter()


@router.post("/join", response_model=JoinRequestOut, status_code=status.HTTP_201_CREATED)
async def join_family(
    body: JoinByCodeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JoinRequestOut:
    now = datetime.now(timezone.utc)
    filters = [FamilyInvite.revoked.is_(False), FamilyInvite.expires_at >= now]
    if body.code:
        filters.append(FamilyInvite.code == body.code.replace(" ", ""))
    if body.qr_token:
        filters.append(FamilyInvite.qr_token == body.qr_token)

    invite = (await db.execute(select(FamilyInvite).where(and_(*filters)))).scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found or expired")

    existing_member = (
        await db.execute(
            select(FamilyMember).where(
                FamilyMember.family_id == invite.family_id,
                FamilyMember.user_id == current_user.id,
            )
        )
    ).scalar_one_or_none()
    if existing_member:
        raise HTTPException(status_code=400, detail="Already a member of this family")

    pending = (
        await db.execute(
            select(JoinRequest).where(
                JoinRequest.family_id == invite.family_id,
                JoinRequest.user_id == current_user.id,
                JoinRequest.status == "pending",
            )
        )
    ).scalar_one_or_none()
    if pending:
        raise HTTPException(status_code=400, detail="Join request already pending")

    join_request = JoinRequest(
        family_id=invite.family_id,
        user_id=current_user.id,
        status="pending",
    )
    db.add(join_request)
    db.add(
        ActivityLog(
            family_id=invite.family_id,
            user_id=current_user.id,
            event_type="join_requested",
            payload={"invite_id": invite.id},
            is_audit=True,
        )
    )
    await db.commit()
    await db.refresh(join_request)
    return JoinRequestOut(
        id=join_request.id,
        family_id=join_request.family_id,
        user_id=join_request.user_id,
        username=current_user.username,
        status=join_request.status,
        requested_at=join_request.requested_at,
    )


@router.get("/families/{family_id}/join-requests", response_model=list[JoinRequestOut])
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


@router.patch("/families/{family_id}/join-requests/{join_request_id}", response_model=JoinRequestOut)
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

