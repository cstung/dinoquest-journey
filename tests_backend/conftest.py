from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncEngine


def _prepare_env(tmp_path: Path) -> None:
    db_path = (tmp_path / "dinoquest_test.db").resolve()
    if db_path.exists():
        db_path.unlink()
    os.environ["ENVIRONMENT"] = "development"
    os.environ["SECRET_KEY"] = "test-secret-key-1234567890"
    os.environ["DB_PATH"] = str(db_path)
    os.environ["ALLOWED_ORIGINS"] = '["http://localhost:3000","http://localhost:5173"]'
    os.environ["SUBTITLE_TITLE_TIMEOUT_SECONDS"] = "1.5"
    os.environ["SUBTITLE_FETCH_TIMEOUT_SECONDS"] = "2.5"


@pytest.fixture(scope="session")
def client(tmp_path_factory: pytest.TempPathFactory) -> TestClient:
    tmp_dir = tmp_path_factory.mktemp("db")
    _prepare_env(tmp_dir)

    # Delay imports until env vars are in place.
    from backend.config import get_settings

    get_settings.cache_clear()

    from backend import models  # noqa: F401
    from backend.database import Base, engine
    from backend.main import app

    async def _create_all(async_engine: AsyncEngine) -> None:
        async with async_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    async def _drop_all(async_engine: AsyncEngine) -> None:
        async with async_engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)

    import asyncio

    asyncio.run(_create_all(engine))
    with TestClient(app) as test_client:
        yield test_client
    asyncio.run(_drop_all(engine))
