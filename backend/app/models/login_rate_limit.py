from sqlalchemy import Column, Index, Integer, String

from app.database.base import Base


class LoginRateLimit(Base):
    __tablename__ = "login_rate_limits"
    __table_args__ = (Index("ix_login_rate_limits_window_started_at", "window_started_at"),)

    key = Column(String(64), primary_key=True)
    window_started_at = Column(Integer, nullable=False)
    attempts = Column(Integer, nullable=False)
