from __future__ import annotations

import json
from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        enable_decoding=False,
    )

    environment: Literal["development", "production"] = "development"
    app_name: str = "DinoQuest API"
    api_host: str = "0.0.0.0"
    api_port: int = 8122

    # Replace in real environments. Default is for local bootstrap only.
    secret_key: str = "change-me-before-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_days: int = 7
    ws_token_expire_minutes: int = 60
    argon2_memory_cost: int = 65536
    argon2_parallelism: int = 2
    argon2_rounds: int = 3

    # Keep this as plain string to avoid pydantic-settings pre-decoding failures on older versions.
    allowed_origins: str = "http://localhost:5007,http://localhost:3000,http://localhost:5173"
    resolved_allowed_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:5007", "http://localhost:3000", "http://localhost:5173"],
        exclude=True,
    )
    app_base_url: str = "http://localhost:5007"
    cookie_domain: str = ""
    tz: str = "Asia/Ho_Chi_Minh"
    db_path: str = "./data/dinoquest.db"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"
    whisper_model: str = "whisper-1"
    test_transcript_max_chars: int = 12000
    subtitle_title_timeout_seconds: float = 4.0
    subtitle_fetch_timeout_per_attempt_seconds: float = 8.0
    subtitle_fetch_total_timeout_seconds: float = 20.0
    subtitle_cache_ttl_seconds: int = 3600
    subtitle_cache_max_size: int = 256
    vapid_private_key: str = ""
    vapid_public_key: str = ""
    vapid_claims_email: str = "admin@dinoquest.local"

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def normalize_allowed_origins(cls, value: object) -> str:
        if value is None:
            return ""
        if isinstance(value, str):
            return value.strip()
        if isinstance(value, list):
            return ",".join(str(origin).strip() for origin in value if str(origin).strip())
        return str(value).strip()

    @model_validator(mode="after")
    def resolve_allowed_origins(self) -> "Settings":
        raw_value = self.allowed_origins.strip()
        if not raw_value:
            self.resolved_allowed_origins = []
            return self

        if raw_value.startswith("["):
            try:
                decoded = json.loads(raw_value)
            except json.JSONDecodeError:
                decoded = None
            if isinstance(decoded, list):
                self.resolved_allowed_origins = [str(origin).strip() for origin in decoded if str(origin).strip()]
                return self

        self.resolved_allowed_origins = [origin.strip() for origin in raw_value.split(",") if origin.strip()]
        return self

    @field_validator("secret_key")
    @classmethod
    def require_non_default_secret_in_production(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("secret_key cannot be empty")
        return value

    @model_validator(mode="after")
    def validate_security_constraints(self) -> "Settings":
        if self.environment == "production" and self.secret_key == "change-me-before-production":
            raise ValueError("secret_key must be overridden in production")
        return self


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
