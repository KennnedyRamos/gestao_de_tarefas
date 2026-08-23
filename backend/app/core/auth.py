import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jwt import InvalidTokenError
from sqlalchemy.orm import Session

from app.core.config import ALGORITHM, SECRET_KEY
from app.core.permissions import has_permission
from app.database.deps import get_db
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciais inválidas",
        headers={"WWW-Authenticate": "Bearer"}
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise credentials_exception
        parsed_user_id = int(user_id)
    except (InvalidTokenError, TypeError, ValueError) as exc:
        raise credentials_exception from exc

    user = db.query(User).filter(User.id == parsed_user_id).first()
    if not user:
        raise credentials_exception
    return user

def get_current_admin(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado")
    return current_user


def require_permission(permission: str):
    def dependency(current_user: User = Depends(get_current_user)):
        if not has_permission(current_user, permission):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado")
        return current_user

    return dependency


def require_any_permission(*permissions: str):
    clean_permissions = [str(item or "").strip() for item in permissions if str(item or "").strip()]

    def dependency(current_user: User = Depends(get_current_user)):
        if not clean_permissions:
            return current_user
        if any(has_permission(current_user, permission) for permission in clean_permissions):
            return current_user
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado")

    return dependency
