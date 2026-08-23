import os
import re
from datetime import date, datetime, time
from pathlib import Path
from typing import Optional
from urllib.error import HTTPError, URLError
from urllib.parse import quote, unquote, urlsplit
from urllib.request import Request as UrlRequest, urlopen
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request as FastAPIRequest, UploadFile, status
from fastapi.responses import FileResponse, Response
from sqlalchemy import or_
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
get_deliveries_viewer = require_permission("deliveries.manage")
get_deliveries_dashboard_viewer = require_any_permission("deliveries.manage", "comodatos.view")

SUPABASE_REF_PREFIX = "supabase://"
MAX_PDF_UPLOAD_BYTES = 10 * 1024 * 1024
DELIVERY_FILE_KINDS = {
    "nf": "pdf_one_path",
    "contract": "pdf_two_path",
    "contrato": "pdf_two_path",
}


def env_text(name: str, default: str = "") -> str:
    return str(os.getenv(name, default) or "").strip()


def parse_boolean_env(name: str, default: bool = False) -> bool:
    raw = env_text(name)
    if not raw:
        return default
    return raw.lower() in {"1", "true", "yes", "sim", "on"}


def get_delivery_storage_backend() -> str:
    backend = env_text("DELIVERY_STORAGE_BACKEND", "auto").lower()
    if backend not in {"auto", "local", "supabase"}:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="DELIVERY_STORAGE_BACKEND inválido. Use auto, local ou supabase.",
        )
    return backend


def get_supabase_storage_config() -> Optional[dict]:
    url = env_text("SUPABASE_URL").rstrip("/")
    service_role_key = env_text("SUPABASE_SERVICE_ROLE_KEY")
    bucket = env_text("SUPABASE_STORAGE_BUCKET", "deliveries")
    prefix = env_text("SUPABASE_STORAGE_PREFIX", "deliveries").strip("/")
    legacy_paths_enabled = parse_boolean_env("SUPABASE_STORAGE_LEGACY_PATHS", default=True)

    if not url or not service_role_key or not bucket:
        return None

    return {
        "url": url,
        "service_role_key": service_role_key,
        "bucket": bucket,
        "prefix": prefix,
        "legacy_paths_enabled": legacy_paths_enabled,
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


def parse_supabase_object_url(value: str, config: dict) -> Optional[tuple[str, str]]:
    parsed = urlsplit(safe_text(value))
    configured = urlsplit(config["url"])
    if (
        parsed.scheme not in {"http", "https"}
        or parsed.hostname != configured.hostname
        or parsed.port != configured.port
    ):
        return None

    path = unquote(parsed.path)
    prefixes = (
        "/storage/v1/object/public/",
        "/storage/v1/object/sign/",
        "/storage/v1/object/authenticated/",
        "/storage/v1/object/",
    )
    payload = next((path[len(prefix):] for prefix in prefixes if path.startswith(prefix)), "")
    if "/" not in payload:
        return None
    bucket, object_path = payload.split("/", 1)
    if not bucket or not object_path:
        return None
    return bucket, object_path


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


def supabase_storage_request_bytes(
    *,
    endpoint: str,
    service_role_key: str,
) -> tuple[int, bytes]:
    headers = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
    }
    request_obj = UrlRequest(endpoint, method="GET", headers=headers)
    try:
        with urlopen(request_obj, timeout=25) as response:
            content_bytes = response.read(MAX_PDF_UPLOAD_BYTES + 1)
            if len(content_bytes) > MAX_PDF_UPLOAD_BYTES:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail="O PDF armazenado excede o limite de 10 MB.",
                )
            return int(response.status), content_bytes
    except HTTPError as exc:
        return int(exc.code), exc.read()
    except URLError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Falha de conexão com Supabase Storage: {exc.reason}",
        ) from exc


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


def read_upload_bytes(upload: UploadFile, max_bytes: int, field_label: str) -> bytes:
    content_bytes = upload.file.read(max_bytes + 1)
    if len(content_bytes) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"{field_label} excede o limite de {max_bytes // (1024 * 1024)} MB.",
        )
    return content_bytes


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


def download_supabase_object(config: dict, bucket: str, object_path: str) -> tuple[int, bytes]:
    endpoint = (
        f"{config['url']}/storage/v1/object/authenticated/"
        f"{quote(bucket, safe='')}/{quote(object_path, safe='/')}"
    )
    return supabase_storage_request_bytes(
        endpoint=endpoint,
        service_role_key=config["service_role_key"],
    )


def build_pdf_response(content_bytes: bytes, filename: str, *, download: bool = False) -> Response:
    disposition = "attachment" if download else "inline"
    safe_filename = quote(Path(filename).name or "documento.pdf", safe="")
    return Response(
        content=content_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"{disposition}; filename*=UTF-8''{safe_filename}",
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


def serve_delivery_reference(relative_path: str, *, download: bool = False):
    raw_path = safe_text(relative_path)
    if not raw_path:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")

    supabase_ref = parse_supabase_reference(raw_path)
    if supabase_ref:
        config = get_supabase_storage_config()
        if not config:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Armazenamento de documentos não configurado.",
            )
        bucket, object_path = supabase_ref
        prefix = safe_text(config.get("prefix", "")).strip("/")
        candidates = build_supabase_path_candidates(object_path, prefix)
        for candidate in candidates:
            response_status, content_bytes = download_supabase_object(config, bucket, candidate)
            if response_status == 200:
                return build_pdf_response(content_bytes, Path(candidate).name, download=download)
            if response_status not in {400, 404}:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Falha ao recuperar o PDF no armazenamento.",
                )
        raise HTTPException(status_code=404, detail="PDF não encontrado no armazenamento.")

    if raw_path.startswith("http://") or raw_path.startswith("https://"):
        config = get_supabase_storage_config()
        supabase_url_ref = parse_supabase_object_url(raw_path, config) if config else None
        if not supabase_url_ref:
            raise HTTPException(status_code=404, detail="Referência antiga de PDF não suportada.")
        bucket, object_path = supabase_url_ref
        return serve_delivery_reference(
            build_supabase_reference(bucket, object_path),
            download=download,
        )

    normalized = raw_path.lstrip("/").replace("\\", "/")
    if normalized.startswith("uploads/"):
        normalized = normalized[len("uploads/"):]

    config = get_supabase_storage_config()
    if config and config.get("legacy_paths_enabled") and normalized:
        prefix = safe_text(config.get("prefix", "")).strip("/")
        for candidate in build_supabase_path_candidates(normalized, prefix):
            response_status, content_bytes = download_supabase_object(config, config["bucket"], candidate)
            if response_status == 200:
                return build_pdf_response(content_bytes, Path(candidate).name, download=download)

    base_dir = get_uploads_base_dir().resolve()
    deliveries_dir = get_deliveries_dir().resolve()
    target_path = (base_dir / normalized).resolve()
    try:
        target_path.relative_to(deliveries_dir)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.") from exc
    if not target_path.exists() or not target_path.is_file():
        raise HTTPException(status_code=404, detail="PDF não encontrado. O arquivo pode ter sido removido do servidor.")

    return FileResponse(
        path=str(target_path),
        media_type="application/pdf",
        filename=target_path.name,
        content_disposition_type="attachment" if download else "inline",
        headers={
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/files/open", name="open_delivery_file")
def open_delivery_file(
    path: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_deliveries_manager),
):
    raw_path = safe_text(path)
    if not raw_path:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")
    is_registered = (
        db.query(Delivery.id)
        .filter(or_(Delivery.pdf_one_path == raw_path, Delivery.pdf_two_path == raw_path))
        .first()
    )
    if not is_registered:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")
    return serve_delivery_reference(raw_path)


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
    content_type = (upload.content_type or "").lower()
    if content_type and content_type not in {"application/pdf", "application/x-pdf"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_label} precisa ser um PDF válido."
        )


def save_pdf(upload: UploadFile, prefix: str, label: str) -> str:
    ensure_pdf(upload, label)
    content_bytes = read_upload_bytes(upload, MAX_PDF_UPLOAD_BYTES, label)
    if not content_bytes.startswith(b"%PDF-"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{label} precisa ser um PDF válido."
        )

    storage_backend = get_delivery_storage_backend()
    supabase_config = None if storage_backend == "local" else get_supabase_storage_config()
    if storage_backend == "supabase" and not supabase_config:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Armazenamento de documentos não configurado. "
                "Defina SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e SUPABASE_STORAGE_BUCKET."
            ),
        )
    original_name = upload.filename or f"{prefix}.pdf"
    stem = sanitize_stem(Path(original_name).stem)
    target_name = f"{prefix}_{uuid4().hex}_{stem}.pdf"

    if supabase_config:
        object_path = f"{supabase_config['prefix']}/{target_name}".lstrip("/")
        endpoint = (
            f"{supabase_config['url']}/storage/v1/object/"
            f"{quote(supabase_config['bucket'], safe='')}/{quote(object_path, safe='/')}"
        )
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
        buffer.write(content_bytes)
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
                # Nao bloqueia o fluxo de exclusao de entrega por falha pontual no storage.
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
        client_code=safe_text(getattr(delivery, "client_code", "")),
        fantasy_name=safe_text(getattr(delivery, "fantasy_name", "")),
        description=delivery.description,
        delivery_date=delivery.delivery_date,
        delivery_time=delivery.delivery_time,
        pdf_one_url=f"/deliveries/{delivery.id}/files/nf",
        pdf_two_url=f"/deliveries/{delivery.id}/files/contract",
        created_at=delivery.created_at
    )


@router.get("/{delivery_id}/files/{file_kind}", name="open_delivery_attachment")
def open_delivery_attachment(
    delivery_id: int,
    file_kind: str,
    download: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_deliveries_manager),
):
    field_name = DELIVERY_FILE_KINDS.get(safe_text(file_kind).lower())
    if not field_name:
        raise HTTPException(status_code=404, detail="Tipo de documento não encontrado.")
    delivery = db.query(Delivery).filter(Delivery.id == delivery_id).first()
    if not delivery:
        raise HTTPException(status_code=404, detail="Entrega não encontrada.")
    return serve_delivery_reference(getattr(delivery, field_name), download=download)


@router.get("/dashboard", response_model=list[DeliveryOut])
def list_deliveries_dashboard(
    request: FastAPIRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_deliveries_dashboard_viewer)
):
    rows = (
        db.query(Delivery)
        .order_by(Delivery.delivery_date.desc(), Delivery.delivery_time.desc(), Delivery.id.desc())
        .all()
    )
    return [build_delivery_out(row, request=request) for row in rows]


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
    client_code: str = Form(""),
    fantasy_name: str = Form(""),
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
            client_code=safe_text(client_code),
            fantasy_name=safe_text(fantasy_name),
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

