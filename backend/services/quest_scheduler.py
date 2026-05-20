from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
import calendar
from zoneinfo import ZoneInfo

from sqlalchemy import and_, func, or_, select

from backend.models import ActivityLog, Quest, QuestAssignment
from backend.realtime import emit_family_event
from backend.database import SessionLocal
from backend.services.streak_service import update_streak

TZ = ZoneInfo("Asia/Ho_Chi_Minh")
UTC = ZoneInfo("UTC")


def midnight_vn(d: date) -> datetime:
    """Return VN midnight converted to UTC-aware datetime."""
    return datetime(d.year, d.month, d.day, 0, 0, 0, tzinfo=TZ).astimezone(UTC)


def compute_next_occurrence(frequency: str, from_dt: datetime) -> datetime | None:
    local_dt = from_dt.astimezone(TZ)
    local_date = local_dt.date()

    if frequency == "once":
        return None

    if frequency == "daily":
        next_date = local_date + timedelta(days=1)
    elif frequency == "weekly":
        next_date = local_date + timedelta(weeks=1)
    elif frequency == "monthly":
        month = local_date.month + 1
        year = local_date.year
        if month > 12:
            month = 1
            year += 1
        last_day = calendar.monthrange(year, month)[1]
        day = min(local_date.day, last_day)
        next_date = date(year, month, day)
    else:
        return None

    return midnight_vn(next_date)


def compute_cycle_due_at(frequency: str, cycle_start: datetime) -> datetime | None:
    local = cycle_start.astimezone(TZ)
    local_date = local.date()

    if frequency == "daily":
        end_date = local_date
    elif frequency == "weekly":
        end_date = local_date + timedelta(days=6)
    elif frequency == "monthly":
        next_occ = compute_next_occurrence("monthly", cycle_start)
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


async def run_quest_scheduler() -> None:
    """Run recurring quest cycle maintenance at VN midnight."""
    async with SessionLocal() as db:
        now_utc = datetime.now(timezone.utc)

        missed_result = await db.execute(
            select(QuestAssignment, Quest)
            .join(Quest, Quest.id == QuestAssignment.quest_id)
            .where(
                QuestAssignment.status == "pending",
                QuestAssignment.cycle_due_at.is_not(None),
                QuestAssignment.cycle_due_at <= now_utc,
            )
        )
        missed_assignments = missed_result.all()

        missed_events: list[tuple[int, int, str]] = []
        for assignment, quest in missed_assignments:
            assignment.status = "missed"
            await update_streak(
                user_id=assignment.user_id,
                family_id=assignment.family_id,
                completed_on_time=False,
                db=db,
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

        due_quests_result = await db.execute(
            select(Quest).where(
                Quest.frequency != "once",
                Quest.next_occurrence_at.is_not(None),
                Quest.next_occurrence_at <= now_utc,
                or_(
                    Quest.recurrence_end_at.is_(None),
                    Quest.recurrence_end_at > now_utc,
                ),
            )
        )
        due_quests = due_quests_result.scalars().all()

        cycle_events: list[tuple[int, int, str, int, int]] = []
        for quest in due_quests:
            cycle_start = quest.next_occurrence_at or now_utc

            latest_cycle = (
                await db.execute(
                    select(func.max(QuestAssignment.cycle_index)).where(QuestAssignment.quest_id == quest.id)
                )
            ).scalar() or 0
            new_cycle_index = latest_cycle + 1

            if latest_cycle == 0:
                continue

            assigned_users = (
                await db.execute(
                    select(QuestAssignment.user_id)
                    .where(
                        QuestAssignment.quest_id == quest.id,
                        QuestAssignment.cycle_index == latest_cycle,
                    )
                    .distinct()
                )
            ).scalars().all()

            if not assigned_users:
                continue

            cycle_due = compute_cycle_due_at(quest.frequency, cycle_start)
            for user_id in assigned_users:
                db.add(
                    QuestAssignment(
                        quest_id=quest.id,
                        user_id=user_id,
                        family_id=quest.family_id,
                        status="pending",
                        cycle_index=new_cycle_index,
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
                            "cycleIndex": new_cycle_index,
                            "userId": user_id,
                        },
                        is_audit=False,
                    )
                )
                cycle_events.append((quest.family_id, quest.id, quest.title, new_cycle_index, user_id))

            quest.next_occurrence_at = compute_next_occurrence(quest.frequency, cycle_start)

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
