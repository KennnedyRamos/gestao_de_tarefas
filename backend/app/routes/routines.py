from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.auth import get_current_admin
from app.core.config import ADMIN_EMAIL, ADMIN_NAME
from app.database.deps import get_db
from app.models.routine import Routine
from app.models.user import User
from app.schemas.routine import RoutineCreate, RoutineUpdate, RoutineOut

router = APIRouter(prefix="/routines", tags=["Routines"])


def get_personal_admin(current_user: User = Depends(get_current_admin)):
    if ADMIN_EMAIL and current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado")
    if ADMIN_NAME and current_user.name != ADMIN_NAME:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado")
    return current_user


@router.get("/", response_model=list[RoutineOut])
def list_routines(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_personal_admin)
):
    return (
        db.query(Routine)
        .order_by(Routine.routine_date.asc(), Routine.routine_time.asc(), Routine.id.desc())
        .all()
    )


@router.post("/", response_model=RoutineOut, status_code=status.HTTP_201_CREATED)
def create_routine(
    payload: RoutineCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_personal_admin)
):
    routine = Routine(
        title=payload.title,
        description=payload.description,
        routine_date=payload.routine_date,
        routine_time=payload.routine_time
    )
    db.add(routine)
    db.commit()
    db.refresh(routine)
    return routine


@router.put("/{routine_id}", response_model=RoutineOut)
def update_routine(
    routine_id: int,
    payload: RoutineUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_personal_admin)
):
    routine = db.query(Routine).filter(Routine.id == routine_id).first()
    if not routine:
        raise HTTPException(status_code=404, detail="Rotina nao encontrada")
    if hasattr(payload, "model_dump"):
        data = payload.model_dump(exclude_unset=True)
    else:
        data = payload.dict(exclude_unset=True)
    for key, value in data.items():
        setattr(routine, key, value)
    db.commit()
    db.refresh(routine)
    return routine


@router.delete("/{routine_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_routine(
    routine_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_personal_admin)
):
    routine = db.query(Routine).filter(Routine.id == routine_id).first()
    if not routine:
        raise HTTPException(status_code=404, detail="Rotina nao encontrada")
    db.delete(routine)
    db.commit()
    return None
