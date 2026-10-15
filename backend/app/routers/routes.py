from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.db import get_db
from app.models import Route, RouteStop, Trip
from app.routers.common import Paging, make_page
from app.schemas import Page, RouteDetail, RouteSummary, TripOut

router = APIRouter(prefix="/routes", tags=["routes"])


def _get_route_or_404(db: Session, route_number: str, *options) -> Route:
    route = db.scalar(
        select(Route).where(func.lower(Route.route_number) == route_number.lower()).options(*options)
    )
    if route is None:
        raise HTTPException(status_code=404, detail="route not found")
    return route


@router.get("", response_model=Page[RouteSummary])
def list_routes(
    q: str | None = Query(None, min_length=1, description="Route number or terminal name"),
    operator_id: int | None = None,
    service_category_id: int | None = None,
    paging: Paging = Depends(),
    db: Session = Depends(get_db),
):
    query = select(Route)
    if q:
        pattern = f"%{q}%"
        query = query.where(
            or_(
                Route.route_number.ilike(pattern),
                Route.origin_label.ilike(pattern),
                Route.destination_label.ilike(pattern),
            )
        )
    if operator_id is not None:
        query = query.where(Route.operator_id == operator_id)
    if service_category_id is not None:
        query = query.where(Route.service_category_id == service_category_id)

    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.scalars(query.order_by(Route.route_number).limit(paging.limit).offset(paging.offset)).all()
    return make_page(rows, total, paging)


@router.get("/{route_number}", response_model=RouteDetail)
def get_route(route_number: str, db: Session = Depends(get_db)):
    route = _get_route_or_404(
        db,
        route_number,
        selectinload(Route.stops).selectinload(RouteStop.stop),
    )
    trip_count = db.scalar(select(func.count()).select_from(Trip).where(Trip.route_id == route.id))
    return {
        **RouteSummary.model_validate(route).model_dump(),
        "via_text": route.via_text,
        "trip_count": trip_count,
        "stops": route.stops,
    }


@router.get("/{route_number}/trips", response_model=list[TripOut])
def get_route_trips(route_number: str, db: Session = Depends(get_db)):
    route = _get_route_or_404(db, route_number)
    return db.scalars(
        select(Trip).where(Trip.route_id == route.id).order_by(Trip.run_code)
    ).all()
