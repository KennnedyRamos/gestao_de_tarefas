from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date

class TaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    due_date: Optional[date] = None
    priority: str = "media"
    labels: List[str] = Field(default_factory=list)

class TaskCreate(TaskBase):
    due_date: date
    assignee_id: Optional[int] = None

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    completed: Optional[bool] = None
    due_date: Optional[date] = None
    priority: Optional[str] = None
    labels: Optional[List[str]] = None
    assignee_id: Optional[int] = None

class TaskOut(TaskBase):
    id: int
    completed: bool
    assignee_id: Optional[int] = None
    assignee_name: Optional[str] = None
    assignee_email: Optional[str] = None

    class Config:
        from_attributes = True
