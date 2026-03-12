from datetime import date
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common import normalize_optional_text, normalize_string_list, normalize_text

TASK_PRIORITY_VALUES = {"alta", "media", "baixa"}


class TaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    due_date: Optional[date] = None
    priority: str = "media"
    labels: List[str] = Field(default_factory=list)


class TaskCreate(TaskBase):
    due_date: date
    assignee_id: Optional[int] = Field(default=None, ge=1)

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        return normalize_text(value, min_length=3, max_length=180)

    @field_validator("description")
    @classmethod
    def validate_description(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, max_length=2000)

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, value: str) -> str:
        priority = normalize_text(value, min_length=4, max_length=10, lower=True)
        if priority not in TASK_PRIORITY_VALUES:
            raise ValueError("Prioridade inválida.")
        return priority

    @field_validator("labels")
    @classmethod
    def validate_labels(cls, value: List[str]) -> List[str]:
        return normalize_string_list(value, max_items=20, item_max_length=40, lower=True)


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    completed: Optional[bool] = None
    due_date: Optional[date] = None
    priority: Optional[Literal["alta", "media", "baixa"]] = None
    labels: Optional[List[str]] = None
    assignee_id: Optional[int] = Field(default=None, ge=1)

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        return normalize_text(value, min_length=3, max_length=180)

    @field_validator("description")
    @classmethod
    def validate_description(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, max_length=2000)

    @field_validator("labels")
    @classmethod
    def validate_labels(cls, value: Optional[List[str]]) -> Optional[List[str]]:
        if value is None:
            return None
        return normalize_string_list(value, max_items=20, item_max_length=40, lower=True)


class TaskOut(TaskBase):
    id: int
    completed: bool
    assignee_id: Optional[int] = None
    assignee_name: Optional[str] = None
    assignee_email: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
