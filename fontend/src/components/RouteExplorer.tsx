"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  BusFront,
  Check,
  Clock3,
  CornerDownRight,
  Info,
  LocateFixed,
  MapPin,
  Route as RouteIcon,
  Search,
  X,
} from "lucide-react";
import {
  getRoute,
  getRouteDepartures,
  searchRoutes,
  toClock24,
  type Direction,
} from "@/lib/timetables";
import { isRideable } from "@/lib/coords";

const POPULAR_ROUTE_CHIPS = ["1", "12C", "205", "218", "S12", "AC9", "C11", "45B"];

interface RouteExplorerProps {
  onSelectJourney?: (from: string, to: string) => void;
  initialRouteNumber?: string;
}

export function RouteExplorer({ onSelectJourney, initialRouteNumber }: RouteExplorerProps) {
  const [searchQuery, setSearchQuery] = useState(initialRouteNumber || "");
  const [selectedRouteNumber, setSelectedRouteNumber] = useState<string>(initialRouteNumber || "1");
  const [activeTab, setActiveTab] = useState<"stops" | "timetable">("stops");
  const [direction, setDirection] = useState<Direction>("outbound");
  const [isOpenSuggestions, setIsOpenSuggestions] = useState(false);

  const suggestions = useMemo(
    () => searchRoutes(searchQuery, searchQuery.trim() ? 10 : 8),
    [searchQuery],
  );
  const route = useMemo(() => getRoute(selectedRouteNumber), [selectedRouteNumber]);
  const departures = useMemo(
    () => getRouteDepartures(selectedRouteNumber, direction),
    [selectedRouteNumber, direction],
  );

  function handleSelectRoute(routeNum: string) {
    setSelectedRouteNumber(routeNum);
    setSearchQuery(routeNum);
    setIsOpenSuggestions(false);
  }

  // Presentation values for the selected route
  const routeNumber = route?.number ?? selectedRouteNumber;
  const isAC = route?.type === "AC";
  const serviceType = isAC ? "AC" : "Non-AC";
  const operatorName = route?.operator ?? "Kolkata Bus Service";
  const originName = route?.origin ?? "Origin";
  const destinationName = route?.destination ?? "Destination";
  const fleetInfo = route?.fleetText ?? (route?.fleetCount ? `${route.fleetCount} buses` : null);
  const isSample = route?.source === "preview";
  const isCatalogue = route?.source === "catalogue";
  const isExternal = route?.source === "external";
  const provenanceLabel =
    route?.provenance === "wbtc_routes" || route?.provenance === "wbtc_routes;kolbusopedia"
      ? "WBTC city route list"
      : route?.provenance === "kolbusopedia"
        ? "Bus-O-Pedia route catalogue"
        : route?.provenance === "osm"
          ? "OpenStreetMap route relation"
          : route?.provenance ?? null;
  const viaText =
    route && route.via.length
      ? `${route.via.slice(0, 6).join(", ")}${route.via.length > 6 ? ` +${route.via.length - 6} more` : ""}`
      : null;

  // Stops list for display
  const rawStops = route?.stops ?? [];
  const displayStops = direction === "outbound" ? rawStops : [...rawStops].reverse();

  const activeTrips = useMemo(
    () =>
      departures.map((item) => ({
        id: item.id,
        runCode: item.runCode ?? "—",
        busReg: item.bus ?? "Not recorded",
        departure: toClock24(item.departure),
        arrival: toClock24(item.arrival),
        notes: item.notes,
      })),
    [departures],
  );

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
              placeholder="e.g. 1, 12C, 205, S12, AC9, C11..."
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

        {/* Suggestions Dropdown */}
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
                  key={item.number}
                  type="button"
                  className={`route-suggestion-item ${item.number === selectedRouteNumber ? "active" : ""}`}
                  onClick={() => handleSelectRoute(item.number)}
                >
                  <span className={`route-badge-chip ${item.type === "AC" ? "ac" : ""}`}>{item.number}</span>
                  <div className="suggestion-route-info">
                    <div className="suggestion-route-terminals">
                      <strong>{item.origin}</strong>
                      <ArrowRight size={13} />
                      <strong>{item.destination}</strong>
                    </div>
                    <span className="suggestion-route-operator">{item.operator}</span>
                  </div>
                  {item.number === selectedRouteNumber && <Check size={16} className="selected-check" />}
                </button>
              ))
            ) : (
              <div className="suggestion-empty-state">
                <Info size={16} />
                <span>No routes found matching &quot;{searchQuery}&quot;. Try numbers like 1, 12C, 205, or S12.</span>
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
      {route ? (
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
              {isRideable(displayStops) && (
                <Link
                  className="ride-along-btn"
                  href={`/ride?route=${encodeURIComponent(routeNumber)}&dir=${direction}`}
                  title="Open the full-page ride map for this route"
                >
                  <LocateFixed size={14} />
                  <span>Set on bus</span>
                </Link>
              )}
              {onSelectJourney && (
                <button
                  type="button"
                  className="plan-trip-btn"
                  onClick={() =>
                    onSelectJourney(
                      direction === "outbound" ? originName : destinationName,
                      direction === "outbound" ? destinationName : originName,
                    )
                  }
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
            {viaText && (
              <span className="meta-pill via">
                <CornerDownRight size={14} />
                <span>Via: {viaText}</span>
              </span>
            )}
            {activeTrips.length > 0 && (
              <span className="meta-pill highlight">
                <Clock3 size={14} />
                <span>
                  {activeTrips.length} {isSample ? "Sample" : "Daily Scheduled"} Departures
                </span>
              </span>
            )}
            {isCatalogue && (
              <span className="meta-pill">
                <Info size={14} />
                <span>Route only · no published timetable</span>
              </span>
            )}
            {provenanceLabel && (isCatalogue || isExternal) && (
              <span className="meta-pill via">
                <RouteIcon size={14} />
                <span>{provenanceLabel}{route?.confidence === "verified" ? " · verified" : ""}</span>
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
                  <p>
                    {isSample
                      ? "Sample departures for this route. Not an official timetable."
                      : isExternal
                        ? `Published stop-by-stop timetable from ${provenanceLabel ?? "the operator"}. Not live.`
                        : isCatalogue
                          ? "No timetable is published for this route. Kolkata city buses run to frequency; no departure is invented."
                          : "Published passage times from the Kolkata bus directory v2. Not live."}
                  </p>
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
                            <span className="run-code-badge">{trip.runCode}</span>
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
                  <h5>{isCatalogue ? "No timetable is published for this route" : "No departures listed for this direction"}</h5>
                  <p>
                    {isCatalogue
                      ? "The route and its stops are real; the times are not published anywhere, so they are left blank."
                      : "The directory has no run times for this route in this direction."}
                  </p>
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
