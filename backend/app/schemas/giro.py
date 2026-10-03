from datetime import datetime

from pydantic import BaseModel


class GiroImportStatusOut(BaseModel):
    dataset: str
    file_name: str
    rows_imported: int
    rows_ignored: int
    imported_at: datetime | None = None


class GiroImportResultOut(BaseModel):
    message: str
    dataset: str
    rows_imported: int
    rows_ignored: int
    imported_at: datetime | None = None


class GiroSummaryOut(BaseModel):
    clients: int
    clients_not_meeting: int
    equipment_count: float
    giro_ok_equipment: float
    giro_nok_equipment: float
    giro_ok_percent: float
    target_percent: float | None = None
    monthly_target: float
    current_sales: float
    gap: float


class GiroQuarterSummaryOut(BaseModel):
    months: list[str]
    target_percent: float | None = None
    real_percent: float | None = None
    missing_target_months: list[str]
    missing_equipment_months: list[str]


class GiroReportItemOut(BaseModel):
    client_code: str
    fantasy_name: str
    document: str
    client_status: str
    frequency: str
    sector: str
    city: str
    mesa: str
    equipment_count: float
    month_sales: dict[str, float]
    last_purchase_month: str | None = None
    monthly_target: float
    gap: float
    giro_status: str


class GiroReportOut(BaseModel):
    equipment_type: str
    months: list[str]
    summary: GiroSummaryOut
    tri: GiroQuarterSummaryOut
    items: list[GiroReportItemOut]
    total_items: int
    page: int
    page_size: int
    sectors: list[str]
    cities: list[str]


class GiroBreakdownOut(BaseModel):
    name: str
    mesa: str | None = None
    visa: GiroSummaryOut
    sopi: GiroSummaryOut


class GiroOverviewOut(BaseModel):
    month: str
    visa: GiroSummaryOut
    sopi: GiroSummaryOut
    visa_tri: GiroQuarterSummaryOut
    sopi_tri: GiroQuarterSummaryOut
    by_sector: list[GiroBreakdownOut]
    by_mesa: list[GiroBreakdownOut]
    by_city: list[GiroBreakdownOut]


class GiroImportStatusListOut(BaseModel):
    imports: list[GiroImportStatusOut]
    sectors: list[str]
    cities: list[str]
    equipment_snapshot_months: list[str]
    available_months: list[str]
    months_without_equipment_snapshot: list[str]
    target_years: list[int]
