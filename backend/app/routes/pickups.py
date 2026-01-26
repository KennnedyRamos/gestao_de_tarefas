from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.auth import get_current_admin
from app.database.deps import get_db
from app.models.pickup import Pickup
from app.models.user import User
from app.schemas.pickup import PickupCreate, PickupOut

router = APIRouter(prefix="/pickups", tags=["Pickups"])


@router.get("/", response_model=list[PickupOut])
def list_pickups(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin)
):
    return (
        db.query(Pickup)
        .order_by(Pickup.pickup_date.desc(), Pickup.id.desc())
        .all()
    )


@router.post("/", response_model=PickupOut, status_code=status.HTTP_201_CREATED)
def create_pickup(
    payload: PickupCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin)
):
    pickup = Pickup(
        description=payload.description,
        pickup_date=payload.pickup_date,
        material=payload.material,
        quantity=payload.quantity
    )
    db.add(pickup)
    db.commit()
    db.refresh(pickup)
    return pickup


@router.delete("/{pickup_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_pickup(
    pickup_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin)
):
    pickup = db.query(Pickup).filter(Pickup.id == pickup_id).first()
    if not pickup:
        raise HTTPException(status_code=404, detail="Retirada nao encontrada")
    db.delete(pickup)
    db.commit()
    return None

