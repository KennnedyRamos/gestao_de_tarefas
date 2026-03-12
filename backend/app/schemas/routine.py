from datetime import date, time
from typing import Optional

from pydantic import BaseModel, ConfigDict, field_validator

from app.schemas.common import normalize_optional_text, normalize_text


class RoutineBase(BaseModel):
    title: str
    description: Optional[str] = None
    routine_date: date
    routine_time: time


class RoutineCreate(RoutineBase):
    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        return normalize_text(value, min_length=3, max_length=180)

    @field_validator("description")
    @classmethod
    def validate_description(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, max_length=1000)


class RoutineUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    routine_date: Optional[date] = None
    routine_time: Optional[time] = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        return normalize_text(value, min_length=3, max_length=180)

    @field_validator("description")
    @classmethod
    def validate_description(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, max_length=1000)


class RoutineOut(RoutineBase):
    id: int

    model_config = ConfigDict(from_attributes=True)
