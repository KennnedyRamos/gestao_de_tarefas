import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text
from app.routes import tasks, auth, users, routines, deliveries, pickups
from app.database.base import Base
from app.database.session import engine, SessionLocal
from app.models import task, user, assignment, routine, delivery, pickup
from app.core.config import ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME, ADMIN_ROLE, CORS_ORIGINS, parse_cors_origins
from app.core.security import get_password_hash
from app.models.user import User
app = FastAPI(title="Gestão de Tarefas")

cors_origins = parse_cors_origins(CORS_ORIGINS)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

Base.metadata.create_all(bind=engine)

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

ensure_task_columns()

def ensure_pickup_columns():
    inspector = inspect(engine)
    if "pickups" not in inspector.get_table_names():
        return
    columns = [col["name"] for col in inspector.get_columns("pickups")]
    with engine.begin() as conn:
        if "photo_path" not in columns:
            conn.execute(text("ALTER TABLE pickups ADD COLUMN photo_path VARCHAR"))

ensure_pickup_columns()

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

ensure_admin_user()

app.include_router(tasks.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(routines.router)
app.include_router(deliveries.router)
app.include_router(pickups.router)

@app.get("/")
def root():
    return {"message": "API rodando corretamente!"}
