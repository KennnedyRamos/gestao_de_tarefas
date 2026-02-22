import os
import tempfile
from pathlib import Path
from uuid import uuid4

import pytest

TEST_DB_FILE = Path(tempfile.gettempdir()) / f"test_equipments_sync_integration_{uuid4().hex}.db"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_FILE.as_posix()}"
os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("ALGORITHM", "HS256")
os.environ.setdefault("ACCESS_TOKEN_EXPIRE_MINUTES", "60")
os.environ.setdefault("DB_BOOTSTRAP_MODE", "off")

from app.core.security import get_password_hash  # noqa: E402
from app.database.base import Base  # noqa: E402
from app.database.session import SessionLocal, engine  # noqa: E402
from app.models.pickup_catalog import PickupCatalogClient, PickupCatalogInventoryItem  # noqa: E402
from app.models.user import User  # noqa: E402
from app.routes.equipments import (  # noqa: E402
    create_equipment,
    list_available_refrigerators_for_comodato,
    list_equipments,
    sync_refrigerators_allocation_status,
)
from app.schemas.equipment import EquipmentCreate  # noqa: E402


@pytest.fixture(autouse=True)
def reset_database():
    engine.dispose()
    if TEST_DB_FILE.exists():
        TEST_DB_FILE.unlink()
    Base.metadata.create_all(bind=engine)
    try:
        yield
    finally:
        Base.metadata.drop_all(bind=engine)
        engine.dispose()
        if TEST_DB_FILE.exists():
            TEST_DB_FILE.unlink()


@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_admin_user(db) -> User:
    suffix = uuid4().hex[:8]
    user = User(
        name="Admin Sync",
        email=f"admin.sync.{suffix}@test.local",
        password=get_password_hash("Admin@123"),
        role="admin",
        permissions="[]",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def seed_020220_allocation(db, tag_code: str, client_code: str = "1001") -> None:
    client = PickupCatalogClient(
        client_code=client_code,
        nome_fantasia="Cliente Teste 020220",
        setor="001",
    )
    db.add(client)
    db.flush()

    db.add(
        PickupCatalogInventoryItem(
            client_id=client.id,
            batch_id=None,
            description="VISA COOLER TESTE",
            item_type="refrigerador",
            open_quantity=1,
            rg=tag_code,
            comodato_number="CMD-0001",
            invoice_issue_date="2026-02-22",
        )
    )
    db.commit()


def equipment_by_id(items, equipment_id: int):
    for item in items:
        item_id = item.get("id") if isinstance(item, dict) else getattr(item, "id", 0)
        if int(item_id or 0) == int(equipment_id):
            return item
    return None


def test_sync_allocation_status_and_hide_from_available_requests(db_session):
    current_user = create_admin_user(db_session)
    token_seed = uuid4().hex[:10].upper()
    local_rg = f"RG-LOCAL-{token_seed}"
    local_tag = f"TAG-{token_seed}"

    created = create_equipment(
        payload=EquipmentCreate(
            category="refrigerador",
            model_name="VISA COOLER 330L",
            brand="BRAHMA",
            quantity=1,
            voltage="220v",
            rg_code=local_rg,
            tag_code=local_tag,
            status="disponivel",
            client_name=None,
            notes="Teste integracao sync",
        ),
        db=db_session,
        current_user=current_user,
    )
    equipment_id = int(created.id)

    available_before = list_available_refrigerators_for_comodato(
        limit=500,
        offset=0,
        q=None,
        db=db_session,
        current_user=current_user,
    )
    assert equipment_by_id(available_before, equipment_id) is not None

    # Registra na base 02.02.20 usando o mesmo valor da etiqueta do cadastro local.
    seed_020220_allocation(db_session, local_tag)

    available_after = list_available_refrigerators_for_comodato(
        limit=500,
        offset=0,
        q=None,
        db=db_session,
        current_user=current_user,
    )
    assert equipment_by_id(available_after, equipment_id) is None

    sync_payload = sync_refrigerators_allocation_status(
        db=db_session,
        current_user=current_user,
    )
    assert int(sync_payload.updated_count or 0) >= 1
    assert equipment_id in (sync_payload.updated_ids or [])

    listed_items = list_equipments(
        category=None,
        status_filter=None,
        client_name=None,
        q=local_rg,
        limit=20,
        offset=0,
        db=db_session,
        current_user=current_user,
    )
    row = equipment_by_id(listed_items, equipment_id)
    assert row is not None
    row_status = row.get("status") if isinstance(row, dict) else getattr(row, "status", "")
    assert str(row_status or "").lower() == "alocado"
