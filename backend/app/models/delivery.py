from sqlalchemy import Column, Date, DateTime, Integer, String, Time, func

from app.database.base import Base


class Delivery(Base):
    __tablename__ = "deliveries"

    id = Column(Integer, primary_key=True, index=True)
    description = Column(String, nullable=False)
    delivery_date = Column(Date, nullable=False)
    delivery_time = Column(Time, nullable=True)
    pdf_one_path = Column(String, nullable=False)
    pdf_two_path = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

