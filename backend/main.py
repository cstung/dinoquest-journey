from __future__ import annotations

from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from backend.config import get_settings
from backend.database import engine
from backend.routers import (
    activity_log,
    auth,
    families,
    invites,
    join_requests,
    leaderboard,
    members,
    pets,
    quests,
    rewards,
    tests,
    ws,
)


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
    app.include_router(families.router, prefix="/api/families", tags=["families"])
    app.include_router(members.router, prefix="/api/families", tags=["members"])
    app.include_router(invites.router, prefix="/api/families", tags=["invites"])
    app.include_router(join_requests.router, prefix="/api", tags=["join-requests"])
    app.include_router(activity_log.router, prefix="/api/families", tags=["activity"])
    app.include_router(quests.router, prefix="/api/families", tags=["quests"])
    app.include_router(tests.router, prefix="/api/families", tags=["tests"])
    app.include_router(pets.router, prefix="/api/families", tags=["pets"])
    app.include_router(rewards.router, prefix="/api/families", tags=["rewards"])
    app.include_router(leaderboard.router, prefix="/api/families", tags=["leaderboard"])
    app.include_router(ws.router, tags=["ws"])

    @app.get("/api/health")
    async def health() -> dict[str, str]:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return {
            "status": "ok",
            "environment": settings.environment,
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }

    return app


app = create_app()
