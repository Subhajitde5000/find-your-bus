"""Database schema (SQLAlchemy 2.0 ORM). This module is the source of truth for the tables.

Entity overview
---------------
operators ──< routes >── service_categories
                 │
                 ├──< route_stops >── stops >── bus_stands (optional link)
                 │
                 └──< trips >── buses
                        └──< trip_schedules
"""

from datetime import datetime, time

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    Time,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

NODE_CATEGORIES = (
    "Operational Maintenance Depot",
    "Major Passenger Terminal",
    "Route Stand & Transit Node",
)
TRIP_DIRECTIONS = ("outbound", "return")


def _sql_in(values: tuple[str, ...]) -> str:
    return ", ".join(f"'{v}'" for v in values)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class Operator(Base):
    """Bus operator, e.g. 'WBTC Govt (AC Volvo)' or 'Private Operators Syndicate'."""

    __tablename__ = "operators"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(150), unique=True, nullable=False)

    routes: Mapped[list["Route"]] = relationship(back_populates="operator")


class ServiceCategory(Base):
    """Service type of a route, e.g. 'AC Volvo Premium' or 'Private Stage Carriage'."""

    __tablename__ = "service_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(150), unique=True, nullable=False)

    routes: Mapped[list["Route"]] = relationship(back_populates="service_category")


class BusStand(TimestampMixin, Base):
    """Physical infrastructure: depots, major passenger terminals and route stands."""

    __tablename__ = "bus_stands"
    __table_args__ = (
        CheckConstraint(
            f"node_category IN ({_sql_in(NODE_CATEGORIES)})", name="ck_bus_stands_node_category"
        ),
        CheckConstraint(
            "latitude IS NULL OR latitude BETWEEN -90 AND 90", name="ck_bus_stands_latitude"
        ),
        CheckConstraint(
            "longitude IS NULL OR longitude BETWEEN -180 AND 180", name="ck_bus_stands_longitude"
        ),
        Index("ix_bus_stands_local_name", "local_name"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    serial_no: Mapped[int | None] = mapped_column(Integer, unique=True)
    name: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    local_name: Mapped[str | None] = mapped_column(String(200))
    node_category: Mapped[str] = mapped_column(String(80), nullable=False)
    operator_division: Mapped[str | None] = mapped_column(String(200))
    address: Mapped[str] = mapped_column(Text, nullable=False)
    functional_role: Mapped[str | None] = mapped_column(Text)
    # Not in the source spreadsheets yet; filled in later (geocoding / manual entry).
    latitude: Mapped[float | None] = mapped_column(Numeric(9, 6))
    longitude: Mapped[float | None] = mapped_column(Numeric(9, 6))

    stops: Mapped[list["Stop"]] = relationship(back_populates="bus_stand")


class Stop(Base):
    """A named point a bus serves (a stand, crossing, landmark or via point).

    `bus_stand_id` links the stop to an infrastructure record when the name clearly matches one.
    """

    __tablename__ = "stops"
    __table_args__ = (
        Index("uq_stops_name_ci", text("lower(name)"), unique=True),
        Index("ix_stops_bus_stand_id", "bus_stand_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    bus_stand_id: Mapped[int | None] = mapped_column(
        ForeignKey("bus_stands.id", ondelete="SET NULL")
    )

    bus_stand: Mapped[BusStand | None] = relationship(back_populates="stops", lazy="selectin")


class Route(TimestampMixin, Base):
    """A numbered bus route, e.g. S12, AC1, 235 or LD_Digha."""

    __tablename__ = "routes"
    __table_args__ = (
        Index("ix_routes_operator_id", "operator_id"),
        Index("ix_routes_service_category_id", "service_category_id"),
        CheckConstraint(
            "documented_fleet_count IS NULL OR documented_fleet_count >= 0",
            name="ck_routes_fleet_count",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    route_number: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    operator_id: Mapped[int] = mapped_column(
        ForeignKey("operators.id", ondelete="RESTRICT"), nullable=False
    )
    service_category_id: Mapped[int] = mapped_column(
        ForeignKey("service_categories.id", ondelete="RESTRICT"), nullable=False
    )
    origin_stop_id: Mapped[int] = mapped_column(
        ForeignKey("stops.id", ondelete="RESTRICT"), nullable=False
    )
    destination_stop_id: Mapped[int] = mapped_column(
        ForeignKey("stops.id", ondelete="RESTRICT"), nullable=False
    )
    # Terminal names exactly as written in the source file (may include notes such as "(via E.M. Bypass)").
    origin_label: Mapped[str] = mapped_column(String(200), nullable=False)
    destination_label: Mapped[str] = mapped_column(String(200), nullable=False)
    via_text: Mapped[str | None] = mapped_column(Text)
    fleet_allocation_text: Mapped[str | None] = mapped_column(String(200))
    documented_fleet_count: Mapped[int | None] = mapped_column(Integer)
    source_sheet: Mapped[str | None] = mapped_column(String(80))

    operator: Mapped[Operator] = relationship(back_populates="routes", lazy="selectin")
    service_category: Mapped[ServiceCategory] = relationship(
        back_populates="routes", lazy="selectin"
    )
    origin_stop: Mapped[Stop] = relationship(foreign_keys=[origin_stop_id], lazy="selectin")
    destination_stop: Mapped[Stop] = relationship(
        foreign_keys=[destination_stop_id], lazy="selectin"
    )
    stops: Mapped[list["RouteStop"]] = relationship(
        back_populates="route",
        order_by="RouteStop.sequence",
        cascade="all, delete-orphan",
        lazy="raise",
    )
    trips: Mapped[list["Trip"]] = relationship(back_populates="route", lazy="raise")

    @property
    def origin(self) -> Stop:
        return self.origin_stop

    @property
    def destination(self) -> Stop:
        return self.destination_stop


class RouteStop(Base):
    """Ordered stop list of a route. sequence 1 = origin, last = destination."""

    __tablename__ = "route_stops"
    __table_args__ = (
        CheckConstraint("sequence > 0", name="ck_route_stops_sequence"),
        Index("ix_route_stops_stop_id", "stop_id"),
    )

    route_id: Mapped[int] = mapped_column(
        ForeignKey("routes.id", ondelete="CASCADE"), primary_key=True
    )
    sequence: Mapped[int] = mapped_column(Integer, primary_key=True)
    stop_id: Mapped[int] = mapped_column(ForeignKey("stops.id", ondelete="RESTRICT"), nullable=False)

    route: Mapped[Route] = relationship(back_populates="stops", lazy="raise")
    stop: Mapped[Stop] = relationship(lazy="selectin")


class Bus(TimestampMixin, Base):
    """A vehicle identified by its registration number (e.g. 'WB 05 6214')."""

    __tablename__ = "buses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    registration_no: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    # Normalised form without spaces/punctuation and upper-cased (e.g. 'WB056214'), used for lookups.
    registration_key: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)

    trips: Mapped[list["Trip"]] = relationship(back_populates="bus", lazy="raise")


class Trip(TimestampMixin, Base):
    """One scheduled run of a route by a bus (a round trip: outbound + return)."""

    __tablename__ = "trips"
    __table_args__ = (
        Index("ix_trips_route_id", "route_id"),
        Index("ix_trips_bus_id", "bus_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_code: Mapped[str] = mapped_column(String(60), unique=True, nullable=False)
    route_id: Mapped[int] = mapped_column(ForeignKey("routes.id", ondelete="CASCADE"), nullable=False)
    # NULL when the source has no registration (floating reserve or private roster).
    bus_id: Mapped[int | None] = mapped_column(ForeignKey("buses.id", ondelete="SET NULL"))
    notes: Mapped[str | None] = mapped_column(Text)

    route: Mapped[Route] = relationship(back_populates="trips", lazy="raise")
    bus: Mapped[Bus | None] = relationship(back_populates="trips", lazy="selectin")
    schedules: Mapped[list["TripSchedule"]] = relationship(
        back_populates="trip",
        cascade="all, delete-orphan",
        order_by="TripSchedule.departure_time",
        lazy="selectin",
    )


class TripSchedule(Base):
    """Departure/arrival times of a trip in one direction.

    outbound = origin -> destination, return = destination -> origin.
    """

    __tablename__ = "trip_schedules"
    __table_args__ = (
        UniqueConstraint("trip_id", "direction", name="uq_trip_schedules_trip_direction"),
        CheckConstraint(
            f"direction IN ({_sql_in(TRIP_DIRECTIONS)})", name="ck_trip_schedules_direction"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    trip_id: Mapped[int] = mapped_column(
        ForeignKey("trips.id", ondelete="CASCADE"), index=True, nullable=False
    )
    direction: Mapped[str] = mapped_column(String(10), nullable=False)
    departure_time: Mapped[time] = mapped_column(Time, nullable=False)
    arrival_time: Mapped[time] = mapped_column(Time, nullable=False)

    trip: Mapped[Trip] = relationship(back_populates="schedules", lazy="raise")
