from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class PickupBase(BaseModel):
    description: str
    pickup_date: date
    material: str
    quantity: int = Field(default=1, ge=1)


class PickupCreate(PickupBase):
    pass


class PickupOut(PickupBase):
    id: int
    photo_path: Optional[str] = None
    photo_url: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
