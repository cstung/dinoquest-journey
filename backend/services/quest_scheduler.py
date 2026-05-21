from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
import calendar
from zoneinfo import ZoneInfo

from sqlalchemy import func, or_, select, update as sa_update

from backend.models import ActivityLog, Quest, QuestAssignment
from backend.realtime import emit_family_event
from backend.database import SessionLocal
from backend.services.streak_service import update_streak

TZ = ZoneInfo("Asia/Ho_Chi_Minh")
UTC = ZoneInfo("UTC")


def midnight_vn(d: date) -> datetime:
    """Return VN midnight converted to UTC-aware datetime."""
    return datetime(d.year, d.month, d.day, 0, 0, 0, tzinfo=TZ).astimezone(UTC)


def _as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _monthly_anchor_day(from_dt: datetime, monthly_anchor_day: int | None) -> int:
    if monthly_anchor_day is not None:
        return max(1, min(31, monthly_anchor_day))
    return from_dt.astimezone(TZ).date().day


def compute_next_occurrence(
    frequency: str,
    from_dt: datetime,
    monthly_anchor_day: int | None = None,
) -> datetime | None:
    from_dt = _as_utc(from_dt)
    local_dt = from_dt.astimezone(TZ)
    local_date = local_dt.date()

    if frequency == "once":
        return None

    if frequency == "daily":
        next_date = local_date + timedelta(days=1)
    elif frequency == "weekly":
        next_date = local_date + timedelta(weeks=1)
    elif frequency == "monthly":
        anchor_day = _monthly_anchor_day(from_dt, monthly_anchor_day)
        month = local_date.month + 1
        year = local_date.year
        if month > 12:
            month = 1
            year += 1
        last_day = calendar.monthrange(year, month)[1]
        day = min(anchor_day, last_day)
        next_date = date(year, month, day)
    else:
        return None

    return midnight_vn(next_date)


def compute_cycle_due_at(
    frequency: str,
    cycle_start: datetime,
    monthly_anchor_day: int | None = None,
) -> datetime | None:
    cycle_start = _as_utc(cycle_start)
    local = cycle_start.astimezone(TZ)
    local_date = local.date()

    if frequency == "daily":
        end_date = local_date
    elif frequency == "weekly":
        end_date = local_date + timedelta(days=6)
    elif frequency == "monthly":
        next_occ = compute_next_occurrence(
            "monthly",
            cycle_start,
            monthly_anchor_day=monthly_anchor_day,
        )
        if not next_occ:
            return None
        end_date = next_occ.astimezone(TZ).date() - timedelta(days=1)
    else:
        return None

    return datetime(
        end_date.year,
        end_date.month,
        end_date.day,
        23,
        59,
        59,
        tzinfo=TZ,
    ).astimezone(UTC)


async def _mark_overdue_assignments(
    db,
    now_utc: datetime,
) -> list[tuple[int, int, str]]:
    overdue_result = await db.execute(
        select(QuestAssignment, Quest)
        .join(Quest, Quest.id == QuestAssignment.quest_id)
        .where(
            QuestAssignment.status.in_(["pending", "pending_approval"]),
            QuestAssignment.cycle_due_at.is_not(None),
            QuestAssignment.cycle_due_at <= now_utc,
        )
    )
    overdue_pairs = overdue_result.all()

    missed_events: list[tuple[int, int, str]] = []
    for assignment, quest in overdue_pairs:
        transition = await db.execute(
            sa_update(QuestAssignment)
            .where(
                QuestAssignment.id == assignment.id,
                QuestAssignment.status.in_(["pending", "pending_approval"]),
                QuestAssignment.cycle_due_at.is_not(None),
                QuestAssignment.cycle_due_at <= now_utc,
            )
            .values(
                status="missed",
                completed_at=None,
                xp_awarded=0,
            )
            .execution_options(synchronize_session=False)
        )
        if transition.rowcount != 1:
            continue

        await update_streak(
            user_id=assignment.user_id,
            family_id=assignment.family_id,
            completed_on_time=False,
            db=db,
            completed_at=now_utc,
        )
        db.add(
            ActivityLog(
                family_id=assignment.family_id,
                user_id=assignment.user_id,
                event_type="quest_missed",
                payload={"questId": quest.id, "questTitle": quest.title, "userId": assignment.user_id},
                is_audit=False,
            )
        )
        missed_events.append((assignment.family_id, assignment.user_id, quest.title))

    return missed_events


def _can_generate_cycle(quest: Quest, cycle_start: datetime, now_utc: datetime) -> bool:
    if cycle_start > now_utc:
        return False
    recurrence_end = quest.recurrence_end_at
    if recurrence_end is None:
        return True
    recurrence_end = _as_utc(recurrence_end)
    return cycle_start < recurrence_end


async def _create_cycle_if_missing(
    db,
    quest: Quest,
    cycle_index: int,
    cycle_start: datetime,
) -> list[tuple[int, int, str, int, int]]:
    previous_cycle_index = cycle_index - 1
    if previous_cycle_index <= 0:
        return []

    assigned_users = (
        await db.execute(
            select(QuestAssignment.user_id)
            .where(
                QuestAssignment.quest_id == quest.id,
                QuestAssignment.cycle_index == previous_cycle_index,
            )
            .distinct()
        )
    ).scalars().all()
    if not assigned_users:
        return []

    cycle_due = compute_cycle_due_at(
        quest.frequency,
        cycle_start,
        monthly_anchor_day=quest.recurrence_anchor_day,
    )
    cycle_events: list[tuple[int, int, str, int, int]] = []
    for user_id in assigned_users:
        exists = (
            await db.execute(
                select(QuestAssignment.id).where(
                    QuestAssignment.quest_id == quest.id,
                    QuestAssignment.user_id == user_id,
                    QuestAssignment.cycle_index == cycle_index,
                )
            )
        ).scalar_one_or_none()
        if exists is not None:
            continue

        db.add(
            QuestAssignment(
                quest_id=quest.id,
                user_id=user_id,
                family_id=quest.family_id,
                status="pending",
                cycle_index=cycle_index,
                cycle_start_at=cycle_start,
                cycle_due_at=cycle_due,
            )
        )
        db.add(
            ActivityLog(
                family_id=quest.family_id,
                user_id=user_id,
                event_type="quest_cycle_created",
                payload={
                    "questId": quest.id,
                    "questTitle": quest.title,
                    "cycleIndex": cycle_index,
                    "userId": user_id,
                },
                is_audit=False,
            )
        )
        cycle_events.append((quest.family_id, quest.id, quest.title, cycle_index, user_id))

    return cycle_events


async def run_quest_scheduler(now_utc: datetime | None = None) -> None:
    """Run recurring quest cycle maintenance with full catch-up."""
    execution_time = _as_utc(now_utc or datetime.now(timezone.utc))
    async with SessionLocal() as db:
        missed_events = await _mark_overdue_assignments(db, execution_time)

        due_quests_result = await db.execute(
            select(Quest).where(
                Quest.frequency != "once",
                Quest.next_occurrence_at.is_not(None),
                Quest.next_occurrence_at <= execution_time,
                or_(
                    Quest.recurrence_end_at.is_(None),
                    Quest.recurrence_end_at > execution_time,
                ),
            )
        )
        due_quests = due_quests_result.scalars().all()

        cycle_events: list[tuple[int, int, str, int, int]] = []
        for quest in due_quests:
            if quest.frequency == "monthly" and quest.recurrence_anchor_day is None:
                cycle_reference = quest.next_occurrence_at or execution_time
                quest.recurrence_anchor_day = _monthly_anchor_day(cycle_reference, None)

            safety_counter = 0
            while True:
                cycle_start = quest.next_occurrence_at
                if cycle_start is None:
                    break
                cycle_start = _as_utc(cycle_start)
                if not _can_generate_cycle(quest, cycle_start, execution_time):
                    if quest.recurrence_end_at is not None and cycle_start >= _as_utc(quest.recurrence_end_at):
                        quest.next_occurrence_at = None
                    break

                latest_cycle = (
                    await db.execute(
                        select(func.max(QuestAssignment.cycle_index)).where(QuestAssignment.quest_id == quest.id)
                    )
                ).scalar() or 0
                if latest_cycle == 0:
                    break

                new_cycle_index = latest_cycle + 1
                cycle_events.extend(
                    await _create_cycle_if_missing(
                        db=db,
                        quest=quest,
                        cycle_index=new_cycle_index,
                        cycle_start=cycle_start,
                    )
                )

                quest.next_occurrence_at = compute_next_occurrence(
                    quest.frequency,
                    cycle_start,
                    monthly_anchor_day=quest.recurrence_anchor_day,
                )
                safety_counter += 1
                if safety_counter >= 500:
                    # Guard against malformed recurrence values causing infinite loops.
                    break

                if quest.next_occurrence_at is None or quest.next_occurrence_at > execution_time:
                    break
                if quest.recurrence_end_at is not None and quest.next_occurrence_at >= _as_utc(quest.recurrence_end_at):
                    if quest.next_occurrence_at <= execution_time:
                        quest.next_occurrence_at = None
                    else:
                        break

        # Mark any catch-up cycles that are already overdue in the same scheduler run.
        missed_events.extend(await _mark_overdue_assignments(db, execution_time))

        await db.commit()

    for family_id, user_id, quest_title in missed_events:
        await emit_family_event(
            family_id,
            "quest_missed",
            {"questTitle": quest_title, "userId": user_id},
        )

    for family_id, quest_id, quest_title, cycle_index, user_id in cycle_events:
        await emit_family_event(
            family_id,
            "quest_cycle_created",
            {
                "questId": quest_id,
                "questTitle": quest_title,
                "cycleIndex": cycle_index,
                "userId": user_id,
            },
        )
        await emit_family_event(
            family_id,
            "quest_updated",
            {"action": "cycle_created", "questId": quest_id},
        )
