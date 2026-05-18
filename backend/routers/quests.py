from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.dependencies import get_active_membership, get_current_user, require_parent
from backend.models import ActivityLog, FamilyMember, Quest, QuestAssignment, User
from backend.realtime import emit_family_event
from backend.schemas.quest import (
    QuestAssignedMemberOut,
    QuestCompleteOut,
    QuestCreate,
    QuestItemOut,
    QuestPageOut,
    QuestUpdate,
)
from backend.services.xp_engine import award_xp

router = APIRouter()


def _parse_cursor(cursor: str | None) -> datetime | None:
    if not cursor:
        return None
    dt = datetime.fromisoformat(cursor.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


async def _load_assigned_members(quest_id: int, db: AsyncSession) -> list[QuestAssignedMemberOut]:
    rows = await db.execute(
        select(QuestAssignment, User, FamilyMember.avatar_color)
        .join(User, User.id == QuestAssignment.user_id)
        .outerjoin(
            FamilyMember,
            and_(
                FamilyMember.family_id == QuestAssignment.family_id,
                FamilyMember.user_id == QuestAssignment.user_id,
            ),
        )
        .where(QuestAssignment.quest_id == quest_id)
        .order_by(QuestAssignment.id.asc())
    )
    return [
        QuestAssignedMemberOut(
            user_id=assignment.user_id,
            username=user.username,
            avatar_color=avatar_color,
            status=assignment.status,
            completed_at=assignment.completed_at,
        )
        for assignment, user, avatar_color in rows.all()
    ]


async def _quest_item(quest: Quest, db: AsyncSession, membership: FamilyMember) -> QuestItemOut:
    assigned = await _load_assigned_members(quest.id, db)
    my_status = "pending"
    for row in assigned:
        if row.user_id == membership.user_id:
            my_status = row.status
            break
    return QuestItemOut(
        id=quest.id,
        title=quest.title,
        description=quest.description,
        category=quest.category,
        difficulty=quest.difficulty,
        xp_reward=quest.xp_reward,
        due_date=quest.due_date,
        is_recurring=quest.is_recurring,
        status=my_status if membership.role == "child" else "pending",
        assigned_members=assigned,
        created_at=quest.created_at,
    )


@router.get("/{family_id}/quests", response_model=QuestPageOut)
async def list_quests(
    membership: FamilyMember = Depends(get_active_membership),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    search: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    db: AsyncSession = Depends(get_db),
) -> QuestPageOut:
    created_before = _parse_cursor(cursor)

    base = select(Quest).where(Quest.family_id == membership.family_id)
    if created_before:
        base = base.where(Quest.created_at < created_before)
    if search:
        term = f"%{search.strip().lower()}%"
        base = base.where(func.lower(Quest.title).like(term))

    if membership.role == "child":
        base = base.join(QuestAssignment, QuestAssignment.quest_id == Quest.id).where(
            QuestAssignment.user_id == membership.user_id
        )
        if status_filter in {"pending", "completed"}:
            base = base.where(QuestAssignment.status == status_filter)

    rows = await db.execute(base.order_by(Quest.created_at.desc(), Quest.id.desc()).limit(limit + 1))
    quests = rows.scalars().all()
    has_more = len(quests) > limit
    page_quests = quests[:limit]

    items: list[QuestItemOut] = []
    for quest in page_quests:
        item = await _quest_item(quest, db, membership)
        if membership.role == "parent" and status_filter in {"pending", "completed"}:
            any_completed = any(a.status == "completed" for a in item.assigned_members)
            if status_filter == "completed" and not any_completed:
                continue
            if status_filter == "pending" and any_completed:
                continue
        items.append(item)

    total_q = select(func.count(Quest.id)).where(Quest.family_id == membership.family_id)
    if membership.role == "child":
        total_q = (
            select(func.count(Quest.id))
            .select_from(Quest)
            .join(QuestAssignment, QuestAssignment.quest_id == Quest.id)
            .where(
                Quest.family_id == membership.family_id,
                QuestAssignment.user_id == membership.user_id,
            )
        )
    total = int((await db.execute(total_q)).scalar_one())

    next_cursor = None
    if has_more and page_quests:
        next_cursor = page_quests[-1].created_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")

    return QuestPageOut(items=items, next_cursor=next_cursor, total=total)


@router.post("/{family_id}/quests", response_model=QuestItemOut, status_code=status.HTTP_201_CREATED)
async def create_quest(
    body: QuestCreate,
    parent_member: FamilyMember = Depends(require_parent),
    db: AsyncSession = Depends(get_db),
) -> QuestItemOut:
    quest = Quest(
        family_id=parent_member.family_id,
        created_by=parent_member.user_id,
        title=body.title,
        description=body.description,
        category=body.category,
        difficulty=body.difficulty,
        xp_reward=body.xp_reward,
        due_date=body.due_date,
        is_recurring=body.is_recurring,
    )
    db.add(quest)
    await db.flush()

    if body.assigned_user_ids:
        target_ids = sorted(set(body.assigned_user_ids))
        member_rows = await db.execute(
            select(FamilyMember).where(
                FamilyMember.family_id == parent_member.family_id,
                FamilyMember.user_id.in_(target_ids),
            )
        )
        members = member_rows.scalars().all()
        if len(members) != len(target_ids):
            raise HTTPException(status_code=400, detail="One or more assigned users are not in this family")
        assignees = members
    else:
        member_rows = await db.execute(
            select(FamilyMember).where(
                FamilyMember.family_id == parent_member.family_id,
                FamilyMember.role == "child",
            )
        )
        assignees = member_rows.scalars().all()

    for member in assignees:
        db.add(
            QuestAssignment(
                quest_id=quest.id,
                family_id=quest.family_id,
                user_id=member.user_id,
                status="pending",
            )
        )

    db.add(
        ActivityLog(
            family_id=quest.family_id,
            user_id=parent_member.user_id,
            event_type="quest_created",
            payload={"quest_id": quest.id, "title": quest.title},
            is_audit=True,
        )
    )

    await db.commit()
    await db.refresh(quest)
    await emit_family_event(
        quest.family_id,
        "quest_updated",
        {"action": "created", "questId": quest.id},
    )
    return await _quest_item(quest, db, parent_member)


@router.get("/{family_id}/quests/{quest_id}", response_model=QuestItemOut)
async def quest_detail(
    quest_id: int,
    membership: FamilyMember = Depends(get_active_membership),
    db: AsyncSession = Depends(get_db),
) -> QuestItemOut:
    quest = (
        await db.execute(
            select(Quest).where(Quest.id == quest_id, Quest.family_id == membership.family_id)
        )
    ).scalar_one_or_none()
    if not quest:
        raise HTTPException(status_code=404, detail="Quest not found")

    if membership.role == "child":
        assigned = (
            await db.execute(
                select(QuestAssignment).where(
                    QuestAssignment.quest_id == quest_id,
                    QuestAssignment.user_id == membership.user_id,
                )
            )
        ).scalar_one_or_none()
        if not assigned:
            raise HTTPException(status_code=403, detail="Quest not assigned to you")

    return await _quest_item(quest, db, membership)


@router.patch("/{family_id}/quests/{quest_id}", response_model=QuestItemOut)
async def update_quest(
    quest_id: int,
    body: QuestUpdate,
    parent_member: FamilyMember = Depends(require_parent),
    db: AsyncSession = Depends(get_db),
) -> QuestItemOut:
    quest = (
        await db.execute(
            select(Quest).where(Quest.id == quest_id, Quest.family_id == parent_member.family_id)
        )
    ).scalar_one_or_none()
    if not quest:
        raise HTTPException(status_code=404, detail="Quest not found")

    if body.title is not None:
        quest.title = body.title.strip()
    if body.description is not None:
        quest.description = body.description.strip() or None
    if body.category is not None:
        quest.category = body.category
    if body.difficulty is not None:
        quest.difficulty = body.difficulty
    if body.xp_reward is not None:
        quest.xp_reward = body.xp_reward
    if body.due_date is not None:
        quest.due_date = body.due_date
    if body.is_recurring is not None:
        quest.is_recurring = body.is_recurring

    db.add(
        ActivityLog(
            family_id=quest.family_id,
            user_id=parent_member.user_id,
            event_type="quest_updated",
            payload={"quest_id": quest.id},
            is_audit=True,
        )
    )
    await db.commit()
    await db.refresh(quest)
    await emit_family_event(
        quest.family_id,
        "quest_updated",
        {"action": "updated", "questId": quest.id},
    )
    return await _quest_item(quest, db, parent_member)


@router.delete(
    "/{family_id}/quests/{quest_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    response_model=None,
)
async def delete_quest(
    quest_id: int,
    parent_member: FamilyMember = Depends(require_parent),
    db: AsyncSession = Depends(get_db),
) -> Response:
    quest = (
        await db.execute(
            select(Quest).where(Quest.id == quest_id, Quest.family_id == parent_member.family_id)
        )
    ).scalar_one_or_none()
    if not quest:
        raise HTTPException(status_code=404, detail="Quest not found")

    assignments = (
        await db.execute(select(QuestAssignment).where(QuestAssignment.quest_id == quest.id))
    ).scalars().all()
    for assignment in assignments:
        await db.delete(assignment)
    await db.delete(quest)

    db.add(
        ActivityLog(
            family_id=parent_member.family_id,
            user_id=parent_member.user_id,
            event_type="quest_deleted",
            payload={"quest_id": quest_id},
            is_audit=True,
        )
    )
    await db.commit()
    await emit_family_event(
        parent_member.family_id,
        "quest_updated",
        {"action": "deleted", "questId": quest_id},
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{family_id}/quests/{quest_id}/complete", response_model=QuestCompleteOut)
async def complete_quest(
    quest_id: int,
    current_user: User = Depends(get_current_user),
    membership: FamilyMember = Depends(get_active_membership),
    db: AsyncSession = Depends(get_db),
) -> QuestCompleteOut:
    assignment = (
        await db.execute(
            select(QuestAssignment)
            .join(Quest, Quest.id == QuestAssignment.quest_id)
            .where(
                QuestAssignment.quest_id == quest_id,
                QuestAssignment.user_id == current_user.id,
                QuestAssignment.family_id == membership.family_id,
                Quest.family_id == membership.family_id,
            )
        )
    ).scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Quest assignment not found")
    if assignment.status == "completed":
        raise HTTPException(status_code=400, detail="Quest already completed")

    quest = await db.get(Quest, quest_id)
    if not quest:
        raise HTTPException(status_code=404, detail="Quest not found")

    assignment.status = "completed"
    assignment.completed_at = datetime.now(timezone.utc)
    assignment.xp_awarded = quest.xp_reward

    level_row = await award_xp(
        family_id=membership.family_id,
        user_id=current_user.id,
        delta=quest.xp_reward,
        reason=f"quest_complete:{quest.id}",
        source_id=assignment.id,
        db=db,
    )

    db.add(
        ActivityLog(
            family_id=membership.family_id,
            user_id=current_user.id,
            event_type="quest_completed",
            payload={"quest_id": quest.id, "xp_awarded": quest.xp_reward},
            is_audit=False,
        )
    )
    await db.commit()
    await db.refresh(assignment)
    await emit_family_event(
        membership.family_id,
        "xp_earned",
        {"userId": current_user.id, "delta": quest.xp_reward, "reason": "quest_complete"},
    )
    await emit_family_event(
        membership.family_id,
        "leaderboard_update",
        {"userId": current_user.id},
    )
    return QuestCompleteOut(
        quest_id=quest.id,
        assignment_id=assignment.id,
        xp_awarded=assignment.xp_awarded,
        total_xp=level_row.total_xp,
        level=level_row.level,
        status=assignment.status,
    )
