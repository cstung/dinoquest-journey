from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, SerializationInfo, SerializerFunctionWrapHandler, field_serializer
from pydantic.alias_generators import to_camel

from backend.datetime_utils import ensure_utc


class APIModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )

    @field_serializer("*", mode="wrap")
    def _utc_datetimes(self, value: Any, handler: SerializerFunctionWrapHandler, info: SerializationInfo) -> Any:
        # SQLite hands back naive UTC timestamps; without an explicit "Z" browsers read them as
        # local time (7h off in Vietnam).
        if isinstance(value, datetime):
            value = ensure_utc(value)
        return handler(value)
