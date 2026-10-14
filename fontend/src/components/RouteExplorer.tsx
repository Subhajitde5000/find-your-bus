"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  BusFront,
  Check,
  ChevronRight,
  Clock3,
  CornerDownRight,
  Footprints,
  Info,
  Layers,
  MapPin,
  Route as RouteIcon,
  Search,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import {
  fetchRouteDetail,
  fetchRoutes,
  fetchRouteTrips,
  type BackendRouteDetail,
  type BackendRouteSummary,
  type BackendRouteTrip,
} from "@/lib/api";
import {
  getLocalRouteDetail,
  searchLocalRoutes,
  type LocalRouteSummary,
  type ServiceType,
} from "@/lib/timetables";

const POPULAR_ROUTE_CHIPS = ["1", "12C", "205", "218", "230", "S5", "AC12", "45B"];

interface RouteExplorerProps {
  onSelectJourney?: (from: string, to: string) => void;
  initialRouteNumber?: string;
}

export function RouteExplorer({ onSelectJourney, initialRouteNumber }: RouteExplorerProps) {
  const [searchQuery, setSearchQuery] = useState(initialRouteNumber || "");
  const [selectedRouteNumber, setSelectedRouteNumber] = useState<string | null>(initialRouteNumber || "1");
  const [routeDetail, setRouteDetail] = useState<BackendRouteDetail | null>(null);
  const [localFallback, setLocalFallback] = useState<LocalRouteSummary | null>(null);
  const [trips, setTrips] = useState<BackendRouteTrip[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"stops" | "timetable">("stops");
  const [direction, setDirection] = useState<"outbound" | "return">("outbound");
  const [suggestions, setSuggestions] = useState<BackendRouteSummary[]>([]);
  const [isOpenSuggestions, setIsOpenSuggestions] = useState(false);
  const [allRoutesList, setAllRoutesList] = useState<BackendRouteSummary[]>([]);

  // Load route directory on mount
  useEffect(() => {
    let mounted = true;
    async function loadDirectory() {
      const data = await fetchRoutes("", 100);
      if (mounted && data.length > 0) {
        setAllRoutesList(data);
      }
    }
    loadDirectory();
    return () => {
      mounted = false;
    };
  }, []);

  // Update suggestions as search query changes
  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      setSuggestions(allRoutesList.slice(0, 8));
      return;
    }
    if (allRoutesList.length > 0) {
      const filtered = allRoutesList.filter(
        (r) =>
          r.route_number.toLowerCase().includes(q) ||
          r.origin_label.toLowerCase().includes(q) ||
          r.destination_label.toLowerCase().includes(q),
      );
      setSuggestions(filtered.slice(0, 10));
    } else {
      // Local fallback
      const local = searchLocalRoutes(q).map((lr, idx) => ({
        id: idx + 1,
        route_number: lr.route_number,
        operator: { id: 1, name: lr.operator },
        service_category: { id: 1, name: lr.type },
        origin: { id: 1, name: lr.origin, bus_stand_id: null },
        destination: { id: 2, name: lr.destination, bus_stand_id: null },
        origin_label: lr.origin,
        destination_label: lr.destination,
        fleet_allocation_text: null,
        documented_fleet_count: null,
      }));
      setSuggestions(local.slice(0, 8));
    }
  }, [searchQuery, allRoutesList]);

  // Load details when selected route changes
  useEffect(() => {
    if (!selectedRouteNumber) return;
    let mounted = true;
    setLoading(true);

    async function loadRoute() {
      if (!selectedRouteNumber) return;
      const [detail, routeTrips] = await Promise.all([
        fetchRouteDetail(selectedRouteNumber),
        fetchRouteTrips(selectedRouteNumber),
      ]);

      if (!mounted) return;

      if (detail) {
        setRouteDetail(detail);
        setLocalFallback(null);
        setTrips(routeTrips);
      } else {
        // Fallback to local routes
        const local = getLocalRouteDetail(selectedRouteNumber);
        setLocalFallback(local || null);
        setRouteDetail(null);
        setTrips([]);
      }
      setLoading(false);
    }

    loadRoute();
    return () => {
      mounted = false;
    };
  }, [selectedRouteNumber]);

  function handleSelectRoute(routeNum: string) {
    setSelectedRouteNumber(routeNum);
    setSearchQuery(routeNum);
    setIsOpenSuggestions(false);
  }

  // Active route presentation data
  const routeNumber = routeDetail?.route_number || localFallback?.route_number || selectedRouteNumber || "";
  const isAC =
    (routeDetail?.service_category.name || localFallback?.type || "").toUpperCase().includes("AC") &&
    !(routeDetail?.service_category.name || localFallback?.type || "").toUpperCase().includes("NON-AC");
  const serviceType: ServiceType = isAC ? "AC" : "Non-AC";
  const operatorName = routeDetail?.operator.name || localFallback?.operator || "Kolkata Bus Service";
  const originName = routeDetail?.origin_label || localFallback?.origin || "Origin";
  const destinationName = routeDetail?.destination_label || localFallback?.destination || "Destination";
  const fleetInfo = routeDetail?.fleet_allocation_text || (routeDetail?.documented_fleet_count ? `${routeDetail.documented_fleet_count} buses` : null);

  // Stops list for display
  const rawStops = routeDetail?.stops.map((s) => s.stop.name) || localFallback?.stops || [];
  const displayStops = direction === "outbound" ? rawStops : [...rawStops].reverse();

  // Trips list filtered by active direction
  const activeTrips = useMemo(() => {
    return trips
      .map((t) => {
        const sched = t.schedules.find((s) => s.direction === direction);
        return {
          id: t.id,
          run_code: t.run_code,
          busReg: t.bus?.registration_no || "Scheduled Bus",
          departure: sched ? sched.departure_time.slice(0, 5) : "--:--",
          arrival: sched ? sched.arrival_time.slice(0, 5) : "--:--",
          notes: t.notes,
        };
      })
      .filter((t) => t.departure !== "--:--")
      .sort((a, b) => a.departure.localeCompare(b.departure));
  }, [trips, direction]);

  return (
    <div className="route-explorer">
      {/* Search Bar for Route Number */}
      <div className="route-search-bar-shell">
        <div className="route-search-input-wrap">
          <span className="route-search-icon" aria-hidden="true">
            <BusFront size={20} strokeWidth={2.2} />
          </span>
          <div className="route-input-inner">
            <label htmlFor="route-number-input">SEARCH BY BUS ROUTE NUMBER</label>
            <input
              id="route-number-input"
              type="text"
              placeholder="e.g. 1, 12C, 205, 218, S5, AC12..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsOpenSuggestions(true);
              }}
              onFocus={() => setIsOpenSuggestions(true)}
              autoComplete="off"
            />
          </div>
          {searchQuery && (
            <button
              type="button"
              className="route-clear-btn"
              onClick={() => {
                setSearchQuery("");
                setIsOpenSuggestions(true);
              }}
              aria-label="Clear route search"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Live Suggestions Dropdown */}
        {isOpenSuggestions && (
          <div className="route-suggestions-menu" role="listbox">
            <div className="suggestions-header">
              <span>Matching bus routes ({suggestions.length})</span>
              <button type="button" onClick={() => setIsOpenSuggestions(false)}>
                Close
              </button>
            </div>
            {suggestions.length > 0 ? (
              suggestions.map((item) => (
                <button
                  key={item.route_number}
                  type="button"
                  className={`route-suggestion-item ${item.route_number === selectedRouteNumber ? "active" : ""}`}
                  onClick={() => handleSelectRoute(item.route_number)}
                >
                  <span
                    className={`route-badge-chip ${
                      item.service_category.name.toUpperCase().includes("AC") &&
                      !item.service_category.name.toUpperCase().includes("NON-AC")
                        ? "ac"
                        : ""
                    }`}
                  >
                    {item.route_number}
                  </span>
                  <div className="suggestion-route-info">
                    <div className="suggestion-route-terminals">
                      <strong>{item.origin_label}</strong>
                      <ArrowRight size={13} />
                      <strong>{item.destination_label}</strong>
                    </div>
                    <span className="suggestion-route-operator">{item.operator.name}</span>
                  </div>
                  {item.route_number === selectedRouteNumber && <Check size={16} className="selected-check" />}
                </button>
              ))
            ) : (
              <div className="suggestion-empty-state">
                <Info size={16} />
                <span>No routes found matching &quot;{searchQuery}&quot;. Try numbers like 1, 12C, 205, or S5.</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick Route Number Chips */}
      <div className="popular-route-chips-row">
        <span className="popular-label">Popular routes:</span>
        <div className="chips-list">
          {POPULAR_ROUTE_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              className={`route-chip-btn ${selectedRouteNumber === chip ? "active" : ""}`}
              onClick={() => handleSelectRoute(chip)}
            >
              <BusFront size={13} />
              <span>{chip}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Route Detail Presentation Card */}
      {loading ? (
        <div className="route-loading-state">
          <div className="pulse-spinner" />
          <span>Loading route {selectedRouteNumber} details...</span>
        </div>
      ) : routeDetail || localFallback ? (
        <div className="route-display-card">
          {/* Card Top: Number, Terminus, Badges */}
          <div className="route-card-header">
            <div className="route-identity-block">
              <span className={`route-square large ${isAC ? "ac" : ""}`}>
                <BusFront size={28} strokeWidth={2.1} />
              </span>
              <div className="route-header-text">
                <div className="route-title-line">
                  <h3 className="route-hero-number">{routeNumber}</h3>
                  <span className={`type-badge ${isAC ? "ac" : ""}`}>{serviceType}</span>
                  <span className="operator-chip">{operatorName}</span>
                </div>
                <div className="route-terminals-headline">
                  <span>{direction === "outbound" ? originName : destinationName}</span>
                  <ArrowRight size={15} className="route-arrow-icon" />
                  <span>{direction === "outbound" ? destinationName : originName}</span>
                </div>
              </div>
            </div>

            {/* Direction Switcher */}
            <div className="route-controls-block">
              <button
                type="button"
                className="direction-toggle-btn"
                onClick={() => setDirection(direction === "outbound" ? "return" : "outbound")}
                title="Swap direction"
              >
                <ArrowLeftRight size={15} strokeWidth={2.2} />
                <span>
                  Direction: <strong>{direction === "outbound" ? "Outbound" : "Return"}</strong>
                </span>
              </button>
              {onSelectJourney && (
                <button
                  type="button"
                  className="plan-trip-btn"
                  onClick={() => onSelectJourney(originName, destinationName)}
                  title="Plan journey between terminals"
                >
                  <Search size={14} />
                  <span>Plan Journey</span>
                  <ArrowUpRight size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Quick Meta Pills */}
          <div className="route-meta-strip">
            {fleetInfo && (
              <span className="meta-pill">
                <BusFront size={14} />
                <span>{fleetInfo}</span>
              </span>
            )}
            <span className="meta-pill">
              <MapPin size={14} />
              <span>{displayStops.length} Total Stops</span>
            </span>
            {routeDetail?.via_text && (
              <span className="meta-pill via">
                <CornerDownRight size={14} />
                <span>Via: {routeDetail.via_text}</span>
              </span>
            )}
            {activeTrips.length > 0 && (
              <span className="meta-pill highlight">
                <Clock3 size={14} />
                <span>{activeTrips.length} Daily Scheduled Departures</span>
              </span>
            )}
          </div>

          {/* View Mode Tabs: Stops Timeline vs Timetable */}
          <div className="route-subtabs-row">
            <button
              type="button"
              className={`subtab-btn ${activeTab === "stops" ? "active" : ""}`}
              onClick={() => setActiveTab("stops")}
            >
              <RouteIcon size={15} />
              <span>All Stops Sequence ({displayStops.length})</span>
            </button>
            <button
              type="button"
              className={`subtab-btn ${activeTab === "timetable" ? "active" : ""}`}
              onClick={() => setActiveTab("timetable")}
            >
              <Clock3 size={15} />
              <span>Schedule & Timetable {activeTrips.length > 0 ? `(${activeTrips.length})` : ""}</span>
            </button>
          </div>

          {/* TAB 1: Stops Timeline */}
          {activeTab === "stops" && (
            <div className="stops-timeline-view">
              <div className="timeline-instructions">
                <span>
                  Ordered stops for <strong>{routeNumber}</strong> ({direction === "outbound" ? "Outbound" : "Return"})
                </span>
                <span className="click-stop-hint">Click any stop to plan journey</span>
              </div>
              <ol className="stops-vertical-timeline">
                {displayStops.map((stopName, index) => {
                  const isFirst = index === 0;
                  const isLast = index === displayStops.length - 1;
                  return (
                    <li
                      key={`${stopName}-${index}`}
                      className={`timeline-stop-item ${isFirst ? "terminal start" : ""} ${isLast ? "terminal end" : ""}`}
                    >
                      <div className="timeline-marker-col">
                        <span className={`timeline-node ${isFirst ? "start" : isLast ? "end" : "middle"}`}>
                          {isFirst || isLast ? <MapPin size={12} strokeWidth={2.8} /> : index + 1}
                        </span>
                        {!isLast && <span className="timeline-connector" />}
                      </div>
                      <div className="timeline-stop-info">
                        <div className="stop-title-wrap">
                          <strong className="stop-name">{stopName}</strong>
                          {isFirst && <span className="terminal-badge origin">Origin Terminal</span>}
                          {isLast && <span className="terminal-badge dest">Destination Terminal</span>}
                        </div>
                        {onSelectJourney && !isFirst && (
                          <button
                            type="button"
                            className="ride-to-here-btn"
                            onClick={() => onSelectJourney(displayStops[0], stopName)}
                          >
                            Ride from {displayStops[0]} <ArrowRight size={11} />
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {/* TAB 2: Scheduled Departures Timetable */}
          {activeTab === "timetable" && (
            <div className="route-timetable-view">
              <div className="timetable-header-info">
                <div>
                  <h4>{direction === "outbound" ? originName : destinationName} Departures</h4>
                  <p>Official timetable runs loaded from Kolkata bus directory.</p>
                </div>
                <div className="direction-badge">
                  <span>{direction.toUpperCase()}</span>
                </div>
              </div>

              {activeTrips.length > 0 ? (
                <div className="timetable-table-wrapper">
                  <table className="timetable-table">
                    <thead>
                      <tr>
                        <th>RUN CODE</th>
                        <th>DEPARTURE</th>
                        <th>ARRIVAL</th>
                        <th>VEHICLE REGISTRATION</th>
                        <th>NOTES</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeTrips.map((trip) => (
                        <tr key={trip.id}>
                          <td>
                            <span className="run-code-badge">{trip.run_code}</span>
                          </td>
                          <td className="time-cell">
                            <strong>{trip.departure}</strong>
                          </td>
                          <td className="time-cell">
                            <span>{trip.arrival}</span>
                          </td>
                          <td className="bus-reg-cell">
                            <span className="bus-plate">
                              <BusFront size={12} />
                              {trip.busReg}
                            </span>
                          </td>
                          <td className="notes-cell">
                            <span>{trip.notes || "Regular scheduled run"}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="timetable-empty">
                  <Clock3 size={32} />
                  <h5>No scheduled trips recorded for this direction</h5>
                  <p>Regular service runs along this corridor every 20-30 minutes between 06:00 and 21:00.</p>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="route-not-found">
          <Info size={24} />
          <h4>Route not found</h4>
          <p>We could not find route &quot;{selectedRouteNumber}&quot;. Choose a route from the suggestions above.</p>
        </div>
      )}
    </div>
  );
}
