import re
import threading
import time
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Request as FastAPIRequest, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.permissions import permissions_for_user
from app.core.security import create_access_token, verify_password
from app.database.deps import get_db
from app.models.user import User
from app.schemas.token import Token
from app.schemas.user import UserLogin, UserOut

router = APIRouter(prefix="/auth", tags=["Auth"])
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
INVALID_CREDENTIALS_DETAIL = "Email ou senha incorretos."
LOGIN_RATE_LIMIT_WINDOW_SECONDS = 60
LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 5
_login_attempts_lock = threading.Lock()
_login_attempts: dict[str, list[float]] = defaultdict(list)


def is_valid_email(value: str) -> bool:
    if not value:
        return False
    return bool(EMAIL_PATTERN.match(value))


def _login_rate_limit_key(request: FastAPIRequest, email: str) -> str:
    client_host = str(getattr(getattr(request, "client", None), "host", "") or "unknown").strip().lower()
    normalized_email = str(email or "").strip().lower()
    return f"{client_host}:{normalized_email}"


def _prune_login_attempts(now_ts: float) -> None:
    cutoff = now_ts - LOGIN_RATE_LIMIT_WINDOW_SECONDS
    expired_keys = []
    for key, attempts in _login_attempts.items():
        fresh_attempts = [attempt for attempt in attempts if attempt >= cutoff]
        if fresh_attempts:
            _login_attempts[key] = fresh_attempts
            continue
        expired_keys.append(key)
    for key in expired_keys:
        _login_attempts.pop(key, None)


def _is_login_rate_limited(key: str) -> bool:
    now_ts = time.time()
    with _login_attempts_lock:
        _prune_login_attempts(now_ts)
        return len(_login_attempts.get(key, [])) >= LOGIN_RATE_LIMIT_MAX_ATTEMPTS


def _register_login_failure(key: str) -> None:
    now_ts = time.time()
    with _login_attempts_lock:
        _prune_login_attempts(now_ts)
        _login_attempts.setdefault(key, []).append(now_ts)


def _clear_login_failures(key: str) -> None:
    with _login_attempts_lock:
        _login_attempts.pop(key, None)


@router.post("/login", response_model=Token)
def login(
    credentials: UserLogin,
    request: FastAPIRequest,
    db: Session = Depends(get_db),
):
    email = credentials.email.strip().lower()
    rate_limit_key = _login_rate_limit_key(request, email)
    if _is_login_rate_limited(rate_limit_key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Muitas tentativas de login. Aguarde 1 minuto e tente novamente.",
        )
    if not is_valid_email(email):
        _register_login_failure(rate_limit_key)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=INVALID_CREDENTIALS_DETAIL)

    user = db.query(User).filter(func.lower(User.email) == email).first()
    if not user or not verify_password(credentials.password, user.password):
        _register_login_failure(rate_limit_key)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=INVALID_CREDENTIALS_DETAIL)

    _clear_login_failures(rate_limit_key)
    token = create_access_token({
        "sub": str(user.id),
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
