from pydantic import BaseModel
from typing import Optional
from datetime import date, time


class RoutineBase(BaseModel):
    title: str
    description: Optional[str] = None
    routine_date: date
    routine_time: time


class RoutineCreate(RoutineBase):
    pass


class RoutineUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    routine_date: Optional[date] = None
    routine_time: Optional[time] = None


class RoutineOut(RoutineBase):
    id: int

    class Config:
        from_attributes = True
