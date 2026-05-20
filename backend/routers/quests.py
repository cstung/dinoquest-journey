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
    QuestAssignmentHistoryOut,
    QuestCompleteOut,
    QuestCreate,
    QuestFrequency,
    QuestItemOut,
    QuestPageOut,
    QuestUpdate,
)
from backend.services.quest_scheduler import compute_cycle_due_at, compute_next_occurrence
from backend.services.streak_service import update_streak
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
    latest_cycle = select(func.max(QuestAssignment.cycle_index)).where(
        QuestAssignment.quest_id == quest_id
    ).scalar_subquery()
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
        .where(
            QuestAssignment.quest_id == quest_id,
            QuestAssignment.cycle_index == latest_cycle,
        )
        .order_by(QuestAssignment.id.asc())
    )
    return [
        QuestAssignedMemberOut(
            assignment_id=assignment.id,
            user_id=assignment.user_id,
            username=user.username,
            avatar_color=avatar_color,
            status=assignment.status,
            completed_at=assignment.completed_at,
            cycle_index=assignment.cycle_index,
            cycle_due_at=assignment.cycle_due_at,
            cycle_start_at=assignment.cycle_start_at,
        )
        for assignment, user, avatar_color in rows.all()
    ]


async def _quest_item(quest: Quest, db: AsyncSession, membership: FamilyMember) -> QuestItemOut:
    assigned = await _load_assigned_members(quest.id, db)

    if membership.role == "child":
        mine = next((row for row in assigned if row.user_id == membership.user_id), None)
        my_status = mine.status if mine else "pending"
    else:
        statuses = [row.status for row in assigned]
        if statuses and all(status_value == "completed" for status_value in statuses):
            my_status = "completed"
        elif "missed" in statuses:
            my_status = "missed"
        else:
            my_status = "pending"

    return QuestItemOut(
        id=quest.id,
        title=quest.title,
        description=quest.description,
        category=quest.category,
        difficulty=quest.difficulty,
        xp_reward=quest.xp_reward,
        due_date=quest.due_date,
        frequency=QuestFrequency(quest.frequency),
        next_occurrence_at=quest.next_occurrence_at,
        recurrence_end_at=quest.recurrence_end_at,
        status=my_status,
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
        latest_for_user = (
            select(
                QuestAssignment.quest_id.label("quest_id"),
                func.max(QuestAssignment.cycle_index).label("max_cycle"),
            )
            .where(
                QuestAssignment.family_id == membership.family_id,
                QuestAssignment.user_id == membership.user_id,
            )
            .group_by(QuestAssignment.quest_id)
            .subquery()
        )
        base = (
            base.join(latest_for_user, latest_for_user.c.quest_id == Quest.id)
            .join(
                QuestAssignment,
                and_(
                    QuestAssignment.quest_id == Quest.id,
                    QuestAssignment.user_id == membership.user_id,
                    QuestAssignment.cycle_index == latest_for_user.c.max_cycle,
                ),
            )
        )
        if status_filter in {"pending", "completed", "missed"}:
            base = base.where(QuestAssignment.status == status_filter)

    rows = await db.execute(base.order_by(Quest.created_at.desc(), Quest.id.desc()).limit(limit + 1))
    quests = rows.scalars().all()
    has_more = len(quests) > limit
    page_quests = quests[:limit]

    items: list[QuestItemOut] = []
    for quest in page_quests:
        item = await _quest_item(quest, db, membership)
        if membership.role != "child" and status_filter in {"pending", "completed", "missed"}:
            if item.status != status_filter:
                continue
        items.append(item)

    total_q = select(func.count(Quest.id)).where(Quest.family_id == membership.family_id)
    if search:
        term = f"%{search.strip().lower()}%"
        total_q = total_q.where(func.lower(Quest.title).like(term))
    if membership.role == "child":
        latest_for_user = (
            select(
                QuestAssignment.quest_id.label("quest_id"),
                func.max(QuestAssignment.cycle_index).label("max_cycle"),
            )
            .where(
                QuestAssignment.family_id == membership.family_id,
                QuestAssignment.user_id == membership.user_id,
            )
            .group_by(QuestAssignment.quest_id)
            .subquery()
        )
        total_q = (
            select(func.count(Quest.id))
            .select_from(Quest)
            .join(latest_for_user, latest_for_user.c.quest_id == Quest.id)
            .join(
                QuestAssignment,
                and_(
                    QuestAssignment.quest_id == Quest.id,
                    QuestAssignment.family_id == membership.family_id,
                    QuestAssignment.user_id == membership.user_id,
                    QuestAssignment.cycle_index == latest_for_user.c.max_cycle,
                ),
            )
            .where(Quest.family_id == membership.family_id)
        )
        if status_filter in {"pending", "completed", "missed"}:
            total_q = total_q.where(QuestAssignment.status == status_filter)
        if search:
            total_q = total_q.where(func.lower(Quest.title).like(term))
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
    now_utc = datetime.now(timezone.utc)
    frequency_value = body.frequency.value
    next_occurrence_at = compute_next_occurrence(frequency_value, now_utc)

    quest = Quest(
        family_id=parent_member.family_id,
        created_by=parent_member.user_id,
        title=body.title,
        description=body.description,
        category=body.category,
        difficulty=body.difficulty,
        xp_reward=body.xp_reward,
        due_date=body.due_date,
        frequency=frequency_value,
        next_occurrence_at=next_occurrence_at,
        recurrence_end_at=body.recurrence_end_at,
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

    cycle_due = body.due_date if frequency_value == "once" else compute_cycle_due_at(frequency_value, now_utc)

    for member in assignees:
        db.add(
            QuestAssignment(
                quest_id=quest.id,
                family_id=quest.family_id,
                user_id=member.user_id,
                status="pending",
                cycle_index=1,
                cycle_start_at=now_utc,
                cycle_due_at=cycle_due,
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
    if "due_date" in body.model_fields_set:
        quest.due_date = body.due_date
    if "recurrence_end_at" in body.model_fields_set:
        quest.recurrence_end_at = body.recurrence_end_at
    if "frequency" in body.model_fields_set and body.frequency is not None:
        quest.frequency = body.frequency.value
        if quest.frequency == QuestFrequency.once.value:
            quest.next_occurrence_at = None
        else:
            quest.next_occurrence_at = compute_next_occurrence(quest.frequency, datetime.now(timezone.utc))

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


async def _complete_assignment(
    assignment: QuestAssignment,
    quest: Quest,
    membership: FamilyMember,
    current_user: User,
    db: AsyncSession,
) -> QuestCompleteOut:
    if assignment.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your assignment.")
    if assignment.status == "completed":
        raise HTTPException(status_code=400, detail="Quest already completed for this cycle.")
    if assignment.status == "missed":
        raise HTTPException(status_code=400, detail="Deadline has passed for this cycle.")

    now_utc = datetime.now(timezone.utc)
    if assignment.cycle_due_at and now_utc > assignment.cycle_due_at:
        raise HTTPException(status_code=400, detail="Deadline has passed for this cycle. Your streak will be broken.")

    assignment.status = "completed"
    assignment.completed_at = now_utc
    assignment.xp_awarded = quest.xp_reward

    await update_streak(
        user_id=current_user.id,
        family_id=membership.family_id,
        completed_on_time=True,
        db=db,
    )

    level_row = await award_xp(
        family_id=membership.family_id,
        user_id=current_user.id,
        delta=quest.xp_reward,
        reason=f"quest:{quest.id}:cycle:{assignment.cycle_index}",
        source_id=assignment.id,
        db=db,
    )

    db.add(
        ActivityLog(
            family_id=membership.family_id,
            user_id=current_user.id,
            event_type="quest_completed",
            payload={"quest_id": quest.id, "xp_awarded": quest.xp_reward, "cycle_index": assignment.cycle_index},
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
    await emit_family_event(
        membership.family_id,
        "quest_updated",
        {"action": "completed", "questId": quest.id},
    )
    return QuestCompleteOut(
        quest_id=quest.id,
        assignment_id=assignment.id,
        xp_awarded=assignment.xp_awarded,
        total_xp=level_row.total_xp,
        level=level_row.level,
        status=assignment.status,
    )


@router.post("/{family_id}/quest-assignments/{assignment_id}/complete", response_model=QuestCompleteOut)
async def complete_assignment(
    assignment_id: int,
    current_user: User = Depends(get_current_user),
    membership: FamilyMember = Depends(get_active_membership),
    db: AsyncSession = Depends(get_db),
) -> QuestCompleteOut:
    row = await db.execute(
        select(QuestAssignment, Quest)
        .join(Quest, Quest.id == QuestAssignment.quest_id)
        .where(
            QuestAssignment.id == assignment_id,
            QuestAssignment.family_id == membership.family_id,
            Quest.family_id == membership.family_id,
        )
    )
    result = row.one_or_none()
    if not result:
        raise HTTPException(status_code=404, detail="Quest assignment not found")

    assignment, quest = result
    return await _complete_assignment(assignment, quest, membership, current_user, db)


@router.post("/{family_id}/quests/{quest_id}/complete", response_model=QuestCompleteOut)
async def complete_quest(
    quest_id: int,
    current_user: User = Depends(get_current_user),
    membership: FamilyMember = Depends(get_active_membership),
    db: AsyncSession = Depends(get_db),
) -> QuestCompleteOut:
    row = await db.execute(
        select(QuestAssignment, Quest)
        .join(Quest, Quest.id == QuestAssignment.quest_id)
        .where(
            QuestAssignment.quest_id == quest_id,
            QuestAssignment.user_id == current_user.id,
            QuestAssignment.family_id == membership.family_id,
            Quest.family_id == membership.family_id,
        )
        .order_by(QuestAssignment.cycle_index.desc(), QuestAssignment.id.desc())
    )
    result = row.first()
    if not result:
        raise HTTPException(status_code=404, detail="Quest assignment not found")

    assignment, quest = result
    return await _complete_assignment(assignment, quest, membership, current_user, db)


@router.get("/{family_id}/quests/{quest_id}/history", response_model=list[QuestAssignmentHistoryOut])
async def quest_history(
    quest_id: int,
    parent_member: FamilyMember = Depends(require_parent),
    db: AsyncSession = Depends(get_db),
) -> list[QuestAssignmentHistoryOut]:
    quest = (
        await db.execute(
            select(Quest).where(
                Quest.id == quest_id,
                Quest.family_id == parent_member.family_id,
            )
        )
    ).scalar_one_or_none()
    if not quest:
        raise HTTPException(status_code=404, detail="Quest not found")

    rows = await db.execute(
        select(QuestAssignment, User.username)
        .join(User, User.id == QuestAssignment.user_id)
        .where(
            QuestAssignment.quest_id == quest.id,
            QuestAssignment.family_id == parent_member.family_id,
        )
        .order_by(QuestAssignment.cycle_index.desc(), QuestAssignment.id.desc())
    )
    return [
        QuestAssignmentHistoryOut(
            assignment_id=assignment.id,
            quest_id=assignment.quest_id,
            user_id=assignment.user_id,
            username=username,
            status=assignment.status,
            completed_at=assignment.completed_at,
            cycle_due_at=assignment.cycle_due_at,
            cycle_start_at=assignment.cycle_start_at,
            cycle_index=assignment.cycle_index,
        )
        for assignment, username in rows.all()
    ]
