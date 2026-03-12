import os
import re
from mimetypes import guess_type
from datetime import date
from pathlib import Path
from typing import Optional
from urllib.parse import quote
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request as FastAPIRequest, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.auth import require_any_permission, require_permission
from app.database.deps import get_db
from app.models.pickup import Pickup
from app.models.user import User
from app.schemas.pickup import PickupOut

router = APIRouter(prefix="/pickups", tags=["Pickups"])
get_pickups_manager = require_permission("pickups.manage")
get_pickups_viewer = require_permission("pickups.manage")
get_pickups_dashboard_viewer = require_any_permission("pickups.manage", "comodatos.view")

ALLOWED_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
MAX_IMAGE_UPLOAD_BYTES = 8 * 1024 * 1024


def get_uploads_base_dir() -> Path:
    uploads_dir = os.getenv("UPLOADS_DIR")
    if uploads_dir:
        base_dir = Path(uploads_dir)
    else:
        base_dir = Path(__file__).resolve().parents[2] / "uploads"
    base_dir.mkdir(parents=True, exist_ok=True)
    return base_dir


def get_pickups_dir() -> Path:
    pickups_dir = get_uploads_base_dir() / "pickups"
    pickups_dir.mkdir(parents=True, exist_ok=True)
    return pickups_dir


def sanitize_stem(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_-]+", "_", value or "")
    cleaned = cleaned.strip("_")
    return cleaned[:60] or "arquivo"


def build_upload_url(relative_path: Optional[str], request: Optional[FastAPIRequest] = None) -> Optional[str]:
    if not relative_path:
        return None
    if request is not None:
        try:
            base_url = str(request.url_for("open_pickup_file"))
        except Exception:
            base_url = "/pickups/files/open"
        return f"{base_url}?path={quote(str(relative_path), safe='')}"
    return f"/pickups/files/open?path={quote(str(relative_path), safe='')}"


def parse_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Data inválida. Use YYYY-MM-DD.") from exc


def parse_quantity(value: str) -> int:
    try:
        parsed = int(value)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Quantidade inválida.") from exc
    if parsed <= 0:
        raise HTTPException(status_code=422, detail="Quantidade inválida.")
    return parsed


def read_upload_bytes(upload: UploadFile, max_bytes: int) -> bytes:
    content_bytes = upload.file.read(max_bytes + 1)
    if len(content_bytes) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"A foto excede o limite de {max_bytes // (1024 * 1024)} MB."
        )
    return content_bytes


def detect_image_suffix(content_bytes: bytes) -> str:
    if content_bytes.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if content_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if content_bytes.startswith(b"RIFF") and content_bytes[8:12] == b"WEBP":
        return ".webp"
    return ""


def ensure_image(upload: UploadFile, content_bytes: bytes) -> str:
    filename = upload.filename or ""
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_IMAGE_SUFFIXES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A foto precisa ser uma imagem (.jpg, .jpeg, .png ou .webp)."
        )
    content_type = (upload.content_type or "").lower()
    if content_type and not content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tipo de arquivo inválido para a foto."
        )
    detected_suffix = detect_image_suffix(content_bytes)
    if not detected_suffix:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="O arquivo enviado nÃ£o Ã© uma imagem válida."
        )
    if suffix == ".jpeg" and detected_suffix == ".jpg":
        return suffix
    return detected_suffix


def save_photo(upload: UploadFile) -> str:
    content_bytes = read_upload_bytes(upload, MAX_IMAGE_UPLOAD_BYTES)
    suffix = ensure_image(upload, content_bytes)
    pickups_dir = get_pickups_dir()
    original_name = upload.filename or f"foto{suffix}"
    stem = sanitize_stem(Path(original_name).stem)
    target_name = f"pickup_{uuid4().hex}_{stem}{suffix}"
    target_path = pickups_dir / target_name
    with target_path.open("wb") as buffer:
        buffer.write(content_bytes)
    relative_path = Path("pickups") / target_name
    return relative_path.as_posix()


def remove_upload(relative_path: Optional[str]) -> None:
    if not relative_path:
        return
    base_dir = get_uploads_base_dir()
    target_path = (base_dir / relative_path).resolve()
    pickups_dir = get_pickups_dir().resolve()
    try:
        target_path.relative_to(pickups_dir)
    except ValueError:
        return
    if target_path.exists():
        target_path.unlink(missing_ok=True)


def build_pickup_out(pickup: Pickup, request: Optional[FastAPIRequest] = None) -> PickupOut:
    return PickupOut(
        id=pickup.id,
        description=pickup.description,
        pickup_date=pickup.pickup_date,
        material=pickup.material,
        quantity=pickup.quantity,
        photo_url=build_upload_url(pickup.photo_path, request=request),
        created_at=pickup.created_at
    )


@router.get("/files/open", name="open_pickup_file")
def open_pickup_file(
    path: str,
    current_user: User = Depends(get_pickups_manager)
):
    normalized = str(path or "").strip().lstrip("/").replace("\\", "/")
    if normalized.startswith("uploads/"):
        normalized = normalized[len("uploads/"):]
    if normalized.startswith("pickups/"):
        normalized = normalized[len("pickups/"):]
    if not normalized:
        raise HTTPException(status_code=404, detail="Arquivo nÃ£o encontrado")

    pickups_dir = get_pickups_dir().resolve()
    target_path = (pickups_dir / normalized).resolve()
    try:
        target_path.relative_to(pickups_dir)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Arquivo nÃ£o encontrado") from exc
    if not target_path.exists() or not target_path.is_file():
        raise HTTPException(status_code=404, detail="Arquivo nÃ£o encontrado")

    return FileResponse(
        path=str(target_path),
        media_type=guess_type(str(target_path))[0] or "application/octet-stream",
        filename=target_path.name,
    )


@router.get("/dashboard", response_model=list[PickupOut])
def list_pickups_dashboard(
    request: FastAPIRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_pickups_dashboard_viewer)
):
    rows = (
        db.query(Pickup)
        .order_by(Pickup.pickup_date.desc(), Pickup.id.desc())
        .all()
    )
    return [build_pickup_out(row, request=request) for row in rows]


@router.get("/", response_model=list[PickupOut])
def list_pickups(
    request: FastAPIRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_pickups_viewer)
):
    rows = (
        db.query(Pickup)
        .order_by(Pickup.pickup_date.desc(), Pickup.id.desc())
        .all()
    )
    return [build_pickup_out(row, request=request) for row in rows]


@router.post("/", response_model=PickupOut, status_code=status.HTTP_201_CREATED)
def create_pickup(
    request: FastAPIRequest,
    description: str = Form(...),
    pickup_date: str = Form(...),
    material: str = Form(...),
    quantity: str = Form(...),
    photo: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_pickups_manager)
):
    parsed_date = parse_date(pickup_date)
    parsed_quantity = parse_quantity(quantity)

    photo_path = None
    if photo is not None:
        photo_path = save_photo(photo)

    pickup = Pickup(
        description=description,
        pickup_date=parsed_date,
        material=material,
        quantity=parsed_quantity,
        photo_path=photo_path
    )
    try:
        db.add(pickup)
        db.commit()
        db.refresh(pickup)
        return build_pickup_out(pickup, request=request)
    except Exception:
        remove_upload(photo_path)
        raise


@router.delete("/{pickup_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_pickup(
    pickup_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_pickups_manager)
):
    pickup = db.query(Pickup).filter(Pickup.id == pickup_id).first()
    if not pickup:
        raise HTTPException(status_code=404, detail="Retirada não encontrada")
    photo_path = pickup.photo_path
    db.delete(pickup)
    db.commit()
    remove_upload(photo_path)
    return None
