from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from backend.config import get_settings
from backend.database import engine
from backend.services.quest_scheduler import run_quest_scheduler
from backend.routers import (
    activity_log,
    auth,
    dashboard,
    families,
    invites,
    join_requests,
    leaderboard,
    members,
    pets,
    quests,
    rewards,
    tests,
    users,
    ws,
)


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name)
    scheduler = AsyncIOScheduler(timezone="Asia/Ho_Chi_Minh")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
    app.include_router(join_requests.router, prefix="/api", tags=["join"])
    app.include_router(families.router, prefix="/api/families", tags=["families"])
    app.include_router(join_requests.legacy_router, prefix="/api", tags=["join-requests"])
    app.include_router(members.router, prefix="/api/families", tags=["members"])
    app.include_router(invites.router, prefix="/api/families", tags=["invites"])
    app.include_router(activity_log.router, prefix="/api/families", tags=["activity"])
    app.include_router(dashboard.router, prefix="/api/families", tags=["dashboard"])
    app.include_router(quests.router, prefix="/api/families", tags=["quests"])
    app.include_router(tests.router, prefix="/api/families", tags=["tests"])
    app.include_router(pets.router, prefix="/api/families", tags=["pets"])
    app.include_router(rewards.router, prefix="/api/families", tags=["rewards"])
    app.include_router(leaderboard.router, prefix="/api/families", tags=["leaderboard"])
    app.include_router(users.router, prefix="/api/users", tags=["users"])
    app.include_router(ws.router, tags=["ws"])

    data_dir = Path(settings.db_path).expanduser()
    if data_dir == Path(":memory:"):
        static_dir = Path("./data").resolve()
    else:
        static_dir = data_dir.resolve().parent
    static_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=str(static_dir)), name="uploads")

    @app.get("/api/health")
    async def health() -> dict[str, str]:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return {
            "status": "ok",
            "environment": settings.environment,
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }

    @app.on_event("startup")
    async def start_scheduler() -> None:
        # Catch up missed cycles and overdue assignments before serving traffic.
        await run_quest_scheduler()
        scheduler.add_job(
            run_quest_scheduler,
            CronTrigger(hour=0, minute=0, second=0),
            id="quest_scheduler",
            replace_existing=True,
        )
        scheduler.start()

    @app.on_event("shutdown")
    async def stop_scheduler() -> None:
        scheduler.shutdown(wait=False)

    return app


app = create_app()
