from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    environment: Literal["development", "production"] = "development"
    app_name: str = "DinoQuest API"
    api_host: str = "0.0.0.0"
    api_port: int = 8122

    # Replace in real environments. Default is for local bootstrap only.
    secret_key: str = "change-me-before-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_days: int = 7
    ws_token_expire_minutes: int = 60

    allowed_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:3000", "http://localhost:5173"]
    )
    cookie_domain: str = ""
    tz: str = "Asia/Ho_Chi_Minh"
    db_path: str = "./data/dinoquest.db"

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def parse_allowed_origins(cls, value: object) -> list[str]:
        if value is None:
            return []
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        if isinstance(value, list):
            return [str(origin).strip() for origin in value if str(origin).strip()]
        raise ValueError("allowed_origins must be a comma-separated string or list")

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
