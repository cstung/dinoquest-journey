from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from backend.database import SessionLocal
from backend.models import Family, FamilyMember, User
from backend.realtime import realtime_hub
from backend.security import parse_token_subject

router = APIRouter()


@router.websocket("/ws/families/{family_id}")
async def family_room(websocket: WebSocket, family_id: int) -> None:
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4401, reason="Missing token")
        return

    try:
        user_id = parse_token_subject(token, required_type="ws")
    except ValueError:
        await websocket.close(code=4401, reason="Invalid token")
        return

    async with SessionLocal() as db:
        user = await db.get(User, user_id)
        if not user or not user.is_active:
            await websocket.close(code=4401, reason="User not found")
            return

        family = await db.get(Family, family_id)
        if not family or family.is_deleted:
            await websocket.close(code=4404, reason="Family not found")
            return

        membership = (
            await db.execute(
                select(FamilyMember).where(
                    FamilyMember.family_id == family_id,
                    FamilyMember.user_id == user_id,
                )
            )
        ).scalar_one_or_none()
        if not membership:
            await websocket.close(code=4403, reason="Not a member")
            return

    await realtime_hub.connect(family_id, websocket)
    try:
        while True:
            message = await websocket.receive_text()
            if message.strip().lower() == "ping":
                await websocket.send_json({"event": "pong", "payload": {"familyId": family_id}})
    except WebSocketDisconnect:
        await realtime_hub.disconnect(family_id, websocket)
    except Exception:
        await realtime_hub.disconnect(family_id, websocket)
