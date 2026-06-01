from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.dependencies import get_active_membership, require_parent
from backend.models import ActivityLog, FamilyMember, RewardClaim, RewardItem, User, UserFamilyLevel
from backend.realtime import emit_family_event
from backend.schemas.reward import (
    RewardClaimOut,
    RewardClaimResolveIn,
    RewardCreate,
    RewardOut,
    RewardUpdate,
)
from backend.services.xp_engine import XpReason, award_xp

router = APIRouter()


@router.get("/{family_id}/rewards", response_model=list[RewardOut])
async def list_rewards(
    membership: FamilyMember = Depends(get_active_membership),
    include_inactive: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
) -> list[RewardOut]:
    stmt = select(RewardItem).where(
        RewardItem.family_id == membership.family_id,
        RewardItem.is_deleted.is_(False),
    )
    if membership.role != "parent" or not include_inactive:
        stmt = stmt.where(RewardItem.is_active.is_(True))
    rows = await db.execute(stmt.order_by(RewardItem.created_at.desc(), RewardItem.id.desc()))
    return [RewardOut.model_validate(item) for item in rows.scalars().all()]


@router.post("/{family_id}/rewards", response_model=RewardOut, status_code=status.HTTP_201_CREATED)
async def create_reward(
    body: RewardCreate,
    parent_member: FamilyMember = Depends(require_parent),
    db: AsyncSession = Depends(get_db),
) -> RewardOut:
    item = RewardItem(
        family_id=parent_member.family_id,
        created_by=parent_member.user_id,
        title=body.title,
        description=body.description,
        thumbnail_url=body.thumbnail_url,
        xp_cost=body.xp_cost,
        is_active=True,
    )
    db.add(item)
    db.add(
        ActivityLog(
            family_id=parent_member.family_id,
            user_id=parent_member.user_id,
            event_type="reward_created",
            payload={"title": item.title, "xp_cost": item.xp_cost},
            is_audit=True,
        )
    )
    await db.commit()
    await db.refresh(item)
    await emit_family_event(
        parent_member.family_id,
        "reward_updated",
        {"action": "created", "rewardId": item.id},
    )
    return RewardOut.model_validate(item)


@router.patch("/{family_id}/rewards/{reward_id}", response_model=RewardOut)
async def update_reward(
    reward_id: int,
    body: RewardUpdate,
    parent_member: FamilyMember = Depends(require_parent),
    db: AsyncSession = Depends(get_db),
) -> RewardOut:
    item = (
        await db.execute(
            select(RewardItem).where(
                RewardItem.id == reward_id,
                RewardItem.family_id == parent_member.family_id,
                RewardItem.is_deleted.is_(False),
            )
        )
    ).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Reward not found")

    if "title" in body.model_fields_set and body.title is not None:
        item.title = body.title
    if "description" in body.model_fields_set:
        item.description = body.description
    if "thumbnail_url" in body.model_fields_set:
        item.thumbnail_url = body.thumbnail_url
    if "xp_cost" in body.model_fields_set and body.xp_cost is not None:
        item.xp_cost = body.xp_cost
    if "is_active" in body.model_fields_set and body.is_active is not None:
        if body.is_active is False:
            pending_claim = (
                await db.execute(
                    select(RewardClaim).where(
                        RewardClaim.reward_id == item.id,
                        RewardClaim.family_id == parent_member.family_id,
                        RewardClaim.status == "pending",
                    )
                )
            ).scalars().first()
            if pending_claim:
                raise HTTPException(
                    status_code=409,
                    detail="Cannot deactivate reward while pending claim requests exist.",
                )
        item.is_active = body.is_active

    db.add(
        ActivityLog(
            family_id=parent_member.family_id,
            user_id=parent_member.user_id,
            event_type="reward_updated",
            payload={"reward_id": item.id},
            is_audit=True,
        )
    )
    await db.commit()
    await db.refresh(item)
    await emit_family_event(
        parent_member.family_id,
        "reward_updated",
        {"action": "updated", "rewardId": item.id},
    )
    return RewardOut.model_validate(item)


@router.post("/{family_id}/rewards/{reward_id}/claim", response_model=RewardClaimOut, status_code=status.HTTP_201_CREATED)
async def claim_reward(
    reward_id: int,
    membership: FamilyMember = Depends(get_active_membership),
    db: AsyncSession = Depends(get_db),
) -> RewardClaimOut:
    reward = (
        await db.execute(
            select(RewardItem).where(
                RewardItem.id == reward_id,
                RewardItem.family_id == membership.family_id,
                RewardItem.is_active.is_(True),
                RewardItem.is_deleted.is_(False),
            )
        )
    ).scalar_one_or_none()
    if not reward:
        raise HTTPException(status_code=404, detail="Reward not found")

    existing_pending_claim = (
        await db.execute(
            select(RewardClaim).where(
                RewardClaim.reward_id == reward.id,
                RewardClaim.user_id == membership.user_id,
                RewardClaim.family_id == membership.family_id,
                RewardClaim.status == "pending",
            )
        )
    ).scalar_one_or_none()
    if existing_pending_claim:
        raise HTTPException(
            status_code=409,
            detail="You already have a pending claim for this reward.",
        )

    level_row = (
        await db.execute(
            select(UserFamilyLevel).where(
                UserFamilyLevel.family_id == membership.family_id,
                UserFamilyLevel.user_id == membership.user_id,
            )
        )
    ).scalar_one_or_none()
    current_xp = level_row.xp_balance if level_row else 0
    if current_xp < reward.xp_cost:
        raise HTTPException(
            status_code=400,
            detail="Insufficient XP to claim this reward.",
        )

    claim = RewardClaim(
        reward_id=reward.id,
        family_id=membership.family_id,
        user_id=membership.user_id,
        status="pending",
    )
    db.add(claim)
    db.add(
        ActivityLog(
            family_id=membership.family_id,
            user_id=membership.user_id,
            event_type="reward_claim_requested",
            payload={"reward_id": reward.id, "xp_cost": reward.xp_cost},
            is_audit=False,
        )
    )
    await db.commit()
    await db.refresh(claim)
    await emit_family_event(
        membership.family_id,
        "reward_claimed",
        {"rewardId": reward.id, "claimId": claim.id, "userId": membership.user_id},
    )
    user = await db.get(User, membership.user_id)
    return RewardClaimOut(
        id=claim.id,
        reward_id=claim.reward_id,
        reward_title=reward.title,
        family_id=claim.family_id,
        user_id=claim.user_id,
        username=user.username if user else "user",
        status=claim.status,
        requested_at=claim.requested_at,
        resolved_at=claim.resolved_at,
        resolved_by=claim.resolved_by,
    )


@router.delete(
    "/{family_id}/rewards/{reward_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def delete_reward(
    reward_id: int,
    parent_member: FamilyMember = Depends(require_parent),
    db: AsyncSession = Depends(get_db),
) -> None:
    item = (
        await db.execute(
            select(RewardItem).where(
                RewardItem.id == reward_id,
                RewardItem.family_id == parent_member.family_id,
                RewardItem.is_deleted.is_(False),
            )
        )
    ).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Reward not found")

    pending_claim = (
        await db.execute(
            select(RewardClaim).where(
                RewardClaim.reward_id == item.id,
                RewardClaim.family_id == parent_member.family_id,
                RewardClaim.status == "pending",
            )
        )
    ).scalars().first()
    if pending_claim:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete reward while pending claim requests exist.",
        )

    item.is_active = False
    item.is_deleted = True
    db.add(
        ActivityLog(
            family_id=parent_member.family_id,
            user_id=parent_member.user_id,
            event_type="reward_deleted",
            payload={"reward_id": item.id, "title": item.title},
            is_audit=True,
        )
    )
    await db.commit()
    await emit_family_event(
        parent_member.family_id,
        "reward_updated",
        {"action": "deleted", "rewardId": item.id},
    )


@router.get("/{family_id}/reward-claims", response_model=list[RewardClaimOut])
async def list_reward_claims(
    membership: FamilyMember = Depends(get_active_membership),
    status_filter: str | None = Query(default=None, alias="status"),
    db: AsyncSession = Depends(get_db),
) -> list[RewardClaimOut]:
    stmt = (
        select(RewardClaim, RewardItem.title, User.username)
        .join(RewardItem, RewardItem.id == RewardClaim.reward_id)
        .join(User, User.id == RewardClaim.user_id)
        .where(RewardClaim.family_id == membership.family_id)
    )
    if membership.role != "parent":
        stmt = stmt.where(RewardClaim.user_id == membership.user_id)
    if status_filter in {"pending", "approved", "rejected"}:
        stmt = stmt.where(RewardClaim.status == status_filter)

    rows = await db.execute(stmt.order_by(RewardClaim.requested_at.desc(), RewardClaim.id.desc()))
    return [
        RewardClaimOut(
            id=claim.id,
            reward_id=claim.reward_id,
            reward_title=reward_title,
            family_id=claim.family_id,
            user_id=claim.user_id,
            username=username,
            status=claim.status,
            requested_at=claim.requested_at,
            resolved_at=claim.resolved_at,
            resolved_by=claim.resolved_by,
        )
        for claim, reward_title, username in rows.all()
    ]


@router.post("/{family_id}/reward-claims/{claim_id}/resolve", response_model=RewardClaimOut)
async def resolve_reward_claim(
    claim_id: int,
    body: RewardClaimResolveIn,
    parent_member: FamilyMember = Depends(require_parent),
    db: AsyncSession = Depends(get_db),
) -> RewardClaimOut:
    row = await db.execute(
        select(RewardClaim, RewardItem, User)
        .join(RewardItem, RewardItem.id == RewardClaim.reward_id)
        .join(User, User.id == RewardClaim.user_id)
        .where(
            RewardClaim.id == claim_id,
            RewardClaim.family_id == parent_member.family_id,
        )
    )
    result = row.one_or_none()
    if not result:
        raise HTTPException(status_code=404, detail="Reward claim not found")
    claim, reward, user = result

    if claim.status != "pending":
        raise HTTPException(status_code=400, detail="Claim already resolved")

    claim.status = body.decision
    claim.resolved_at = datetime.now(timezone.utc)
    claim.resolved_by = parent_member.user_id
    xp_delta = 0
    if body.decision == "approved":
        level_row = (
            await db.execute(
                select(UserFamilyLevel).where(
                    UserFamilyLevel.family_id == claim.family_id,
                    UserFamilyLevel.user_id == claim.user_id,
                )
            )
        ).scalar_one_or_none()
        current_xp = level_row.xp_balance if level_row else 0
        if current_xp < reward.xp_cost:
            raise HTTPException(status_code=400, detail="User does not have enough XP")
        xp_delta = -reward.xp_cost
        await award_xp(
            family_id=claim.family_id,
            user_id=claim.user_id,
            delta=xp_delta,
            reason=XpReason.REWARD_CLAIM,
            source_id=claim.id,
            db=db,
        )

    db.add(
        ActivityLog(
            family_id=parent_member.family_id,
            user_id=parent_member.user_id,
            event_type="reward_claim_resolved",
            payload={"claim_id": claim.id, "decision": body.decision, "xp_delta": xp_delta},
            is_audit=True,
        )
    )
    await db.commit()
    await db.refresh(claim)

    await emit_family_event(
        parent_member.family_id,
        "reward_claim_resolved",
        {
            "claimId": claim.id,
            "rewardId": reward.id,
            "userId": claim.user_id,
            "decision": body.decision,
            "xpDelta": xp_delta,
        },
    )
    if xp_delta != 0:
        await emit_family_event(
            parent_member.family_id,
            "leaderboard_update",
            {"userId": claim.user_id},
        )

    return RewardClaimOut(
        id=claim.id,
        reward_id=claim.reward_id,
        reward_title=reward.title,
        family_id=claim.family_id,
        user_id=claim.user_id,
        username=user.username,
        status=claim.status,
        requested_at=claim.requested_at,
        resolved_at=claim.resolved_at,
        resolved_by=claim.resolved_by,
    )
