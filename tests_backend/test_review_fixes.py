from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import select

from test_quest_recurrence_hardening import _setup_family_with_child


def test_uploads_does_not_serve_database(client: TestClient) -> None:
    from backend.config import get_settings
    from pathlib import Path

    db_name = Path(get_settings().db_path).name
    assert client.get(f"/uploads/{db_name}").status_code == 404
    assert client.get("/uploads/avatars/missing.png").status_code == 404


def test_invalid_invite_is_uniform_and_rate_limited(client: TestClient) -> None:
    from backend.services import invite_service

    invite_service._invite_failures.clear()
    try:
        anon = TestClient(client.app)
        details = set()
        for i in range(invite_service._INVITE_FAIL_LIMIT):
            r = anon.post(
                "/api/auth/register",
                json={"username": f"brute_{i}", "password": "Password12345!", "inviteCode": "000000"},
            )
            assert r.status_code == 400, r.text
            details.add(r.json()["detail"])
        assert details == {invite_service.INVALID_INVITE_DETAIL}
        r = anon.post(
            "/api/auth/register",
            json={"username": "brute_x", "password": "Password12345!", "inviteCode": "000000"},
        )
        assert r.status_code == 429
    finally:
        invite_service._invite_failures.clear()


def _create_once_quest(client: TestClient, family_id: int, child_user_id: int, xp: int = 25) -> int:
    r = client.post(
        f"/api/families/{family_id}/quests",
        json={"title": "Fix test quest", "xpReward": xp, "frequency": "once", "assignedUserIds": [child_user_id]},
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_double_approve_awards_xp_once_and_starts_streak(client: TestClient) -> None:
    family_id, child_user_id, child_client = _setup_family_with_child(client)
    quest_id = _create_once_quest(client, family_id, child_user_id, xp=25)

    done = child_client.post(f"/api/families/{family_id}/quests/{quest_id}/complete")
    assert done.status_code == 200, done.text
    assignment_id = done.json()["assignmentId"]

    url = f"/api/families/{family_id}/quest-assignments/{assignment_id}/resolve"
    first = client.post(url, json={"decision": "approve"})
    assert first.status_code == 200, first.text
    assert first.json()["xpBalance"] == 25
    second = client.post(url, json={"decision": "approve"})
    assert second.status_code == 400

    from backend.database import SessionLocal
    from backend.models import UserFamilyLevel

    async def _level() -> UserFamilyLevel:
        async with SessionLocal() as db:
            return (
                await db.execute(
                    select(UserFamilyLevel).where(
                        UserFamilyLevel.family_id == family_id, UserFamilyLevel.user_id == child_user_id
                    )
                )
            ).scalar_one()

    level = asyncio.run(_level())
    assert level.xp_balance == 25
    assert level.current_streak == 1  # first-ever completion used to be dropped


def test_on_time_request_survives_deadline_until_parent_reviews(client: TestClient) -> None:
    from backend.database import SessionLocal
    from backend.models import QuestAssignment
    from backend.services.quest_scheduler import run_quest_scheduler

    family_id, child_user_id, child_client = _setup_family_with_child(client)
    quest_id = _create_once_quest(client, family_id, child_user_id)
    done = child_client.post(f"/api/families/{family_id}/quests/{quest_id}/complete")
    assert done.status_code == 200, done.text
    assignment_id = done.json()["assignmentId"]

    now = datetime.now(timezone.utc)

    async def _backdate() -> None:
        async with SessionLocal() as db:
            a = await db.get(QuestAssignment, assignment_id)
            a.completion_requested_at = now - timedelta(hours=2)
            a.cycle_due_at = now - timedelta(hours=1)
            await db.commit()

    async def _status() -> str:
        async with SessionLocal() as db:
            return (await db.get(QuestAssignment, assignment_id)).status

    asyncio.run(_backdate())
    asyncio.run(run_quest_scheduler(now_utc=now))
    assert asyncio.run(_status()) == "pending_approval"

    r = client.post(
        f"/api/families/{family_id}/quest-assignments/{assignment_id}/resolve", json={"decision": "approve"}
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "completed"
