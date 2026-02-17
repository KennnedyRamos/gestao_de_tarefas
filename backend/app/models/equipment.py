from sqlalchemy import Column, DateTime, Index, Integer, String, Text, UniqueConstraint, func

from app.database.base import Base


class Equipment(Base):
    __tablename__ = "equipments"
    __table_args__ = (
        UniqueConstraint("rg_code", name="uq_equipments_rg_code"),
        UniqueConstraint("tag_code", name="uq_equipments_tag_code"),
        Index("ix_equipments_category_status", "category", "status"),
    )

    id = Column(Integer, primary_key=True, index=True)
    category = Column(String(40), nullable=False, default="refrigerador", index=True)
    model_name = Column(String(120), nullable=False)
    voltage = Column(String(40), nullable=False, default="")
    rg_code = Column(String(120), nullable=False, index=True)
    tag_code = Column(String(120), nullable=False, index=True)
    status = Column(String(20), nullable=False, default="novo", index=True)
    client_name = Column(String(180), nullable=True, index=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
