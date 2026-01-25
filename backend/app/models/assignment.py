from sqlalchemy import Column, Integer, ForeignKey, UniqueConstraint
from app.database.base import Base

class Assignment(Base):
    __tablename__ = "assignments"
    __table_args__ = (
        UniqueConstraint("task_id", name="uq_assignment_task"),
    )

    id = Column(Integer, primary_key=True)
    task_id = Column(Integer, ForeignKey("tasks.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
