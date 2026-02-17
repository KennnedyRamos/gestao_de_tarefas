import os
import re
import shutil
import json
from datetime import date, datetime, time
from pathlib import Path
from typing import Optional
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request as UrlRequest, urlopen
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request as FastAPIRequest, UploadFile, status
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

SUPABASE_REF_PREFIX = "supabase://"


def env_text(name: str, default: str = "") -> str:
    return str(os.getenv(name, default) or "").strip()


def parse_boolean_env(name: str, default: bool = False) -> bool:
    raw = env_text(name)
    if not raw:
        return default
    return raw.lower() in {"1", "true", "yes", "sim", "on"}


def get_supabase_storage_config() -> Optional[dict]:
    url = env_text("SUPABASE_URL").rstrip("/")
    service_role_key = env_text("SUPABASE_SERVICE_ROLE_KEY")
    bucket = env_text("SUPABASE_STORAGE_BUCKET", "deliveries")
    prefix = env_text("SUPABASE_STORAGE_PREFIX", "deliveries").strip("/")
    use_public_url = parse_boolean_env("SUPABASE_STORAGE_PUBLIC", default=True)
    legacy_paths_enabled = parse_boolean_env("SUPABASE_STORAGE_LEGACY_PATHS", default=True)
    signed_url_ttl_raw = env_text("SUPABASE_STORAGE_SIGNED_URL_TTL", "3600")
    try:
        signed_url_ttl = max(60, int(signed_url_ttl_raw))
    except ValueError:
        signed_url_ttl = 3600

    if not url or not service_role_key or not bucket:
        return None

    return {
        "url": url,
        "service_role_key": service_role_key,
        "bucket": bucket,
        "prefix": prefix,
        "use_public_url": use_public_url,
        "legacy_paths_enabled": legacy_paths_enabled,
        "signed_url_ttl": signed_url_ttl,
    }


def parse_supabase_reference(value: Optional[str]) -> Optional[tuple[str, str]]:
    raw = str(value or "").strip()
    if not raw.startswith(SUPABASE_REF_PREFIX):
        return None

    payload = raw[len(SUPABASE_REF_PREFIX):]
    if "/" not in payload:
        return None
    bucket, object_path = payload.split("/", 1)
    bucket = bucket.strip()
    object_path = object_path.strip().lstrip("/")
    if not bucket or not object_path:
        return None
    return bucket, object_path


def build_supabase_reference(bucket: str, object_path: str) -> str:
    return f"{SUPABASE_REF_PREFIX}{bucket.strip()}/{object_path.strip().lstrip('/')}"


def supabase_storage_request(
    *,
    method: str,
    endpoint: str,
    service_role_key: str,
    body: Optional[bytes] = None,
    content_type: Optional[str] = None,
) -> tuple[int, str]:
    headers = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
    }
    if content_type:
        headers["Content-Type"] = content_type

    request_obj = UrlRequest(endpoint, method=method.upper(), data=body, headers=headers)
    try:
        with urlopen(request_obj, timeout=25) as response:
            payload = response.read().decode("utf-8", errors="ignore")
            return int(response.status), payload
    except HTTPError as exc:
        payload = exc.read().decode("utf-8", errors="ignore")
        return int(exc.code), payload
    except URLError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Falha de conexão com Supabase Storage: {exc.reason}",
        ) from exc


def build_supabase_signed_url(config: dict, bucket: str, object_path: str) -> str:
    endpoint = (
        f"{config['url']}/storage/v1/object/sign/"
        f"{quote(bucket, safe='')}/{quote(object_path, safe='/')}"
    )
    payload = json.dumps({"expiresIn": int(config["signed_url_ttl"])}).encode("utf-8")
    response_status, response_payload = supabase_storage_request(
        method="POST",
        endpoint=endpoint,
        service_role_key=config["service_role_key"],
        body=payload,
        content_type="application/json",
    )
    if response_status not in {200, 201}:
        return ""
    try:
        parsed = json.loads(response_payload or "{}")
    except json.JSONDecodeError:
        return ""

    signed_url = safe_text(parsed.get("signedURL") or parsed.get("signedUrl"))
    if not signed_url:
        return ""
    if signed_url.startswith("http://") or signed_url.startswith("https://"):
        return signed_url
    return f"{config['url']}{signed_url if signed_url.startswith('/') else f'/{signed_url}'}"


def build_supabase_object_url(config: dict, bucket: str, object_path: str) -> str:
    quoted_bucket = quote(bucket, safe="")
    quoted_path = quote(object_path, safe="/")
    if config["use_public_url"]:
        signed_url = build_supabase_signed_url(config, bucket, object_path)
        if signed_url:
            return signed_url
        return f"{config['url']}/storage/v1/object/public/{quoted_bucket}/{quoted_path}"
    return build_supabase_signed_url(config, bucket, object_path)


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


def unique_paths(paths: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for path in paths:
        clean_path = safe_text(path).lstrip("/")
        if not clean_path or clean_path in seen:
            continue
        seen.add(clean_path)
        result.append(clean_path)
    return result


def build_supabase_path_candidates(object_path: str, prefix: str = "") -> list[str]:
    clean_path = safe_text(object_path).lstrip("/")
    clean_prefix = safe_text(prefix).strip("/")
    file_name = Path(clean_path).name if clean_path else ""

    candidates = [clean_path]
    if file_name:
        candidates.append(file_name)

    if clean_prefix and clean_path:
        if not clean_path.startswith(f"{clean_prefix}/"):
            candidates.append(f"{clean_prefix}/{clean_path}")
    if clean_prefix and file_name:
        candidates.append(f"{clean_prefix}/{file_name}")

    # Fallback adicional para bases antigas que gravaram tudo na pasta deliveries/.
    if clean_path and not clean_path.startswith("deliveries/"):
        candidates.append(f"deliveries/{clean_path}")
    if file_name:
        candidates.append(f"deliveries/{file_name}")

    return unique_paths(candidates)


def supabase_object_exists(config: dict, bucket: str, object_path: str) -> bool:
    endpoint = (
        f"{config['url']}/storage/v1/object/info/"
        f"{quote(bucket, safe='')}/{quote(object_path, safe='/')}"
    )
    try:
        response_status, _ = supabase_storage_request(
            method="GET",
            endpoint=endpoint,
            service_role_key=config["service_role_key"],
        )
    except HTTPException:
        return False
    return response_status == 200


def find_supabase_object_by_file_name(config: dict, bucket: str, file_name: str) -> str:
    clean_file_name = safe_text(file_name)
    if not clean_file_name:
        return ""

    endpoint = f"{config['url']}/storage/v1/object/list/{quote(bucket, safe='')}"
    prefixes = unique_paths([
        safe_text(config.get("prefix", "")).strip("/"),
        "deliveries",
        "",
    ])

    for prefix in prefixes:
        payload = json.dumps(
            {
                "prefix": prefix,
                "limit": 100,
                "offset": 0,
                "search": clean_file_name,
                "sortBy": {"column": "name", "order": "asc"},
            }
        ).encode("utf-8")

        try:
            response_status, response_payload = supabase_storage_request(
                method="POST",
                endpoint=endpoint,
                service_role_key=config["service_role_key"],
                body=payload,
                content_type="application/json",
            )
        except HTTPException:
            continue

        if response_status not in {200, 201}:
            continue
        try:
            parsed_items = json.loads(response_payload or "[]")
        except json.JSONDecodeError:
            continue
        if not isinstance(parsed_items, list):
            continue

        for item in parsed_items:
            if not isinstance(item, dict):
                continue
            name = safe_text(item.get("name"))
            if not name:
                continue
            if Path(name).name.lower() != clean_file_name.lower():
                continue
            if prefix and not name.startswith(f"{prefix}/"):
                return f"{prefix}/{name}".lstrip("/")
            return name.lstrip("/")
    return ""


def build_upload_url(relative_path: str, request: Optional[FastAPIRequest] = None) -> str:
    raw_path = safe_text(relative_path)
    if not raw_path:
        return ""
    if raw_path.startswith("http://") or raw_path.startswith("https://"):
        return raw_path

    supabase_ref = parse_supabase_reference(relative_path)
    if supabase_ref:
        bucket, object_path = supabase_ref
        config = get_supabase_storage_config()
        if config:
            prefix = safe_text(config.get("prefix", "")).strip("/")
            candidates = build_supabase_path_candidates(object_path, prefix)
            for candidate in candidates:
                if not supabase_object_exists(config, bucket, candidate):
                    continue
                object_url = build_supabase_object_url(config, bucket, candidate)
                if object_url:
                    return object_url
            discovered = find_supabase_object_by_file_name(config, bucket, Path(object_path).name)
            if discovered and supabase_object_exists(config, bucket, discovered):
                object_url = build_supabase_object_url(config, bucket, discovered)
                if object_url:
                    return object_url
        return ""

    normalized = raw_path.lstrip("/")
    if normalized.startswith("uploads/"):
        normalized = normalized[len("uploads/"):]

    config = get_supabase_storage_config()
    if config and config.get("legacy_paths_enabled") and normalized:
        prefix = safe_text(config.get("prefix", "")).strip("/")
        candidates = build_supabase_path_candidates(normalized, prefix)

        for candidate in candidates:
            if not supabase_object_exists(config, config["bucket"], candidate):
                continue
            object_url = build_supabase_object_url(config, config["bucket"], candidate)
            if object_url:
                return object_url

        file_name = Path(normalized).name
        discovered = find_supabase_object_by_file_name(config, config["bucket"], file_name)
        if discovered and supabase_object_exists(config, config["bucket"], discovered):
            object_url = build_supabase_object_url(config, config["bucket"], discovered)
            if object_url:
                return object_url

    if not normalized:
        return ""
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

    supabase_config = get_supabase_storage_config()
    original_name = upload.filename or f"{prefix}.pdf"
    stem = sanitize_stem(Path(original_name).stem)
    target_name = f"{prefix}_{uuid4().hex}_{stem}.pdf"

    if supabase_config:
        object_path = f"{supabase_config['prefix']}/{target_name}".lstrip("/")
        endpoint = (
            f"{supabase_config['url']}/storage/v1/object/"
            f"{quote(supabase_config['bucket'], safe='')}/{quote(object_path, safe='/')}"
        )
        content_bytes = upload.file.read()
        response_status, response_payload = supabase_storage_request(
            method="POST",
            endpoint=endpoint,
            service_role_key=supabase_config["service_role_key"],
            body=content_bytes,
            content_type="application/pdf",
        )
        if response_status not in {200, 201}:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=(
                    "Falha ao enviar PDF para o Supabase Storage. "
                    f"Status {response_status}: {safe_text(response_payload)[:180]}"
                ),
            )
        return build_supabase_reference(supabase_config["bucket"], object_path)

    deliveries_dir = get_deliveries_dir()
    target_path = deliveries_dir / target_name
    with target_path.open("wb") as buffer:
        shutil.copyfileobj(upload.file, buffer)
    relative_path = Path("deliveries") / target_name
    return relative_path.as_posix()


def remove_upload(relative_path: Optional[str]) -> None:
    if not relative_path:
        return

    supabase_ref = parse_supabase_reference(relative_path)
    if supabase_ref:
        config = get_supabase_storage_config()
        if not config:
            return
        bucket, object_path = supabase_ref
        endpoint = (
            f"{config['url']}/storage/v1/object/"
            f"{quote(bucket, safe='')}/{quote(object_path, safe='/')}"
        )
        try:
            response_status, _ = supabase_storage_request(
                method="DELETE",
                endpoint=endpoint,
                service_role_key=config["service_role_key"],
            )
            if response_status not in {200, 204, 404}:
                # Não bloqueia o fluxo de exclusão de entrega por falha pontual no storage.
                return
        except HTTPException:
            return
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


def build_delivery_out(delivery: Delivery, request: Optional[FastAPIRequest] = None) -> DeliveryOut:
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
    request: FastAPIRequest,
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
    request: FastAPIRequest,
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
