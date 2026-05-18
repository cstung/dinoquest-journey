from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import get_settings
from backend.database import get_db
from backend.dependencies import require_parent
from backend.models import ActivityLog, FamilyInvite, FamilyMember
from backend.schemas.invite import InviteOut
from backend.services.invite_service import (
    build_expiry,
    build_qr_png,
    generate_qr_token,
    generate_unique_invite_code,
)

router = APIRouter()


@router.post("/{family_id}/invites", response_model=InviteOut, status_code=status.HTTP_201_CREATED)
async def create_invite(
    parent_member: FamilyMember = Depends(require_parent),
    db: AsyncSession = Depends(get_db),
) -> InviteOut:
    invite = FamilyInvite(
        family_id=parent_member.family_id,
        created_by=parent_member.user_id,
        code=await generate_unique_invite_code(db),
        qr_token=generate_qr_token(),
        expires_at=build_expiry(7),
    )
    db.add(invite)
    db.add(
        ActivityLog(
            family_id=parent_member.family_id,
            user_id=parent_member.user_id,
            event_type="invite_sent",
            payload={"invite_id": None},
            is_audit=True,
        )
    )
    await db.commit()
    await db.refresh(invite)
    return InviteOut.model_validate(invite)


@router.get("/{family_id}/invites", response_model=list[InviteOut])
async def list_invites(
    parent_member: FamilyMember = Depends(require_parent),
    db: AsyncSession = Depends(get_db),
) -> list[InviteOut]:
    now = datetime.now(timezone.utc)
    rows = await db.execute(
        select(FamilyInvite)
        .where(
            FamilyInvite.family_id == parent_member.family_id,
            FamilyInvite.revoked.is_(False),
            FamilyInvite.expires_at >= now,
        )
        .order_by(FamilyInvite.created_at.desc())
    )
    return [InviteOut.model_validate(item) for item in rows.scalars().all()]


@router.delete(
    "/{family_id}/invites/{invite_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    response_model=None,
)
async def revoke_invite(
    invite_id: int,
    parent_member: FamilyMember = Depends(require_parent),
    db: AsyncSession = Depends(get_db),
) -> Response:
    invite = (
        await db.execute(
            select(FamilyInvite).where(
                FamilyInvite.id == invite_id,
                FamilyInvite.family_id == parent_member.family_id,
            )
        )
    ).scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")
    invite.revoked = True
    db.add(
        ActivityLog(
            family_id=parent_member.family_id,
            user_id=parent_member.user_id,
            event_type="invite_revoked",
            payload={"invite_id": invite_id},
            is_audit=True,
        )
    )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{family_id}/invite/qr")
async def latest_invite_qr(
    parent_member: FamilyMember = Depends(require_parent),
    db: AsyncSession = Depends(get_db),
) -> Response:
    now = datetime.now(timezone.utc)
    invite = (
        await db.execute(
            select(FamilyInvite)
            .where(
                FamilyInvite.family_id == parent_member.family_id,
                FamilyInvite.revoked.is_(False),
                FamilyInvite.expires_at >= now,
            )
            .order_by(FamilyInvite.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=404, detail="No active invite found")

    settings = get_settings()
    base = settings.allowed_origins[0] if settings.allowed_origins else "http://localhost:3000"
    join_url = f"{base.rstrip('/')}/families/join?token={invite.qr_token}"
    png = build_qr_png(join_url)
    return Response(content=png, media_type="image/png")
