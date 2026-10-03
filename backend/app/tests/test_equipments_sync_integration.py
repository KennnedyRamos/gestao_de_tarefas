import json
import os
import tempfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import jwt
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from starlette.middleware.cors import CORSMiddleware

TEST_DB_FILE = Path(tempfile.gettempdir()) / f"test_equipments_sync_integration_{uuid4().hex}.db"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_FILE.as_posix()}"
os.environ.setdefault("SECRET_KEY", "test-secret-key-at-least-32-bytes-long")
os.environ.setdefault("ALGORITHM", "HS256")
os.environ.setdefault("ACCESS_TOKEN_EXPIRE_MINUTES", "60")
os.environ.setdefault("DB_BOOTSTRAP_MODE", "off")

from app.core.auth import get_current_user, require_any_permission  # noqa: E402
from app.core.config import (  # noqa: E402
    ALGORITHM,
    CORS_ORIGINS,
    SECRET_KEY,
    parse_cors_origins,
    validate_security_settings,
)
from app.core.permissions import ALLOWED_PERMISSIONS, serialize_permissions  # noqa: E402
from app.core.security import (  # noqa: E402
    create_access_token,
    get_password_hash,
    validate_password,
    verify_password,
)
from app.database.base import Base  # noqa: E402
from app.database.session import SessionLocal, engine  # noqa: E402
import app.main as app_main  # noqa: E402
from app.main import app  # noqa: E402
from app.routes.auth import (  # noqa: E402
    LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
    _login_rate_limit_key,
    _login_rate_limit_settings,
    _consume_login_attempt,
)
from app.models.equipment import Equipment  # noqa: E402
from app.models.assignment import Assignment  # noqa: E402
from app.models.pickup_catalog import (  # noqa: E402
    PickupCatalogClient,
    PickupCatalogInventoryItem,
    PickupCatalogOrder,
    PickupCatalogOrderItem,
)
from app.models.delivery import Delivery  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.task import Task  # noqa: E402
from app.routes.deliveries import (  # noqa: E402
    build_delivery_out,
    open_delivery_attachment,
    parse_supabase_object_url,
)
from app.routes.pickup_catalog import list_orders, update_order_status  # noqa: E402
from app.routes.equipments import (  # noqa: E402
    create_equipment,
    list_available_refrigerators_for_comodato,
    list_equipments,
    list_inventory_materials,
    list_non_allocated_refrigerators,
    sync_refrigerators_allocation_status,
)
from app.schemas.equipment import EquipmentCreate  # noqa: E402
from app.schemas.pickup_catalog import PickupCatalogOrderStatusUpdateIn  # noqa: E402
from app.schemas.user import UserCreate, UserLogin, UserPasswordReset  # noqa: E402


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


def create_assistant_user(db, *, name: str, permissions: list[str] | None = None) -> User:
    suffix = uuid4().hex[:8]
    user = User(
        name=name,
        email=f"{name.lower().replace(' ', '.')}.{suffix}@test.local",
        password=get_password_hash("Assistant@123"),
        role="assistente",
        permissions=serialize_permissions(permissions or []),
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


def test_jwt_round_trip_and_invalid_subject(db_session):
    user = create_admin_user(db_session)
    token = create_access_token({"sub": str(user.id)})

    assert get_current_user(token=token, db=db_session).id == user.id

    invalid_token = create_access_token({"sub": "not-a-number"})
    with pytest.raises(HTTPException) as exc_info:
        get_current_user(token=invalid_token, db=db_session)
    assert exc_info.value.status_code == 401


def _encode_test_token(payload: dict, *, key: str = SECRET_KEY, algorithm: str = ALGORITHM) -> str:
    return jwt.encode(payload, key, algorithm=algorithm)


def test_auth_requires_a_bearer_token_and_keeps_health_endpoints_public():
    with TestClient(app) as client:
        assert client.get("/auth/me").status_code == 401
        assert client.get("/auth/me", headers={"Authorization": "Bearer "}).status_code == 401
        assert client.get("/health").status_code == 200
        assert client.get("/health/db").status_code == 200


@pytest.mark.parametrize("token", ["not-a-jwt", "random-token-value"])
def test_auth_rejects_malformed_and_random_tokens(token):
    with TestClient(app) as client:
        response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert response.json()["detail"] == "Credenciais inválidas"


def test_auth_rejects_expired_token(db_session):
    user = create_admin_user(db_session)
    token = _encode_test_token({
        "sub": str(user.id),
        "exp": datetime.now(timezone.utc) - timedelta(minutes=1),
    })

    with TestClient(app) as client:
        response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401
    assert response.json()["detail"] == "Credenciais inválidas"


def test_auth_rejects_invalid_signature(db_session):
    user = create_admin_user(db_session)
    token = _encode_test_token(
        {
            "sub": str(user.id),
            "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
        },
        key="different-test-signing-key-with-enough-entropy-for-test-only",
    )

    with TestClient(app) as client:
        response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401
    assert response.json()["detail"] == "Credenciais inválidas"


@pytest.mark.parametrize("subject", [None, "", "not-a-number", "1.5", True, 123, "0"])
def test_auth_rejects_missing_or_invalid_subject(subject):
    payload = {"exp": datetime.now(timezone.utc) + timedelta(minutes=5)}
    if subject is not None:
        payload["sub"] = subject
    token = _encode_test_token(payload)

    with TestClient(app) as client:
        response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401
    assert response.json()["detail"] == "Credenciais inválidas"


def test_auth_rejects_token_for_nonexistent_user():
    token = create_access_token({"sub": "99999999", "token_version": 0})

    with TestClient(app) as client:
        response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401
    assert response.json()["detail"] == "Credenciais inválidas"


def test_auth_rejects_jwt_signed_with_unauthorized_algorithm(db_session):
    user = create_admin_user(db_session)
    token = _encode_test_token(
        {
            "sub": str(user.id),
            "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
        },
        key="test-signing-key-with-more-than-forty-eight-bytes-for-hmac",
        algorithm="HS384" if ALGORITHM != "HS384" else "HS512",
    )

    with TestClient(app) as client:
        response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401
    assert response.json()["detail"] == "Credenciais inválidas"


def test_auth_rejects_jwt_without_expiration(db_session):
    user = create_admin_user(db_session)
    token = _encode_test_token({"sub": str(user.id)})

    with TestClient(app) as client:
        response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401
    assert response.json()["detail"] == "Credenciais inválidas"


def test_auth_returns_database_user_for_a_valid_signed_token(db_session):
    user = User(
        name="Assistant JWT",
        email="assistant.jwt@test.local",
        password=get_password_hash("Assistant@123"),
        role="assistente",
        permissions='["tasks.manage"]',
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    token = create_access_token({
        "sub": str(user.id),
        "token_version": user.token_version,
        "role": "admin",
        "permissions": ["users.manage"],
    })

    with TestClient(app) as client:
        response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json()["role"] == "assistente"
    assert response.json()["permissions"] == ["tasks.manage"]


def test_admin_route_allows_admin_and_rejects_assistant_even_with_spoofed_admin_claims(db_session):
    admin = create_admin_user(db_session)
    assistant = create_assistant_user(
        db_session,
        name="Assistant With Permissions",
        permissions=sorted(ALLOWED_PERMISSIONS),
    )
    admin_token = create_access_token({"sub": str(admin.id), "token_version": admin.token_version})
    assistant_token = create_access_token({
        "sub": str(assistant.id),
        "token_version": assistant.token_version,
        "role": "admin",
        "permissions": sorted(ALLOWED_PERMISSIONS),
    })

    with TestClient(app) as client:
        admin_response = client.get(
            "/users/permissions",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assistant_response = client.get(
            "/users/permissions",
            headers={"Authorization": f"Bearer {assistant_token}"},
        )

    assert admin_response.status_code == 200
    assert assistant_response.status_code == 403


def test_empty_any_permission_guard_fails_closed():
    assistant = User(
        id=1,
        name="Assistant",
        email="assistant.guard@test.local",
        password="not-used",
        role="assistente",
    )
    dependency = require_any_permission()

    with pytest.raises(HTTPException) as exc_info:
        dependency(current_user=assistant)

    assert exc_info.value.status_code == 403


def test_user_without_permission_is_forbidden_from_routines(db_session):
    assistant = create_assistant_user(db_session, name="Assistant Without Permission")
    token = create_access_token({"sub": str(assistant.id), "token_version": assistant.token_version})

    with TestClient(app) as client:
        response = client.get("/routines/", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 403


def test_revoked_permission_blocks_the_same_existing_jwt(db_session):
    assistant = create_assistant_user(
        db_session,
        name="Assistant Routine Manager",
        permissions=["routines.manage"],
    )
    token = create_access_token({
        "sub": str(assistant.id),
        "token_version": assistant.token_version,
        "permissions": ["routines.manage"],
    })
    headers = {"Authorization": f"Bearer {token}"}

    with TestClient(app) as client:
        assert client.get("/routines/", headers=headers).status_code == 200
        assistant.permissions = serialize_permissions([])
        db_session.commit()
        response = client.get("/routines/", headers=headers)

    assert response.status_code == 403


def test_task_ownership_allows_only_assigned_user_to_read_and_complete(db_session):
    user_a = create_assistant_user(db_session, name="Task Owner A")
    user_b = create_assistant_user(db_session, name="Task Owner B")
    task_a = Task(title="Task belonging to A", completed=False)
    task_b = Task(title="Task belonging to B", completed=False)
    db_session.add_all([task_a, task_b])
    db_session.flush()
    db_session.add_all([
        Assignment(task_id=task_a.id, user_id=user_a.id),
        Assignment(task_id=task_b.id, user_id=user_b.id),
    ])
    db_session.commit()
    token_a = create_access_token({"sub": str(user_a.id), "token_version": user_a.token_version})
    headers = {"Authorization": f"Bearer {token_a}"}

    with TestClient(app) as client:
        own_read = client.get(f"/tasks/{task_a.id}", headers=headers)
        other_read = client.get(f"/tasks/{task_b.id}", headers=headers)
        own_update = client.put(
            f"/tasks/{task_a.id}",
            json={"completed": True},
            headers=headers,
        )
        other_update = client.put(
            f"/tasks/{task_b.id}",
            json={"completed": True},
            headers=headers,
        )

    assert own_read.status_code == 200
    assert other_read.status_code == 403
    assert own_update.status_code == 200
    assert other_update.status_code == 403
    db_session.refresh(task_a)
    db_session.refresh(task_b)
    assert task_a.completed is True
    assert task_b.completed is False


def test_bootstrap_adds_token_version_to_legacy_users_table(monkeypatch):
    legacy_engine = create_engine("sqlite:///:memory:")
    with legacy_engine.begin() as connection:
        connection.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY)"))
        connection.execute(text("INSERT INTO users (id) VALUES (1)"))

    monkeypatch.setattr(app_main, "engine", legacy_engine)
    try:
        app_main.ensure_user_token_version_column()
        with legacy_engine.connect() as connection:
            token_version = connection.execute(
                text("SELECT token_version FROM users WHERE id = 1")
            ).scalar_one()
        assert token_version == 0
    finally:
        legacy_engine.dispose()


def test_login_rate_limit_is_shared_and_expires_after_window(db_session):
    rate_limit_key = "a" * 64
    now_ts = 1_800_000_000

    for _ in range(LOGIN_RATE_LIMIT_MAX_ATTEMPTS):
        assert not _consume_login_attempt(db_session, rate_limit_key, now_ts=now_ts)
    assert _consume_login_attempt(db_session, rate_limit_key, now_ts=now_ts)

    other_session = SessionLocal()
    try:
        assert _consume_login_attempt(other_session, rate_limit_key, now_ts=now_ts)
        assert not _consume_login_attempt(
            other_session,
            rate_limit_key,
            now_ts=now_ts + 60,
        )
    finally:
        other_session.close()

    assert not _consume_login_attempt(db_session, rate_limit_key, now_ts=now_ts + 60)


def test_login_rate_limit_has_independent_counters_for_users_and_ips(db_session):
    request_a = SimpleNamespace(client=SimpleNamespace(host="192.0.2.10"))
    request_b = SimpleNamespace(client=SimpleNamespace(host="192.0.2.11"))

    user_a_ip_a = _login_rate_limit_key(request_a, "user-a@example.test")
    user_b_ip_a = _login_rate_limit_key(request_a, "user-b@example.test")
    user_a_ip_b = _login_rate_limit_key(request_b, "user-a@example.test")

    assert len({user_a_ip_a, user_b_ip_a, user_a_ip_b}) == 3
    for key in (user_a_ip_a, user_b_ip_a, user_a_ip_b):
        for _ in range(LOGIN_RATE_LIMIT_MAX_ATTEMPTS):
            assert not _consume_login_attempt(db_session, key, now_ts=1_800_000_000)
        assert _consume_login_attempt(db_session, key, now_ts=1_800_000_000)


def test_login_rate_limit_is_configurable_and_expires_counters(monkeypatch, db_session):
    monkeypatch.setenv("LOGIN_RATE_LIMIT_WINDOW_SECONDS", "30")
    monkeypatch.setenv("LOGIN_RATE_LIMIT_MAX_ATTEMPTS", "2")
    key = "b" * 64
    now_ts = 1_800_000_000

    assert _login_rate_limit_settings() == (30, 2)
    assert not _consume_login_attempt(db_session, key, now_ts=now_ts)
    assert not _consume_login_attempt(db_session, key, now_ts=now_ts)
    assert _consume_login_attempt(db_session, key, now_ts=now_ts)
    assert not _consume_login_attempt(db_session, key, now_ts=now_ts + 30)


def test_invalid_rate_limit_configuration_uses_safe_defaults(monkeypatch):
    monkeypatch.setenv("LOGIN_RATE_LIMIT_WINDOW_SECONDS", "0")
    monkeypatch.setenv("LOGIN_RATE_LIMIT_MAX_ATTEMPTS", "not-a-number")

    assert _login_rate_limit_settings() == (60, 5)


def test_successful_login_clears_the_shared_failure_counter(db_session):
    rate_limit_key = "c" * 64
    now_ts = 1_800_000_000
    for _ in range(LOGIN_RATE_LIMIT_MAX_ATTEMPTS):
        assert not _consume_login_attempt(db_session, rate_limit_key, now_ts=now_ts)

    from app.routes.auth import _clear_login_failures

    _clear_login_failures(db_session, rate_limit_key)

    assert not _consume_login_attempt(db_session, rate_limit_key, now_ts=now_ts)


def test_login_endpoint_returns_429_after_five_attempts(db_session):
    with TestClient(app) as client:
        for _ in range(LOGIN_RATE_LIMIT_MAX_ATTEMPTS):
            response = client.post(
                "/auth/login",
                json={"email": "rate-limit@test.local", "password": "WrongPassword@123"},
            )
            assert response.status_code == 401

        response = client.post(
            "/auth/login",
            json={"email": "rate-limit@test.local", "password": "WrongPassword@123"},
        )
        assert response.status_code == 429


def test_api_health_login_and_authenticated_user(db_session):
    user = create_admin_user(db_session)

    with TestClient(app) as client:
        health_response = client.get("/health/db")
        assert health_response.status_code == 200
        assert health_response.json() == {"status": "ok"}
        assert health_response.headers["x-content-type-options"] == "nosniff"
        assert health_response.headers["x-frame-options"] == "DENY"
        assert health_response.headers["referrer-policy"] == "no-referrer"
        assert health_response.headers["x-app-version"]

        login_response = client.post(
            "/auth/login",
            json={"email": user.email, "password": "Admin@123"},
        )
        assert login_response.status_code == 200
        token = login_response.json()["access_token"]

        me_response = client.get(
            "/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert me_response.status_code == 200
        assert me_response.json()["email"] == user.email


def test_cors_allows_configured_origin_and_authorization_preflight():
    cors_options = next(
        middleware.kwargs
        for middleware in app.user_middleware
        if middleware.cls is CORSMiddleware
    )
    allowed_origin = CORS_ORIGINS[0]

    with TestClient(app) as client:
        response = client.get("/health", headers={"Origin": allowed_origin})
        preflight = client.options(
            "/auth/login",
            headers={
                "Origin": allowed_origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "authorization,content-type",
            },
        )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == allowed_origin
    assert "access-control-allow-credentials" not in response.headers
    assert preflight.status_code == 200
    assert preflight.headers["access-control-allow-origin"] == allowed_origin
    assert "access-control-allow-credentials" not in preflight.headers
    assert "authorization" in preflight.headers["access-control-allow-headers"].lower()
    assert "POST" in preflight.headers["access-control-allow-methods"]
    assert cors_options["allow_origins"] == CORS_ORIGINS
    assert "allow_origin_regex" not in cors_options
    assert cors_options["allow_credentials"] is False


def test_cors_rejects_unconfigured_origin_and_preserves_public_health():
    with TestClient(app) as client:
        response = client.get(
            "/health",
            headers={"Origin": "https://untrusted.invalid"},
        )
        preflight = client.options(
            "/auth/login",
            headers={
                "Origin": "https://untrusted.invalid",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "authorization",
            },
        )

    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers
    assert preflight.status_code == 400
    assert "access-control-allow-origin" not in preflight.headers


@pytest.mark.parametrize(
    ("secret_key", "algorithm", "production"),
    [
        ("", "HS256", False),
        ("strong-test-secret-with-at-least-32-bytes", "", False),
        ("strong-test-secret-with-at-least-32-bytes", "none", False),
        ("short", "HS256", True),
        ("troque-por-uma-chave-segura", "HS256", True),
    ],
)
def test_invalid_security_configuration_is_rejected(secret_key, algorithm, production):
    with pytest.raises(ValueError):
        validate_security_settings(secret_key, algorithm, production=production)


def test_valid_security_configuration_accepts_supported_algorithm():
    validate_security_settings(
        "secure-production-secret-with-more-than-32-bytes",
        "HS256",
        production=True,
    )


@pytest.mark.parametrize(
    "origins",
    [
        "*",
        "https://frontend.example.test/path",
        "ftp://frontend.example.test",
        "https://user:password@frontend.example.test",
        "https://frontend.example.test:99999",
    ],
)
def test_cors_rejects_wildcard_or_invalid_origin_configuration(origins):
    with pytest.raises(ValueError):
        parse_cors_origins(origins)


def test_cors_requires_explicit_origin_in_production():
    with pytest.raises(ValueError):
        parse_cors_origins("", production=True)

    assert parse_cors_origins("https://frontend.example.test", production=True) == [
        "https://frontend.example.test"
    ]


def test_password_reset_revokes_existing_access_tokens(db_session):
    admin = create_admin_user(db_session)
    user = User(
        name="Assistente Reset",
        email="assistente.reset@test.local",
        password=get_password_hash("OldPassword@123"),
        role="assistente",
        permissions="[]",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    old_token = create_access_token({"sub": str(user.id), "token_version": user.token_version})
    admin_token = create_access_token({"sub": str(admin.id), "token_version": admin.token_version})

    with TestClient(app) as client:
        reset_response = client.put(
            f"/users/{user.id}/password",
            json={"password": "NewPassword@123"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert reset_response.status_code == 204

        old_token_response = client.get(
            "/auth/me",
            headers={"Authorization": f"Bearer {old_token}"},
        )
        assert old_token_response.status_code == 401

        login_response = client.post(
            "/auth/login",
            json={"email": user.email, "password": "NewPassword@123"},
        )
        assert login_response.status_code == 200
        new_token_response = client.get(
            "/auth/me",
            headers={"Authorization": f"Bearer {login_response.json()['access_token']}"},
        )
        assert new_token_response.status_code == 200


@pytest.mark.parametrize(
    "password",
    [
        "ASCII-password-123",
        "Senhaáéíóú",
        "Senha-ç-Ç",
        "日本語のパスワード",
        "Senha-😀-🙂",
        "a" * 72,
        "😀" * 18,
        "  senha com espaços  ",
    ],
)
def test_password_hashing_preserves_supported_utf8_passwords(password):
    assert len(password.encode("utf-8")) <= 72
    password_hash = get_password_hash(password)

    assert password_hash != password
    assert verify_password(password, password_hash)
    if password != password.strip():
        assert not verify_password(password.strip(), password_hash)


@pytest.mark.parametrize("password", ["a" * 73, "😀" * 19, "a" * 71 + "é"])
def test_passwords_over_bcrypt_utf8_limit_are_rejected(password):
    assert len(password.encode("utf-8")) > 72

    with pytest.raises(ValueError, match="72 bytes em UTF-8"):
        validate_password(password)
    with pytest.raises(ValueError, match="72 bytes em UTF-8"):
        get_password_hash(password)
    with pytest.raises(ValueError, match="72 bytes em UTF-8"):
        verify_password(password, "unused-hash")


def test_password_schemas_preserve_exact_value_and_enforce_byte_limit():
    password = "  Senha-ç-😀  "
    user_values = {
        "name": "Usuário Teste",
        "email": "password.schema@test.local",
        "password": password,
    }

    assert UserCreate(**user_values).password == password
    assert UserLogin(email=user_values["email"], password=password).password == password
    assert UserPasswordReset(password=password).password == password

    oversized_password = "😀" * 19
    for schema, values in (
        (UserCreate, {**user_values, "password": oversized_password}),
        (UserLogin, {"email": user_values["email"], "password": oversized_password}),
        (UserPasswordReset, {"password": oversized_password}),
    ):
        with pytest.raises(ValueError, match="72 bytes em UTF-8"):
            schema(**values)


def test_user_creation_login_and_password_reset_preserve_unicode_password(db_session):
    admin = create_admin_user(db_session)
    admin_token = create_access_token({"sub": str(admin.id), "token_version": admin.token_version})
    original_password = "  Senha-ç-😀  "

    with TestClient(app) as client:
        create_response = client.post(
            "/users/",
            json={
                "name": "Senha Unicode",
                "email": "senha.unicode@test.local",
                "password": original_password,
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert create_response.status_code == 201

        user = db_session.query(User).filter_by(email="senha.unicode@test.local").one()
        assert user.password != original_password
        assert verify_password(original_password, user.password)
        assert not verify_password(original_password.strip(), user.password)

        login_response = client.post(
            "/auth/login",
            json={"email": user.email, "password": original_password},
        )
        assert login_response.status_code == 200

        reset_password = "  Nova-senha-á-🧡  "
        reset_response = client.put(
            f"/users/{user.id}/password",
            json={"password": reset_password},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert reset_response.status_code == 204
        db_session.refresh(user)
        assert user.password != reset_password
        assert verify_password(reset_password, user.password)
        assert not verify_password(reset_password.strip(), user.password)

        reset_login_response = client.post(
            "/auth/login",
            json={"email": user.email, "password": reset_password},
        )
        assert reset_login_response.status_code == 200


def test_client_lookup_allows_every_requests_screen_permission(db_session):
    db_session.add(
        PickupCatalogClient(
            client_code="1234",
            nome_fantasia="Cliente Autofill",
            cnpj_cpf="12345678000199",
        )
    )
    db_session.commit()

    allowed_permissions = (
        "pickups.create_order",
        "pickups.withdrawals_history",
        "equipments.view",
        "equipments.manage",
    )

    with TestClient(app) as client:
        for permission in allowed_permissions:
            user = User(
                name=f"Usuario {permission}",
                email=f"{permission.replace('.', '-')}@test.local",
                password="unused",
                role="assistente",
                permissions=json.dumps([permission]),
            )
            db_session.add(user)
            db_session.commit()
            db_session.refresh(user)

            token = create_access_token({"sub": str(user.id)})
            response = client.get(
                "/pickup-catalog/client/001234",
                headers={"Authorization": f"Bearer {token}"},
            )

            assert response.status_code == 200
            payload = response.json()
            assert payload["found_anything"] is True
            assert payload["client"]["client_code"] == "1234"
            assert payload["client"]["nome_fantasia"] == "Cliente Autofill"
            assert payload["client"]["cnpj_cpf"] == "12345678000199"


def test_client_lookup_rejects_unrelated_permission(db_session):
    user = User(
        name="Usuario sem acesso a clientes",
        email="tasks-only@test.local",
        password="unused",
        role="assistente",
        permissions=json.dumps(["tasks.manage"]),
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    token = create_access_token({"sub": str(user.id)})
    with TestClient(app) as client:
        response = client.get(
            "/pickup-catalog/client/1234",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 403


def test_inventory_search_by_tag_returns_all_open_comodatos_for_matched_client(db_session):
    current_user = create_admin_user(db_session)
    matched_client = PickupCatalogClient(
        client_code="1001",
        nome_fantasia="Cliente com vários comodatos",
    )
    other_client = PickupCatalogClient(
        client_code="2002",
        nome_fantasia="Outro cliente",
    )
    db_session.add_all([matched_client, other_client])
    db_session.flush()

    db_session.add_all([
        Equipment(
            category="refrigerador",
            model_name="VISA COOLER CADASTRADO",
            brand="BRAHMA",
            quantity=1,
            voltage="220v",
            rg_code="RG 777-9",
            tag_code="ETQ-ABC-99",
            status="alocado",
            client_name=matched_client.nome_fantasia,
        ),
        Equipment(
            category="refrigerador",
            model_name="VISA COOLER CADASTRADO",
            brand="BRAHMA",
            quantity=1,
            voltage="220v",
            rg_code="RG-SEM-COMODATO",
            tag_code=None,
            status="disponivel",
            client_name="",
        ),
    ])
    db_session.add_all([
        PickupCatalogInventoryItem(
            client_id=matched_client.id,
            description="VISA COOLER NA BASE",
            item_type="refrigerador",
            open_quantity=1,
            rg="RG7779",
            comodato_number="CMD-REFRIGERADOR",
            invoice_issue_date="15/03/2026",
        ),
        PickupCatalogInventoryItem(
            client_id=matched_client.id,
            description="CAIXA TÉRMICA 12L",
            item_type="caixa_termica",
            open_quantity=2,
            rg="",
            comodato_number="CMD-CAIXA",
            invoice_issue_date="10/01/2025",
        ),
        PickupCatalogInventoryItem(
            client_id=matched_client.id,
            description="JOGO DE MESA",
            item_type="jogo_mesa",
            open_quantity=3,
            rg="",
            comodato_number="CMD-MESA",
            invoice_issue_date="20/02/2024",
        ),
        PickupCatalogInventoryItem(
            client_id=other_client.id,
            description="MATERIAL DE OUTRO CLIENTE",
            item_type="outro",
            open_quantity=1,
            rg="",
            comodato_number="CMD-OUTRO",
            invoice_issue_date="15/03/2026",
        ),
    ])
    db_session.commit()

    result = list_inventory_materials(
        group="todos",
        limit=50,
        offset=0,
        q="ETQ ABC 99",
        year="2026",
        month="2026-03",
        item_type_filter=None,
        sort="newest",
        db=db_session,
        current_user=current_user,
    )

    assert result.page.total == 3
    assert {item.client_code for item in result.items} == {"1001"}
    assert {item.comodato_number for item in result.items} == {
        "CMD-REFRIGERADOR",
        "CMD-CAIXA",
        "CMD-MESA",
    }
    assert {item.invoice_month for item in result.items} == {"2026-03", "2025-01", "2024-02"}
    assert result.items[0].comodato_number == "CMD-REFRIGERADOR"
    assert result.items[0].is_search_match is True
    assert sum(item.is_search_match for item in result.items) == 1

    description_result = list_inventory_materials(
        group="todos",
        limit=50,
        offset=0,
        q="CAIXA TÉRMICA 12L",
        year="2026",
        month="2026-03",
        item_type_filter=None,
        sort="newest",
        db=db_session,
        current_user=current_user,
    )

    assert description_result.page.total == 3
    assert description_result.items[0].comodato_number == "CMD-CAIXA"
    assert description_result.items[0].is_search_match is True
    assert sum(item.is_search_match for item in description_result.items) == 1

    equipment_description_result = list_inventory_materials(
        group="todos",
        limit=50,
        offset=0,
        q="VISA COOLER CADASTRADO",
        year=None,
        month=None,
        item_type_filter=None,
        sort="newest",
        db=db_session,
        current_user=current_user,
    )

    assert equipment_description_result.page.total == 3
    assert {item.client_code for item in equipment_description_result.items} == {"1001"}
    assert equipment_description_result.items[0].comodato_number == "CMD-REFRIGERADOR"
    assert equipment_description_result.items[0].is_search_match is True

    rg_result = list_inventory_materials(
        group="todos",
        limit=50,
        offset=0,
        q="RG 777-9",
        year=None,
        month=None,
        item_type_filter=None,
        sort="oldest",
        db=db_session,
        current_user=current_user,
    )

    assert rg_result.items[0].comodato_number == "CMD-REFRIGERADOR"
    assert rg_result.items[0].is_search_match is True

    march_result = list_inventory_materials(
        group="todos",
        limit=50,
        offset=0,
        q=None,
        year="2026",
        month="2026-03",
        item_type_filter=None,
        sort="newest",
        db=db_session,
        current_user=current_user,
    )

    assert march_result.page.total == 2
    assert {item.comodato_number for item in march_result.items} == {
        "CMD-REFRIGERADOR",
        "CMD-OUTRO",
    }


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


def test_concluded_withdrawal_returns_refrigerator_to_non_allocated_and_blocks_resync(db_session):
    current_user = create_admin_user(db_session)
    token_seed = uuid4().hex[:10].upper()
    local_rg = f"RG-RET-{token_seed}"

    created = create_equipment(
        payload=EquipmentCreate(
            category="refrigerador",
            model_name="VISA COOLER RETORNO",
            brand="BRAHMA",
            quantity=1,
            voltage="220v",
            rg_code=local_rg,
            tag_code=f"TAG-RET-{token_seed}",
            status="novo",
            client_name=None,
            notes="Teste integracao retorno",
        ),
        db=db_session,
        current_user=current_user,
    )
    equipment_id = int(created.id)

    seed_020220_allocation(db_session, local_rg, client_code="2002")

    available_after_allocation = list_available_refrigerators_for_comodato(
        limit=500,
        offset=0,
        q=None,
        db=db_session,
        current_user=current_user,
    )
    assert equipment_by_id(available_after_allocation, equipment_id) is None

    order = PickupCatalogOrder(
        order_number=f"RET-{token_seed}",
        client_code="2002",
        nome_fantasia="Cliente Retorno",
        withdrawal_date="2026-03-11",
        status="pendente",
        summary_line="Refrigerador retornado",
    )
    db_session.add(order)
    db_session.flush()
    db_session.add(
        PickupCatalogOrderItem(
            order_id=order.id,
            description="VISA COOLER RETORNO",
            item_type="refrigerador",
            quantity=1,
            rg=local_rg,
            comodato_number="CMD-RET-0001",
        )
    )
    db_session.commit()

    update_order_status(
        order_id=int(order.id),
        payload=PickupCatalogOrderStatusUpdateIn(
            status="concluida",
            status_note="Retirado",
            refrigerator_condition="boa",
        ),
        db=db_session,
        current_user=current_user,
    )

    available_after_return = list_available_refrigerators_for_comodato(
        limit=500,
        offset=0,
        q=None,
        db=db_session,
        current_user=current_user,
    )
    assert equipment_by_id(available_after_return, equipment_id) is not None

    non_allocated = list_non_allocated_refrigerators(
        limit=50,
        offset=0,
        q=None,
        status_filter="todos",
        sort="newest",
        db=db_session,
        current_user=current_user,
    )
    returned_row = equipment_by_id(non_allocated.items, equipment_id)
    assert returned_row is not None
    returned_status = returned_row.get("status") if isinstance(returned_row, dict) else getattr(returned_row, "status", "")
    assert str(returned_status or "").lower() == "disponivel"

    sync_payload = sync_refrigerators_allocation_status(
        db=db_session,
        current_user=current_user,
    )
    assert equipment_id not in (sync_payload.updated_ids or [])


def test_list_orders_sorts_pending_first_then_completed_by_withdrawal_date_desc(db_session):
    current_user = create_admin_user(db_session)

    db_session.add_all([
        PickupCatalogOrder(
            order_number="RET-PENDENTE-RECENTE",
            client_code="1001",
            nome_fantasia="Cliente Ordenacao",
            withdrawal_date="2026-03-12",
            status="pendente",
            summary_line="RET-PENDENTE-RECENTE",
        ),
        PickupCatalogOrder(
            order_number="RET-PENDENTE-ANTIGA",
            client_code="1001",
            nome_fantasia="Cliente Ordenacao",
            withdrawal_date="2026-03-10",
            status="pendente",
            summary_line="RET-PENDENTE-ANTIGA",
        ),
        PickupCatalogOrder(
            order_number="RET-CONCLUIDA-RECENTE",
            client_code="1001",
            nome_fantasia="Cliente Ordenacao",
            withdrawal_date="2026-03-11",
            status="concluida",
            summary_line="RET-CONCLUIDA-RECENTE",
        ),
        PickupCatalogOrder(
            order_number="RET-CONCLUIDA-ANTIGA",
            client_code="1001",
            nome_fantasia="Cliente Ordenacao",
            withdrawal_date="2026-03-09",
            status="concluida",
            summary_line="RET-CONCLUIDA-ANTIGA",
        ),
        PickupCatalogOrder(
            order_number="RET-CANCELADA",
            client_code="1001",
            nome_fantasia="Cliente Ordenacao",
            withdrawal_date="2026-03-13",
            status="cancelada",
            summary_line="RET-CANCELADA",
        ),
    ])
    db_session.commit()

    rows = list_orders(
        limit=20,
        offset=0,
        status_filter=None,
        email_request_status=None,
        q=None,
        db=db_session,
        current_user=current_user,
    )

    ordered_numbers = [row.order_number for row in rows]
    assert ordered_numbers == [
        "RET-PENDENTE-RECENTE",
        "RET-PENDENTE-ANTIGA",
        "RET-CONCLUIDA-RECENTE",
        "RET-CONCLUIDA-ANTIGA",
        "RET-CANCELADA",
    ]


def test_delivery_pdf_is_served_inline_from_authenticated_endpoint(db_session, tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOADS_DIR", str(tmp_path))
    monkeypatch.setenv("DELIVERY_STORAGE_BACKEND", "local")
    deliveries_dir = tmp_path / "deliveries"
    deliveries_dir.mkdir(parents=True)
    pdf_path = deliveries_dir / "nota-fiscal.pdf"
    pdf_path.write_bytes(b"%PDF-1.4\n%%EOF")

    delivery = Delivery(
        client_code="1001",
        fantasy_name="Cliente Teste",
        description="Entrega de teste",
        delivery_date=date(2026, 3, 15),
        pdf_one_path="deliveries/nota-fiscal.pdf",
        pdf_two_path="deliveries/nota-fiscal.pdf",
    )
    db_session.add(delivery)
    db_session.commit()
    db_session.refresh(delivery)

    response = open_delivery_attachment(
        delivery_id=int(delivery.id),
        file_kind="nf",
        download=False,
        db=db_session,
        current_user=create_admin_user(db_session),
    )

    assert response.media_type == "application/pdf"
    assert response.headers["content-disposition"].startswith("inline;")
    assert response.headers["cache-control"] == "private, no-store"


def test_delivery_output_uses_structured_fields_and_relative_file_urls(db_session):
    delivery = Delivery(
        client_code="2002",
        fantasy_name="Fantasia Estruturada",
        description="Descrição sem concatenação",
        delivery_date=date(2026, 3, 16),
        pdf_one_path="deliveries/nf.pdf",
        pdf_two_path="deliveries/contrato.pdf",
    )
    db_session.add(delivery)
    db_session.commit()
    db_session.refresh(delivery)

    payload = build_delivery_out(delivery)

    assert payload.client_code == "2002"
    assert payload.fantasy_name == "Fantasia Estruturada"
    assert payload.description == "Descrição sem concatenação"
    assert payload.pdf_one_url == f"/deliveries/{delivery.id}/files/nf"
    assert payload.pdf_two_url == f"/deliveries/{delivery.id}/files/contract"


def test_legacy_supabase_url_is_accepted_only_for_configured_project():
    config = {"url": "https://project-ref.supabase.co"}

    assert parse_supabase_object_url(
        "https://project-ref.supabase.co/storage/v1/object/public/deliveries/docs/nf.pdf",
        config,
    ) == ("deliveries", "docs/nf.pdf")
    assert parse_supabase_object_url(
        "https://malicious.example/storage/v1/object/public/deliveries/docs/nf.pdf",
        config,
    ) is None
