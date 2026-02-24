from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.auth import get_current_admin
from app.core.permissions import (
    PERMISSION_DEFINITIONS,
    permissions_for_user,
    serialize_permissions,
)
from app.core.security import get_password_hash
from app.database.deps import get_db
from app.models.assignment import Assignment
from app.models.user import User
from app.schemas.user import (
    PermissionOptionOut,
    UserAccessUpdate,
    UserCreate,
    UserOut,
    UserPasswordReset,
)

router = APIRouter(prefix='/users', tags=['Users'])
VALID_ROLES = {'admin', 'assistente'}


def _build_user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        name=user.name,
        email=user.email,
        role=user.role,
        permissions=permissions_for_user(user),
    )


@router.get('/permissions', response_model=list[PermissionOptionOut])
def list_permissions(
    current_user: User = Depends(get_current_admin),
):
    return [PermissionOptionOut(code=item['code'], label=item['label']) for item in PERMISSION_DEFINITIONS]


@router.get('/', response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    rows = db.query(User).order_by(User.name.asc()).all()
    return [_build_user_out(row) for row in rows]


@router.post('/', response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=409, detail='Email já cadastrado')
    if payload.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail='Perfil inválido')

    permissions = [] if payload.role == 'admin' else payload.permissions
    user = User(
        name=payload.name,
        email=payload.email,
        password=get_password_hash(payload.password),
        role=payload.role,
        permissions=serialize_permissions(permissions),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _build_user_out(user)


@router.put('/{user_id}/access', response_model=UserOut)
def update_user_access(
    user_id: int,
    payload: UserAccessUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    if payload.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail='Perfil inválido')
    if current_user.id == user_id and payload.role != 'admin':
        raise HTTPException(status_code=400, detail='Não é possível remover o próprio perfil de administrador')

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail='Usuário não encontrado')

    user.role = payload.role
    user.permissions = serialize_permissions([] if payload.role == 'admin' else payload.permissions)
    db.commit()
    db.refresh(user)
    return _build_user_out(user)


@router.delete('/{user_id}', status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    if current_user.id == user_id:
        raise HTTPException(status_code=400, detail='Não é possível excluir o próprio usuário')
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail='Usuário não encontrado')
    db.query(Assignment).filter(Assignment.user_id == user_id).delete()
    db.delete(user)
    db.commit()
    return None


@router.put('/{user_id}/password', status_code=status.HTTP_204_NO_CONTENT)
def reset_password(
    user_id: int,
    payload: UserPasswordReset,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail='Usuário não encontrado')
    user.password = get_password_hash(payload.password)
    db.commit()
    return None
