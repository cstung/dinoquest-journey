from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any

from fastapi import WebSocket


class FamilyRealtimeHub:
    def __init__(self) -> None:
        self._rooms: dict[int, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, family_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._rooms[family_id].add(websocket)

    async def disconnect(self, family_id: int, websocket: WebSocket) -> None:
        async with self._lock:
            room = self._rooms.get(family_id)
            if not room:
                return
            room.discard(websocket)
            if not room:
                self._rooms.pop(family_id, None)

    async def broadcast(self, family_id: int, event: str, payload: dict[str, Any]) -> None:
        message = {"event": event, "payload": payload}
        async with self._lock:
            clients = list(self._rooms.get(family_id, set()))
        if not clients:
            return
        stale: list[WebSocket] = []
        for ws in clients:
            try:
                await ws.send_json(message)
            except Exception:
                stale.append(ws)
        if stale:
            async with self._lock:
                room = self._rooms.get(family_id)
                if not room:
                    return
                for ws in stale:
                    room.discard(ws)
                if not room:
                    self._rooms.pop(family_id, None)


realtime_hub = FamilyRealtimeHub()


async def emit_family_event(family_id: int, event: str, payload: dict[str, Any]) -> None:
    await realtime_hub.broadcast(family_id, event, payload)
