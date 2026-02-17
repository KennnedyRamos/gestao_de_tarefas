import os
import re
import shutil
from datetime import date, datetime, time
from pathlib import Path
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from sqlalchemy.orm import Session

from app.core.auth import require_any_permission, require_permission
from app.database.deps import get_db
from app.models.delivery import Delivery
from app.models.pickup_catalog import PickupCatalogClient
from app.models.user import User
from app.schemas.delivery import DeliveryClientLookupOut, DeliveryOut
from app.services.pickup_catalog_csv import canonical_code

router = APIRouter(prefix="/deliveries", tags=["Deliveries"])
get_deliveries_manager = require_permission("deliveries.manage")
get_deliveries_viewer = require_any_permission("deliveries.manage", "comodatos.view")


def get_uploads_base_dir() -> Path:
    uploads_dir = os.getenv("UPLOADS_DIR")
    if uploads_dir:
        base_dir = Path(uploads_dir)
    else:
        base_dir = Path(__file__).resolve().parents[2] / "uploads"
    base_dir.mkdir(parents=True, exist_ok=True)
    return base_dir


def get_deliveries_dir() -> Path:
    deliveries_dir = get_uploads_base_dir() / "deliveries"
    deliveries_dir.mkdir(parents=True, exist_ok=True)
    return deliveries_dir


def sanitize_stem(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_-]+", "_", value or "")
    cleaned = cleaned.strip("_")
    return cleaned[:60] or "arquivo"


def safe_text(value: object) -> str:
    return str(value or "").strip()


def build_upload_url(relative_path: str, request: Optional[Request] = None) -> str:
    normalized = str(relative_path or "").strip().lstrip("/")
    if normalized.startswith("uploads/"):
        normalized = normalized[len("uploads/"):]
    if request is not None:
        try:
            return str(request.url_for("uploads", path=normalized))
        except Exception:
            pass
    return f"/uploads/{normalized}"


def parse_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Data inválida. Use YYYY-MM-DD.") from exc


def parse_time(value: Optional[str]) -> Optional[time]:
    if value is None or value == "":
        return None
    try:
        return datetime.strptime(value, "%H:%M").time()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Horário inválido. Use HH:MM.") from exc


def ensure_pdf(upload: UploadFile, field_label: str) -> None:
    filename = upload.filename or ""
    suffix = Path(filename).suffix.lower()
    if suffix != ".pdf":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_label} precisa ser um PDF (.pdf)."
        )


def save_pdf(upload: UploadFile, prefix: str, label: str) -> str:
    ensure_pdf(upload, label)
    deliveries_dir = get_deliveries_dir()
    original_name = upload.filename or f"{prefix}.pdf"
    stem = sanitize_stem(Path(original_name).stem)
    target_name = f"{prefix}_{uuid4().hex}_{stem}.pdf"
    target_path = deliveries_dir / target_name
    with target_path.open("wb") as buffer:
        shutil.copyfileobj(upload.file, buffer)
    relative_path = Path("deliveries") / target_name
    return relative_path.as_posix()


def remove_upload(relative_path: Optional[str]) -> None:
    if not relative_path:
        return
    base_dir = get_uploads_base_dir()
    target_path = (base_dir / relative_path).resolve()
    deliveries_dir = get_deliveries_dir().resolve()
    try:
        target_path.relative_to(deliveries_dir)
    except ValueError:
        return
    if target_path.exists():
        target_path.unlink(missing_ok=True)


def build_delivery_out(delivery: Delivery, request: Optional[Request] = None) -> DeliveryOut:
    return DeliveryOut(
        id=delivery.id,
        description=delivery.description,
        delivery_date=delivery.delivery_date,
        delivery_time=delivery.delivery_time,
        pdf_one_path=delivery.pdf_one_path,
        pdf_two_path=delivery.pdf_two_path,
        pdf_one_url=build_upload_url(delivery.pdf_one_path, request=request),
        pdf_two_url=build_upload_url(delivery.pdf_two_path, request=request),
        created_at=delivery.created_at
    )


@router.get("/", response_model=list[DeliveryOut])
def list_deliveries(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_deliveries_viewer)
):
    rows = (
        db.query(Delivery)
        .order_by(Delivery.delivery_date.desc(), Delivery.delivery_time.desc(), Delivery.id.desc())
        .all()
    )
    return [build_delivery_out(row, request=request) for row in rows]


@router.get("/client/{client_code}", response_model=DeliveryClientLookupOut)
def lookup_delivery_client(
    client_code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_deliveries_manager)
):
    search_code = canonical_code(client_code)
    if not search_code:
        return DeliveryClientLookupOut()

    row = (
        db.query(PickupCatalogClient.client_code, PickupCatalogClient.nome_fantasia)
        .filter(PickupCatalogClient.client_code == search_code)
        .first()
    )
    if not row:
        return DeliveryClientLookupOut(client_code=search_code, nome_fantasia="", found=False)

    fantasy_name = safe_text(row.nome_fantasia)
    return DeliveryClientLookupOut(
        client_code=safe_text(row.client_code) or search_code,
        nome_fantasia=fantasy_name,
        found=bool(fantasy_name),
    )


@router.post("/", response_model=DeliveryOut, status_code=status.HTTP_201_CREATED)
def create_delivery(
    request: Request,
    description: str = Form(...),
    delivery_date: str = Form(...),
    delivery_time: Optional[str] = Form(None),
    pdf_one: UploadFile = File(...),
    pdf_two: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_deliveries_manager)
):
    parsed_date = parse_date(delivery_date)
    parsed_time = parse_time(delivery_time)

    pdf_one_path = None
    pdf_two_path = None
    try:
        pdf_one_path = save_pdf(pdf_one, "pdf1", "PDF 1")
        pdf_two_path = save_pdf(pdf_two, "pdf2", "PDF 2")
        delivery = Delivery(
            description=description,
            delivery_date=parsed_date,
            delivery_time=parsed_time,
            pdf_one_path=pdf_one_path,
            pdf_two_path=pdf_two_path
        )
        db.add(delivery)
        db.commit()
        db.refresh(delivery)
        return build_delivery_out(delivery, request=request)
    except Exception:
        remove_upload(pdf_one_path)
        remove_upload(pdf_two_path)
        raise


@router.delete("/{delivery_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_delivery(
    delivery_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_deliveries_manager)
):
    delivery = db.query(Delivery).filter(Delivery.id == delivery_id).first()
    if not delivery:
        raise HTTPException(status_code=404, detail="Entrega não encontrada")
    pdf_one_path = delivery.pdf_one_path
    pdf_two_path = delivery.pdf_two_path
    db.delete(delivery)
    db.commit()
    remove_upload(pdf_one_path)
    remove_upload(pdf_two_path)
    return None
