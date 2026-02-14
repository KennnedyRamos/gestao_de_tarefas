from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class PickupCatalogStats(BaseModel):
    clients_count: int = 0
    inventory_clients: int = 0
    open_items: int = 0


class PickupCatalogStatusOut(BaseModel):
    dataset_ready: bool
    loaded_at: Optional[datetime] = None
    stats: PickupCatalogStats


class PickupCatalogClientData(BaseModel):
    client_code: str = ""
    nome_fantasia: str = ""
    razao_social: str = ""
    cnpj_cpf: str = ""
    setor: str = ""
    telefone: str = ""
    endereco: str = ""
    bairro: str = ""
    cidade: str = ""
    cep: str = ""
    inscricao_estadual: str = ""
    responsavel_cliente: str = ""
    responsavel_retirada: str = ""
    responsavel_conferencia: str = ""


class PickupCatalogInventoryItemOut(BaseModel):
    id: int
    description: str
    item_type: str
    type_label: str
    open_quantity: int
    rg: str = ""
    comodato_number: str = ""
    data_emissao: str = ""
    volume_key: str = ""


class PickupCatalogClientOut(BaseModel):
    matched_code: str = ""
    found_anything: bool = False
    client: PickupCatalogClientData
    items: List[PickupCatalogInventoryItemOut] = Field(default_factory=list)


class PickupCatalogInventorySelectionIn(BaseModel):
    item_id: int
    quantity: int = Field(default=1, ge=1)


class PickupCatalogManualItemIn(BaseModel):
    description: str
    quantity: int = Field(default=1, ge=1)
    item_type: str = "outro"
    rg: Optional[str] = ""
    volume_key: Optional[str] = ""


class PickupCatalogPdfRequest(BaseModel):
    lookup_code: Optional[str] = ""
    company_name: Optional[str] = ""
    data_retirada: Optional[str] = ""
    hora_retirada: Optional[str] = ""
    auto_summary: Optional[str] = ""
    observacao_extra: Optional[str] = ""
    client: PickupCatalogClientData
    selected_inventory: List[PickupCatalogInventorySelectionIn] = Field(default_factory=list)
    manual_items: List[PickupCatalogManualItemIn] = Field(default_factory=list)


class PickupCatalogOrderOut(BaseModel):
    id: int
    order_number: str = ""
    client_code: str = ""
    nome_fantasia: str = ""
    summary_line: str = ""
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
