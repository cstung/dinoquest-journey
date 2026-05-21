from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import get_settings
from backend.database import get_db
from backend.dependencies import require_parent
from backend.models import ActivityLog, Family, FamilyInvite, FamilyMember
from backend.schemas.invite import InviteCreate, InviteOut
from backend.services.invite_service import (
    build_expiry,
    generate_unique_invite_code,
    generate_unique_qr_token,
)

router = APIRouter()


def _invite_out(invite: FamilyInvite, family_name: str | None, app_base_url: str) -> InviteOut:
    join_link = f"{app_base_url.rstrip('/')}/register?code={invite.code}"
    qr_join_link = (
        f"{app_base_url.rstrip('/')}/register?qrToken={invite.qr_token}" if invite.qr_token else None
    )
    return InviteOut(
        id=invite.id,
        family_id=invite.family_id,
        family_name=family_name,
        role=invite.role,
        code=invite.code,
        qr_token=invite.qr_token,
        join_link=join_link,
        qr_join_link=qr_join_link,
        expires_at=invite.expires_at,
        used_by=invite.used_by,
        revoked=invite.revoked,
        created_at=invite.created_at,
    )


@router.post("/{family_id}/invites", response_model=InviteOut, status_code=status.HTTP_201_CREATED)
async def create_invite(
    family_id: int,
    body: InviteCreate,
    parent_member: FamilyMember = Depends(require_parent),
    db: AsyncSession = Depends(get_db),
) -> InviteOut:
    family = await db.get(Family, family_id)
    if not family or family.is_deleted:
        raise HTTPException(status_code=404, detail="Family not found")

    invite = FamilyInvite(
        family_id=family.id,
        created_by=parent_member.user_id,
        role=body.role,
        code=await generate_unique_invite_code(db),
        qr_token=await generate_unique_qr_token(db),
        expires_at=build_expiry(7),
    )
    db.add(invite)
    db.add(
        ActivityLog(
            family_id=family.id,
            user_id=parent_member.user_id,
            event_type="invite_sent",
            payload={"invite_id": None},
            is_audit=True,
        )
    )
    await db.commit()
    await db.refresh(invite)
    settings = get_settings()
    return _invite_out(invite, family.name, settings.app_base_url)


@router.get("/{family_id}/invites", response_model=list[InviteOut])
async def list_invites(
    family_id: int,
    _: FamilyMember = Depends(require_parent),
    db: AsyncSession = Depends(get_db),
) -> list[InviteOut]:
    family = await db.get(Family, family_id)
    if not family or family.is_deleted:
        raise HTTPException(status_code=404, detail="Family not found")

    settings = get_settings()
    now = datetime.now(timezone.utc)
    rows = await db.execute(
        select(FamilyInvite)
        .where(
            FamilyInvite.family_id == family_id,
            FamilyInvite.revoked.is_(False),
            FamilyInvite.expires_at >= now,
        )
        .order_by(FamilyInvite.created_at.desc())
    )
    return [_invite_out(item, family.name, settings.app_base_url) for item in rows.scalars().all()]


@router.delete(
    "/{family_id}/invites/{invite_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    response_model=None,
)
async def revoke_invite(
    family_id: int,
    invite_id: int,
    parent_member: FamilyMember = Depends(require_parent),
    db: AsyncSession = Depends(get_db),
) -> Response:
    family = await db.get(Family, family_id)
    if not family or family.is_deleted:
        raise HTTPException(status_code=404, detail="Family not found")

    invite = (
        await db.execute(
            select(FamilyInvite).where(
                FamilyInvite.id == invite_id,
                FamilyInvite.family_id == family_id,
            )
        )
    ).scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")
    invite.revoked = True
    db.add(
        ActivityLog(
            family_id=family_id,
            user_id=parent_member.user_id,
            event_type="invite_revoked",
            payload={"invite_id": invite_id},
            is_audit=True,
        )
    )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
