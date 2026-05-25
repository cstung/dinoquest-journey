from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import get_settings
from backend.database import get_db
from backend.dependencies import get_current_user
from backend.models import FamilyMember, QuestAssignment, User, UserFamilyLevel
from backend.schemas.user_profile import UserProfileOut, UserProfileUpdateIn

router = APIRouter()

ALLOWED_CONTENT_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024


async def _resolve_shared_family_id(db: AsyncSession, requester_id: int, target_id: int) -> int | None:
    requester_families = (
        select(FamilyMember.family_id)
        .where(FamilyMember.user_id == requester_id)
        .subquery()
    )
    row = (
        await db.execute(
            select(FamilyMember.family_id)
            .where(
                FamilyMember.user_id == target_id,
                FamilyMember.family_id.in_(select(requester_families.c.family_id)),
            )
            .order_by(FamilyMember.joined_at.asc())
            .limit(1)
        )
    ).first()
    return int(row[0]) if row else None


async def _assert_can_view_profile(db: AsyncSession, requester: User, target: User) -> int | None:
    if requester.id == target.id or requester.global_role == "superadmin":
        return None
    shared_family_id = await _resolve_shared_family_id(db, requester.id, target.id)
    if shared_family_id is None:
        raise HTTPException(status_code=403, detail="Not allowed to view this profile")
    return shared_family_id


async def _build_profile_out(db: AsyncSession, user: User, shared_family_id: int | None) -> UserProfileOut:
    member_nickname: str | None = None
    if shared_family_id is not None:
        member = (
            await db.execute(
                select(FamilyMember.nickname).where(
                    FamilyMember.family_id == shared_family_id,
                    FamilyMember.user_id == user.id,
                )
            )
        ).scalar_one_or_none()
        member_nickname = member.strip() if isinstance(member, str) and member.strip() else None
    if member_nickname is None:
        first_member_nickname = (
            await db.execute(
                select(FamilyMember.nickname)
                .where(FamilyMember.user_id == user.id)
                .order_by(FamilyMember.joined_at.asc())
                .limit(1)
            )
        ).scalar_one_or_none()
        member_nickname = (
            first_member_nickname.strip()
            if isinstance(first_member_nickname, str) and first_member_nickname.strip()
            else None
        )

    completed_count = int(
        (
            await db.execute(
                select(func.count(QuestAssignment.id)).where(
                    QuestAssignment.user_id == user.id,
                    QuestAssignment.status == "completed",
                )
            )
        ).scalar_one()
        or 0
    )
    total_xp = int(
        (
            await db.execute(
                select(func.coalesce(func.sum(UserFamilyLevel.xp_balance), 0)).where(
                    UserFamilyLevel.user_id == user.id,
                )
            )
        ).scalar_one()
        or 0
    )
    current_streak = int(
        (
            await db.execute(
                select(func.coalesce(func.max(UserFamilyLevel.current_streak), 0)).where(
                    UserFamilyLevel.user_id == user.id,
                )
            )
        ).scalar_one()
        or 0
    )

    return UserProfileOut(
        id=user.id,
        username=user.username,
        nickname=(user.nickname.strip() if user.nickname and user.nickname.strip() else member_nickname) or user.username,
        avatar_url=user.avatar_url,
        birthday=user.birthday,
        height_cm=user.height_cm,
        weight_kg=user.weight_kg,
        gender=user.gender,
        school_grade=user.school_grade,
        favorite_dino=user.favorite_dino or "",
        catchphrase=user.catchphrase or "",
        favorite_subject=user.favorite_subject or "Other",
        fun_fact=user.fun_fact or "",
        joined_at=user.created_at,
        total_xp=total_xp,
        quests_completed=completed_count,
        current_streak=current_streak,
    )


@router.get("/{user_id}/profile", response_model=UserProfileOut, response_model_by_alias=False)
async def get_user_profile(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserProfileOut:
    target_user = await db.get(User, user_id)
    if target_user is None:
        raise HTTPException(status_code=404, detail="User not found")

    shared_family_id = await _assert_can_view_profile(db, current_user, target_user)
    return await _build_profile_out(db, target_user, shared_family_id)


@router.patch("/me/profile", response_model=UserProfileOut, response_model_by_alias=False)
async def update_my_profile(
    body: UserProfileUpdateIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserProfileOut:
    updates = body.model_dump(exclude_unset=True)
    if "nickname" in updates:
        nickname = updates.pop("nickname")
        current_user.nickname = nickname
        await db.execute(
            update(FamilyMember)
            .where(FamilyMember.user_id == current_user.id)
            .values(nickname=nickname)
        )

    for field, value in updates.items():
        setattr(current_user, field, value)

    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)

    return await _build_profile_out(db, current_user, None)


@router.post("/me/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=415, detail="Unsupported image type")

    payload = await file.read()
    if len(payload) > MAX_AVATAR_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 5 MB)")

    settings = get_settings()
    data_dir = Path(settings.db_path).expanduser()
    if data_dir != Path(":memory:"):
        data_dir = data_dir.resolve().parent
    else:
        data_dir = Path("./data").resolve()
    avatar_dir = data_dir / "avatars"
    avatar_dir.mkdir(parents=True, exist_ok=True)

    ext = ALLOWED_CONTENT_TYPES[file.content_type]
    file_name = f"user_{current_user.id}_{uuid4().hex[:10]}.{ext}"
    file_path = avatar_dir / file_name
    file_path.write_bytes(payload)

    avatar_url = f"/uploads/avatars/{file_name}"
    current_user.avatar_url = avatar_url
    db.add(current_user)
    await db.commit()

    return {"avatar_url": avatar_url}
