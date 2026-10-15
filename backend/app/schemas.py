"""Response/request models for the API (Pydantic v2)."""

from __future__ import annotations

from datetime import time
from decimal import Decimal
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict

T = TypeVar("T")
Direction = Literal["outbound", "return"]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(ORMModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int


class OperatorOut(ORMModel):
    id: int
    name: str


class ServiceCategoryOut(ORMModel):
    id: int
    name: str


class StopRef(ORMModel):
    id: int
    name: str
    bus_stand_id: int | None


class StandSummary(ORMModel):
    id: int
    serial_no: int | None
    name: str
    local_name: str | None
    node_category: str
    operator_division: str | None
    #: Null when no published source gives an address; such a stand is still listed.
    address: str | None
    #: False = address/role still missing; the stand is listed without invented details.
    verified: bool
    latitude: Decimal | None
    longitude: Decimal | None


class StandDetail(StandSummary):
    functional_role: str | None
    verification_note: str | None
    stops: list[StopRef]


class RouteSummary(ORMModel):
    id: int
    route_number: str
    operator: OperatorOut
    service_category: ServiceCategoryOut
    origin: StopRef
    destination: StopRef
    origin_label: str
    destination_label: str
    fleet_allocation_text: str | None
    documented_fleet_count: int | None
    #: False = still waiting for the transport office to confirm the route sheet.
    verified: bool


class RouteStopOut(ORMModel):
    sequence: int
    stop: StopRef


class ScheduleOut(ORMModel):
    direction: Direction
    departure_time: time
    arrival_time: time


class BusRef(ORMModel):
    id: int
    registration_no: str


class TripOut(ORMModel):
    id: int
    run_code: str
    bus: BusRef | None
    notes: str | None
    schedules: list[ScheduleOut]


class RouteDetail(RouteSummary):
    via_text: str | None
    #: Where the published timetable came from (blank while the route has none).
    timetable_source: str | None
    trip_count: int
    stops: list[RouteStopOut]


class BusSummary(ORMModel):
    id: int
    registration_no: str
    trip_count: int


class BusTripOut(ORMModel):
    id: int
    run_code: str
    route_number: str
    notes: str | None
    schedules: list[ScheduleOut]


class BusDetail(BusSummary):
    trips: list[BusTripOut]


class JourneyDeparture(ORMModel):
    trip_id: int
    run_code: str
    bus: BusRef | None
    departure_time: time
    arrival_time: time


class JourneyOption(ORMModel):
    route_number: str
    operator: OperatorOut
    service_category: ServiceCategoryOut
    direction: Direction
    boarding_stop: StopRef
    alighting_stop: StopRef
    stops_between: int
    # False when the route passes both stops but timetables only cover its two terminals.
    schedule_available: bool
    departures: list[JourneyDeparture]


class JourneySearchOut(ORMModel):
    from_stop: StopRef
    to_stop: StopRef
    options: list[JourneyOption]
