from sqlalchemy import Column, Date, DateTime, Integer, String, func

from app.database.base import Base


class Pickup(Base):
    __tablename__ = "pickups"

    id = Column(Integer, primary_key=True, index=True)
    description = Column(String, nullable=False)
    pickup_date = Column(Date, nullable=False)
    material = Column(String, nullable=False)
    quantity = Column(Integer, nullable=False, default=1)
    photo_path = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
