from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common import normalize_text


class PickupBase(BaseModel):
    description: str
    pickup_date: date
    material: str
    quantity: int = Field(default=1, ge=1)


class PickupCreate(PickupBase):
    @field_validator("description")
    @classmethod
    def validate_description(cls, value: str) -> str:
        return normalize_text(value, min_length=3, max_length=255)

    @field_validator("material")
    @classmethod
    def validate_material(cls, value: str) -> str:
        return normalize_text(value, min_length=2, max_length=255)


class PickupOut(PickupBase):
    id: int
    photo_url: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
