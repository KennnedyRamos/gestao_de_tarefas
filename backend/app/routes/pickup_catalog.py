import json
from datetime import datetime
from io import BytesIO
import re
from typing import Any
from urllib.parse import quote
from urllib.request import urlopen

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.auth import get_current_admin
from app.database.deps import get_db
from app.models.pickup_catalog import (
    PickupCatalogClient,
    PickupCatalogInventoryItem,
    PickupCatalogOrder,
    PickupCatalogOrderItem,
    PickupCatalogUploadBatch,
)
from app.models.user import User
from app.schemas.pickup_catalog import (
    PickupCatalogClientData,
    PickupCatalogClientOut,
    PickupCatalogInventoryItemOut,
    PickupCatalogOrderOut,
    PickupCatalogPdfRequest,
    PickupCatalogStats,
    PickupCatalogStatusOut,
)
from app.services.pickup_catalog_csv import (
    CLIENT_FORM_FIELDS,
    calculate_bottles_for_crates,
    canonical_code,
    item_type_label,
    load_clients_csv,
    load_inventory_csv,
    merge_clients_with_inventory_snapshots,
)
from app.services.pickup_catalog_pdf import build_withdrawal_pdf

router = APIRouter(prefix="/pickup-catalog", tags=["PickupCatalog"])

RESELLER_LINES = [
    "Ribeira Beer Distribuidora de Bebidas Ltda",
    "Rua Arapongal N 40 - Arapongal",
    "Registro - SP",
    "11900-000",
]

MANUAL_CLIENT_FIELDS = {
    "telefone",
    "responsavel_cliente",
    "responsavel_retirada",
    "responsavel_conferencia",
}


def _safe_text(value: Any) -> str:
    return str(value or "").strip()


def _empty_client(code: str = "") -> dict[str, str]:
    payload = {field: "" for field in CLIENT_FORM_FIELDS}
    payload["client_code"] = code
    return payload


def _client_payload_from_model(client: PickupCatalogClient | None, fallback_code: str = "") -> dict[str, str]:
    if not client:
        return _empty_client(fallback_code)

    return {
        "client_code": _safe_text(client.client_code),
        "nome_fantasia": _safe_text(client.nome_fantasia),
        "razao_social": _safe_text(client.razao_social),
        "cnpj_cpf": _safe_text(client.cnpj_cpf),
        "setor": _safe_text(client.setor),
        "telefone": _safe_text(client.telefone),
        "endereco": _safe_text(client.endereco),
        "bairro": _safe_text(client.bairro),
        "cidade": _safe_text(client.cidade),
        "cep": _safe_text(client.cep),
        "inscricao_estadual": _safe_text(client.inscricao_estadual),
        "responsavel_cliente": _safe_text(client.responsavel_cliente),
        "responsavel_retirada": _safe_text(client.responsavel_retirada),
        "responsavel_conferencia": _safe_text(client.responsavel_conferencia),
    }


def _apply_payload_to_client(client: PickupCatalogClient, payload: dict[str, str]) -> None:
    client.nome_fantasia = _safe_text(payload.get("nome_fantasia"))
    client.razao_social = _safe_text(payload.get("razao_social"))
    client.cnpj_cpf = _safe_text(payload.get("cnpj_cpf"))
    client.setor = _safe_text(payload.get("setor"))
    client.telefone = _safe_text(payload.get("telefone"))
    client.endereco = _safe_text(payload.get("endereco"))
    client.bairro = _safe_text(payload.get("bairro"))
    client.cidade = _safe_text(payload.get("cidade"))
    client.cep = _safe_text(payload.get("cep"))
    client.inscricao_estadual = _safe_text(payload.get("inscricao_estadual"))
    client.responsavel_cliente = _safe_text(payload.get("responsavel_cliente"))
    client.responsavel_retirada = _safe_text(payload.get("responsavel_retirada"))
    client.responsavel_conferencia = _safe_text(payload.get("responsavel_conferencia"))


def _merge_client_form_with_db(form_client: dict[str, str], model: PickupCatalogClient | None) -> dict[str, str]:
    merged = dict(form_client)
    if not model:
        return merged

    db_payload = _client_payload_from_model(model)
    for field in CLIENT_FORM_FIELDS:
        if field in MANUAL_CLIENT_FIELDS:
            continue
        if not _safe_text(merged.get(field)):
            merged[field] = _safe_text(db_payload.get(field))
    return merged


def _clear_manual_client_fields(payload: dict[str, str]) -> dict[str, str]:
    cleaned = dict(payload)
    for field in MANUAL_CLIENT_FIELDS:
        cleaned[field] = ""
    return cleaned


def _inventory_item_out(item: PickupCatalogInventoryItem) -> PickupCatalogInventoryItemOut:
    return PickupCatalogInventoryItemOut(
        id=item.id,
        description=_safe_text(item.description),
        item_type=_safe_text(item.item_type) or "outro",
        type_label=item_type_label(_safe_text(item.item_type) or "outro"),
        open_quantity=int(item.open_quantity or 0),
        rg=_safe_text(item.rg),
        comodato_number=_safe_text(item.comodato_number),
        data_emissao=_safe_text(item.invoice_issue_date),
        volume_key=_safe_text(item.volume_key),
    )


def _build_line_from_inventory(item: PickupCatalogInventoryItem, quantity: int) -> dict[str, Any]:
    item_type = _safe_text(item.item_type) or "outro"
    line = {
        "description": _safe_text(item.description),
        "item_type": item_type,
        "type_label": item_type_label(item_type),
        "quantity": quantity,
        "rg": _safe_text(item.rg),
        "volume_key": _safe_text(item.volume_key),
    }

    if item_type == "vasilhame_caixa":
        bottles = calculate_bottles_for_crates(line["volume_key"], quantity)
        if bottles is None:
            line["quantity_text"] = f"{quantity} caixas"
        else:
            line["quantity_text"] = f"{quantity} caixas - {bottles} garrafas"
    else:
        line["quantity_text"] = str(quantity)

    return line


def _build_line_from_manual(
    description: str,
    quantity: int,
    item_type: str,
    rg: str,
    volume_key: str,
) -> dict[str, Any]:
    normalized_type = _safe_text(item_type) or "outro"
    line = {
        "description": _safe_text(description),
        "item_type": normalized_type,
        "type_label": item_type_label(normalized_type),
        "quantity": quantity,
        "rg": _safe_text(rg),
        "volume_key": _safe_text(volume_key),
    }

    if normalized_type == "vasilhame_caixa":
        bottles = calculate_bottles_for_crates(line["volume_key"], quantity)
        if bottles is None:
            line["quantity_text"] = f"{quantity} caixas"
        else:
            line["quantity_text"] = f"{quantity} caixas - {bottles} garrafas"
    else:
        line["quantity_text"] = str(quantity)

    return line


def _build_summary(lines: list[dict[str, Any]]) -> str:
    parts: list[str] = []
    for line in lines:
        item_type = _safe_text(line.get("item_type")) or "outro"
        description = _safe_text(line.get("description"))
        quantity_text = _safe_text(line.get("quantity_text")) or str(line.get("quantity", 0))
        rg = _safe_text(line.get("rg"))

        if item_type == "refrigerador" and rg:
            parts.append(f"{description} (RG {rg}) - {quantity_text}")
        else:
            parts.append(f"{description} - {quantity_text}")
    return "; ".join(parts)


def _equipment_by_type(items: list[PickupCatalogInventoryItem]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, dict[str, dict[str, Any]]] = {}
    for item in items:
        item_type = _safe_text(item.item_type) or "outro"
        description = _safe_text(item.description)

        slot = grouped.setdefault(item_type, {})
        if description not in slot:
            slot[description] = {
                "description": description,
                "quantity": 0,
                "rgs": [],
            }

        slot[description]["quantity"] += int(item.open_quantity or 0)
        if item_type == "refrigerador" and _safe_text(item.rg):
            slot[description]["rgs"].append(_safe_text(item.rg))

    output: dict[str, list[dict[str, Any]]] = {}
    for item_type, rows in grouped.items():
        output[item_type] = sorted(rows.values(), key=lambda row: row["description"].lower())
    return output


def _open_equipment_summary(items: list[PickupCatalogInventoryItem], selected_types: set[str]) -> list[str]:
    if not selected_types:
        return []

    grouped = _equipment_by_type(items)
    lines: list[str] = []
    for item_type in sorted(selected_types):
        for row in grouped.get(item_type, []):
            quantity = row.get("quantity", 0)
            description = _safe_text(row.get("description"))
            if item_type == "refrigerador" and row.get("rgs"):
                lines.append(f"{description} - {quantity} un. | RGs: {', '.join(row['rgs'])}")
            else:
                lines.append(f"{description} - {quantity}")

    return lines


def _prepare_merged_clients(
    client_rows: dict[str, dict[str, str]],
    inventory_rows: dict[str, list[dict[str, Any]]],
) -> dict[str, dict[str, str]]:
    merged = merge_clients_with_inventory_snapshots(client_rows, inventory_rows)
    for code, payload in merged.items():
        payload["client_code"] = _safe_text(payload.get("client_code")) or code
    return merged


def _latest_batch_id(db: Session) -> int | None:
    row = (
        db.query(PickupCatalogUploadBatch.id)
        .order_by(PickupCatalogUploadBatch.id.desc())
        .first()
    )
    return int(row[0]) if row else None


def _uses_batched_inventory(db: Session) -> bool:
    return (
        db.query(PickupCatalogInventoryItem.id)
        .filter(PickupCatalogInventoryItem.batch_id.isnot(None))
        .first()
        is not None
    )


def _load_inventory_items_for_client(db: Session, client_id: int) -> list[PickupCatalogInventoryItem]:
    query = db.query(PickupCatalogInventoryItem).filter(PickupCatalogInventoryItem.client_id == client_id)

    if _uses_batched_inventory(db):
        latest_batch_id = _latest_batch_id(db)
        if latest_batch_id is None:
            return []
        query = query.filter(PickupCatalogInventoryItem.batch_id == latest_batch_id)

    return query.order_by(PickupCatalogInventoryItem.item_type.asc(), PickupCatalogInventoryItem.description.asc()).all()


def _latest_status(db: Session) -> tuple[bool, PickupCatalogStats, datetime | None]:
    latest_batch = db.query(PickupCatalogUploadBatch).order_by(PickupCatalogUploadBatch.id.desc()).first()
    if latest_batch:
        stats = PickupCatalogStats(
            clients_count=int(latest_batch.clients_count or 0),
            inventory_clients=int(latest_batch.inventory_clients or 0),
            open_items=int(latest_batch.open_items or 0),
        )
        return True, stats, latest_batch.uploaded_at

    clients_count = int(db.query(func.count(PickupCatalogClient.id)).scalar() or 0)
    inventory_clients = int(db.query(func.count(func.distinct(PickupCatalogInventoryItem.client_id))).scalar() or 0)
    open_items = int(db.query(func.count(PickupCatalogInventoryItem.id)).scalar() or 0)
    has_data = clients_count > 0 or open_items > 0

    return has_data, PickupCatalogStats(
        clients_count=clients_count,
        inventory_clients=inventory_clients,
        open_items=open_items,
    ), None


def _format_brazil_date(value: str | None) -> str:
    raw = _safe_text(value)
    if not raw:
        return datetime.now().strftime("%d/%m/%Y")
    try:
        return datetime.strptime(raw, "%Y-%m-%d").strftime("%d/%m/%Y")
    except ValueError:
        return raw


def _normalize_cep(value: str) -> str:
    digits = re.sub(r"\D+", "", _safe_text(value))
    if len(digits) != 8:
        return ""
    return f"{digits[:5]}-{digits[5:]}"


def _street_for_lookup(value: str) -> str:
    street = re.sub(r"\s+", " ", _safe_text(value))
    if not street:
        return ""
    # Remove número e complemento para melhorar a busca no ViaCEP.
    street = re.sub(r"\s+\d+.*$", "", street).strip()
    return street[:80]


def _lookup_cep_by_address(cidade: str, endereco: str, uf: str = "SP") -> str:
    city = _safe_text(cidade)
    street = _street_for_lookup(endereco)
    if not city or not street:
        return ""

    url = f"https://viacep.com.br/ws/{quote(uf)}/{quote(city)}/{quote(street)}/json/"
    try:
        with urlopen(url, timeout=4) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception:
        return ""

    if not isinstance(payload, list):
        return ""

    for item in payload:
        if not isinstance(item, dict):
            continue
        cep = _normalize_cep(item.get("cep"))
        if cep:
            return cep
    return ""


def _ensure_client_cep(client_payload: dict[str, str]) -> dict[str, str]:
    normalized_cep = _normalize_cep(client_payload.get("cep", ""))
    if normalized_cep:
        client_payload["cep"] = normalized_cep
        return client_payload

    auto_cep = _lookup_cep_by_address(
        cidade=client_payload.get("cidade", ""),
        endereco=client_payload.get("endereco", ""),
    )
    if auto_cep:
        client_payload["cep"] = auto_cep
    return client_payload


def _safe_filename_chunk(text: str) -> str:
    raw = _safe_text(text)
    if not raw:
        return "sem_codigo"
    chunk = re.sub(r"[^A-Za-z0-9_-]+", "_", raw)
    return chunk.strip("_") or "sem_codigo"


@router.get("/status", response_model=PickupCatalogStatusOut)
def get_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    dataset_ready, stats, loaded_at = _latest_status(db)
    return PickupCatalogStatusOut(dataset_ready=dataset_ready, loaded_at=loaded_at, stats=stats)


@router.post("/upload-csv")
async def upload_csv(
    clients_csv: UploadFile = File(...),
    inventory_csv: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    clients_bytes = await clients_csv.read()
    inventory_bytes = await inventory_csv.read()

    if not clients_bytes or not inventory_bytes:
        raise HTTPException(status_code=400, detail="Envie os dois arquivos CSV (01.20.11 e 02.02.20).")

    try:
        clients_rows = load_clients_csv(clients_bytes)
        inventory_rows = load_inventory_csv(inventory_bytes)
        merged_clients = _prepare_merged_clients(clients_rows, inventory_rows)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    batch = PickupCatalogUploadBatch(
        clients_file_name=_safe_text(clients_csv.filename),
        inventory_file_name=_safe_text(inventory_csv.filename),
    )
    db.add(batch)
    db.flush()

    all_codes = sorted(merged_clients.keys())
    existing_clients: dict[str, PickupCatalogClient] = {}
    if all_codes:
        existing_rows = db.query(PickupCatalogClient).filter(PickupCatalogClient.client_code.in_(all_codes)).all()
        existing_clients = {row.client_code: row for row in existing_rows}

    for code, payload in merged_clients.items():
        client_model = existing_clients.get(code)
        if not client_model:
            client_model = PickupCatalogClient(client_code=code)
            db.add(client_model)
            existing_clients[code] = client_model
        _apply_payload_to_client(client_model, payload)

    db.flush()

    open_items = 0
    for code, items in inventory_rows.items():
        client_model = existing_clients.get(code)
        if not client_model:
            client_model = PickupCatalogClient(client_code=code)
            db.add(client_model)
            db.flush()
            existing_clients[code] = client_model

        for item in items:
            db.add(
                PickupCatalogInventoryItem(
                    client_id=client_model.id,
                    batch_id=batch.id,
                    description=_safe_text(item.get("description")),
                    item_type=_safe_text(item.get("item_type")) or "outro",
                    open_quantity=int(item.get("open_quantity", 0) or 0),
                    rg=_safe_text(item.get("rg")),
                    comodato_number=_safe_text(item.get("comodato_number")),
                    invoice_issue_date=_safe_text(item.get("issue_date")),
                    volume_key=_safe_text(item.get("volume_key")),
                    source_baixados=int(item.get("source_baixados", 0) or 0),
                    product_code=_safe_text(item.get("product_code")),
                )
            )
            open_items += 1

    batch.clients_count = len(merged_clients)
    batch.inventory_clients = len(inventory_rows)
    batch.open_items = open_items

    db.commit()

    return {
        "message": "Dados gravados com sucesso.",
        "stats": {
            "clients_count": batch.clients_count,
            "inventory_clients": batch.inventory_clients,
            "open_items": batch.open_items,
        },
    }


@router.get("/client/{client_code}", response_model=PickupCatalogClientOut)
def get_client(
    client_code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    search_code = canonical_code(client_code)
    if not search_code:
        return PickupCatalogClientOut(client=PickupCatalogClientData(), items=[])

    client_model = db.query(PickupCatalogClient).filter(PickupCatalogClient.client_code == search_code).first()
    inventory_items: list[PickupCatalogInventoryItem] = []
    if client_model:
        inventory_items = _load_inventory_items_for_client(db, client_model.id)

    client_payload = _client_payload_from_model(client_model, fallback_code=search_code)
    client_payload = _ensure_client_cep(client_payload)
    client_payload = _clear_manual_client_fields(client_payload)
    out_items = [_inventory_item_out(item) for item in inventory_items]

    return PickupCatalogClientOut(
        matched_code=search_code,
        found_anything=bool(client_model or out_items),
        client=PickupCatalogClientData(**client_payload),
        items=out_items,
    )


@router.get("/orders", response_model=list[PickupCatalogOrderOut])
def list_orders(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    return (
        db.query(PickupCatalogOrder)
        .order_by(PickupCatalogOrder.id.desc())
        .limit(300)
        .all()
    )


@router.post("/orders/pdf")
def create_order_pdf(
    payload: PickupCatalogPdfRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    client_form = payload.client.model_dump() if hasattr(payload.client, "model_dump") else payload.client.dict()
    search_code = canonical_code(_safe_text(client_form.get("client_code")) or _safe_text(payload.lookup_code))

    client_model = None
    inventory_items: list[PickupCatalogInventoryItem] = []
    if search_code:
        client_model = db.query(PickupCatalogClient).filter(PickupCatalogClient.client_code == search_code).first()
        if client_model:
            inventory_items = _load_inventory_items_for_client(db, client_model.id)

    client_data = _merge_client_form_with_db(client_form, client_model)
    if not _safe_text(client_data.get("client_code")) and search_code:
        client_data["client_code"] = search_code
    client_data = _ensure_client_cep(client_data)

    inventory_map = {item.id: item for item in inventory_items}
    selected_lines: list[dict[str, Any]] = []
    selected_types: set[str] = set()

    for selection in payload.selected_inventory:
        item = inventory_map.get(selection.item_id)
        if not item:
            continue

        quantity = max(1, int(selection.quantity or 1))
        quantity = min(quantity, int(item.open_quantity or 0))
        if quantity <= 0:
            continue

        selected_lines.append(_build_line_from_inventory(item, quantity))
        if item.item_type and item.item_type != "outro":
            selected_types.add(item.item_type)

    for manual in payload.manual_items:
        description = _safe_text(manual.description)
        quantity = int(manual.quantity or 0)
        if not description or quantity <= 0:
            continue

        item_type = _safe_text(manual.item_type) or "outro"
        selected_lines.append(
            _build_line_from_manual(
                description=description,
                quantity=quantity,
                item_type=item_type,
                rg=_safe_text(manual.rg),
                volume_key=_safe_text(manual.volume_key),
            )
        )
        if item_type != "outro":
            selected_types.add(item_type)

    if not selected_lines:
        raise HTTPException(status_code=422, detail="Selecione pelo menos um item para gerar a retirada.")

    auto_summary = _safe_text(payload.auto_summary) or _build_summary(selected_lines)
    extra_obs = _safe_text(payload.observacao_extra)
    observation = f"{auto_summary} | {extra_obs}" if extra_obs else auto_summary

    withdrawal_date = _format_brazil_date(payload.data_retirada)
    withdrawal_time = _safe_text(payload.hora_retirada)
    company_name = _safe_text(payload.company_name) or "Ribeira Beer"

    open_equipment_summary = _open_equipment_summary(inventory_items, selected_types)
    if client_model and not _safe_text(client_model.cep) and _safe_text(client_data.get("cep")):
        client_model.cep = _safe_text(client_data.get("cep"))

    order = PickupCatalogOrder(
        company_name=company_name,
        client_id=client_model.id if client_model else None,
        client_code=_safe_text(client_data.get("client_code")),
        nome_fantasia=_safe_text(client_data.get("nome_fantasia")),
        razao_social=_safe_text(client_data.get("razao_social")),
        cnpj_cpf=_safe_text(client_data.get("cnpj_cpf")),
        setor=_safe_text(client_data.get("setor")),
        telefone=_safe_text(client_data.get("telefone")),
        endereco=_safe_text(client_data.get("endereco")),
        bairro=_safe_text(client_data.get("bairro")),
        cidade=_safe_text(client_data.get("cidade")),
        cep=_safe_text(client_data.get("cep")),
        inscricao_estadual=_safe_text(client_data.get("inscricao_estadual")),
        responsavel_cliente=_safe_text(client_data.get("responsavel_cliente")),
        responsavel_retirada=_safe_text(client_data.get("responsavel_retirada")),
        responsavel_conferencia=_safe_text(client_data.get("responsavel_conferencia")),
        withdrawal_date=withdrawal_date,
        withdrawal_time=withdrawal_time,
        summary_line=auto_summary,
        observation=observation,
        selected_types=",".join(sorted(selected_types)),
    )
    db.add(order)
    db.flush()

    order.order_number = f"RET-{datetime.now().strftime('%Y%m%d')}-{order.id:06d}"

    for line in selected_lines:
        db.add(
            PickupCatalogOrderItem(
                order_id=order.id,
                description=_safe_text(line.get("description")),
                item_type=_safe_text(line.get("item_type")) or "outro",
                quantity=int(line.get("quantity", 0) or 0),
                quantity_text=_safe_text(line.get("quantity_text")),
                rg=_safe_text(line.get("rg")),
                volume_key=_safe_text(line.get("volume_key")),
            )
        )

    db.commit()

    order_payload = {
        "company_name": company_name,
        "client": client_data,
        "items": selected_lines,
        "observation": observation,
        "summary_line": auto_summary,
        "withdrawal_date": withdrawal_date,
        "withdrawal_time": withdrawal_time,
        "generated_at": datetime.now().strftime("%d/%m/%Y %H:%M"),
        "copies": ["Via do Cliente", "Via da Logística"],
        "reseller_lines": RESELLER_LINES,
        "open_equipment_summary": open_equipment_summary,
        "order_number": order.order_number,
    }

    pdf_bytes = build_withdrawal_pdf(order_payload)
    filename = (
        f"ordem_retirada_{_safe_filename_chunk(search_code or client_data.get('client_code', 'sem_codigo'))}"
        f"_{datetime.now().strftime('%Y%m%d_%H%M')}.pdf"
    )
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}

    return StreamingResponse(BytesIO(pdf_bytes), media_type="application/pdf", headers=headers)
