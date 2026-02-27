import logging
import os
import threading
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text
from app.routes import tasks, auth, users, routines, deliveries, pickups, pickup_catalog as pickup_catalog_routes, equipments
from app.database.base import Base
from app.database.session import engine, SessionLocal
from app.models import task, user, assignment, routine, delivery, pickup, pickup_catalog, equipment
from app.core.config import (
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    ADMIN_NAME,
    ADMIN_ROLE,
    CORS_ORIGINS,
    CORS_ORIGIN_REGEX,
    parse_cors_origins,
)
from app.core.security import get_password_hash
from app.models.user import User

logger = logging.getLogger("uvicorn.error")
app = FastAPI(title="Gestão de Tarefas")

cors_origins = parse_cors_origins(CORS_ORIGINS)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=CORS_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)


@app.middleware("http")
async def ensure_utf8_json_charset(request: Request, call_next):
    response = await call_next(request)
    content_type = str(response.headers.get("content-type", ""))
    if content_type.startswith("application/json") and "charset=" not in content_type.lower():
        response.headers["content-type"] = "application/json; charset=utf-8"
    return response

uploads_dir = Path(os.getenv("UPLOADS_DIR", Path(__file__).resolve().parents[1] / "uploads")).resolve()
uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")

def ensure_task_columns():
    inspector = inspect(engine)
    if "tasks" not in inspector.get_table_names():
        return
    columns = [col["name"] for col in inspector.get_columns("tasks")]
    with engine.begin() as conn:
        if "due_date" not in columns:
            conn.execute(text("ALTER TABLE tasks ADD COLUMN due_date DATE"))
        priority_added = False
        if "priority" not in columns:
            conn.execute(text("ALTER TABLE tasks ADD COLUMN priority VARCHAR DEFAULT 'media'"))
            priority_added = True
        if "labels" not in columns:
            conn.execute(text("ALTER TABLE tasks ADD COLUMN labels VARCHAR"))
        if "priority" in columns or priority_added:
            conn.execute(text("UPDATE tasks SET priority = 'media' WHERE priority IS NULL"))

def ensure_pickup_columns():
    inspector = inspect(engine)
    if "pickups" not in inspector.get_table_names():
        return
    columns = [col["name"] for col in inspector.get_columns("pickups")]
    with engine.begin() as conn:
        if "photo_path" not in columns:
            conn.execute(text("ALTER TABLE pickups ADD COLUMN photo_path VARCHAR"))

def ensure_user_permissions_column():
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return
    columns = [col["name"] for col in inspector.get_columns("users")]
    with engine.begin() as conn:
        if "permissions" not in columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN permissions TEXT"))
        conn.execute(
            text(
                "UPDATE users "
                "SET permissions = '[]' "
                "WHERE permissions IS NULL OR TRIM(permissions) = ''"
            )
        )


def ensure_pickup_catalog_columns():
    inspector = inspect(engine)
    if "pickup_catalog_inventory_items" not in inspector.get_table_names():
        return
    columns = [col["name"] for col in inspector.get_columns("pickup_catalog_inventory_items")]
    with engine.begin() as conn:
        if "comodato_number" not in columns:
            conn.execute(text("ALTER TABLE pickup_catalog_inventory_items ADD COLUMN comodato_number VARCHAR"))
        if "invoice_issue_date" not in columns:
            conn.execute(text("ALTER TABLE pickup_catalog_inventory_items ADD COLUMN invoice_issue_date VARCHAR"))


def ensure_pickup_catalog_item_type_overrides():
    inspector = inspect(engine)
    if "pickup_catalog_inventory_items" not in inspector.get_table_names():
        return

    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE pickup_catalog_inventory_items "
                "SET item_type = 'jogo_mesa' "
                "WHERE (LOWER(COALESCE(description, '')) LIKE '%cj de mesa plastica%' "
                "OR LOWER(COALESCE(description, '')) LIKE '%mesa jogos%' "
                "OR LOWER(COALESCE(description, '')) LIKE '%jogos mesa%' "
                "OR LOWER(COALESCE(description, '')) LIKE '%jogo de mesa%' "
                "OR LOWER(COALESCE(description, '')) LIKE '%jogos de mesa%') "
                "AND LOWER(TRIM(COALESCE(item_type, ''))) <> 'jogo_mesa'"
            )
        )
        conn.execute(
            text(
                "UPDATE pickup_catalog_inventory_items "
                "SET item_type = 'caixa_termica' "
                "WHERE LOWER(COALESCE(description, '')) LIKE '%caixa termica%' "
                "AND LOWER(TRIM(COALESCE(item_type, ''))) <> 'caixa_termica'"
            )
        )
        conn.execute(
            text(
                "UPDATE pickup_catalog_inventory_items "
                "SET item_type = 'refrigerador' "
                "WHERE LOWER(COALESCE(description, '')) LIKE '%visa cooler%' "
                "AND LOWER(TRIM(COALESCE(item_type, ''))) <> 'refrigerador'"
            )
        )


def ensure_pickup_catalog_order_columns():
    inspector = inspect(engine)
    if "pickup_catalog_orders" not in inspector.get_table_names():
        return
    columns = [col["name"] for col in inspector.get_columns("pickup_catalog_orders")]
    with engine.begin() as conn:
        if "status" not in columns:
            conn.execute(
                text(
                    "ALTER TABLE pickup_catalog_orders "
                    "ADD COLUMN status VARCHAR DEFAULT 'pendente'"
                )
            )
        if "status_note" not in columns:
            conn.execute(text("ALTER TABLE pickup_catalog_orders ADD COLUMN status_note TEXT"))
        if "status_updated_at" not in columns:
            conn.execute(text("ALTER TABLE pickup_catalog_orders ADD COLUMN status_updated_at TIMESTAMP"))
        if "status_updated_by" not in columns:
            conn.execute(text("ALTER TABLE pickup_catalog_orders ADD COLUMN status_updated_by VARCHAR"))
        if "email_request_status" not in columns:
            conn.execute(text("ALTER TABLE pickup_catalog_orders ADD COLUMN email_request_status VARCHAR DEFAULT ''"))
        if "email_request_updated_at" not in columns:
            conn.execute(text("ALTER TABLE pickup_catalog_orders ADD COLUMN email_request_updated_at TIMESTAMP"))
        if "email_request_updated_by" not in columns:
            conn.execute(text("ALTER TABLE pickup_catalog_orders ADD COLUMN email_request_updated_by VARCHAR"))
        conn.execute(
            text(
                "UPDATE pickup_catalog_orders "
                "SET status = LOWER(TRIM(status)) "
                "WHERE status IS NOT NULL "
                "AND TRIM(status) <> '' "
                "AND status <> LOWER(TRIM(status))"
            )
        )
        conn.execute(
            text(
                "UPDATE pickup_catalog_orders "
                "SET status = 'pendente' "
                "WHERE status IS NULL "
                "OR TRIM(status) = '' "
                "OR status NOT IN ('pendente', 'concluida', 'cancelada')"
            )
        )
        conn.execute(
            text(
                "UPDATE pickup_catalog_orders "
                "SET status_note = '' "
                "WHERE status_note IS NULL"
            )
        )
        conn.execute(
            text(
                "UPDATE pickup_catalog_orders "
                "SET status_updated_by = '' "
                "WHERE status_updated_by IS NULL"
            )
        )
        conn.execute(
            text(
                "UPDATE pickup_catalog_orders "
                "SET email_request_status = '' "
                "WHERE email_request_status IS NULL"
            )
        )
        conn.execute(
            text(
                "UPDATE pickup_catalog_orders "
                "SET email_request_updated_by = '' "
                "WHERE email_request_updated_by IS NULL"
            )
        )
        conn.execute(
            text(
                "UPDATE pickup_catalog_orders "
                "SET email_request_status = 'pending' "
                "WHERE status = 'concluida' AND TRIM(COALESCE(email_request_status, '')) = ''"
            )
        )
        conn.execute(
            text(
                "UPDATE pickup_catalog_orders "
                "SET email_request_status = '' "
                "WHERE status <> 'concluida' AND TRIM(COALESCE(email_request_status, '')) <> ''"
            )
        )


def ensure_pickup_catalog_order_item_columns():
    inspector = inspect(engine)
    if "pickup_catalog_order_items" not in inspector.get_table_names():
        return
    columns = [col["name"] for col in inspector.get_columns("pickup_catalog_order_items")]
    with engine.begin() as conn:
        if "comodato_number" not in columns:
            conn.execute(text("ALTER TABLE pickup_catalog_order_items ADD COLUMN comodato_number VARCHAR"))
        if "refrigerator_condition" not in columns:
            conn.execute(text("ALTER TABLE pickup_catalog_order_items ADD COLUMN refrigerator_condition VARCHAR"))
        conn.execute(
            text(
                "UPDATE pickup_catalog_order_items "
                "SET comodato_number = '' "
                "WHERE comodato_number IS NULL"
            )
        )
        conn.execute(
            text(
                "UPDATE pickup_catalog_order_items "
                "SET refrigerator_condition = '' "
                "WHERE refrigerator_condition IS NULL"
            )
        )


def ensure_equipment_columns():
    inspector = inspect(engine)
    if "equipments" not in inspector.get_table_names():
        return
    columns = [col["name"] for col in inspector.get_columns("equipments")]
    with engine.begin() as conn:
        if "brand" not in columns:
            conn.execute(text("ALTER TABLE equipments ADD COLUMN brand VARCHAR DEFAULT ''"))
        conn.execute(
            text(
                "UPDATE equipments "
                "SET brand = '' "
                "WHERE brand IS NULL"
            )
        )
        if "quantity" not in columns:
            conn.execute(text("ALTER TABLE equipments ADD COLUMN quantity INTEGER DEFAULT 1"))
        conn.execute(
            text(
                "UPDATE equipments "
                "SET quantity = 1 "
                "WHERE quantity IS NULL OR quantity < 1"
            )
        )
        if "voltage" not in columns:
            conn.execute(text("ALTER TABLE equipments ADD COLUMN voltage VARCHAR DEFAULT ''"))
        conn.execute(
            text(
                "UPDATE equipments "
                "SET voltage = '' "
                "WHERE voltage IS NULL"
            )
        )
        # Permite cadastrar equipamentos não refrigeradores sem RG/Etiqueta.
        try:
            conn.execute(text("ALTER TABLE equipments ALTER COLUMN rg_code DROP NOT NULL"))
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE equipments ALTER COLUMN tag_code DROP NOT NULL"))
        except Exception:
            pass


def _has_index_with_columns(indexes: list[dict], columns: list[str]) -> bool:
    target = tuple(columns)
    for index in indexes:
        if tuple(index.get("column_names") or []) == target:
            return True
    return False


def ensure_pickup_catalog_indexes():
    inspector = inspect(engine)
    table_names = inspector.get_table_names()

    with engine.begin() as conn:
        if "pickup_catalog_orders" in table_names:
            order_indexes = inspector.get_indexes("pickup_catalog_orders")

            if not _has_index_with_columns(order_indexes, ["created_at"]):
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS "
                        "idx_pickup_catalog_orders_created_at "
                        "ON pickup_catalog_orders (created_at)"
                    )
                )
            if not _has_index_with_columns(order_indexes, ["client_code"]):
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS "
                        "idx_pickup_catalog_orders_client_code "
                        "ON pickup_catalog_orders (client_code)"
                    )
                )
            if not _has_index_with_columns(order_indexes, ["withdrawal_date", "status"]):
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS "
                        "idx_pickup_catalog_orders_withdrawal_status "
                        "ON pickup_catalog_orders (withdrawal_date, status)"
                    )
                )
            if not _has_index_with_columns(order_indexes, ["status", "created_at"]):
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS "
                        "idx_pickup_catalog_orders_status_created_at "
                        "ON pickup_catalog_orders (status, created_at)"
                    )
                )

        if "pickup_catalog_inventory_items" in table_names:
            inventory_indexes = inspector.get_indexes("pickup_catalog_inventory_items")

            if not _has_index_with_columns(inventory_indexes, ["client_id"]):
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS "
                        "idx_pickup_catalog_inventory_items_client_id "
                        "ON pickup_catalog_inventory_items (client_id)"
                    )
                )
            if not _has_index_with_columns(inventory_indexes, ["batch_id"]):
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS "
                        "idx_pickup_catalog_inventory_items_batch_id "
                        "ON pickup_catalog_inventory_items (batch_id)"
                    )
                )
            if not _has_index_with_columns(inventory_indexes, ["client_id", "batch_id"]):
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS "
                        "idx_pickup_catalog_inventory_items_client_batch "
                        "ON pickup_catalog_inventory_items (client_id, batch_id)"
                    )
                )


def ensure_admin_user():
    if not ADMIN_EMAIL or not ADMIN_PASSWORD:
        return
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == ADMIN_EMAIL).first()
        if existing:
            updated = False
            if ADMIN_NAME and existing.name != ADMIN_NAME:
                existing.name = ADMIN_NAME
                updated = True
            if ADMIN_ROLE and existing.role != ADMIN_ROLE:
                existing.role = ADMIN_ROLE
                updated = True
            if updated:
                db.commit()
            return
        admin = User(
            name=ADMIN_NAME,
            email=ADMIN_EMAIL,
            password=get_password_hash(ADMIN_PASSWORD),
            role=ADMIN_ROLE
        )
        db.add(admin)
        db.commit()
    finally:
        db.close()


def run_db_bootstrap() -> None:
    steps = [
        ("create_all", lambda: Base.metadata.create_all(bind=engine)),
        ("ensure_task_columns", ensure_task_columns),
        ("ensure_pickup_columns", ensure_pickup_columns),
        ("ensure_user_permissions_column", ensure_user_permissions_column),
        ("ensure_pickup_catalog_columns", ensure_pickup_catalog_columns),
        ("ensure_pickup_catalog_item_type_overrides", ensure_pickup_catalog_item_type_overrides),
        ("ensure_pickup_catalog_order_columns", ensure_pickup_catalog_order_columns),
        ("ensure_pickup_catalog_order_item_columns", ensure_pickup_catalog_order_item_columns),
        ("ensure_equipment_columns", ensure_equipment_columns),
        ("ensure_pickup_catalog_indexes", ensure_pickup_catalog_indexes),
        ("ensure_admin_user", ensure_admin_user),
    ]
    for step_name, step_fn in steps:
        try:
            step_fn()
        except Exception:  # pragma: no cover - startup hardening
            logger.exception("Falha ao executar bootstrap do banco (etapa: %s)", step_name)


_bootstrap_lock = threading.Lock()
_bootstrap_started = False


def trigger_db_bootstrap() -> None:
    global _bootstrap_started
    with _bootstrap_lock:
        if _bootstrap_started:
            return
        _bootstrap_started = True

    mode = str(os.getenv("DB_BOOTSTRAP_MODE", "background") or "background").strip().lower()
    if mode == "off":
        logger.info("DB bootstrap desativado (DB_BOOTSTRAP_MODE=off).")
        return
    if mode == "sync":
        logger.info("Executando DB bootstrap em modo sincronizado.")
        run_db_bootstrap()
        return

    logger.info("Executando DB bootstrap em background.")
    threading.Thread(target=run_db_bootstrap, daemon=True, name="db-bootstrap").start()


app.include_router(tasks.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(routines.router)
app.include_router(deliveries.router)
app.include_router(pickups.router)
app.include_router(pickup_catalog_routes.router)
app.include_router(equipments.router)

@app.get("/")
def root():
    return {"message": "API rodando corretamente!"}


@app.get("/health")
def healthcheck():
    return {"status": "ok"}


@app.get("/health/db")
def healthcheck_db():
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return {"status": "ok"}


@app.on_event("startup")
def startup_event():
    trigger_db_bootstrap()




