from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.dependencies import get_active_membership
from backend.models import ActivityLog, FamilyMember, Pet, User
from backend.realtime import emit_family_event
from backend.schemas.pet import PetCreate, PetFeedOut, PetOut, PetPageOut, PetUpdate
from backend.services.pet_service import pet_level_from_xp, pet_stage_from_level, pet_xp_to_next_level

router = APIRouter()

FEED_COOLDOWN_HOURS = 4
FEED_XP_GAIN = 20


def _build_pet_out(pet: Pet, username: str) -> PetOut:
    return PetOut(
        id=pet.id,
        user_id=pet.user_id,
        username=username,
        name=pet.name,
        species=pet.species,
        stage=pet.stage,
        level=pet.level,
        xp=pet.xp,
        xp_to_next=pet_xp_to_next_level(pet.xp),
        is_active=pet.is_active,
        last_fed_at=pet.last_fed_at,
        created_at=pet.created_at,
    )


@router.get("/{family_id}/pets", response_model=PetPageOut)
async def list_pets(
    membership: FamilyMember = Depends(get_active_membership),
    db: AsyncSession = Depends(get_db),
) -> PetPageOut:
    rows = await db.execute(
        select(Pet, User.username)
        .join(User, User.id == Pet.user_id)
        .where(Pet.family_id == membership.family_id)
        .order_by(Pet.is_active.desc(), Pet.level.desc(), Pet.created_at.asc())
    )
    items = [_build_pet_out(pet, username) for pet, username in rows.all()]
    return PetPageOut(items=items, total=len(items))


@router.post("/{family_id}/pets", response_model=PetOut, status_code=status.HTTP_201_CREATED)
async def create_pet(
    body: PetCreate,
    membership: FamilyMember = Depends(get_active_membership),
    db: AsyncSession = Depends(get_db),
) -> PetOut:
    existing_any = (
        await db.execute(
            select(Pet).where(Pet.family_id == membership.family_id, Pet.user_id == membership.user_id)
        )
    ).scalars().all()
    is_active = len(existing_any) == 0

    pet = Pet(
        family_id=membership.family_id,
        user_id=membership.user_id,
        name=body.name,
        species=body.species,
        stage="egg",
        xp=0,
        level=1,
        is_active=is_active,
    )
    db.add(pet)
    db.add(
        ActivityLog(
            family_id=membership.family_id,
            user_id=membership.user_id,
            event_type="pet_created",
            payload={"name": pet.name, "species": pet.species},
            is_audit=False,
        )
    )
    await db.commit()
    await db.refresh(pet)

    await emit_family_event(
        membership.family_id,
        "pet_updated",
        {"action": "created", "petId": pet.id, "userId": pet.user_id},
    )
    user = await db.get(User, membership.user_id)
    return _build_pet_out(pet, user.username if user else "user")


@router.patch("/{family_id}/pets/{pet_id}", response_model=PetOut)
async def update_pet(
    pet_id: int,
    body: PetUpdate,
    membership: FamilyMember = Depends(get_active_membership),
    db: AsyncSession = Depends(get_db),
) -> PetOut:
    pet = (
        await db.execute(
            select(Pet).where(
                Pet.id == pet_id,
                Pet.family_id == membership.family_id,
            )
        )
    ).scalar_one_or_none()
    if not pet:
        raise HTTPException(status_code=404, detail="Pet not found")
    if pet.user_id != membership.user_id and membership.role != "parent":
        raise HTTPException(status_code=403, detail="Only owner or parent can edit this pet")

    if body.name is not None:
        pet.name = body.name
    if body.is_active is True:
        owner_pets = (
            await db.execute(
                select(Pet).where(
                    Pet.family_id == membership.family_id,
                    Pet.user_id == pet.user_id,
                )
            )
        ).scalars().all()
        for item in owner_pets:
            item.is_active = item.id == pet.id

    db.add(
        ActivityLog(
            family_id=membership.family_id,
            user_id=membership.user_id,
            event_type="pet_updated",
            payload={"pet_id": pet.id},
            is_audit=False,
        )
    )
    await db.commit()
    await db.refresh(pet)
    user = await db.get(User, pet.user_id)
    await emit_family_event(
        membership.family_id,
        "pet_updated",
        {"action": "updated", "petId": pet.id, "userId": pet.user_id},
    )
    return _build_pet_out(pet, user.username if user else "user")


@router.post("/{family_id}/pets/{pet_id}/feed", response_model=PetFeedOut)
async def feed_pet(
    pet_id: int,
    membership: FamilyMember = Depends(get_active_membership),
    db: AsyncSession = Depends(get_db),
) -> PetFeedOut:
    pet = (
        await db.execute(
            select(Pet).where(
                Pet.id == pet_id,
                Pet.family_id == membership.family_id,
            )
        )
    ).scalar_one_or_none()
    if not pet:
        raise HTTPException(status_code=404, detail="Pet not found")
    if pet.user_id != membership.user_id and membership.role != "parent":
        raise HTTPException(status_code=403, detail="Only owner or parent can feed this pet")

    now = datetime.now(timezone.utc)
    if pet.last_fed_at is not None:
        next_feed_at = pet.last_fed_at + timedelta(hours=FEED_COOLDOWN_HOURS)
        if now < next_feed_at:
            raise HTTPException(
                status_code=400,
                detail=f"Pet can be fed again after {next_feed_at.isoformat().replace('+00:00', 'Z')}",
            )

    old_level = pet.level
    pet.xp += FEED_XP_GAIN
    pet.level = pet_level_from_xp(pet.xp)
    pet.stage = pet_stage_from_level(pet.level)
    pet.last_fed_at = now
    next_feed_at = now + timedelta(hours=FEED_COOLDOWN_HOURS)

    db.add(
        ActivityLog(
            family_id=membership.family_id,
            user_id=membership.user_id,
            event_type="pet_fed",
            payload={"pet_id": pet.id, "gained_xp": FEED_XP_GAIN, "level": pet.level},
            is_audit=False,
        )
    )
    await db.commit()
    await db.refresh(pet)

    await emit_family_event(
        membership.family_id,
        "pet_updated",
        {
            "action": "fed",
            "petId": pet.id,
            "userId": pet.user_id,
            "level": pet.level,
            "xp": pet.xp,
        },
    )
    return PetFeedOut(
        pet_id=pet.id,
        gained_xp=FEED_XP_GAIN,
        level_up=pet.level > old_level,
        level=pet.level,
        xp=pet.xp,
        stage=pet.stage,
        next_feed_at=next_feed_at,
    )
