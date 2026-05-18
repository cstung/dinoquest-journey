from __future__ import annotations

from pathlib import Path
from typing import AsyncIterator

from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from backend.config import get_settings


class Base(DeclarativeBase):
    pass


def _ensure_db_parent_dir(db_path: str) -> None:
    if db_path == ":memory:":
        return
    path = Path(db_path).expanduser()
    if path.parent and not path.parent.exists():
        path.parent.mkdir(parents=True, exist_ok=True)


def _build_database_url(db_path: str) -> str:
    if db_path == ":memory:":
        return "sqlite+aiosqlite:///:memory:"
    path = Path(db_path).expanduser().resolve()
    return f"sqlite+aiosqlite:///{path.as_posix()}"


settings = get_settings()
_ensure_db_parent_dir(settings.db_path)
DATABASE_URL = _build_database_url(settings.db_path)

engine: AsyncEngine = create_async_engine(
    DATABASE_URL,
    future=True,
    pool_pre_ping=True,
)

SessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)


@event.listens_for(engine.sync_engine, "connect")
def set_sqlite_pragma(dbapi_connection, _) -> None:  # type: ignore[no-untyped-def]
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


async def get_db() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session

