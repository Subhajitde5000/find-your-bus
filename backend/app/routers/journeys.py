from datetime import time

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, aliased, selectinload

from app.db import get_db
from app.models import Route, RouteStop, Stop, Trip
from app.schemas import JourneyDeparture, JourneyOption, JourneySearchOut

router = APIRouter(prefix="/journeys", tags=["journeys"])


@router.get("/search", response_model=JourneySearchOut)
def search_journeys(
    from_stop_id: int = Query(..., description="Boarding stop id (see GET /stops)"),
    to_stop_id: int = Query(..., description="Alighting stop id (see GET /stops)"),
    after: time | None = Query(None, description="Only departures at or after this time, e.g. 08:30"),
    db: Session = Depends(get_db),
):
    if from_stop_id == to_stop_id:
        raise HTTPException(status_code=422, detail="from_stop_id and to_stop_id must differ")

    from_stop = db.get(Stop, from_stop_id)
    to_stop = db.get(Stop, to_stop_id)
    if from_stop is None or to_stop is None:
        raise HTTPException(status_code=404, detail="stop not found")

    # Routes that serve both stops. Each row gives the sequence number of both stops on that route.
    # Unverified routes are excluded: until the transport office confirms a route sheet, its
    # corridor (and therefore any journey built on it) must not be offered to passengers.
    boarding = aliased(RouteStop)
    alighting = aliased(RouteStop)
    matches = db.execute(
        select(Route, boarding.sequence, alighting.sequence)
        .join(boarding, (boarding.route_id == Route.id) & (boarding.stop_id == from_stop_id))
        .join(alighting, (alighting.route_id == Route.id) & (alighting.stop_id == to_stop_id))
        .where(Route.verified.is_(True))
        .order_by(Route.route_number)
    ).all()
    if not matches:
        return {"from_stop": from_stop, "to_stop": to_stop, "options": []}

    # Last sequence number per route = its destination terminal.
    route_ids = {route.id for route, _, _ in matches}
    last_seq = dict(
        db.execute(
            select(RouteStop.route_id, func.max(RouteStop.sequence))
            .where(RouteStop.route_id.in_(route_ids))
            .group_by(RouteStop.route_id)
        ).all()
    )

    trips_by_route: dict[int, list[Trip]] = {rid: [] for rid in route_ids}
    for trip in db.scalars(
        select(Trip)
        .where(Trip.route_id.in_(route_ids))
        .options(selectinload(Trip.schedules), selectinload(Trip.bus))
    ).all():
        trips_by_route[trip.route_id].append(trip)

    options: list[JourneyOption] = []
    for route, from_seq, to_seq in matches:
        direction = "outbound" if from_seq < to_seq else "return"
        between = abs(to_seq - from_seq) - 1
        # Timetables only cover the two terminals. Trips are usable only for a terminal-to-terminal
        # journey: origin->destination (outbound) or destination->origin (return).
        full_route = {from_seq, to_seq} == {1, last_seq[route.id]}
        schedule_available = full_route

        departures: list[JourneyDeparture] = []
        if schedule_available:
            for trip in trips_by_route[route.id]:
                for sched in trip.schedules:
                    if sched.direction != direction:
                        continue
                    if after is not None and sched.departure_time < after:
                        continue
                    departures.append(
                        JourneyDeparture(
                            trip_id=trip.id,
                            run_code=trip.run_code,
                            bus=trip.bus,
                            departure_time=sched.departure_time,
                            arrival_time=sched.arrival_time,
                        )
                    )
            departures.sort(key=lambda d: d.departure_time)

        options.append(
            JourneyOption(
                route_number=route.route_number,
                operator=route.operator,
                service_category=route.service_category,
                direction=direction,
                boarding_stop=from_stop,
                alighting_stop=to_stop,
                stops_between=between,
                schedule_available=schedule_available,
                departures=departures,
            )
        )

    return {"from_stop": from_stop, "to_stop": to_stop, "options": options}
