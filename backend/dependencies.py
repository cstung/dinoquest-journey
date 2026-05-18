from __future__ import annotations

from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models import Family, FamilyMember, User
from backend.security import parse_token_subject


async def get_current_user(
    access_token: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not access_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    try:
        user_id = parse_token_subject(access_token, required_type="access")
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session",
        ) from exc

    user = await db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


async def get_active_membership(
    family_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FamilyMember:
    family = await db.get(Family, family_id)
    if not family or family.is_deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Family not found")

    member = (
        await db.execute(
            select(FamilyMember).where(
                FamilyMember.family_id == family_id,
                FamilyMember.user_id == current_user.id,
            )
        )
    ).scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this family")
    return member


async def require_parent(member: FamilyMember = Depends(get_active_membership)) -> FamilyMember:
    if member.role != "parent":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Parent/Admin role required")
    return member
