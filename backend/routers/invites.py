from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import get_settings
from backend.database import get_db
from backend.dependencies import require_parent, require_superadmin
from backend.models import ActivityLog, Family, FamilyInvite, FamilyMember, User
from backend.schemas.invite import InviteCreate, InviteOut
from backend.services.invite_service import (
    build_expiry,
    build_qr_png,
    generate_qr_token,
    generate_unique_invite_code,
)

router = APIRouter()


def _invite_out(invite: FamilyInvite, family_name: str | None) -> InviteOut:
    return InviteOut(
        id=invite.id,
        family_id=invite.family_id,
        family_name=family_name,
        role=invite.role,
        code=invite.code,
        qr_token=invite.qr_token,
        expires_at=invite.expires_at,
        used_by=invite.used_by,
        revoked=invite.revoked,
        created_at=invite.created_at,
    )


@router.post("/{family_id}/invites", response_model=InviteOut, status_code=status.HTTP_201_CREATED)
async def create_invite(
    family_id: int,
    body: InviteCreate,
    current_user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
) -> InviteOut:
    family = await db.get(Family, family_id)
    if not family or family.is_deleted:
        raise HTTPException(status_code=404, detail="Family not found")

    invite = FamilyInvite(
        family_id=family.id,
        created_by=current_user.id,
        role=body.role,
        code=await generate_unique_invite_code(db),
        qr_token=generate_qr_token(),
        expires_at=build_expiry(7),
    )
    db.add(invite)
    db.add(
        ActivityLog(
            family_id=family.id,
            user_id=current_user.id,
            event_type="invite_sent",
            payload={"invite_id": None},
            is_audit=True,
        )
    )
    await db.commit()
    await db.refresh(invite)
    return _invite_out(invite, family.name)


@router.get("/{family_id}/invites", response_model=list[InviteOut])
async def list_invites(
    parent_member: FamilyMember = Depends(require_parent),
    db: AsyncSession = Depends(get_db),
) -> list[InviteOut]:
    family = await db.get(Family, parent_member.family_id)
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
    return [_invite_out(item, family.name if family else None) for item in rows.scalars().all()]


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
