from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.dependencies import get_active_membership, require_parent
from backend.models import ActivityLog, FamilyMember, User
from backend.schemas.activity import ActivityItemOut, ActivityPageOut

router = APIRouter()


def _to_utc_datetime(cursor: str | None) -> datetime | None:
    if not cursor:
        return None
    raw = cursor.replace("Z", "+00:00")
    dt = datetime.fromisoformat(raw)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


async def _fetch_activity_page(
    *,
    family_id: int,
    is_audit: bool,
    cursor: str | None,
    limit: int,
    include_total: bool,
    db: AsyncSession,
) -> ActivityPageOut:
    created_before = _to_utc_datetime(cursor)
    filters = [ActivityLog.family_id == family_id, ActivityLog.is_audit.is_(is_audit)]
    if created_before:
        filters.append(ActivityLog.created_at < created_before)

    rows = await db.execute(
        select(ActivityLog, User.username)
        .outerjoin(User, User.id == ActivityLog.user_id)
        .where(and_(*filters))
        .order_by(ActivityLog.created_at.desc(), ActivityLog.id.desc())
        .limit(limit + 1)
    )
    pairs = rows.all()
    has_more = len(pairs) > limit
    page_pairs = pairs[:limit]

    if include_total:
        total = int(
            (
                await db.execute(
                    select(func.count(ActivityLog.id)).where(
                        ActivityLog.family_id == family_id,
                        ActivityLog.is_audit.is_(is_audit),
                    )
                )
            ).scalar_one()
        )
    else:
        total = 0

    items = [
        ActivityItemOut(
            id=log.id,
            family_id=log.family_id,
            user_id=log.user_id,
            username=username,
            event_type=log.event_type,
            payload=log.payload,
            is_audit=log.is_audit,
            created_at=log.created_at,
        )
        for log, username in page_pairs
    ]
    next_cursor = None
    if has_more and page_pairs:
        next_cursor = page_pairs[-1][0].created_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")

    return ActivityPageOut(items=items, next_cursor=next_cursor, total=total)


@router.get("/{family_id}/activity", response_model=ActivityPageOut)
async def family_activity(
    membership: FamilyMember = Depends(get_active_membership),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    include_total: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
) -> ActivityPageOut:
    # Parents and children can view regular family activity.
    return await _fetch_activity_page(
        family_id=membership.family_id,
        is_audit=False,
        cursor=cursor,
        limit=limit,
        include_total=include_total,
        db=db,
    )


@router.get("/{family_id}/audit", response_model=ActivityPageOut)
async def family_audit(
    parent_member: FamilyMember = Depends(require_parent),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    include_total: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
) -> ActivityPageOut:
    return await _fetch_activity_page(
        family_id=parent_member.family_id,
        is_audit=True,
        cursor=cursor,
        limit=limit,
        include_total=include_total,
        db=db,
    )
