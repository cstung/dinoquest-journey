from __future__ import annotations

import itertools

from fastapi.testclient import TestClient

_seq = itertools.count(1)


def _register(client: TestClient, username: str, email: str) -> dict:
    response = client.post(
        "/api/auth/register",
        json={"username": username, "password": "Password12345!", "email": email},
    )
    assert response.status_code == 201, response.text
    return response.json()


def _setup_family_with_child(client: TestClient) -> tuple[int, int, TestClient]:
    idx = next(_seq)
    parent = _register(client, f"parent_test_{idx}", f"parent_test_{idx}@example.com")
    assert parent["globalRole"] == "superadmin"
    family = client.post("/api/families", json={"name": "Test Family", "motto": "QA"})
    assert family.status_code == 201, family.text
    family_id = family.json()["id"]

    invite = client.post(f"/api/families/{family_id}/invites", json={"role": "child"})
    assert invite.status_code == 201, invite.text
    code = invite.json()["code"]

    child_client = TestClient(client.app)
    _register(child_client, f"child_test_{idx}", f"child_test_{idx}@example.com")
    join = child_client.post("/api/join", json={"code": code})
    assert join.status_code == 200, join.text
    child_user_id = (
        child_client.get(f"/api/families/{family_id}/members")
        .json()
    )
    child_user_id = next(m["userId"] for m in child_user_id if m["role"] == "child")
    return family_id, child_user_id, child_client


def test_auth_invite_join_flow(client: TestClient) -> None:
    first = _register(client, "auth_parent", "auth_parent@example.com")
    assert first["globalRole"] == "superadmin"

    second_client = TestClient(client.app)
    second = _register(second_client, "auth_second", "auth_second@example.com")
    assert second["globalRole"] == "user"

    family = client.post("/api/families", json={"name": "Auth Family"})
    assert family.status_code == 201, family.text
    family_id = family.json()["id"]

    invite = client.post(f"/api/families/{family_id}/invites", json={"role": "child"})
    assert invite.status_code == 201, invite.text
    assert invite.json()["role"] == "child"
    assert invite.json()["code"].isdigit()
    assert len(invite.json()["code"]) == 6

    child_client = TestClient(client.app)
    _register(child_client, "auth_child", "auth_child@example.com")
    join = child_client.post("/api/join", json={"code": invite.json()["code"]})
    assert join.status_code == 200, join.text
    assert join.json()["familyId"] == family_id
    assert join.json()["role"] == "child"

    joined_twice = child_client.post("/api/join", json={"code": invite.json()["code"]})
    assert joined_twice.status_code == 400, joined_twice.text
    assert joined_twice.json()["detail"] == "This invite code has already been used"


def test_testmaker_reopen_revokes_and_reawards_xp(client: TestClient) -> None:
    family_id, child_user_id, child_client = _setup_family_with_child(client)

    preview = client.post(
        f"/api/families/{family_id}/tests/preview",
        json={"youtubeUrl": "https://www.youtube.com/watch?v=ZCkn3l_RtgU", "questionCount": 5},
    )
    assert preview.status_code == 200, preview.text
    payload = preview.json()

    created = client.post(
        f"/api/families/{family_id}/tests",
        json={
            "title": payload["title"],
            "youtubeUrl": payload["youtubeUrl"],
            "videoId": payload["videoId"],
            "thumbnailUrl": payload["thumbnailUrl"],
            "subtitleSource": payload["subtitleSource"],
            "rawTranscript": payload["rawTranscript"],
            "questionCount": len(payload["questions"]),
            "timeLimitMin": 20,
            "maxXp": 120,
            "assignedUserIds": [child_user_id],
            "questions": payload["questions"],
        },
    )
    assert created.status_code == 201, created.text
    test_id = created.json()["id"]

    start = child_client.post(f"/api/families/{family_id}/tests/{test_id}/start")
    assert start.status_code == 200, start.text
    attempt = start.json()
    submit = child_client.post(
        f"/api/families/{family_id}/tests/{test_id}/submit",
        json={
            "attemptId": attempt["attemptId"],
            "answers": [{"questionId": q["id"], "selectedOption": 0} for q in attempt["questions"]],
        },
    )
    assert submit.status_code == 200, submit.text
    first_xp = submit.json()["xpEarned"]
    assert first_xp > 0

    reopen = child_client.post(
        f"/api/families/{family_id}/tests/{test_id}/reopen-request",
        json={"reason": "Retake"},
    )
    assert reopen.status_code == 201, reopen.text

    resolved = client.post(
        f"/api/families/{family_id}/tests/{test_id}/reopen-requests/{reopen.json()['id']}/resolve",
        json={"decision": "approve"},
    )
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["xpDelta"] == -first_xp
    assert resolved.json()["request"]["status"] == "approved"

    start2 = child_client.post(f"/api/families/{family_id}/tests/{test_id}/start")
    assert start2.status_code == 200, start2.text
    attempt2 = start2.json()
    submit2 = child_client.post(
        f"/api/families/{family_id}/tests/{test_id}/submit",
        json={
            "attemptId": attempt2["attemptId"],
            "answers": [{"questionId": q["id"], "selectedOption": 0} for q in attempt2["questions"]],
        },
    )
    assert submit2.status_code == 200, submit2.text
    assert submit2.json()["xpEarned"] == first_xp


def test_websocket_receives_reward_claim_resolution_event(client: TestClient) -> None:
    family_id, child_user_id, child_client = _setup_family_with_child(client)

    # give child XP by quest completion so reward approval can deduct XP
    quest = client.post(
        f"/api/families/{family_id}/quests",
        json={"title": "Do homework", "xpReward": 150, "assignedUserIds": [child_user_id]},
    )
    assert quest.status_code == 201, quest.text
    quest_id = quest.json()["id"]
    complete = child_client.post(f"/api/families/{family_id}/quests/{quest_id}/complete")
    assert complete.status_code == 200, complete.text

    reward = client.post(
        f"/api/families/{family_id}/rewards",
        json={"title": "Movie night", "description": "Pick a movie", "xpCost": 100},
    )
    assert reward.status_code == 201, reward.text
    reward_id = reward.json()["id"]

    claim = child_client.post(f"/api/families/{family_id}/rewards/{reward_id}/claim")
    assert claim.status_code == 201, claim.text
    claim_id = claim.json()["id"]

    ws_token = client.get("/api/auth/ws-token")
    assert ws_token.status_code == 200, ws_token.text
    token = ws_token.json()["wsToken"]

    with client.websocket_connect(f"/ws/families/{family_id}?token={token}") as websocket:
        resolved = client.post(
            f"/api/families/{family_id}/reward-claims/{claim_id}/resolve",
            json={"decision": "approved"},
        )
        assert resolved.status_code == 200, resolved.text
        event = websocket.receive_json()
        assert event["event"] == "reward_claim_resolved"
        assert event["payload"]["claimId"] == claim_id
