from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.dependencies import get_active_membership
from backend.models import FamilyMember, User, UserFamilyLevel
from backend.schemas.leaderboard import LeaderboardEntryOut, LeaderboardPageOut

router = APIRouter()


@router.get("/{family_id}/leaderboard", response_model=LeaderboardPageOut)
async def get_leaderboard(
    membership: FamilyMember = Depends(get_active_membership),
    scope: str = Query(default="family"),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> LeaderboardPageOut:
    mode = scope.strip().lower()
    if mode not in {"family", "global"}:
        mode = "family"

    if mode == "family":
        rows = await db.execute(
            select(
                User.id,
                User.username,
                FamilyMember.avatar_color,
                func.coalesce(UserFamilyLevel.level, 1),
                func.coalesce(UserFamilyLevel.xp_balance, 0),
                func.coalesce(UserFamilyLevel.coin_balance, 0),
                func.coalesce(UserFamilyLevel.current_streak, 0),
            )
            .join(FamilyMember, FamilyMember.user_id == User.id)
            .outerjoin(
                UserFamilyLevel,
                (UserFamilyLevel.user_id == User.id) & (UserFamilyLevel.family_id == membership.family_id),
            )
            .where(FamilyMember.family_id == membership.family_id)
            .order_by(func.coalesce(UserFamilyLevel.xp_balance, 0).desc(), User.username.asc())
            .limit(limit)
        )
        raw = rows.all()
    else:
        rows = await db.execute(
            select(
                User.id,
                User.username,
                func.min(FamilyMember.avatar_color),
                func.coalesce(func.max(UserFamilyLevel.level), 1),
                func.coalesce(func.sum(UserFamilyLevel.xp_balance), 0),
                func.coalesce(func.sum(UserFamilyLevel.coin_balance), 0),
                func.coalesce(func.max(UserFamilyLevel.current_streak), 0),
            )
            .join(FamilyMember, FamilyMember.user_id == User.id)
            .outerjoin(UserFamilyLevel, UserFamilyLevel.user_id == User.id)
            .group_by(User.id, User.username)
            .order_by(func.coalesce(func.sum(UserFamilyLevel.xp_balance), 0).desc(), User.username.asc())
            .limit(limit)
        )
        raw = rows.all()

    items: list[LeaderboardEntryOut] = []
    for index, (user_id, username, avatar_color, level, xp, coins, current_streak) in enumerate(raw, start=1):
        items.append(
            LeaderboardEntryOut(
                rank=index,
                user_id=user_id,
                username=username,
                avatar_color=avatar_color,
                level=int(level),
                xp=int(xp),
                coins=int(coins),
                current_streak=int(current_streak),
                is_you=user_id == membership.user_id,
            )
        )
    return LeaderboardPageOut(scope=mode, items=items)
