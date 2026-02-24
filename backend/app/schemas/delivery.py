from datetime import date, datetime, time
from typing import Optional

from pydantic import BaseModel, ConfigDict


class DeliveryOut(BaseModel):
    id: int
    description: str
    delivery_date: date
    delivery_time: Optional[time] = None
    pdf_one_path: str
    pdf_two_path: str
    pdf_one_url: str
    pdf_two_url: str
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class DeliveryClientLookupOut(BaseModel):
    client_code: str = ""
    nome_fantasia: str = ""
    found: bool = False
