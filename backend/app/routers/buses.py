from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.db import get_db
from app.importer import normalise_registration
from app.models import Bus, Route, Trip
from app.routers.common import Paging, make_page
from app.schemas import BusDetail, BusSummary, BusTripOut, Page

router = APIRouter(prefix="/buses", tags=["buses"])


def _trip_count_query():
    return (
        select(Bus, func.count(Trip.id).label("trip_count"))
        .outerjoin(Trip, Trip.bus_id == Bus.id)
        .group_by(Bus.id)
    )


def _to_summary(bus: Bus, trip_count: int) -> dict:
    return {"id": bus.id, "registration_no": bus.registration_no, "trip_count": trip_count}


@router.get("", response_model=Page[BusSummary])
def list_buses(
    q: str | None = Query(None, min_length=1, description="Registration, e.g. 'WB 05 6214' or 'WB056214'"),
    paging: Paging = Depends(),
    db: Session = Depends(get_db),
):
    query = _trip_count_query()
    if q:
        query = query.where(Bus.registration_key.ilike(f"%{normalise_registration(q)}%"))

    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.execute(
        query.order_by(Bus.registration_no).limit(paging.limit).offset(paging.offset)
    ).all()
    return make_page([_to_summary(bus, count) for bus, count in rows], total, paging)


@router.get("/{registration}", response_model=BusDetail)
def get_bus(registration: str, db: Session = Depends(get_db)):
    key = normalise_registration(registration)
    row = db.execute(_trip_count_query().where(Bus.registration_key == key)).first()
    if row is None:
        raise HTTPException(status_code=404, detail="bus not found")
    bus, trip_count = row
    trips = db.scalars(
        select(Trip)
        .where(Trip.bus_id == bus.id)
        .join(Route, Route.id == Trip.route_id)
        .options(selectinload(Trip.schedules), selectinload(Trip.route))
        .order_by(Route.route_number, Trip.run_code)
    ).all()
    trip_rows = [
        BusTripOut(
            id=t.id,
            run_code=t.run_code,
            route_number=t.route.route_number,
            notes=t.notes,
            schedules=t.schedules,
        )
        for t in trips
    ]
    return {**_to_summary(bus, trip_count), "trips": trip_rows}
