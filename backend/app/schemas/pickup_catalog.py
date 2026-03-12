from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common import normalize_optional_text, normalize_string_list, normalize_text


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
    item_id: int = Field(ge=1)
    quantity: int = Field(default=1, ge=1, le=999)


class PickupCatalogManualItemIn(BaseModel):
    description: str
    quantity: int = Field(default=1, ge=1, le=999)
    item_type: str = "outro"
    rg: Optional[str] = ""
    volume_key: Optional[str] = ""

    @field_validator("description")
    @classmethod
    def validate_description(cls, value: str) -> str:
        return normalize_text(value, min_length=2, max_length=255)

    @field_validator("item_type")
    @classmethod
    def validate_item_type(cls, value: str) -> str:
        return normalize_text(value, min_length=2, max_length=40, lower=True)

    @field_validator("rg", "volume_key")
    @classmethod
    def validate_codes(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, max_length=120)


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

    @field_validator("lookup_code")
    @classmethod
    def validate_lookup_code(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, max_length=64, lower=False)

    @field_validator("company_name")
    @classmethod
    def validate_company_name(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, max_length=255)

    @field_validator("data_retirada")
    @classmethod
    def validate_withdrawal_date(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, max_length=20)

    @field_validator("hora_retirada")
    @classmethod
    def validate_withdrawal_time(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, max_length=20)

    @field_validator("auto_summary")
    @classmethod
    def validate_auto_summary(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, max_length=4000)

    @field_validator("observacao_extra")
    @classmethod
    def validate_observation(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, max_length=2000)

    @field_validator("selected_inventory")
    @classmethod
    def validate_selected_inventory(cls, value: List[PickupCatalogInventorySelectionIn]) -> List[PickupCatalogInventorySelectionIn]:
        if len(value) > 300:
            raise ValueError("Selecione no máximo 300 itens do inventário.")
        unique_ids: set[int] = set()
        normalized: list[PickupCatalogInventorySelectionIn] = []
        for item in value:
            if item.item_id in unique_ids:
                continue
            unique_ids.add(item.item_id)
            normalized.append(item)
        return normalized

    @field_validator("manual_items")
    @classmethod
    def validate_manual_items(cls, value: List[PickupCatalogManualItemIn]) -> List[PickupCatalogManualItemIn]:
        if len(value) > 300:
            raise ValueError("Informe no máximo 300 itens manuais.")
        return value


class PickupCatalogOrderOut(BaseModel):
    id: int
    order_number: str = ""
    client_code: str = ""
    nome_fantasia: str = ""
    withdrawal_date: str = ""
    status: str = "pendente"
    email_request_status: str = ""
    status_note: str = ""
    status_updated_by: str = ""
    status_updated_at: Optional[datetime] = None
    summary_line: str = ""
    has_refrigerator: bool = False
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class PickupCatalogOrderEmailRefrigeratorOut(BaseModel):
    modelo: str = ""
    rg: str = ""
    etiqueta: str = ""
    nota: str = ""


class PickupCatalogOrderEmailOtherOut(BaseModel):
    modelo: str = ""
    quantidade: int = 0
    nota: str = ""


class PickupCatalogOrderEmailRequestOut(BaseModel):
    order_id: int
    order_number: str = ""
    client_code: str = ""
    nome_fantasia: str = ""
    cnpj_cpf: str = ""
    refrigeradores: List[PickupCatalogOrderEmailRefrigeratorOut] = Field(default_factory=list)
    outros: List[PickupCatalogOrderEmailOtherOut] = Field(default_factory=list)


class PickupCatalogOrderStatusUpdateIn(BaseModel):
    status: Literal["pendente", "concluida", "cancelada"]
    status_note: Optional[str] = ""
    refrigerator_condition: Optional[Literal["boa", "recap", "sucata"]] = None

    @field_validator("status_note")
    @classmethod
    def validate_status_note(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, max_length=500)


class PickupCatalogOrderBulkStatusUpdateIn(BaseModel):
    order_ids: List[int] = Field(default_factory=list)
    status: Literal["pendente", "concluida", "cancelada"]
    status_note: Optional[str] = ""
    refrigerator_condition: Optional[Literal["boa", "recap", "sucata"]] = None

    @field_validator("order_ids")
    @classmethod
    def validate_order_ids(cls, value: List[int]) -> List[int]:
        normalized = sorted({int(item) for item in value if int(item) > 0})
        if not normalized:
            raise ValueError("Informe ao menos uma ordem válida.")
        if len(normalized) > 200:
            raise ValueError("Selecione no máximo 200 ordens por vez.")
        return normalized

    @field_validator("status_note")
    @classmethod
    def validate_status_note(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_text(value, max_length=500)


class PickupCatalogOrderBulkStatusUpdateOut(BaseModel):
    updated_count: int = 0
    orders: List[PickupCatalogOrderOut] = Field(default_factory=list)


class PickupCatalogOrderEmailRequestBulkIn(BaseModel):
    order_ids: List[int] = Field(default_factory=list)

    @field_validator("order_ids")
    @classmethod
    def validate_order_ids(cls, value: List[int]) -> List[int]:
        normalized = sorted({int(item) for item in value if int(item) > 0})
        if not normalized:
            raise ValueError("Informe ao menos uma ordem válida.")
        if len(normalized) > 200:
            raise ValueError("Selecione no máximo 200 ordens por vez.")
        return normalized


class PickupCatalogOrderEmailRequestBulkOut(BaseModel):
    updated_count: int = 0
    orders: List[PickupCatalogOrderOut] = Field(default_factory=list)


class PickupCatalogDailyFollowupOut(BaseModel):
    date_reference: str = ""
    reminder_time: str = "17:30"
    now_brazil: str = ""
    can_prompt: bool = False
    total_pending: int = 0
    orders: List[PickupCatalogOrderOut] = Field(default_factory=list)
