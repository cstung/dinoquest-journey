from __future__ import annotations

from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from backend.config import get_settings

@lru_cache(maxsize=1)
def _pwd_context() -> CryptContext:
    settings = get_settings()
    return CryptContext(
        schemes=["argon2"],
        deprecated="auto",
        argon2__memory_cost=settings.argon2_memory_cost,
        argon2__parallelism=settings.argon2_parallelism,
        argon2__rounds=settings.argon2_rounds,
    )


def hash_password(password: str) -> str:
    return _pwd_context().hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    return _pwd_context().verify(password, hashed_password)


def _create_token(subject: str, expires_delta: timedelta, token_type: str) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": subject,
        "iat": int(now.timestamp()),
        "nbf": int(now.timestamp()),
        "exp": int((now + expires_delta).timestamp()),
        "typ": token_type,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def create_access_token(user_id: int) -> str:
    settings = get_settings()
    return _create_token(
        subject=str(user_id),
        expires_delta=timedelta(days=settings.access_token_expire_days),
        token_type="access",
    )


def create_ws_token(user_id: int) -> str:
    settings = get_settings()
    return _create_token(
        subject=str(user_id),
        expires_delta=timedelta(minutes=settings.ws_token_expire_minutes),
        token_type="ws",
    )


def decode_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    return jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])


def parse_token_subject(token: str, required_type: str | None = None) -> int:
    try:
        payload = decode_token(token)
        token_type = payload.get("typ")
        if required_type and token_type != required_type:
            raise ValueError("Invalid token type")
        return int(payload["sub"])
    except (JWTError, KeyError, ValueError) as exc:
        raise ValueError("Invalid or expired session") from exc
