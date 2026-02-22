import csv
import io
import re
import unicodedata
from collections import defaultdict
from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.auth import require_any_permission, require_permission
from app.database.deps import get_db
from app.models.equipment import Equipment
from app.models.pickup_catalog import (
    PickupCatalogClient,
    PickupCatalogInventoryItem,
    PickupCatalogUploadBatch,
)
from app.models.user import User
from app.schemas.equipment import (
    EquipmentAllocatedRefrigeratorItemOut,
    EquipmentAllocationLookupItemOut,
    EquipmentAllocationLookupOut,
    EquipmentAllocationSyncOut,
    EquipmentBulkImportResultOut,
    EquipmentCreate,
    EquipmentInventoryMaterialItemOut,
    EquipmentInventoryMaterialListOut,
    EquipmentNewRefrigeratorItemOut,
    EquipmentNewRefrigeratorListOut,
    EquipmentNonAllocatedDashboardOut,
    EquipmentNonAllocatedListOut,
    EquipmentOut,
    EquipmentPageMetaOut,
    EquipmentRefrigeratorDashboardOut,
    EquipmentRefrigeratorsOverviewOut,
    EquipmentSummaryOut,
    EquipmentUpdate,
)
from app.services.pickup_catalog_csv import classify_item_type

router = APIRouter(prefix="/equipments", tags=["Equipments"])
get_equipments_viewer = require_any_permission("equipments.view", "equipments.manage")
get_equipments_manager = require_permission("equipments.manage")

CATEGORY_LABELS = {
    "refrigerador": "Refrigeradores",
    "caixa_termica": "Caixa térmica",
    "jogo_mesa": "Jogos de mesa",
    "outro": "Outros",
}
CATEGORY_ALIASES = {
    "refrigerador": "refrigerador",
    "refrigeradores": "refrigerador",
    "geladeira": "refrigerador",
    "geladeiras": "refrigerador",
    "frigobar": "refrigerador",
    "frigorifico": "refrigerador",
    "caixa termica": "caixa_termica",
    "caixas termicas": "caixa_termica",
    "caixa termicas": "caixa_termica",
    "caixa_termica": "caixa_termica",
    "jogo de mesa": "jogo_mesa",
    "jogos de mesa": "jogo_mesa",
    "jogo mesa": "jogo_mesa",
    "jogos mesa": "jogo_mesa",
    "jogo_mesa": "jogo_mesa",
    "outro": "outro",
    "outros": "outro",
}
VALID_STATUSES = {"novo", "disponivel", "recap", "sucata", "alocado"}
VOLTAGE_ALIASES = {
    "": "",
    "110": "110v",
    "110v": "110v",
    "127": "127v",
    "127v": "127v",
    "220": "220v",
    "220v": "220v",
    "bivolt": "bivolt",
    "bi volt": "bivolt",
    "nao informado": "nao_informado",
    "nao_informada": "nao_informado",
    "nao se aplica": "nao_informado",
    "n/a": "nao_informado",
}
SORT_OPTIONS = {"newest", "oldest"}
MATERIAL_GROUP_OPTIONS = {"todos", "refrigerador", "outros"}
MATERIAL_TYPE_ALIASES = {
    "refrigerador": "refrigerador",
    "refrigeradores": "refrigerador",
    "geladeira": "refrigerador",
    "geladeiras": "refrigerador",
    "frigobar": "refrigerador",
    "frigorifico": "refrigerador",
    "cervejeira": "refrigerador",
    "caixa termica": "caixa_termica",
    "caixa_termica": "caixa_termica",
    "caixa termicas": "caixa_termica",
    "caixas termicas": "caixa_termica",
    "cx termica": "caixa_termica",
    "jogo mesa": "jogo_mesa",
    "jogos mesa": "jogo_mesa",
    "jogo de mesa": "jogo_mesa",
    "jogos de mesa": "jogo_mesa",
    "jogo_mesa": "jogo_mesa",
    "garrafeira": "garrafeira",
    "vasilhame caixa": "vasilhame_caixa",
    "vasilhame_caixa": "vasilhame_caixa",
    "vasilhame garrafa": "vasilhame_garrafa",
    "vasilhame_garrafa": "vasilhame_garrafa",
    "chopeira": "outro",
    "choppeira": "outro",
    "balde": "outro",
    "baldes": "outro",
    "testeira": "outro",
    "compressor": "outro",
    "totem": "outro",
    "cooler carrinho": "outro",
    "coller carrinho": "outro",
    "cooler_carrinho": "outro",
    "inflavel": "outro",
    "empilhadeira": "outro",
    "calca": "outro",
    "cartucho": "outro",
    "ombrelone": "outro",
    "ombrellone": "outro",
    "camera fria": "outro",
    "camera_fria": "outro",
    "camara fria": "outro",
    "dispensador": "outro",
    "outro": "outro",
    "outros": "outro",
}
INVOICE_DATE_FORMATS = ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%y", "%Y/%m/%d")
IMPORT_CSV_HEADERS = {
    "tipo": {"tipo", "type"},
    "modelo": {"modelo", "model", "material", "descricao", "descrição"},
    "marca": {"marca", "brand"},
    "voltagem": {"voltagem", "voltage"},
    "rg": {"rg", "r.g", "r g"},
    "etiqueta": {"etiqueta", "tag", "tag_code"},
}


def normalize_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


def digits_only(value: str) -> str:
    return re.sub(r"\D+", "", str(value or ""))


def normalize_lookup_text(value: str) -> str:
    normalized = normalize_spaces(value).lower()
    without_accents = unicodedata.normalize("NFD", normalized)
    without_accents = "".join(ch for ch in without_accents if unicodedata.category(ch) != "Mn")
    without_accents = without_accents.replace("-", " ").replace("_", " ")
    return re.sub(r"\s+", " ", without_accents).strip()


def _decode_import_csv(raw_bytes: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            return raw_bytes.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise HTTPException(status_code=422, detail="Nao foi possivel ler o CSV enviado.")


def _sniff_csv_delimiter(text: str) -> str:
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=";,|\t")
        return dialect.delimiter
    except csv.Error:
        return ";"


def _resolve_import_header_map(headers: list[str]) -> dict[str, str]:
    normalized_headers = {
        normalize_lookup_text(header): str(header or "").strip()
        for header in headers
        if normalize_spaces(header)
    }
    resolved: dict[str, str] = {}
    missing: list[str] = []
    for field_name, aliases in IMPORT_CSV_HEADERS.items():
        found = ""
        for alias in aliases:
            normalized_alias = normalize_lookup_text(alias)
            if normalized_alias in normalized_headers:
                found = normalized_headers[normalized_alias]
                break
        if not found:
            missing.append(field_name.upper())
            continue
        resolved[field_name] = found
    if missing:
        raise HTTPException(
            status_code=422,
            detail=(
                "Cabecalho CSV invalido. "
                f"Colunas obrigatorias nao encontradas: {', '.join(missing)}."
            ),
        )
    return resolved


def normalize_category(value: str) -> str:
    lookup = normalize_lookup_text(value)
    if lookup in CATEGORY_ALIASES:
        return CATEGORY_ALIASES[lookup]
    raise HTTPException(status_code=422, detail="Categoria inválida.")


def normalize_status(value: str) -> str:
    normalized = normalize_lookup_text(value)
    if normalized in VALID_STATUSES:
        return normalized
    raise HTTPException(status_code=422, detail="Status inválido.")


def normalize_voltage(value: Optional[str]) -> str:
    lookup = normalize_lookup_text(value or "")
    if lookup in VOLTAGE_ALIASES:
        return VOLTAGE_ALIASES[lookup]
    raise HTTPException(status_code=422, detail="Voltagem invalida.")


def normalize_code(value: str) -> str:
    text = normalize_spaces(value)
    if not text:
        raise HTTPException(status_code=422, detail="RG e etiqueta são obrigatórios.")
    return text.upper()


def normalize_optional_text(value: Optional[str]) -> Optional[str]:
    text = normalize_spaces(value or "")
    return text or None


def normalize_optional_code(value: Optional[str]) -> Optional[str]:
    text = normalize_spaces(value or "")
    if not text:
        return None
    return text.upper()


def normalize_quantity(value: Optional[int], *, required: bool = False) -> int:
    if value is None:
        if required:
            raise HTTPException(status_code=422, detail="Quantidade e obrigatoria para esta categoria.")
        return 1
    try:
        resolved = int(value)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="Quantidade invalida.") from exc
    if resolved < 1:
        raise HTTPException(status_code=422, detail="Quantidade deve ser maior que zero.")
    return resolved


def build_equipment_out(item: Equipment) -> EquipmentOut:
    return EquipmentOut(
        id=item.id,
        category=item.category,
        model_name=item.model_name,
        brand=item.brand or "",
        quantity=int(item.quantity or 1),
        voltage=item.voltage or "",
        rg_code=item.rg_code,
        tag_code=item.tag_code,
        status=item.status,
        client_name=item.client_name,
        notes=item.notes,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


def ensure_unique_codes(
    db: Session,
    rg_code: Optional[str],
    tag_code: Optional[str],
    current_id: Optional[int] = None,
) -> None:
    if rg_code:
        rg_query = db.query(Equipment).filter(Equipment.rg_code == rg_code)
        if current_id is not None:
            rg_query = rg_query.filter(Equipment.id != current_id)
        if rg_query.first():
            raise HTTPException(status_code=409, detail="RG ja cadastrado.")

    if tag_code:
        tag_query = db.query(Equipment).filter(Equipment.tag_code == tag_code)
        if current_id is not None:
            tag_query = tag_query.filter(Equipment.id != current_id)
        if tag_query.first():
            raise HTTPException(status_code=409, detail="Etiqueta ja cadastrada.")

def _inventory_uses_batches(db: Session) -> bool:
    return (
        db.query(PickupCatalogInventoryItem.id)
        .filter(PickupCatalogInventoryItem.batch_id.isnot(None))
        .first()
        is not None
    )


def _latest_inventory_batch_id(db: Session) -> Optional[int]:
    row = (
        db.query(PickupCatalogUploadBatch.id)
        .order_by(PickupCatalogUploadBatch.id.desc())
        .first()
    )
    return int(row[0]) if row else None


def _normalize_sort(value: str) -> Literal["newest", "oldest"]:
    normalized = normalize_lookup_text(value)
    if normalized in SORT_OPTIONS:
        return "oldest" if normalized == "oldest" else "newest"
    raise HTTPException(status_code=422, detail="Ordenacao invalida.")


def _normalize_month(value: str) -> str:
    text = normalize_spaces(value)
    if not re.match(r"^\d{4}-\d{2}$", text):
        raise HTTPException(status_code=422, detail="Mes invalido. Use formato YYYY-MM.")
    year = int(text[:4])
    month = int(text[5:7])
    if year < 1900 or year > 2300 or month < 1 or month > 12:
        raise HTTPException(status_code=422, detail="Mes invalido. Use formato YYYY-MM.")
    return text


def _normalize_year(value: str) -> str:
    text = normalize_spaces(value)
    if not re.match(r"^\d{4}$", text):
        raise HTTPException(status_code=422, detail="Ano invalido. Use formato YYYY.")
    year = int(text)
    if year < 1900 or year > 2300:
        raise HTTPException(status_code=422, detail="Ano invalido. Use formato YYYY.")
    return text


def _material_type_bucket(value: str) -> str:
    normalized = normalize_lookup_text(value)
    mapped = MATERIAL_TYPE_ALIASES.get(normalized, "")
    if mapped in {"vasilhame_caixa", "vasilhame_garrafa", "garrafeira"}:
        return "garrafeira"
    if mapped in {"refrigerador", "jogo_mesa", "caixa_termica"}:
        return mapped
    return "outro"


def _normalize_material_type(value: str) -> str:
    normalized = normalize_lookup_text(value)
    if normalized in MATERIAL_TYPE_ALIASES:
        return _material_type_bucket(MATERIAL_TYPE_ALIASES[normalized])
    raise HTTPException(status_code=422, detail="Tipo de material invalido.")


def _parse_inventory_issue_date(raw_date: Optional[str], fallback: Optional[datetime]) -> datetime:
    text = normalize_spaces(raw_date or "")
    if text:
        for fmt in INVOICE_DATE_FORMATS:
            try:
                return datetime.strptime(text, fmt)
            except ValueError:
                continue
    return fallback or datetime(1900, 1, 1)


def _apply_inventory_base_filter(query, db: Session):
    filtered = query.filter(PickupCatalogInventoryItem.open_quantity > 0)
    if not _inventory_uses_batches(db):
        return filtered
    latest_batch_id = _latest_inventory_batch_id(db)
    if latest_batch_id is None:
        return filtered.filter(PickupCatalogInventoryItem.id == -1)
    return filtered.filter(PickupCatalogInventoryItem.batch_id == latest_batch_id)


def _build_code_lookup_tokens(value: Optional[str]) -> set[str]:
    normalized = normalize_spaces(value or "")
    if not normalized:
        return set()
    upper = normalized.upper()
    compact = re.sub(r"[^A-Z0-9]+", "", upper)
    digits = digits_only(upper)
    tokens = {upper}
    if compact:
        tokens.add(compact)
    if digits:
        tokens.add(digits)
    return {token for token in tokens if token}


def _build_equipment_lookup_tokens(rg_code: Optional[str], tag_code: Optional[str]) -> set[str]:
    tokens: set[str] = set()
    tokens.update(_build_code_lookup_tokens(rg_code))
    tokens.update(_build_code_lookup_tokens(tag_code))
    return tokens


def _refrigerator_allocated_tokens_from_020220(db: Session) -> set[str]:
    inventory_rows = _apply_inventory_base_filter(
        db.query(
            PickupCatalogInventoryItem.item_type.label("item_type"),
            PickupCatalogInventoryItem.description.label("description"),
            PickupCatalogInventoryItem.rg.label("rg_code"),
        ),
        db=db,
    ).all()

    allocated_tokens: set[str] = set()
    for row in inventory_rows:
        item_type_value = normalize_spaces(row.item_type)
        mapped_type = _material_type_bucket(item_type_value)
        if mapped_type != "refrigerador":
            inferred = _material_type_bucket(classify_item_type(normalize_spaces(row.description)))
            if inferred != "refrigerador":
                continue
        allocated_tokens.update(_build_code_lookup_tokens(row.rg_code))

    return allocated_tokens


def _is_refrigerator_allocated_in_020220(
    db: Session,
    rg_code: Optional[str],
    tag_code: Optional[str],
    *,
    allocated_tokens: Optional[set[str]] = None,
) -> bool:
    equipment_tokens = _build_equipment_lookup_tokens(rg_code, tag_code)
    if not equipment_tokens:
        return False

    tokens = allocated_tokens if allocated_tokens is not None else _refrigerator_allocated_tokens_from_020220(db)
    return bool(tokens.intersection(equipment_tokens))


def _build_page_meta(limit: int, offset: int, total: int) -> EquipmentPageMetaOut:
    return EquipmentPageMetaOut(
        limit=limit,
        offset=offset,
        total=total,
        has_next=(offset + limit) < total,
        has_previous=offset > 0,
    )


def _matches_inventory_search(search_text: str, row: dict[str, object]) -> bool:
    normalized_search = normalize_lookup_text(search_text)
    search_digits = digits_only(search_text)

    if not normalized_search and not search_digits:
        return True

    searchable_values = [
        normalize_spaces(row.get("item_type") or ""),
        normalize_spaces(row.get("model_name") or ""),
        normalize_spaces(row.get("rg_code") or ""),
        normalize_spaces(row.get("client_code") or ""),
        normalize_spaces(row.get("nome_fantasia") or ""),
        normalize_spaces(row.get("comodato_number") or ""),
    ]
    normalized_haystack = " ".join(
        normalize_lookup_text(value)
        for value in searchable_values
        if value
    )
    if normalized_search and normalized_search in normalized_haystack:
        return True

    if not search_digits:
        return False

    numeric_candidates = [
        digits_only(normalize_spaces(row.get("client_code") or "")),
        digits_only(normalize_spaces(row.get("rg_code") or "")),
        digits_only(normalize_spaces(row.get("model_name") or "")),
        digits_only(normalize_spaces(row.get("comodato_number") or "")),
    ]
    return any(search_digits in candidate for candidate in numeric_candidates if candidate)


@router.get("/", response_model=list[EquipmentOut])
def list_equipments(
    category: Optional[str] = Query(default=None),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    client_name: Optional[str] = Query(default=None),
    q: Optional[str] = Query(default=None),
    limit: int = Query(default=120, ge=1, le=400),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_equipments_viewer),
):
    query = db.query(Equipment)

    if category:
        query = query.filter(Equipment.category == normalize_category(category))
    if status_filter:
        query = query.filter(Equipment.status == normalize_status(status_filter))
    if client_name:
        query = query.filter(Equipment.client_name.ilike(f"%{normalize_spaces(client_name)}%"))
    if q:
        search = f"%{normalize_spaces(q)}%"
        query = query.filter(
            or_(
                Equipment.model_name.ilike(search),
                Equipment.brand.ilike(search),
                Equipment.voltage.ilike(search),
                Equipment.rg_code.ilike(search),
                Equipment.tag_code.ilike(search),
                Equipment.client_name.ilike(search),
                Equipment.notes.ilike(search),
            )
        )

    rows = (
        query
        .order_by(Equipment.created_at.desc(), Equipment.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [build_equipment_out(row) for row in rows]


@router.get("/summary", response_model=EquipmentSummaryOut)
def equipment_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_equipments_viewer),
):
    rows = db.query(Equipment.category, Equipment.status, Equipment.client_name).all()

    totals = {"total": 0, "novo": 0, "disponivel": 0, "recap": 0, "sucata": 0, "alocado": 0}
    by_category = {
        category: {"total": 0, "novo": 0, "disponivel": 0, "recap": 0, "sucata": 0, "alocado": 0}
        for category in CATEGORY_LABELS
    }
    client_counts: dict[str, int] = defaultdict(int)

    for category, status_value, client in rows:
        resolved_category = category if category in CATEGORY_LABELS else "outro"
        resolved_status = status_value if status_value in VALID_STATUSES else "novo"
        totals["total"] += 1
        totals[resolved_status] += 1
        by_category[resolved_category]["total"] += 1
        by_category[resolved_category][resolved_status] += 1
        if resolved_status == "alocado":
            normalized_client = normalize_optional_text(client)
            if normalized_client:
                client_counts[normalized_client] += 1

    categories_payload = [
        {
            "category": category,
            "label": CATEGORY_LABELS[category],
            "total": counts["total"],
            "novo": counts["novo"],
            "disponivel": counts["disponivel"],
            "recap": counts["recap"],
            "sucata": counts["sucata"],
            "alocado": counts["alocado"],
        }
        for category, counts in by_category.items()
    ]
    clients_payload = [
        {"client_name": client, "total": total}
        for client, total in sorted(client_counts.items(), key=lambda item: (-item[1], item[0].lower()))
    ]

    return EquipmentSummaryOut(
        total=totals["total"],
        novo=totals["novo"],
        disponivel=totals["disponivel"],
        recap=totals["recap"],
        sucata=totals["sucata"],
        alocado=totals["alocado"],
        categories=categories_payload,
        clients=clients_payload,
    )


@router.get("/refrigerators/overview", response_model=EquipmentRefrigeratorsOverviewOut)
def refrigerators_overview(
    novos_limit: int = Query(default=240, ge=1, le=800),
    alocados_limit: int = Query(default=240, ge=1, le=800),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_equipments_viewer),
):
    status_counts_rows = (
        db.query(Equipment.status, func.count(Equipment.id))
        .filter(Equipment.category == "refrigerador")
        .group_by(Equipment.status)
        .all()
    )
    status_counts = {"novo": 0, "disponivel": 0, "recap": 0, "sucata": 0, "alocado": 0}
    total_cadastrados = 0
    for status_value, qty in status_counts_rows:
        normalized_status = normalize_lookup_text(status_value)
        if normalized_status not in status_counts:
            continue
        resolved_qty = int(qty or 0)
        status_counts[normalized_status] += resolved_qty
        total_cadastrados += resolved_qty

    novos_rows = (
        db.query(Equipment)
        .filter(
            Equipment.category == "refrigerador",
            Equipment.status == "novo",
        )
        .order_by(Equipment.created_at.desc(), Equipment.id.desc())
        .limit(novos_limit)
        .all()
    )

    use_batches = _inventory_uses_batches(db)
    latest_batch_id = _latest_inventory_batch_id(db) if use_batches else None

    def apply_allocados_filter(query):
        filtered = query.filter(
            PickupCatalogInventoryItem.item_type == "refrigerador",
            PickupCatalogInventoryItem.open_quantity > 0,
        )
        if not use_batches:
            return filtered
        if latest_batch_id is None:
            return filtered.filter(PickupCatalogInventoryItem.id == -1)
        return filtered.filter(PickupCatalogInventoryItem.batch_id == latest_batch_id)

    alocados_linhas = int(
        apply_allocados_filter(db.query(func.count(PickupCatalogInventoryItem.id))).scalar() or 0
    )
    alocados_unidades = int(
        apply_allocados_filter(
            db.query(func.coalesce(func.sum(PickupCatalogInventoryItem.open_quantity), 0))
        ).scalar()
        or 0
    )
    clientes_alocados = int(
        apply_allocados_filter(
            db.query(func.count(func.distinct(PickupCatalogInventoryItem.client_id)))
        ).scalar()
        or 0
    )

    alocados_rows = (
        apply_allocados_filter(
            db.query(
                PickupCatalogInventoryItem.id.label("inventory_item_id"),
                PickupCatalogInventoryItem.description.label("model_name"),
                PickupCatalogInventoryItem.rg.label("rg_code"),
                PickupCatalogInventoryItem.open_quantity.label("quantity"),
                PickupCatalogInventoryItem.comodato_number.label("comodato_number"),
                PickupCatalogInventoryItem.invoice_issue_date.label("invoice_issue_date"),
                PickupCatalogClient.client_code.label("client_code"),
                PickupCatalogClient.nome_fantasia.label("nome_fantasia"),
            )
            .join(
                PickupCatalogClient,
                PickupCatalogClient.id == PickupCatalogInventoryItem.client_id,
            )
        )
        .order_by(
            PickupCatalogClient.nome_fantasia.asc(),
            PickupCatalogInventoryItem.description.asc(),
            PickupCatalogInventoryItem.id.desc(),
        )
        .limit(alocados_limit)
        .all()
    )

    novos_payload = [
        EquipmentNewRefrigeratorItemOut(
            id=int(item.id),
            model_name=normalize_spaces(item.model_name),
            brand=normalize_spaces(item.brand or ""),
            voltage=normalize_spaces(item.voltage or "") or "nao_informado",
            rg_code=normalize_spaces(item.rg_code),
            tag_code=normalize_spaces(item.tag_code),
            status=normalize_spaces(item.status),
            client_name=normalize_optional_text(item.client_name),
            created_at=item.created_at,
        )
        for item in novos_rows
    ]

    alocados_payload = [
        EquipmentAllocatedRefrigeratorItemOut(
            inventory_item_id=int(row.inventory_item_id),
            model_name=normalize_spaces(row.model_name),
            rg_code=normalize_spaces(row.rg_code),
            client_code=normalize_spaces(row.client_code),
            nome_fantasia=normalize_spaces(row.nome_fantasia),
            quantity=int(row.quantity or 0),
            comodato_number=normalize_spaces(row.comodato_number),
            invoice_issue_date=normalize_spaces(row.invoice_issue_date),
        )
        for row in alocados_rows
    ]

    return EquipmentRefrigeratorsOverviewOut(
        dashboard=EquipmentRefrigeratorDashboardOut(
            total_cadastrados=total_cadastrados,
            novos_cadastrados=status_counts["novo"],
            disponiveis_cadastrados=status_counts["disponivel"],
            recap_cadastrados=status_counts["recap"],
            sucata_cadastrados=status_counts["sucata"],
            alocados_cadastrados=status_counts["alocado"],
            alocados_020220_linhas=alocados_linhas,
            alocados_020220_unidades=alocados_unidades,
            clientes_alocados_020220=clientes_alocados,
        ),
        novos=novos_payload,
        alocados_020220=alocados_payload,
    )


@router.get("/refrigerators/new", response_model=EquipmentNewRefrigeratorListOut)
def list_new_refrigerators(
    limit: int = Query(default=50, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    q: Optional[str] = Query(default=None),
    sort: str = Query(default="newest"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_equipments_viewer),
):
    normalized_sort = _normalize_sort(sort)
    search = normalize_spaces(q or "")

    query = db.query(Equipment).filter(
        Equipment.category == "refrigerador",
        Equipment.status == "novo",
    )
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            or_(
                Equipment.model_name.ilike(pattern),
                Equipment.brand.ilike(pattern),
                Equipment.voltage.ilike(pattern),
                Equipment.rg_code.ilike(pattern),
                Equipment.tag_code.ilike(pattern),
                Equipment.notes.ilike(pattern),
            )
        )

    total = int(query.count() or 0)
    if normalized_sort == "oldest":
        query = query.order_by(Equipment.created_at.asc(), Equipment.id.asc())
    else:
        query = query.order_by(Equipment.created_at.desc(), Equipment.id.desc())

    rows = query.offset(offset).limit(limit).all()
    items = [
        EquipmentNewRefrigeratorItemOut(
            id=int(item.id),
            model_name=normalize_spaces(item.model_name),
            brand=normalize_spaces(item.brand or ""),
            voltage=normalize_spaces(item.voltage or "") or "nao_informado",
            rg_code=normalize_spaces(item.rg_code),
            tag_code=normalize_spaces(item.tag_code),
            status=normalize_spaces(item.status),
            client_name=normalize_optional_text(item.client_name),
            created_at=item.created_at,
        )
        for item in rows
    ]

    return EquipmentNewRefrigeratorListOut(
        items=items,
        page=_build_page_meta(limit=limit, offset=offset, total=total),
    )


@router.get("/refrigerators/available-for-comodato", response_model=list[EquipmentNewRefrigeratorItemOut])
def list_available_refrigerators_for_comodato(
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    q: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_equipments_viewer),
):
    search = normalize_spaces(q or "")

    query = db.query(Equipment).filter(
        Equipment.category == "refrigerador",
        Equipment.status.in_(["novo", "disponivel"]),
    )
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            or_(
                Equipment.model_name.ilike(pattern),
                Equipment.brand.ilike(pattern),
                Equipment.voltage.ilike(pattern),
                Equipment.rg_code.ilike(pattern),
                Equipment.tag_code.ilike(pattern),
                Equipment.notes.ilike(pattern),
            )
        )

    rows = query.order_by(Equipment.created_at.desc(), Equipment.id.desc()).all()
    if not rows:
        return []
    allocated_tokens_020220 = _refrigerator_allocated_tokens_from_020220(db)

    filtered_rows: list[Equipment] = []
    for row in rows:
        equipment_tokens = _build_equipment_lookup_tokens(row.rg_code, row.tag_code)
        if equipment_tokens and allocated_tokens_020220.intersection(equipment_tokens):
            continue
        filtered_rows.append(row)

    sorted_rows = sorted(
        filtered_rows,
        key=lambda item: (
            0 if normalize_lookup_text(item.status) == "novo" else 1,
            normalize_spaces(item.model_name).lower(),
            int(item.id),
        ),
    )

    paged_rows = sorted_rows[offset: offset + limit]
    return [
        EquipmentNewRefrigeratorItemOut(
            id=int(item.id),
            model_name=normalize_spaces(item.model_name),
            brand=normalize_spaces(item.brand or ""),
            voltage=normalize_spaces(item.voltage or "") or "nao_informado",
            rg_code=normalize_spaces(item.rg_code),
            tag_code=normalize_spaces(item.tag_code),
            status=normalize_spaces(item.status),
            client_name=normalize_optional_text(item.client_name),
            created_at=item.created_at,
        )
        for item in paged_rows
    ]


@router.get("/refrigerators/non-allocated", response_model=EquipmentNonAllocatedListOut)
def list_non_allocated_refrigerators(
    limit: int = Query(default=25, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    q: Optional[str] = Query(default=None),
    status_filter: Optional[str] = Query(default="todos", alias="status"),
    sort: str = Query(default="newest"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_equipments_viewer),
):
    normalized_sort = _normalize_sort(sort)
    normalized_status = normalize_lookup_text(status_filter or "todos")
    allowed_status_filters = {"todos", "novo", "disponivel", "recap", "sucata"}
    if normalized_status not in allowed_status_filters:
        raise HTTPException(status_code=422, detail="Status invalido para consulta de refrigeradores.")

    search = normalize_spaces(q or "")
    query = db.query(Equipment).filter(
        Equipment.category == "refrigerador",
        Equipment.status != "alocado",
    )
    if normalized_status == "disponivel":
        query = query.filter(Equipment.status.in_(["novo", "disponivel"]))
    elif normalized_status != "todos":
        query = query.filter(Equipment.status == normalized_status)
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            or_(
                Equipment.model_name.ilike(pattern),
                Equipment.brand.ilike(pattern),
                Equipment.voltage.ilike(pattern),
                Equipment.rg_code.ilike(pattern),
                Equipment.tag_code.ilike(pattern),
                Equipment.notes.ilike(pattern),
            )
        )

    rows = query.order_by(Equipment.created_at.desc(), Equipment.id.desc()).all()
    allocated_tokens_020220 = _refrigerator_allocated_tokens_from_020220(db)

    counters = {"novo": 0, "disponivel": 0, "recap": 0, "sucata": 0}
    filtered_rows: list[Equipment] = []
    for row in rows:
        equipment_tokens = _build_equipment_lookup_tokens(row.rg_code, row.tag_code)
        if equipment_tokens and allocated_tokens_020220.intersection(equipment_tokens):
            continue
        status_value = normalize_lookup_text(row.status)
        if status_value in counters:
            counters[status_value] += 1
        filtered_rows.append(row)

    if normalized_sort == "oldest":
        filtered_rows = list(reversed(filtered_rows))

    total = len(filtered_rows)
    paged_rows = filtered_rows[offset: offset + limit]
    items = [
        EquipmentNewRefrigeratorItemOut(
            id=int(item.id),
            model_name=normalize_spaces(item.model_name),
            brand=normalize_spaces(item.brand or ""),
            voltage=normalize_spaces(item.voltage or "") or "nao_informado",
            rg_code=normalize_spaces(item.rg_code),
            tag_code=normalize_spaces(item.tag_code),
            status=normalize_spaces(item.status),
            client_name=normalize_optional_text(item.client_name),
            created_at=item.created_at,
        )
        for item in paged_rows
    ]

    return EquipmentNonAllocatedListOut(
        dashboard=EquipmentNonAllocatedDashboardOut(
            total_nao_alocados=total,
            novo=counters["novo"],
            disponivel=counters["disponivel"],
            recap=counters["recap"],
            sucata=counters["sucata"],
        ),
        items=items,
        page=_build_page_meta(limit=limit, offset=offset, total=total),
    )


@router.post("/refrigerators/sync-allocation-status", response_model=EquipmentAllocationSyncOut)
def sync_refrigerators_allocation_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_equipments_manager),
):
    rows = (
        db.query(Equipment)
        .filter(
            Equipment.category == "refrigerador",
            Equipment.status.in_(["novo", "disponivel"]),
        )
        .all()
    )
    scanned_count = len(rows)
    if scanned_count == 0:
        return EquipmentAllocationSyncOut(
            scanned_count=0,
            matched_020220_count=0,
            updated_count=0,
            updated_ids=[],
        )

    allocated_tokens_020220 = _refrigerator_allocated_tokens_from_020220(db)
    if not allocated_tokens_020220:
        return EquipmentAllocationSyncOut(
            scanned_count=scanned_count,
            matched_020220_count=0,
            updated_count=0,
            updated_ids=[],
        )

    updated_ids: list[int] = []
    matched_count = 0
    for row in rows:
        if not _is_refrigerator_allocated_in_020220(
            db,
            rg_code=row.rg_code,
            tag_code=row.tag_code,
            allocated_tokens=allocated_tokens_020220,
        ):
            continue
        matched_count += 1
        row.status = "alocado"
        row.client_name = normalize_optional_text(row.client_name)
        updated_ids.append(int(row.id))

    if updated_ids:
        db.commit()

    return EquipmentAllocationSyncOut(
        scanned_count=scanned_count,
        matched_020220_count=matched_count,
        updated_count=len(updated_ids),
        updated_ids=updated_ids,
    )


@router.get("/inventory-materials/month-options", response_model=list[str])
def list_inventory_material_month_options(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_equipments_viewer),
):
    rows = _apply_inventory_base_filter(
        db.query(
            PickupCatalogInventoryItem.invoice_issue_date.label("invoice_issue_date"),
            PickupCatalogInventoryItem.created_at.label("created_at"),
        ),
        db=db,
    ).all()

    options = {
        _parse_inventory_issue_date(row.invoice_issue_date, row.created_at).strftime("%Y-%m")
        for row in rows
    }
    return sorted(options, reverse=True)


@router.get("/inventory-materials", response_model=EquipmentInventoryMaterialListOut)
def list_inventory_materials(
    group: str = Query(default="todos"),
    limit: int = Query(default=50, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    q: Optional[str] = Query(default=None),
    year: Optional[str] = Query(default=None),
    month: Optional[str] = Query(default=None),
    item_type_filter: Optional[str] = Query(default=None, alias="item_type"),
    sort: str = Query(default="newest"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_equipments_viewer),
):
    normalized_group = normalize_lookup_text(group)
    if normalized_group not in MATERIAL_GROUP_OPTIONS:
        raise HTTPException(status_code=422, detail="Grupo de materiais invalido.")
    normalized_sort = _normalize_sort(sort)
    normalized_year = _normalize_year(year) if normalize_spaces(year or "") else ""
    normalized_month = _normalize_month(month) if normalize_spaces(month or "") else ""
    if normalized_month and normalized_year and not normalized_month.startswith(f"{normalized_year}-"):
        raise HTTPException(status_code=422, detail="Mes e ano conflitantes.")
    normalized_item_type = _normalize_material_type(item_type_filter) if normalize_spaces(item_type_filter or "") else ""
    search = normalize_spaces(q or "")

    base_query = _apply_inventory_base_filter(
        db.query(
            PickupCatalogInventoryItem.id.label("inventory_item_id"),
            PickupCatalogInventoryItem.item_type.label("item_type"),
            PickupCatalogInventoryItem.description.label("model_name"),
            PickupCatalogInventoryItem.rg.label("rg_code"),
            PickupCatalogInventoryItem.open_quantity.label("quantity"),
            PickupCatalogInventoryItem.comodato_number.label("comodato_number"),
            PickupCatalogInventoryItem.invoice_issue_date.label("invoice_issue_date"),
            PickupCatalogInventoryItem.created_at.label("created_at"),
            PickupCatalogClient.client_code.label("client_code"),
            PickupCatalogClient.nome_fantasia.label("nome_fantasia"),
        ).join(PickupCatalogClient, PickupCatalogClient.id == PickupCatalogInventoryItem.client_id),
        db=db,
    )

    rows = list(base_query.all())
    normalized_rows = []
    for row in rows:
        parsed_date = _parse_inventory_issue_date(row.invoice_issue_date, row.created_at)
        invoice_month = parsed_date.strftime("%Y-%m")
        invoice_year = invoice_month[:4]
        if normalized_year and invoice_year != normalized_year:
            continue
        if normalized_month and invoice_month != normalized_month:
            continue
        stored_bucket = _material_type_bucket(normalize_spaces(row.item_type))
        inferred_bucket = _material_type_bucket(classify_item_type(normalize_spaces(row.model_name)))
        resolved_item_type = inferred_bucket if stored_bucket == "outro" and inferred_bucket != "outro" else stored_bucket
        normalized_rows.append(
            {
                "inventory_item_id": int(row.inventory_item_id),
                "item_type": resolved_item_type,
                "model_name": normalize_spaces(row.model_name),
                "rg_code": normalize_spaces(row.rg_code),
                "client_code": normalize_spaces(row.client_code),
                "nome_fantasia": normalize_spaces(row.nome_fantasia),
                "quantity": int(row.quantity or 0),
                "comodato_number": normalize_spaces(row.comodato_number),
                "invoice_issue_date": normalize_spaces(row.invoice_issue_date),
                "invoice_month": invoice_month,
                "sort_date": parsed_date,
            }
        )

    if normalized_group == "refrigerador":
        normalized_rows = [item for item in normalized_rows if item["item_type"] == "refrigerador"]
    elif normalized_group == "outros":
        normalized_rows = [item for item in normalized_rows if item["item_type"] != "refrigerador"]

    if normalized_item_type:
        normalized_rows = [item for item in normalized_rows if item["item_type"] == normalized_item_type]

    if search:
        normalized_rows = [
            item for item in normalized_rows
            if _matches_inventory_search(search, item)
        ]

    reverse = normalized_sort == "newest"
    normalized_rows.sort(
        key=lambda item: (
            item["sort_date"],
            item["model_name"].lower(),
            item["inventory_item_id"],
        ),
        reverse=reverse,
    )

    total = len(normalized_rows)
    paged_rows = normalized_rows[offset: offset + limit]
    items = [
        EquipmentInventoryMaterialItemOut(
            inventory_item_id=item["inventory_item_id"],
            item_type=item["item_type"],
            model_name=item["model_name"],
            rg_code=item["rg_code"],
            client_code=item["client_code"],
            nome_fantasia=item["nome_fantasia"],
            quantity=item["quantity"],
            comodato_number=item["comodato_number"],
            invoice_issue_date=item["invoice_issue_date"],
            invoice_month=item["invoice_month"],
        )
        for item in paged_rows
    ]

    return EquipmentInventoryMaterialListOut(
        items=items,
        page=_build_page_meta(limit=limit, offset=offset, total=total),
    )


@router.get("/allocations/lookup", response_model=EquipmentAllocationLookupOut)
def lookup_allocated_material(
    rg_code: Optional[str] = Query(default=None),
    tag_code: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_equipments_viewer),
):
    normalized_rg_code = normalize_optional_code(rg_code) or ""
    normalized_tag_code = normalize_optional_code(tag_code) or ""

    if not normalized_rg_code and not normalized_tag_code:
        raise HTTPException(status_code=422, detail="Informe RG ou etiqueta para consulta.")

    resolved_rg_code = normalized_rg_code
    resolved_tag_code = normalized_tag_code

    if resolved_tag_code:
        equipment_from_tag = (
            db.query(Equipment.rg_code, Equipment.tag_code)
            .filter(func.upper(func.coalesce(Equipment.tag_code, "")) == resolved_tag_code)
            .order_by(Equipment.id.desc())
            .first()
        )
        if equipment_from_tag:
            if not resolved_rg_code:
                resolved_rg_code = normalize_optional_code(equipment_from_tag.rg_code) or ""

    if not resolved_tag_code and resolved_rg_code:
        equipment_from_rg = (
            db.query(Equipment.tag_code)
            .filter(func.upper(func.coalesce(Equipment.rg_code, "")) == resolved_rg_code)
            .order_by(Equipment.id.desc())
            .first()
        )
        if equipment_from_rg:
            resolved_tag_code = normalize_optional_code(equipment_from_rg.tag_code) or ""

    output_rg_code = resolved_rg_code or normalized_rg_code
    output_tag_code = resolved_tag_code or normalized_tag_code
    target_tokens = _build_equipment_lookup_tokens(output_rg_code, output_tag_code)
    if not target_tokens:
        return EquipmentAllocationLookupOut(
            rg_code=output_rg_code,
            tag_code=output_tag_code,
            total=0,
            items=[],
        )

    base_rows = _apply_inventory_base_filter(
        db.query(
            PickupCatalogInventoryItem.id.label("inventory_item_id"),
            PickupCatalogInventoryItem.description.label("model_name"),
            PickupCatalogInventoryItem.rg.label("rg_code"),
            PickupCatalogInventoryItem.invoice_issue_date.label("invoice_issue_date"),
            PickupCatalogInventoryItem.created_at.label("created_at"),
            PickupCatalogClient.client_code.label("client_code"),
            PickupCatalogClient.nome_fantasia.label("nome_fantasia"),
            PickupCatalogClient.setor.label("setor"),
        ).join(PickupCatalogClient, PickupCatalogClient.id == PickupCatalogInventoryItem.client_id),
        db=db,
    ).all()

    matched_rows = []
    for row in base_rows:
        row_tokens = _build_code_lookup_tokens(row.rg_code)
        if target_tokens.intersection(row_tokens):
            matched_rows.append(row)

    matched_rows.sort(
        key=lambda item: (
            _parse_inventory_issue_date(item.invoice_issue_date, item.created_at),
            normalize_spaces(item.nome_fantasia or "").lower(),
            int(item.inventory_item_id),
        ),
        reverse=True,
    )

    items = [
        EquipmentAllocationLookupItemOut(
            inventory_item_id=int(row.inventory_item_id),
            rg_code=normalize_spaces(row.rg_code),
            tag_code=output_tag_code,
            client_code=normalize_spaces(row.client_code),
            nome_fantasia=normalize_spaces(row.nome_fantasia),
            setor=normalize_spaces(row.setor),
            model_name=normalize_spaces(row.model_name),
            invoice_issue_date=normalize_spaces(row.invoice_issue_date),
        )
        for row in matched_rows
    ]

    return EquipmentAllocationLookupOut(
        rg_code=output_rg_code,
        tag_code=output_tag_code,
        total=len(items),
        items=items,
    )


@router.post("/refrigerators/import-csv", response_model=EquipmentBulkImportResultOut)
async def import_refrigerators_csv(
    csv_file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_equipments_manager),
):
    raw_bytes = await csv_file.read()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Arquivo CSV vazio.")

    text = _decode_import_csv(raw_bytes)
    delimiter = _sniff_csv_delimiter(text)
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    if not reader.fieldnames:
        raise HTTPException(status_code=422, detail="CSV sem cabecalho.")
    header_map = _resolve_import_header_map([str(item or "") for item in reader.fieldnames])

    existing_rg_tokens: set[str] = set()
    existing_tag_codes: set[str] = set()
    for row in db.query(Equipment.rg_code, Equipment.tag_code).all():
        existing_rg_tokens.update(_build_code_lookup_tokens(row.rg_code))
        normalized_tag = normalize_optional_code(row.tag_code)
        if normalized_tag:
            existing_tag_codes.add(normalized_tag)

    base_inventory_tokens = _refrigerator_allocated_tokens_from_020220(db)

    total_rows = 0
    imported_count = 0
    duplicated_by_rg = 0
    duplicates_in_file = 0
    duplicates_in_020220 = 0
    duplicates_in_cadastro = 0
    invalid_rows = 0
    ignored_non_refrigerator = 0
    errors: list[str] = []

    seen_import_rg_tokens: set[str] = set()
    seen_import_tags: set[str] = set()
    pending_rows: list[Equipment] = []

    for index, raw_row in enumerate(reader, start=2):
        row = raw_row or {}
        if not any(normalize_spaces(value or "") for value in row.values()):
            continue

        total_rows += 1
        raw_tipo = normalize_spaces(row.get(header_map["tipo"]) or "")
        if raw_tipo:
            try:
                resolved_type = normalize_category(raw_tipo)
            except HTTPException:
                invalid_rows += 1
                if len(errors) < 30:
                    errors.append(f"Linha {index}: tipo invalido ({raw_tipo}).")
                continue
            if resolved_type != "refrigerador":
                ignored_non_refrigerator += 1
                continue

        model_name = normalize_spaces(row.get(header_map["modelo"]) or "")
        brand = normalize_spaces(row.get(header_map["marca"]) or "")
        raw_voltage = normalize_spaces(row.get(header_map["voltagem"]) or "")
        rg_code = normalize_optional_code(row.get(header_map["rg"]) or "")
        tag_code = normalize_optional_code(row.get(header_map["etiqueta"]) or "")

        if not model_name or not brand or not raw_voltage or not rg_code:
            invalid_rows += 1
            if len(errors) < 30:
                errors.append(
                    f"Linha {index}: informe Tipo/Modelo/Marca/Voltagem/RG para importar refrigerador."
                )
            continue

        try:
            voltage = normalize_voltage(raw_voltage)
        except HTTPException:
            invalid_rows += 1
            if len(errors) < 30:
                errors.append(f"Linha {index}: voltagem invalida ({raw_voltage}).")
            continue

        rg_tokens = _build_code_lookup_tokens(rg_code)
        if not rg_tokens:
            invalid_rows += 1
            if len(errors) < 30:
                errors.append(f"Linha {index}: RG invalido.")
            continue
        equipment_tokens = _build_equipment_lookup_tokens(rg_code, tag_code)

        if any(token in seen_import_rg_tokens for token in rg_tokens):
            duplicates_in_file += 1
            duplicated_by_rg += 1
            continue

        if any(token in existing_rg_tokens for token in rg_tokens):
            duplicates_in_cadastro += 1
            duplicated_by_rg += 1
            continue

        if any(token in base_inventory_tokens for token in equipment_tokens):
            duplicates_in_020220 += 1
            duplicated_by_rg += 1
            continue

        if tag_code and (tag_code in existing_tag_codes or tag_code in seen_import_tags):
            invalid_rows += 1
            if len(errors) < 30:
                errors.append(f"Linha {index}: etiqueta ja cadastrada ({tag_code}).")
            continue

        pending_rows.append(
            Equipment(
                category="refrigerador",
                model_name=model_name,
                brand=brand,
                quantity=1,
                voltage=voltage,
                rg_code=rg_code,
                tag_code=tag_code,
                status="novo",
                client_name=None,
                notes=None,
            )
        )
        imported_count += 1
        seen_import_rg_tokens.update(rg_tokens)
        if tag_code:
            seen_import_tags.add(tag_code)

    if pending_rows:
        try:
            db.add_all(pending_rows)
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            raise HTTPException(
                status_code=409,
                detail=(
                    "Conflito de unicidade durante a importacao. "
                    "Verifique RG ou etiqueta duplicados."
                ),
            ) from exc

    return EquipmentBulkImportResultOut(
        total_rows=total_rows,
        imported_count=imported_count,
        duplicated_by_rg=duplicated_by_rg,
        duplicates_in_file=duplicates_in_file,
        duplicates_in_020220=duplicates_in_020220,
        duplicates_in_cadastro=duplicates_in_cadastro,
        invalid_rows=invalid_rows,
        ignored_non_refrigerator=ignored_non_refrigerator,
        errors=errors,
    )


@router.post("/", response_model=EquipmentOut, status_code=status.HTTP_201_CREATED)
def create_equipment(
    payload: EquipmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_equipments_manager),
):
    resolved_category = normalize_category(payload.category)
    is_refrigerator = resolved_category == "refrigerador"
    resolved_status = normalize_status(payload.status) if is_refrigerator else "novo"
    model_name = normalize_spaces(payload.model_name)
    brand = normalize_spaces(payload.brand)
    quantity = normalize_quantity(payload.quantity, required=not is_refrigerator)
    resolved_voltage = normalize_voltage(payload.voltage) if is_refrigerator else ""
    rg_code = normalize_optional_code(payload.rg_code)
    tag_code = normalize_optional_code(payload.tag_code)
    client_name = normalize_optional_text(payload.client_name) if is_refrigerator else None
    notes = normalize_optional_text(payload.notes)

    if not model_name:
        raise HTTPException(status_code=422, detail="Modelo e obrigatorio.")
    if not brand:
        raise HTTPException(status_code=422, detail="Marca e obrigatoria.")
    if is_refrigerator and not resolved_voltage:
        raise HTTPException(status_code=422, detail="Voltagem e obrigatoria para refrigerador.")
    if is_refrigerator and not rg_code:
        raise HTTPException(status_code=422, detail="RG e obrigatorio para refrigerador.")
    if is_refrigerator and resolved_status == "alocado" and not client_name:
        raise HTTPException(status_code=422, detail="Cliente e obrigatorio quando o equipamento esta alocado.")
    if resolved_status != "alocado":
        client_name = None

    ensure_unique_codes(db, rg_code=rg_code, tag_code=tag_code)
    if (
        is_refrigerator
        and resolved_status in {"novo", "disponivel"}
        and _is_refrigerator_allocated_in_020220(db, rg_code=rg_code, tag_code=tag_code)
    ):
        raise HTTPException(
            status_code=409,
            detail=(
                "Equipamento ja consta alocado na base 02.02.20 para o RG ou etiqueta informados. "
                "Nao e permitido cadastrar como disponivel."
            ),
        )

    row = Equipment(
        category=resolved_category,
        model_name=model_name,
        brand=brand,
        quantity=quantity if not is_refrigerator else 1,
        voltage=resolved_voltage,
        rg_code=rg_code,
        tag_code=tag_code,
        status=resolved_status,
        client_name=client_name,
        notes=notes,
    )
    try:
        db.add(row)
        db.commit()
        db.refresh(row)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="RG ou etiqueta ja cadastrados.") from exc

    return build_equipment_out(row)

@router.put("/{equipment_id}", response_model=EquipmentOut)
def update_equipment(
    equipment_id: int,
    payload: EquipmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_equipments_manager),
):
    row = db.query(Equipment).filter(Equipment.id == equipment_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Equipamento nao encontrado.")

    if hasattr(payload, "model_dump"):
        data = payload.model_dump(exclude_unset=True)
    else:
        data = payload.dict(exclude_unset=True)
    if not data:
        return build_equipment_out(row)

    next_category = normalize_category(data["category"]) if "category" in data else row.category
    next_is_refrigerator = next_category == "refrigerador"
    next_model_name = normalize_spaces(data["model_name"]) if "model_name" in data else row.model_name
    next_brand = normalize_spaces(data["brand"]) if "brand" in data else (row.brand or "")
    current_quantity = int(row.quantity or 1)
    next_quantity = normalize_quantity(data["quantity"], required=not next_is_refrigerator) if "quantity" in data else current_quantity
    next_voltage = normalize_voltage(data["voltage"]) if ("voltage" in data and next_is_refrigerator) else (row.voltage or "")
    next_rg_code = normalize_optional_code(data["rg_code"]) if "rg_code" in data else row.rg_code
    next_tag_code = normalize_optional_code(data["tag_code"]) if "tag_code" in data else row.tag_code
    next_status = normalize_status(data["status"]) if ("status" in data and next_is_refrigerator) else (row.status if next_is_refrigerator else "novo")
    next_client_name = normalize_optional_text(data["client_name"]) if ("client_name" in data and next_is_refrigerator) else (row.client_name if next_is_refrigerator else None)
    next_notes = normalize_optional_text(data["notes"]) if "notes" in data else row.notes

    if not next_model_name:
        raise HTTPException(status_code=422, detail="Modelo e obrigatorio.")
    if not next_brand:
        raise HTTPException(status_code=422, detail="Marca e obrigatoria.")
    if next_is_refrigerator and not next_voltage:
        raise HTTPException(status_code=422, detail="Voltagem e obrigatoria para refrigerador.")
    if not next_is_refrigerator:
        next_voltage = ""
        next_rg_code = normalize_optional_code(data.get("rg_code")) if "rg_code" in data else normalize_optional_code(row.rg_code)
        next_tag_code = normalize_optional_code(data.get("tag_code")) if "tag_code" in data else normalize_optional_code(row.tag_code)
    if next_is_refrigerator and not next_rg_code:
        raise HTTPException(status_code=422, detail="RG e obrigatorio para refrigerador.")
    if next_is_refrigerator and next_status == "alocado" and not next_client_name:
        raise HTTPException(status_code=422, detail="Cliente e obrigatorio quando o equipamento esta alocado.")
    if next_status != "alocado":
        next_client_name = None

    ensure_unique_codes(db, rg_code=next_rg_code, tag_code=next_tag_code, current_id=row.id)
    should_validate_020220 = (
        next_is_refrigerator
        and next_status in {"novo", "disponivel"}
        and (
            normalize_optional_code(row.rg_code) != normalize_optional_code(next_rg_code)
            or normalize_optional_code(row.tag_code) != normalize_optional_code(next_tag_code)
            or normalize_lookup_text(row.status) != normalize_lookup_text(next_status)
        )
    )
    if should_validate_020220 and _is_refrigerator_allocated_in_020220(
        db,
        rg_code=next_rg_code,
        tag_code=next_tag_code,
    ):
        raise HTTPException(
            status_code=409,
            detail=(
                "Equipamento ja consta alocado na base 02.02.20 para o RG ou etiqueta informados. "
                "Nao e permitido salvar como disponivel."
            ),
        )

    row.category = next_category
    row.model_name = next_model_name
    row.brand = next_brand
    row.quantity = next_quantity if not next_is_refrigerator else 1
    row.voltage = next_voltage
    row.rg_code = next_rg_code
    row.tag_code = next_tag_code
    row.status = next_status
    row.client_name = next_client_name
    row.notes = next_notes

    try:
        db.commit()
        db.refresh(row)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="RG ou etiqueta ja cadastrados.") from exc

    return build_equipment_out(row)

@router.delete("/{equipment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_equipment(
    equipment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_equipments_manager),
):
    row = db.query(Equipment).filter(Equipment.id == equipment_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Equipamento não encontrado.")

    db.delete(row)
    db.commit()
    return None
