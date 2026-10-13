from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.db import get_db
from app.models import NODE_CATEGORIES, BusStand
from app.routers.common import Paging, make_page
from app.schemas import Page, StandDetail, StandSummary

router = APIRouter(prefix="/stands", tags=["bus stands"])


@router.get("", response_model=Page[StandSummary])
def list_stands(
    q: str | None = Query(None, min_length=1, description="Search name, local name or address"),
    category: str | None = Query(None, description=f"One of: {', '.join(NODE_CATEGORIES)}"),
    paging: Paging = Depends(),
    db: Session = Depends(get_db),
):
    query = select(BusStand)
    if q:
        pattern = f"%{q}%"
        query = query.where(
            or_(
                BusStand.name.ilike(pattern),
                BusStand.local_name.ilike(pattern),
                BusStand.address.ilike(pattern),
            )
        )
    if category:
        if category not in NODE_CATEGORIES:
            raise HTTPException(status_code=422, detail="unknown category")
        query = query.where(BusStand.node_category == category)

    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.scalars(
        query.order_by(BusStand.serial_no.nulls_last(), BusStand.name)
        .limit(paging.limit)
        .offset(paging.offset)
    ).all()
    return make_page(rows, total, paging)


@router.get("/{stand_id}", response_model=StandDetail)
def get_stand(stand_id: int, db: Session = Depends(get_db)):
    stand = db.scalar(
        select(BusStand).where(BusStand.id == stand_id).options(selectinload(BusStand.stops))
    )
    if stand is None:
        raise HTTPException(status_code=404, detail="bus stand not found")
    return stand
