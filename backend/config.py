from __future__ import annotations

from functools import lru_cache
from typing import Any, List, Literal, Tuple, Type

from pydantic import field_validator, model_validator
from pydantic_settings import (
    BaseSettings,
    DotEnvSettingsSource,
    EnvSettingsSource,
    PydanticBaseSettingsSource,
    SettingsConfigDict,
)


class RawAllowedOriginsEnvSource(EnvSettingsSource):
    def prepare_field_value(self, field_name: str, field: Any, value: Any, value_is_complex: bool) -> Any:
        if field_name == "allowed_origins" and isinstance(value, str):
            return value
        return super().prepare_field_value(field_name, field, value, value_is_complex)


class RawAllowedOriginsDotEnvSource(DotEnvSettingsSource):
    def prepare_field_value(self, field_name: str, field: Any, value: Any, value_is_complex: bool) -> Any:
        if field_name == "allowed_origins" and isinstance(value, str):
            return value
        return super().prepare_field_value(field_name, field, value, value_is_complex)


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

    allowed_origins: List[str] = ["http://localhost:5173"]
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
    def parse_allowed_origins(cls, v: object) -> object:
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return ["http://localhost:5173"]
            if v.startswith("["):
                import json

                return json.loads(v)
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: Type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> Tuple[PydanticBaseSettingsSource, ...]:
        return (
            init_settings,
            RawAllowedOriginsEnvSource(settings_cls),
            RawAllowedOriginsDotEnvSource(settings_cls),
            file_secret_settings,
        )

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
