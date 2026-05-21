from __future__ import annotations

import asyncio
import itertools
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient
from sqlalchemy import select

_seq = itertools.count(1000)
TZ = ZoneInfo("Asia/Ho_Chi_Minh")


def _register_with_invite(client: TestClient, username: str, email: str, invite_code: str | None) -> dict:
    payload = {"username": username, "password": "Password12345!", "email": email}
    if invite_code is not None:
        payload["inviteCode"] = invite_code
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def _setup_family_with_child(client: TestClient) -> tuple[int, int, TestClient]:
    idx = next(_seq)
    _register_with_invite(client, f"rec_parent_{idx}", f"rec_parent_{idx}@example.com", None)
    family = client.post("/api/families", json={"name": f"Rec Family {idx}", "motto": "QA"})
    assert family.status_code == 201, family.text
    family_id = family.json()["id"]

    invite = client.post(f"/api/families/{family_id}/invites", json={"role": "child"})
    assert invite.status_code == 201, invite.text

    child_client = TestClient(client.app)
    _register_with_invite(
        child_client,
        f"rec_child_{idx}",
        f"rec_child_{idx}@example.com",
        invite.json()["code"],
    )
    members = child_client.get(f"/api/families/{family_id}/members").json()
    child_user_id = next(m["userId"] for m in members if m["role"] == "child")
    return family_id, child_user_id, child_client


def test_monthly_anchor_preserves_original_day_after_short_month(client: TestClient) -> None:
    assert client is not None
    from backend.services.quest_scheduler import compute_cycle_due_at, compute_next_occurrence

    start_vn = datetime(2026, 1, 31, 0, 0, 0, tzinfo=TZ)
    start_utc = start_vn.astimezone(timezone.utc)

    feb_occurrence = compute_next_occurrence("monthly", start_utc, monthly_anchor_day=31)
    assert feb_occurrence is not None
    feb_local = feb_occurrence.astimezone(TZ)
    assert (feb_local.year, feb_local.month, feb_local.day) == (2026, 2, 28)

    mar_occurrence = compute_next_occurrence("monthly", feb_occurrence, monthly_anchor_day=31)
    assert mar_occurrence is not None
    mar_local = mar_occurrence.astimezone(TZ)
    assert (mar_local.year, mar_local.month, mar_local.day) == (2026, 3, 31)

    jan_due = compute_cycle_due_at("monthly", start_utc, monthly_anchor_day=31)
    assert jan_due is not None
    jan_due_local = jan_due.astimezone(TZ)
    assert (jan_due_local.year, jan_due_local.month, jan_due_local.day) == (2026, 2, 27)
    assert (jan_due_local.hour, jan_due_local.minute, jan_due_local.second) == (23, 59, 59)


def test_scheduler_catchup_is_idempotent_and_marks_overdue(client: TestClient) -> None:
    from backend.database import SessionLocal
    from backend.models import Quest, QuestAssignment
    from backend.services.quest_scheduler import run_quest_scheduler

    family_id, child_user_id, _ = _setup_family_with_child(client)
    created = client.post(
        f"/api/families/{family_id}/quests",
        json={
            "title": "Daily cleanup",
            "frequency": "daily",
            "assignedUserIds": [child_user_id],
        },
    )
    assert created.status_code == 201, created.text
    quest_id = created.json()["id"]

    checkpoint = datetime(2026, 5, 21, 12, 0, 0, tzinfo=timezone.utc)

    async def _prepare() -> None:
        async with SessionLocal() as db:
            quest = (await db.execute(select(Quest).where(Quest.id == quest_id))).scalar_one()
            quest.next_occurrence_at = checkpoint - timedelta(days=3)
            assignment = (
                await db.execute(
                    select(QuestAssignment).where(
                        QuestAssignment.quest_id == quest_id,
                        QuestAssignment.user_id == child_user_id,
                        QuestAssignment.cycle_index == 1,
                    )
                )
            ).scalar_one()
            assignment.status = "pending"
            assignment.cycle_due_at = checkpoint - timedelta(minutes=5)
            await db.commit()

    async def _snapshot() -> tuple[int, int, int]:
        async with SessionLocal() as db:
            assignments = (
                await db.execute(
                    select(QuestAssignment).where(QuestAssignment.quest_id == quest_id)
                )
            ).scalars().all()
            total = len(assignments)
            max_cycle = max(a.cycle_index for a in assignments)
            missed = len([a for a in assignments if a.status == "missed"])
            return total, max_cycle, missed

    asyncio.run(_prepare())
    asyncio.run(run_quest_scheduler(now_utc=checkpoint))
    first_total, first_max_cycle, first_missed = asyncio.run(_snapshot())
    assert first_max_cycle >= 4
    assert first_missed >= 1

    asyncio.run(run_quest_scheduler(now_utc=checkpoint))
    second_total, second_max_cycle, second_missed = asyncio.run(_snapshot())
    assert (second_total, second_max_cycle, second_missed) == (first_total, first_max_cycle, first_missed)
