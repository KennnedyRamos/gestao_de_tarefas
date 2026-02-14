import re
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database.deps import get_db
from app.models.user import User
from app.schemas.token import Token
from app.schemas.user import UserLogin, UserOut
from app.core.security import verify_password, create_access_token
from app.core.auth import get_current_user
from app.core.permissions import permissions_for_user

router = APIRouter(prefix="/auth", tags=["Auth"])
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

def is_valid_email(value: str) -> bool:
    if not value:
        return False
    return bool(EMAIL_PATTERN.match(value))

@router.post("/login", response_model=Token)
def login(credentials: UserLogin, db: Session = Depends(get_db)):
    email = credentials.email.strip()
    if not is_valid_email(email):
        raise HTTPException(status_code=400, detail="Email incorreto")

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    if not verify_password(credentials.password, user.password):
        raise HTTPException(status_code=401, detail="Senha incorreta")

    token = create_access_token({
        "sub": str(user.id),
        "role": user.role,
        "name": user.name,
        "email": user.email,
        "permissions": permissions_for_user(user)
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
