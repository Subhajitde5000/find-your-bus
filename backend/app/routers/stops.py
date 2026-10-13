from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Stop
from app.routers.common import Paging, make_page
from app.schemas import Page, StopRef

router = APIRouter(prefix="/stops", tags=["stops"])


@router.get("", response_model=Page[StopRef])
def list_stops(
    q: str | None = Query(None, min_length=1, description="Part of a stop name"),
    linked: bool | None = Query(None, description="true = only stops linked to a bus stand"),
    paging: Paging = Depends(),
    db: Session = Depends(get_db),
):
    query = select(Stop)
    if q:
        query = query.where(Stop.name.ilike(f"%{q}%"))
    if linked is True:
        query = query.where(Stop.bus_stand_id.is_not(None))
    elif linked is False:
        query = query.where(Stop.bus_stand_id.is_(None))

    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.scalars(query.order_by(Stop.name).limit(paging.limit).offset(paging.offset)).all()
    return make_page(rows, total, paging)
