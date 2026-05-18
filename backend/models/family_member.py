from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, PrimaryKeyConstraint, String, func
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base


class FamilyMember(Base):
    __tablename__ = "family_members"
    __table_args__ = (PrimaryKeyConstraint("family_id", "user_id", name="pk_family_members"),)

    family_id: Mapped[int] = mapped_column(ForeignKey("families.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # parent | child
    nickname: Mapped[str | None] = mapped_column(String(50))
    avatar_color: Mapped[str | None] = mapped_column(String(7))
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

