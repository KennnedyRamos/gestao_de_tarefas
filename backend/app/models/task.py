from sqlalchemy import Column, Integer, String, Boolean, Date
from app.database.base import Base

class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    completed = Column(Boolean, default=False)
    due_date = Column(Date, nullable=True)
    priority = Column(String, nullable=False, default="media")
    labels = Column(String, nullable=True)
