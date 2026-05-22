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
    parent_resp = client.post(
        "/api/auth/register",
        json={
            "username": f"rec_parent_{idx}",
            "password": "Password12345!",
            "email": f"rec_parent_{idx}@example.com",
        },
    )
    if parent_resp.status_code not in {201, 422}:
        assert parent_resp.status_code == 201, parent_resp.text
    if parent_resp.status_code == 422:
        detail = str(parent_resp.json().get("detail", "")).lower()
        assert "invitecode is required" in detail
        me = client.get("/api/auth/me")
        assert me.status_code == 200, me.text
        me_body = me.json()
        role = me_body.get("role")
        global_role = me_body.get("globalRole")
        assert role in {"parent", "superadmin", None}
        assert global_role in {"superadmin", "user"}

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


def test_due_date_today_vn_stores_utc_eod_and_allows_completion(client: TestClient) -> None:
    family_id, child_user_id, child_client = _setup_family_with_child(client)
    vn_today = datetime.now(TZ).date().isoformat()

    created = client.post(
        f"/api/families/{family_id}/quests",
        json={
            "title": "VN EOD quest",
            "xpReward": 30,
            "frequency": "once",
            "dueDate": f"{vn_today}T16:59:59.999Z",
            "assignedUserIds": [child_user_id],
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()

    assert body["dueDate"].startswith(f"{vn_today}T16:59:59.999")
    assert body["assignedMembers"][0]["cycleDueAt"].startswith(f"{vn_today}T16:59:59.999")

    quest_id = body["id"]
    complete = child_client.post(f"/api/families/{family_id}/quests/{quest_id}/complete")
    assert complete.status_code == 200, complete.text
    assert complete.json()["status"] == "pending_approval"


def test_due_date_bare_date_promotes_to_vn_end_of_day(client: TestClient) -> None:
    family_id, child_user_id, _ = _setup_family_with_child(client)
    vn_today = datetime.now(TZ).date().isoformat()

    created = client.post(
        f"/api/families/{family_id}/quests",
        json={
            "title": "Date only quest",
            "xpReward": 15,
            "frequency": "once",
            "dueDate": vn_today,
            "assignedUserIds": [child_user_id],
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["dueDate"].startswith(f"{vn_today}T16:59:59.999")
    assert body["assignedMembers"][0]["cycleDueAt"].startswith(f"{vn_today}T16:59:59.999")


def test_due_date_past_vn_date_is_rejected(client: TestClient) -> None:
    family_id, child_user_id, _ = _setup_family_with_child(client)
    past_vn = (datetime.now(TZ).date() - timedelta(days=1)).isoformat()

    created = client.post(
        f"/api/families/{family_id}/quests",
        json={
            "title": "Past date quest",
            "xpReward": 10,
            "frequency": "once",
            "dueDate": past_vn,
            "assignedUserIds": [child_user_id],
        },
    )
    assert created.status_code == 422, created.text
    detail = str(created.json().get("detail", "")).lower()
    assert "past" in detail


def test_completion_fails_after_due_boundary(client: TestClient) -> None:
    from backend.database import SessionLocal
    from backend.models import QuestAssignment

    family_id, child_user_id, child_client = _setup_family_with_child(client)
    vn_today = datetime.now(TZ).date().isoformat()

    created = client.post(
        f"/api/families/{family_id}/quests",
        json={
            "title": "Boundary quest",
            "xpReward": 12,
            "frequency": "once",
            "dueDate": f"{vn_today}T16:59:59.999Z",
            "assignedUserIds": [child_user_id],
        },
    )
    assert created.status_code == 201, created.text
    quest_id = created.json()["id"]

    async def _force_expired() -> None:
        async with SessionLocal() as db:
            row = await db.execute(
                select(QuestAssignment).where(
                    QuestAssignment.quest_id == quest_id,
                    QuestAssignment.user_id == child_user_id,
                    QuestAssignment.cycle_index == 1,
                )
            )
            assignment = row.scalar_one()
            assignment.cycle_due_at = datetime.now(timezone.utc) - timedelta(seconds=1)
            assignment.status = "pending"
            await db.commit()

    asyncio.run(_force_expired())

    complete = child_client.post(f"/api/families/{family_id}/quests/{quest_id}/complete")
    assert complete.status_code == 400, complete.text
    assert "deadline has passed" in complete.json()["detail"].lower()
