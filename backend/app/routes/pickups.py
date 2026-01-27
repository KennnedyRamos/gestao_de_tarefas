import os
import re
import shutil
from datetime import date
from pathlib import Path
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.auth import get_current_admin
from app.database.deps import get_db
from app.models.pickup import Pickup
from app.models.user import User
from app.schemas.pickup import PickupOut

router = APIRouter(prefix="/pickups", tags=["Pickups"])

ALLOWED_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}


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


def build_upload_url(relative_path: Optional[str]) -> Optional[str]:
    if not relative_path:
        return None
    return f"/uploads/{relative_path}"


def parse_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Data invalida. Use YYYY-MM-DD.") from exc


def parse_quantity(value: str) -> int:
    try:
        parsed = int(value)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Quantidade invalida.") from exc
    if parsed <= 0:
        raise HTTPException(status_code=422, detail="Quantidade invalida.")
    return parsed


def ensure_image(upload: UploadFile) -> str:
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
            detail="Tipo de arquivo invalido para a foto."
        )
    return suffix


def save_photo(upload: UploadFile) -> str:
    suffix = ensure_image(upload)
    pickups_dir = get_pickups_dir()
    original_name = upload.filename or f"foto{suffix}"
    stem = sanitize_stem(Path(original_name).stem)
    target_name = f"pickup_{uuid4().hex}_{stem}{suffix}"
    target_path = pickups_dir / target_name
    with target_path.open("wb") as buffer:
        shutil.copyfileobj(upload.file, buffer)
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


def build_pickup_out(pickup: Pickup) -> PickupOut:
    return PickupOut(
        id=pickup.id,
        description=pickup.description,
        pickup_date=pickup.pickup_date,
        material=pickup.material,
        quantity=pickup.quantity,
        photo_path=pickup.photo_path,
        photo_url=build_upload_url(pickup.photo_path),
        created_at=pickup.created_at
    )


@router.get("/", response_model=list[PickupOut])
def list_pickups(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin)
):
    rows = (
        db.query(Pickup)
        .order_by(Pickup.pickup_date.desc(), Pickup.id.desc())
        .all()
    )
    return [build_pickup_out(row) for row in rows]


@router.post("/", response_model=PickupOut, status_code=status.HTTP_201_CREATED)
def create_pickup(
    description: str = Form(...),
    pickup_date: str = Form(...),
    material: str = Form(...),
    quantity: str = Form(...),
    photo: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin)
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
        return build_pickup_out(pickup)
    except Exception:
        remove_upload(photo_path)
        raise


@router.delete("/{pickup_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_pickup(
    pickup_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin)
):
    pickup = db.query(Pickup).filter(Pickup.id == pickup_id).first()
    if not pickup:
        raise HTTPException(status_code=404, detail="Retirada nao encontrada")
    photo_path = pickup.photo_path
    db.delete(pickup)
    db.commit()
    remove_upload(photo_path)
    return None
