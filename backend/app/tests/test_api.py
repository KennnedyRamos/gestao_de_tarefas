import os
import requests

BASE_URL = "http://127.0.0.1:8000"

def get_token():
    payload = {
        "email": os.getenv("ADMIN_EMAIL", "auxiliar.vendas@ribeirabeer.com.br"),
        "password": os.getenv("ADMIN_PASSWORD", "Rb615323@@")
    }
    response = requests.post(f"{BASE_URL}/auth/login", json=payload)
    response.raise_for_status()
    return response.json()["access_token"]

def auth_headers():
    token = get_token()
    return {"Authorization": f"Bearer {token}"}

def test_create_tasks():
    tarefas = [
        {"title": "Comprar leite", "description": "Ir ao mercado comprar leite", "due_date": "2026-12-31"},
        {"title": "Estudar Python", "description": "Estudar FastAPI e SQLAlchemy", "due_date": "2026-11-30"}
    ]
    
    for t in tarefas:
        response = requests.post(f"{BASE_URL}/tasks/", json=t, headers=auth_headers())
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == t["title"]
        assert data["description"] == t["description"]

def test_read_tasks():
    response = requests.get(f"{BASE_URL}/tasks/", headers=auth_headers())
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    print("Tarefas atuais:", data)

def test_update_task():
    # Pega a primeira tarefa
    response = requests.get(f"{BASE_URL}/tasks/", headers=auth_headers())
    tasks = response.json()
    if tasks:
        task_id = tasks[0]["id"]
        update_data = {
            "title": "Comprar leite e pão",
            "description": "Ir ao mercado comprar leite e pão",
            "due_date": "2026-10-15"
        }
        response = requests.put(f"{BASE_URL}/tasks/{task_id}", json=update_data, headers=auth_headers())
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == update_data["title"]

def test_delete_task():
    # Pega a primeira tarefa
    response = requests.get(f"{BASE_URL}/tasks/", headers=auth_headers())
    tasks = response.json()
    if tasks:
        task_id = tasks[0]["id"]
        response = requests.delete(f"{BASE_URL}/tasks/{task_id}", headers=auth_headers())
        assert response.status_code == 200 or response.status_code == 404

