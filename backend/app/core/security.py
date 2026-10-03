from datetime import datetime, timedelta, timezone

import jwt
from passlib.context import CryptContext

from .config import ACCESS_TOKEN_EXPIRE_MINUTES, ALGORITHM, SECRET_KEY

MAX_PASSWORD_BYTES = 72
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def validate_password(value: str, *, min_length: int = 1) -> str:
    if not isinstance(value, str):
        raise ValueError("A senha deve ser um texto válido.")
    if len(value) < min_length:
        raise ValueError(f"A senha deve ter pelo menos {min_length} caractere(s).")
    if len(value.encode("utf-8")) > MAX_PASSWORD_BYTES:
        raise ValueError(f"A senha deve ter no máximo {MAX_PASSWORD_BYTES} bytes em UTF-8.")
    return value


def verify_password(plain_password: str, hashed_password: str) -> bool:
    validate_password(plain_password)
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    validate_password(password)
    return pwd_context.hash(password)


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt
