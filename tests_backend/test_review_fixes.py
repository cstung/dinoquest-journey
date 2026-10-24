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


def test_family_list_counts_all_members(client: TestClient) -> None:
    family_id, _, child_client = _setup_family_with_child(client)
    families = child_client.get("/api/families").json()
    assert next(f for f in families if f["id"] == family_id)["memberCount"] == 1  # superadmin is not a member
    invite = client.post(f"/api/families/{family_id}/invites", json={"role": "child"}).json()["code"]
    other = TestClient(client.app)
    r = other.post(
        "/api/auth/register",
        json={"username": f"count_kid_{family_id}", "password": "Password12345!", "inviteCode": invite},
    )
    assert r.status_code == 201, r.text
    families = child_client.get("/api/families").json()
    assert next(f for f in families if f["id"] == family_id)["memberCount"] == 2


def test_parent_status_filter_is_applied_before_paging(client: TestClient) -> None:
    family_id, child_user_id, child_client = _setup_family_with_child(client)
    target = _create_once_quest(client, family_id, child_user_id)
    assert child_client.post(f"/api/families/{family_id}/quests/{target}/complete").status_code == 200
    for _ in range(3):
        _create_once_quest(client, family_id, child_user_id)

    page = client.get(f"/api/families/{family_id}/quests?status=pending_approval&limit=1").json()
    assert [item["id"] for item in page["items"]] == [target]
    assert page["total"] == 1
    assert client.get(f"/api/families/{family_id}/quests?cursor=garbage").status_code == 422


_PNG_1PX = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
)


def test_thumbnail_data_urls_are_stored_as_files(client: TestClient) -> None:
    family_id, _, _ = _setup_family_with_child(client)
    r = client.post(
        f"/api/families/{family_id}/rewards",
        json={"title": "Sticker", "xpCost": 5, "thumbnailUrl": _PNG_1PX},
    )
    assert r.status_code == 201, r.text
    url = r.json()["thumbnailUrl"]
    assert url.startswith("/uploads/thumbnails/") and url.endswith(".png")
    assert client.get(url).status_code == 200

    from backend.database import SessionLocal
    from backend.models import RewardItem
    from backend.services.media import migrate_inline_thumbnails

    async def _legacy() -> int:
        async with SessionLocal() as db:
            item = await db.get(RewardItem, r.json()["id"])
            item.thumbnail_url = _PNG_1PX
            await db.commit()
        moved = await migrate_inline_thumbnails()
        async with SessionLocal() as db:
            assert (await db.get(RewardItem, r.json()["id"])).thumbnail_url.startswith("/uploads/thumbnails/")
        return moved

    assert asyncio.run(_legacy()) >= 1


def test_api_datetimes_are_utc_with_z(client: TestClient) -> None:
    family_id, _, _ = _setup_family_with_child(client)
    created_at = client.get(f"/api/families/{family_id}/members").json()[0]["joinedAt"]
    assert created_at.endswith("Z"), created_at  # naive values were read as local time in browsers
