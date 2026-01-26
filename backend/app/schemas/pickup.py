from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class PickupBase(BaseModel):
    description: str
    pickup_date: date
    material: str
    quantity: int = Field(default=1, ge=1)


class PickupCreate(PickupBase):
    pass


class PickupOut(PickupBase):
    id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

