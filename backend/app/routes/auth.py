import hashlib
import re
import time

from fastapi import APIRouter, Depends, HTTPException, Request as FastAPIRequest, status
from sqlalchemy import case, delete, func
from sqlalchemy.dialects.postgresql import insert as postgresql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.core.config import env_positive_int
from app.core.auth import get_current_user
from app.core.permissions import permissions_for_user
from app.core.security import create_access_token, verify_password
from app.database.deps import get_db
from app.models.login_rate_limit import LoginRateLimit
from app.models.user import User
from app.schemas.token import Token
from app.schemas.user import UserLogin, UserOut

router = APIRouter(prefix="/auth", tags=["Auth"])
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
INVALID_CREDENTIALS_DETAIL = "Email ou senha incorretos."


def _login_rate_limit_settings() -> tuple[int, int]:
    return (
        env_positive_int("LOGIN_RATE_LIMIT_WINDOW_SECONDS", 60),
        env_positive_int("LOGIN_RATE_LIMIT_MAX_ATTEMPTS", 5),
    )


LOGIN_RATE_LIMIT_WINDOW_SECONDS, LOGIN_RATE_LIMIT_MAX_ATTEMPTS = _login_rate_limit_settings()


def is_valid_email(value: str) -> bool:
    if not value:
        return False
    return bool(EMAIL_PATTERN.match(value))


def _login_rate_limit_key(request: FastAPIRequest, email: str) -> str:
    client_host = str(getattr(getattr(request, "client", None), "host", "") or "unknown").strip().lower()
    normalized_email = str(email or "").strip().lower()
    return hashlib.sha256(f"{client_host}:{normalized_email}".encode("utf-8")).hexdigest()


def _consume_login_attempt(db: Session, key: str, *, now_ts: int | None = None) -> bool:
    now = int(time.time()) if now_ts is None else now_ts
    window_seconds, max_attempts = _login_rate_limit_settings()
    cutoff = now - window_seconds
    dialect = db.get_bind().dialect.name
    if dialect == "postgresql":
        insert = postgresql_insert
    elif dialect == "sqlite":
        insert = sqlite_insert
    else:
        raise RuntimeError(f"Unsupported database dialect for login rate limiting: {dialect}")

    statement = insert(LoginRateLimit).values(
        key=key,
        window_started_at=now,
        attempts=1,
    )
    statement = statement.on_conflict_do_update(
        index_elements=[LoginRateLimit.key],
        set_={
            "attempts": case(
                (LoginRateLimit.window_started_at <= cutoff, 1),
                else_=LoginRateLimit.attempts + 1,
            ),
            "window_started_at": case(
                (LoginRateLimit.window_started_at <= cutoff, now),
                else_=LoginRateLimit.window_started_at,
            ),
        },
    )
    attempts = db.execute(statement.returning(LoginRateLimit.attempts)).scalar_one()
    db.execute(delete(LoginRateLimit).where(LoginRateLimit.window_started_at <= cutoff))
    db.commit()
    return attempts > max_attempts


def _clear_login_failures(db: Session, key: str) -> None:
    db.query(LoginRateLimit).filter(LoginRateLimit.key == key).delete(synchronize_session=False)
    db.commit()


@router.post("/login", response_model=Token)
def login(
    credentials: UserLogin,
    request: FastAPIRequest,
    db: Session = Depends(get_db),
):
    email = credentials.email.strip().lower()
    rate_limit_key = _login_rate_limit_key(request, email)
    if _consume_login_attempt(db, rate_limit_key):
        window_seconds, _ = _login_rate_limit_settings()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Muitas tentativas de login. Aguarde {window_seconds} segundos e tente novamente.",
        )
    if not is_valid_email(email):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=INVALID_CREDENTIALS_DETAIL)

    user = db.query(User).filter(func.lower(User.email) == email).first()
    if not user or not verify_password(credentials.password, user.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=INVALID_CREDENTIALS_DETAIL)

    _clear_login_failures(db, rate_limit_key)
    token = create_access_token({
        "sub": str(user.id),
        "token_version": user.token_version,
        "role": user.role,
        "name": user.name,
        "email": user.email,
        "permissions": permissions_for_user(user),
    })
    return {"access_token": token, "token_type": "bearer"}


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return UserOut(
        id=current_user.id,
        name=current_user.name,
        email=current_user.email,
        role=current_user.role,
        permissions=permissions_for_user(current_user),
    )
