import os

import pytest
import requests

BASE_URL = os.getenv("TEST_API_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
REQUEST_TIMEOUT = 15


def _credentials() -> tuple[str, str]:
    email = str(os.getenv("TEST_API_EMAIL") or os.getenv("ADMIN_EMAIL") or "").strip()
    password = str(os.getenv("TEST_API_PASSWORD") or os.getenv("ADMIN_PASSWORD") or "").strip()
    if not email or not password:
        pytest.skip("Credenciais de teste nao configuradas (TEST_API_EMAIL/TEST_API_PASSWORD).")
    return email, password


def get_token() -> str:
    email, password = _credentials()
    payload = {"email": email, "password": password}

    try:
        response = requests.post(f"{BASE_URL}/auth/login", json=payload, timeout=REQUEST_TIMEOUT)
    except requests.RequestException as exc:
        pytest.skip(f"API indisponivel para testes de integracao: {exc}")

    if response.status_code in {401, 403, 404}:
        pytest.skip(f"Credenciais de integracao sem acesso para testes ({response.status_code}).")

    response.raise_for_status()
    token = response.json().get("access_token")
    if not token:
        pytest.skip("Token nao retornado por /auth/login.")
    return token


def auth_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {get_token()}"}


def has_tasks_manage_permission(headers: dict[str, str]) -> bool:
    response = requests.get(f"{BASE_URL}/auth/me", headers=headers, timeout=REQUEST_TIMEOUT)
    if response.status_code != 200:
        return False
    payload = response.json() or {}
    role = str(payload.get("role") or "").strip().lower()
    permissions = payload.get("permissions") or []
    return role == "admin" or "tasks.manage" in permissions


def test_create_tasks():
    headers = auth_headers()
    if not has_tasks_manage_permission(headers):
        pytest.skip("Usuario de integracao sem permissao tasks.manage.")

    tasks = [
        {"title": "Comprar leite", "description": "Ir ao mercado comprar leite", "due_date": "2026-12-31"},
        {"title": "Estudar Python", "description": "Estudar FastAPI e SQLAlchemy", "due_date": "2026-11-30"},
    ]

    for task in tasks:
        response = requests.post(f"{BASE_URL}/tasks/", json=task, headers=headers, timeout=REQUEST_TIMEOUT)
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == task["title"]
        assert data["description"] == task["description"]


def test_read_tasks():
    response = requests.get(f"{BASE_URL}/tasks/", headers=auth_headers(), timeout=REQUEST_TIMEOUT)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


def test_update_task():
    headers = auth_headers()
    if not has_tasks_manage_permission(headers):
        pytest.skip("Usuario de integracao sem permissao tasks.manage.")

    response = requests.get(f"{BASE_URL}/tasks/", headers=headers, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    tasks = response.json() or []

    if not tasks:
        pytest.skip("Sem tarefas para atualizar no ambiente de integracao.")

    task_id = tasks[0]["id"]
    update_data = {
        "title": "Comprar leite e pao",
        "description": "Ir ao mercado comprar leite e pao",
        "due_date": "2026-10-15",
    }
    response = requests.put(f"{BASE_URL}/tasks/{task_id}", json=update_data, headers=headers, timeout=REQUEST_TIMEOUT)
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == update_data["title"]


def test_delete_task():
    headers = auth_headers()
    if not has_tasks_manage_permission(headers):
        pytest.skip("Usuario de integracao sem permissao tasks.manage.")

    response = requests.get(f"{BASE_URL}/tasks/", headers=headers, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    tasks = response.json() or []

    if not tasks:
        pytest.skip("Sem tarefas para excluir no ambiente de integracao.")

    task_id = tasks[0]["id"]
    response = requests.delete(f"{BASE_URL}/tasks/{task_id}", headers=headers, timeout=REQUEST_TIMEOUT)
    assert response.status_code in {200, 404}
