from sqlalchemy import Column, Integer, String, Date, Time
from app.database.base import Base


class Routine(Base):
    __tablename__ = "routines"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    routine_date = Column(Date, nullable=False)
    routine_time = Column(Time, nullable=False)
