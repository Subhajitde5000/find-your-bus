from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Operator, ServiceCategory
from app.schemas import OperatorOut, ServiceCategoryOut

router = APIRouter(tags=["lookups"])


@router.get("/operators", response_model=list[OperatorOut])
def list_operators(db: Session = Depends(get_db)):
    return db.scalars(select(Operator).order_by(Operator.name)).all()


@router.get("/service-categories", response_model=list[ServiceCategoryOut])
def list_service_categories(db: Session = Depends(get_db)):
    return db.scalars(select(ServiceCategory).order_by(ServiceCategory.name)).all()
