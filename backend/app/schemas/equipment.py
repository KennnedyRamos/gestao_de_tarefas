from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class EquipmentBase(BaseModel):
    category: str = Field(default="refrigerador")
    model_name: str = Field(min_length=1, max_length=120)
    brand: str = Field(min_length=1, max_length=120)
    quantity: int = Field(default=1, ge=1)
    voltage: str = Field(default="", max_length=40)
    rg_code: Optional[str] = Field(default=None, max_length=120)
    tag_code: Optional[str] = Field(default=None, max_length=120)
    status: str = Field(default="novo")
    client_name: Optional[str] = Field(default=None, max_length=180)
    notes: Optional[str] = None


class EquipmentCreate(EquipmentBase):
    pass


class EquipmentUpdate(BaseModel):
    category: Optional[str] = None
    model_name: Optional[str] = None
    brand: Optional[str] = None
    quantity: Optional[int] = Field(default=None, ge=1)
    voltage: Optional[str] = None
    rg_code: Optional[str] = None
    tag_code: Optional[str] = None
    status: Optional[str] = None
    client_name: Optional[str] = None
    notes: Optional[str] = None


class EquipmentOut(EquipmentBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class EquipmentSummaryItem(BaseModel):
    category: str
    label: str
    total: int
    novo: int
    disponivel: int
    alocado: int


class EquipmentClientSummaryItem(BaseModel):
    client_name: str
    total: int


class EquipmentSummaryOut(BaseModel):
    total: int
    novo: int
    disponivel: int
    alocado: int
    categories: list[EquipmentSummaryItem]
    clients: list[EquipmentClientSummaryItem]


class EquipmentRefrigeratorDashboardOut(BaseModel):
    total_cadastrados: int
    novos_cadastrados: int
    disponiveis_cadastrados: int
    alocados_cadastrados: int
    alocados_020220_linhas: int
    alocados_020220_unidades: int
    clientes_alocados_020220: int


class EquipmentNewRefrigeratorItemOut(BaseModel):
    id: int
    model_name: str
    brand: str
    voltage: str
    rg_code: str
    tag_code: str
    status: str
    client_name: Optional[str] = None
    created_at: Optional[datetime] = None


class EquipmentAllocatedRefrigeratorItemOut(BaseModel):
    inventory_item_id: int
    model_name: str
    rg_code: str
    client_code: str
    nome_fantasia: str
    quantity: int
    comodato_number: str
    invoice_issue_date: str


class EquipmentRefrigeratorsOverviewOut(BaseModel):
    dashboard: EquipmentRefrigeratorDashboardOut
    novos: list[EquipmentNewRefrigeratorItemOut]
    alocados_020220: list[EquipmentAllocatedRefrigeratorItemOut]


class EquipmentPageMetaOut(BaseModel):
    limit: int
    offset: int
    total: int
    has_next: bool
    has_previous: bool


class EquipmentNewRefrigeratorListOut(BaseModel):
    items: list[EquipmentNewRefrigeratorItemOut]
    page: EquipmentPageMetaOut


class EquipmentInventoryMaterialItemOut(BaseModel):
    inventory_item_id: int
    item_type: str
    model_name: str
    rg_code: str
    client_code: str
    nome_fantasia: str
    quantity: int
    comodato_number: str
    invoice_issue_date: str
    invoice_month: str


class EquipmentInventoryMaterialListOut(BaseModel):
    items: list[EquipmentInventoryMaterialItemOut]
    page: EquipmentPageMetaOut


class EquipmentAllocationLookupItemOut(BaseModel):
    inventory_item_id: int
    rg_code: str
    tag_code: str
    client_code: str
    nome_fantasia: str
    setor: str
    model_name: str
    invoice_issue_date: str


class EquipmentAllocationLookupOut(BaseModel):
    rg_code: str
    tag_code: str
    total: int
    items: list[EquipmentAllocationLookupItemOut]
