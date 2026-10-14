import { type BusTrip, type ServiceType, type Operator } from "./timetables";

export interface BackendStop {
  id: number;
  name: string;
  bus_stand_id: number | null;
}

export interface BackendHealth {
  status: string;
  database: string;
}

export interface BackendDeparture {
  trip_id: number;
  run_code: string;
  bus: { id: number; registration_no: string } | null;
  departure_time: string;
  arrival_time: string;
}

export interface BackendJourneyOption {
  route_number: string;
  operator: { id: number; name: string };
  service_category: { id: number; name: string };
  direction: "outbound" | "return";
  boarding_stop: { id: number; name: string };
  alighting_stop: { id: number; name: string };
  stops_between: number;
  schedule_available: boolean;
  departures: BackendDeparture[];
}

export interface BackendJourneySearchOut {
  from_stop: BackendStop;
  to_stop: BackendStop;
  options: BackendJourneyOption[];
}

export function parseTimeString(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(":");
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  return hours * 60 + minutes;
}

/** Check backend and PostgreSQL database connectivity */
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const res = await fetch("/api/v1/health", { cache: "no-store" });
    if (!res.ok) return false;
    const data = (await res.json()) as BackendHealth;
    return data.status === "ok" && data.database === "ok";
  } catch {
    return false;
  }
}

/** Fetch all stops registered in the PostgreSQL database */
export async function fetchAllStops(): Promise<BackendStop[]> {
  try {
    const res = await fetch("/api/v1/stops?limit=500", { next: { revalidate: 60 } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items as BackendStop[]) || [];
  } catch {
    return [];
  }
}

/** Search journeys between two stops using the FastAPI + Postgres backend */
export async function searchBackendJourneys(
  fromStopId: number,
  toStopId: number,
  afterTime?: string,
): Promise<BusTrip[]> {
  try {
    let url = `/api/v1/journeys/search?from_stop_id=${fromStopId}&to_stop_id=${toStopId}`;
    if (afterTime) {
      url += `&after=${encodeURIComponent(afterTime)}`;
    }
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const data: BackendJourneySearchOut = await res.json();

    const results: BusTrip[] = [];

    for (const opt of data.options) {
      const isAC =
        opt.service_category.name.toUpperCase().includes("AC") &&
        !opt.service_category.name.toUpperCase().includes("NON-AC");
      const serviceType: ServiceType = isAC ? "AC" : "Non-AC";
      const operator: Operator = opt.operator.name.toUpperCase().includes("WBTC") ? "WBTC" : "Private";

      if (opt.departures && opt.departures.length > 0) {
        const firstDep = parseTimeString(opt.departures[0].departure_time);
        const lastDep = parseTimeString(opt.departures[opt.departures.length - 1].departure_time);

        for (const dep of opt.departures) {
          const depMin = parseTimeString(dep.departure_time);
          let arrMin = parseTimeString(dep.arrival_time);
          if (arrMin < depMin) arrMin += 1440; // overnight adjustment
          const duration = Math.max(15, arrMin - depMin);

          results.push({
            id: `db-${opt.route_number}-${dep.trip_id}-${depMin}`,
            number: opt.route_number,
            operator,
            type: serviceType,
            terminusFrom: opt.boarding_stop.name,
            terminusTo: opt.alighting_stop.name,
            boarding: opt.boarding_stop.name,
            alighting: opt.alighting_stop.name,
            departure: depMin,
            arrival: arrMin,
            duration,
            via: opt.stops_between > 0 ? [`${opt.stops_between} intermediate stops`] : [],
            journeyStops: [
              { name: opt.boarding_stop.name, minutes: depMin, role: "boarding" },
              { name: opt.alighting_stop.name, minutes: arrMin, role: "alighting" },
            ],
            fullStops: [
              { name: opt.boarding_stop.name, minutes: depMin, journey: true },
              { name: opt.alighting_stop.name, minutes: arrMin, journey: true },
            ],
            headway: 20,
            serviceStart: firstDep,
            serviceEnd: lastDep,
          });
        }
      } else {
        // Route connects these stops, schedule estimated every 25 min
        const start = 6 * 60;
        const end = 21 * 60;
        for (let t = start; t <= end; t += 25) {
          const depMin = t;
          const arrMin = t + 45;
          results.push({
            id: `est-${opt.route_number}-${t}`,
            number: opt.route_number,
            operator,
            type: serviceType,
            terminusFrom: opt.boarding_stop.name,
            terminusTo: opt.alighting_stop.name,
            boarding: opt.boarding_stop.name,
            alighting: opt.alighting_stop.name,
            departure: depMin,
            arrival: arrMin,
            duration: 45,
            via: opt.stops_between > 0 ? [`${opt.stops_between} stops`] : [],
            journeyStops: [
              { name: opt.boarding_stop.name, minutes: depMin, role: "boarding" },
              { name: opt.alighting_stop.name, minutes: arrMin, role: "alighting" },
            ],
            fullStops: [
              { name: opt.boarding_stop.name, minutes: depMin, journey: true },
              { name: opt.alighting_stop.name, minutes: arrMin, journey: true },
            ],
            headway: 25,
            serviceStart: start,
            serviceEnd: end,
          });
        }
      }
    }

    return results.sort((a, b) => a.departure - b.departure);
  } catch {
    return [];
  }
}

export interface BackendRouteSummary {
  id: number;
  route_number: string;
  operator: { id: number; name: string };
  service_category: { id: number; name: string };
  origin: BackendStop;
  destination: BackendStop;
  origin_label: string;
  destination_label: string;
  fleet_allocation_text: string | null;
  documented_fleet_count: number | null;
}

export interface BackendRouteStop {
  sequence: number;
  stop: BackendStop;
}

export interface BackendRouteDetail extends BackendRouteSummary {
  via_text: string | null;
  trip_count: number;
  stops: BackendRouteStop[];
}

export interface BackendTripSchedule {
  direction: "outbound" | "return";
  departure_time: string;
  arrival_time: string;
}

export interface BackendRouteTrip {
  id: number;
  run_code: string;
  bus: { id: number; registration_no: string } | null;
  notes: string | null;
  schedules: BackendTripSchedule[];
}

/** Search or list routes from the backend */
export async function fetchRoutes(query?: string, limit = 50): Promise<BackendRouteSummary[]> {
  try {
    let url = `/api/v1/routes?limit=${limit}`;
    if (query && query.trim()) {
      url += `&q=${encodeURIComponent(query.trim())}`;
    }
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items as BackendRouteSummary[]) || [];
  } catch {
    return [];
  }
}

/** Fetch detailed route with its ordered stops */
export async function fetchRouteDetail(routeNumber: string): Promise<BackendRouteDetail | null> {
  try {
    const res = await fetch(`/api/v1/routes/${encodeURIComponent(routeNumber)}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as BackendRouteDetail;
  } catch {
    return null;
  }
}

/** Fetch scheduled runs / trips for a route */
export async function fetchRouteTrips(routeNumber: string): Promise<BackendRouteTrip[]> {
  try {
    const res = await fetch(`/api/v1/routes/${encodeURIComponent(routeNumber)}/trips`, { cache: "no-store" });
    if (!res.ok) return [];
    return (await res.json()) as BackendRouteTrip[];
  } catch {
    return [];
  }
}

