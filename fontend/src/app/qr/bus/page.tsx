"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  ArrowLeftRight,
  BusFront,
  Clock3,
  Crosshair,
  Info,
  LocateFixed,
  MapPin,
  MapPinOff,
  Navigation2,
  Route as RouteIcon,
  ScanLine,
  Search,
  Ticket,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { QrHeader, useOnline } from "@/components/QrHeader";
import { StopSearchBox } from "@/components/StopSearchBox";
import { formatClock, getRoute, getRouteStops, searchRoutes, canonicalStop, type Direction } from "@/lib/timetables";
import {
  AT_STOP_RADIUS_METRES,
  NEAR_STOP_RADIUS_METRES,
  guessStops,
  identifyBusRun,
  passagesFor,
  stopsAhead,
  travelMinutes,
  type RunCandidate,
} from "@/lib/onBus";
import { formatDistance } from "@/lib/geo";
import { usePosition } from "@/lib/usePosition";
import { useKolkataMinute } from "@/lib/useKolkataMinute";

/*
 * /qr/bus — the sticker inside a bus.
 *
 * The link only says which route the sticker is on. This screen works out the rest:
 *
 *   your position -> the nearest stop of that route -> the published runs at that stop
 *   -> the one whose time is closest to now.
 *
 * The result is always labelled as likely, never as certain: this project has no live
 * vehicle data, and a timetable cannot know that the bus is stuck at a signal. The
 * alternatives are shown for the same reason.
 *
 * Real conditions this handles, because they happen every day:
 *   - no location permission, location off, a rough fix, or a fix far from the route;
 *   - a stop the map cannot place (listed in the manual picker, marked as unplaced);
 *   - the wrong direction (one tap to swap);
 *   - a route with no published times at all (says so, offers the ride screen instead);
 *   - before the first bus, after the last bus, and runs after midnight;
 *   - the same route number having several runs within a few minutes of each other.
 *
 * Nothing here needs the network. The timetable, the stop positions and the matching all
 * ship with the page, which is the only way this can work inside a moving bus.
 */

interface BusParams {
  route: string;
  direction: Direction | null;
  busReg: string | null;
  boarding: string | null;
  destination: string | null;
}

function readParams(search: URLSearchParams): BusParams {
  const direction = search.get("d");
  return {
    route: (search.get("r") ?? search.get("route") ?? "").trim(),
    direction: direction === "r" || direction === "return" ? "return" : direction === "o" || direction === "outbound" ? "outbound" : null,
    busReg: (search.get("bus") ?? "").trim() || null,
    boarding: (search.get("from") ?? "").trim() || null,
    destination: (search.get("to") ?? "").trim() || null,
  };
}

function OnBusScreen() {
  const search = useSearchParams();
  const params = useMemo(() => readParams(new URLSearchParams(search.toString())), [search]);
  const online = useOnline();
  const nowMinutes = useKolkataMinute();
  const position = usePosition();

  const route = useMemo(() => (params.route ? getRoute(params.route) : undefined), [params.route]);
  const [direction, setDirection] = useState<Direction>(params.direction ?? "outbound");

  const routeStops = useMemo(() => (route ? getRouteStops(route.number, direction) : []), [route, direction]);
  const routeStopSet = useMemo(() => new Set(routeStops), [routeStops]);

  /** The stop the passenger is at. Chosen by GPS where possible, by hand otherwise. */
  const [stop, setStop] = useState<string | null>(() => {
    if (!params.boarding) return null;
    const canonical = canonicalStop(params.boarding);
    return canonical || null;
  });
  const [pickingStop, setPickingStop] = useState(false);
  const [destination, setDestination] = useState<string | null>(params.destination);
  const [chosenRun, setChosenRun] = useState<string | null>(null);
  /** Fixed when the screen opened, so the identified bus does not change while reading. */
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  const [manualRoute, setManualRoute] = useState("");

  if (nowMinutes > 0 && openedAt === null) setOpenedAt(nowMinutes);

  // A boarding stop that this route does not actually serve (a stale sticker, a link
  // made for another route) is dropped rather than shown as fact.
  if (stop && routeStopSet.size > 0 && !routeStopSet.has(stop)) setStop(null);
  if (destination && routeStopSet.size > 0 && !routeStopSet.has(destination)) setDestination(null);

  useEffect(() => {
    if (position.status === "idle") position.locate();
  }, [position]);

  const guesses = useMemo(
    () => (route && position.fix ? guessStops(route.number, direction, position.fix, { limit: 5 }) : []),
    [route, direction, position.fix],
  );

  /*
   * The nearest stop is picked during render, not in an effect: while the passenger has
   * not chosen one, the phone's own position decides -- but only when it is at or beside
   * a stop. A fix 800 m away is not evidence of a stop, so they pick by hand instead.
   */
  const autoStop = useMemo(() => {
    if (stop || !route || position.status !== "ready" || !position.fix) return null;
    return guesses.find((guess) => guess.level === "at-stop" || guess.level === "near-stop")?.name ?? null;
  }, [stop, route, position.status, position.fix, guesses]);
  const activeStop = stop ?? autoStop;

  const passages = useMemo(
    () => (route && activeStop ? passagesFor(route.number, direction, activeStop) : []),
    [route, direction, activeStop],
  );
  const identified = useMemo(() => identifyBusRun(passages, openedAt ?? 0), [passages, openedAt]);

  const chosen: RunCandidate | null = useMemo(() => {
    if (!chosenRun) return identified.best;
    return identified.candidates.find((candidate) => candidate.passage.runCode === chosenRun) ?? identified.best;
  }, [chosenRun, identified]);

  const swapDirection = useCallback(() => {
    setDirection((current) => (current === "outbound" ? "return" : "outbound"));
    setChosenRun(null);
    setStop(null);
  }, []);

  const pickStop = useCallback((name: string) => {
    setStop(canonicalStop(name) || name);
    setPickingStop(false);
    setChosenRun(null);
  }, []);

  const ahead = useMemo(() => (route && activeStop ? stopsAhead(route.number, direction, activeStop) : []), [route, direction, activeStop]);
  const journeyMinutes =
    route && activeStop && destination && chosen
      ? travelMinutes(route.number, direction, activeStop, destination, chosen.passage.runCode)
      : null;

  const rideParams = useMemo(() => {
    if (!route) return null;
    const next = new URLSearchParams({ route: route.number, dir: direction });
    if (activeStop) next.set("from", activeStop);
    if (destination) next.set("to", destination);
    if (chosen?.passage.runCode) next.set("run", chosen.passage.runCode);
    return next.toString();
  }, [route, direction, activeStop, destination, chosen]);

  // ------------------------------------------------------------------ missing route

  if (!route) {
    const suggestions = manualRoute.trim() ? searchRoutes(manualRoute, 6) : [];
    return (
      <div className="ride-page">
        <QrHeader title="On bus" />
        <main className="ride-body">
          <div className="ride-notice-block">
            <span className="ride-notice-icon"><MapPinOff size={24} /></span>
            <h1>{params.route ? `Route ${params.route} is not in this directory` : "This sticker has no route"}</h1>
            <p>
              A QR sticker carries the route number it was printed for. If the directory has been
              rebuilt and the route was renamed, the code can be out of date. Search for the route
              you can see on the bus instead.
            </p>
            <div className="qr-route-search">
              <label className="qr-field">
                <Search size={15} aria-hidden="true" />
                <input
                  type="search"
                  value={manualRoute}
                  placeholder="Route number, e.g. 230 or S-12A"
                  aria-label="Route number"
                  onChange={(event) => setManualRoute(event.target.value)}
                />
              </label>
              {suggestions.length > 0 && (
                <div className="qr-suggestions">
                  {suggestions.map((item) => (
                    <Link key={item.number} href={`/qr/bus?r=${encodeURIComponent(item.number)}`}>
                      <strong>{item.number}</strong>
                      <span>{item.origin} to {item.destination}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <Link className="ride-primary" href="/">Search the timetable <ArrowRight size={15} aria-hidden="true" /></Link>
          </div>
        </main>
      </div>
    );
  }

  const ready = nowMinutes > 0 && openedAt !== null;
  const directionLabel = direction === "outbound" ? `${route.origin} to ${route.destination}` : `${route.destination} to ${route.origin}`;
  const nearest = guesses[0];
  const hereGuess = activeStop ? guesses.find((guess) => guess.name === activeStop) : undefined;

  return (
    <div className="ride-page">
      <QrHeader title="On bus" />

      <main className="ride-body qr-body">
        <header className="ride-route">
          <span className={`route-square ${route.type === "AC" ? "ac" : ""}`}>
            <BusFront size={20} strokeWidth={2.1} aria-hidden="true" />
          </span>
          <div className="ride-route-text">
            <div className="ride-route-row">
              <strong>Bus {route.number}</strong>
              <span className={`type-badge ${route.type === "AC" ? "ac" : ""}`}>{route.type}</span>
              <span className="qr-sticker-tag"><Ticket size={11} aria-hidden="true" /> On bus sticker</span>
            </div>
            <span className="ride-termini">
              {direction === "outbound" ? route.origin : route.destination}
              <ArrowRight size={13} aria-hidden="true" />
              {direction === "outbound" ? route.destination : route.origin}
            </span>
            <span className="ride-operator">{route.operator}</span>
            {params.busReg && (
              <span className="qr-bus-reg" title="Registration printed on this sticker">
                <BusFront size={12} aria-hidden="true" /> {params.busReg}
              </span>
            )}
          </div>
        </header>

        {!ready ? (
          <div className="ride-loading">Reading the timetable…</div>
        ) : (
          <>
            <section className="ride-status" data-state={identified.state === "identified" ? "on-bus" : "waiting"} aria-live="polite">
              <span className="ride-status-icon">
                {activeStop ? <Navigation2 size={22} /> : <Crosshair size={22} />}
              </span>
              <div className="ride-status-text">
                {!activeStop ? (
                  <>
                    <h1>{position.status === "locating" ? "Finding your stop…" : "Which stop are you at?"}</h1>
                    <p>
                      {position.message ??
                        "Location is used once, on this phone, to work out which stop of this route you are nearest to."}
                    </p>
                  </>
                ) : identified.state === "identified" && chosen ? (
                  <>
                    <h1>
                      Your bus is probably the {chosen.clock.time} {chosen.clock.period} run
                    </h1>
                    <p>
                      Published to pass <strong>{activeStop}</strong> at {chosen.clock.time} {chosen.clock.period}
                      {chosen.deltaMinutes >= 1 ? ` — ${Math.round(chosen.deltaMinutes)} min ago` : chosen.deltaMinutes <= -1 ? ` — ${Math.abs(Math.round(chosen.deltaMinutes))} min from now` : " — right now"}.
                      {" "}{identified.message}
                    </p>
                  </>
                ) : (
                  <>
                    <h1>{identified.state === "no-times" ? "This route has no published times" : "No published bus here right now"}</h1>
                    <p>{identified.message}</p>
                  </>
                )}
              </div>
              <div className="ride-status-actions">
                {!activeStop ? (
                  <button type="button" className="ride-primary" onClick={() => setPickingStop(true)}>
                    <MapPin size={16} aria-hidden="true" /> Pick my stop
                  </button>
                ) : (
                  <button type="button" className="ride-secondary" onClick={() => setPickingStop(true)}>
                    <MapPin size={15} aria-hidden="true" /> Change stop
                  </button>
                )}
              </div>
            </section>

            {/* What we know about the stop, and how sure it is. */}
            {activeStop && (
              <section className="qr-facts" aria-label="Where you are on this route">
                <div className="qr-fact">
                  <span className="qr-fact-label"><MapPin size={12} aria-hidden="true" /> Your stop</span>
                  <strong>{activeStop}</strong>
                  <span className="qr-fact-meta">
                    {hereGuess
                      ? `${formatDistance(hereGuess.metres)} from you · ${hereGuess.level === "at-stop" ? "you are at it" : hereGuess.level === "near-stop" ? "just past it" : "not close to it"}`
                      : position.fix
                        ? "kept from the link"
                        : "picked by hand"}
                  </span>
                </div>
                <div className="qr-fact">
                  <span className="qr-fact-label"><Clock3 size={12} aria-hidden="true" /> Now, Kolkata</span>
                  <strong>{formatClock(nowMinutes).time} {formatClock(nowMinutes).period}</strong>
                  <span className="qr-fact-meta">
                    {identified.service.count > 0 && identified.service.first !== null && identified.service.last !== null
                      ? `${identified.service.count} runs a day here · ${formatClock(identified.service.first).time} to ${formatClock(identified.service.last).time}`
                      : "no published runs at this stop"}
                  </span>
                </div>
                <div className="qr-fact">
                  <span className="qr-fact-label"><RouteIcon size={12} aria-hidden="true" /> Direction</span>
                  <strong className="qr-fact-small">{directionLabel}</strong>
                  <button type="button" className="qr-inline-action" onClick={swapDirection}>
                    <ArrowLeftRight size={12} aria-hidden="true" /> Travelling the other way?
                  </button>
                  {!params.direction && (
                    <span className="qr-fact-meta">
                      This sticker does not name a direction, so it starts with the outbound run.
                      The destination board on the bus is the authority.
                    </span>
                  )}
                </div>
              </section>
            )}

            {/* A sticker names a route, not the bus it is stuck in. Saying so matters. */}
            {!activeStop && position.status === "ready" && guesses.length === 0 && (
              <div className="qr-hint" role="status">
                <TriangleAlert size={16} aria-hidden="true" />
                <span>
                  You are nowhere near route {route.number}. This sticker belongs to that route, so
                  either the bus is not the one on the sticker, or the position is wrong.
                </span>
                <Link href="/scan"><ScanLine size={13} aria-hidden="true" /> Scan again</Link>
              </div>
            )}

            {/* Location trouble is stated, with the way out. */}
            {position.status !== "ready" && position.status !== "idle" && position.status !== "locating" && !activeStop && (
              <div className="qr-hint">
                <TriangleAlert size={16} aria-hidden="true" />
                <span>{position.message}</span>
                <button type="button" onClick={position.locate}><LocateFixed size={13} aria-hidden="true" /> Try location again</button>
              </div>
            )}

            {(pickingStop || !activeStop) && (
              <section className="qr-panel" aria-label="Choose your stop">
                <h2>Which stop is the bus at, or the last one it left?</h2>
                <p className="qr-panel-note">
                  Pick the stop you can see outside the window. The runs below are the ones published
                  to pass it, which is how the bus is identified.
                </p>
                {guesses.length > 0 && (
                  <div className="qr-stop-choices">
                    {guesses.map((guess) => (
                      <button key={guess.name} type="button" onClick={() => pickStop(guess.name)}>
                        <MapPin size={14} aria-hidden="true" />
                        <span>{guess.name}</span>
                        <em>{formatDistance(guess.metres)}</em>
                      </button>
                    ))}
                  </div>
                )}
                <StopSearchBox
                  onPick={pickStop}
                  only={routeStopSet}
                  placeholder="Search a stop on this route"
                  label="Search a stop on this route"
                />
                {position.status === "locating" && <p className="qr-panel-note">Getting a position reading…</p>}
              </section>
            )}

            {/* The candidates, with the honest confidence. */}
            {activeStop && identified.state === "identified" && (
              <section className="qr-panel" aria-label="Possible buses">
                <div className="qr-panel-head">
                  <h2>Is this your bus?</h2>
                  <span className={`qr-confidence ${chosen?.confidence ?? "low"}`}>
                    {chosen?.confidence === "high" ? "Strong match" : chosen?.confidence === "medium" ? "Possible" : "Uncertain"}
                  </span>
                </div>
                <ul className="qr-candidates">
                  {identified.candidates.map((candidate) => {
                    const active = candidate.passage.runCode === chosen?.passage.runCode;
                    return (
                      <li key={`${candidate.passage.runCode}-${candidate.passage.minutes}`}>
                        <button
                          type="button"
                          className={active ? "active" : undefined}
                          aria-pressed={active}
                          onClick={() => setChosenRun(candidate.passage.runCode)}
                        >
                          <span className="qr-candidate-time">
                            {candidate.clock.time}
                            <em>{candidate.clock.period}</em>
                          </span>
                          <span className="qr-candidate-text">
                            <strong>{candidate.label}</strong>
                            <span>
                              {candidate.passage.runCode ? `Run ${candidate.passage.runCode}` : "Sample frequency"}
                              {candidate.passage.bus ? ` · bus ${candidate.passage.bus}` : ""}
                              {candidate.passage.kind === "sample" ? " · estimate" : ""}
                            </span>
                          </span>
                          {active && <span className="qr-candidate-tick" aria-hidden="true">✓</span>}
                        </button>
                      </li>
                    );
                  })}
                  {identified.next && (
                    <li className="qr-candidate-next">
                      <span>
                        Next published run: {formatClock(identified.next.minutes).time} {formatClock(identified.next.minutes).period}
                        {identified.next.runCode ? ` · ${identified.next.runCode}` : ""}
                      </span>
                    </li>
                  )}
                </ul>
                <p className="qr-panel-note">
                  Two runs a few minutes apart cannot be told apart by a timetable. If your bus is not
                  listed, it is running more than {25} minutes late, and the times below still hold for
                  the stops ahead.
                </p>
              </section>
            )}

            {/* Destination, optional. */}
            {activeStop && (
              <section className="qr-panel" aria-label="Your destination">
                <div className="qr-panel-head">
                  <h2><UserRound size={16} aria-hidden="true" /> Where are you getting off?</h2>
                  <span className="qr-optional">Optional</span>
                </div>
                {ahead.length > 0 ? (
                  <>
                    <label className="qr-select">
                      <span>Destination</span>
                      <select
                        value={destination ?? ""}
                        onChange={(event) => setDestination(event.target.value || null)}
                      >
                        <option value="">Not chosen yet</option>
                        {ahead.map((name) => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    </label>
                    {destination ? (
                      <div className="qr-eta" aria-live="polite">
                        <div>
                          <span className="qr-fact-label"><Navigation2 size={12} aria-hidden="true" /> To {destination}</span>
                          <strong>{journeyMinutes !== null ? `${journeyMinutes} min` : "—"}</strong>
                          <span className="qr-fact-meta">
                            {journeyMinutes !== null
                              ? `about ${formatClock(nowMinutes + journeyMinutes).time} ${formatClock(nowMinutes + journeyMinutes).period}, from the published times`
                              : "No published time between these two stops"}
                          </span>
                        </div>
                        <p>
                          The bus keeps its own timetable for the rest of the run, so this is the time
                          between the two stops, counted from now. Traffic can still stretch it.
                        </p>
                      </div>
                    ) : (
                      <p className="qr-panel-note">
                        Adding a destination shows how long the rest of the journey should take and lets
                        the ride screen warn you before your stop. It is not needed to identify the bus.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="qr-panel-note">
                    This stop is the last on this route in this direction, so there is nowhere further to go.
                  </p>
                )}
              </section>
            )}

            {/* The way onward. */}
            <section className="qr-actions" aria-label="What next">
              {rideParams && (
                <Link className="ride-primary" href={`/ride?${rideParams}`}>
                  <Navigation2 size={16} aria-hidden="true" /> Follow this ride live
                </Link>
              )}
              <Link className="ride-secondary" href={`/qr/stop?s=${encodeURIComponent(activeStop ?? route.origin)}`}>
                <MapPin size={15} aria-hidden="true" /> Board at this stop
              </Link>
              <Link className="ride-secondary" href="/scan">
                <ScanLine size={15} aria-hidden="true" /> Scan another sticker
              </Link>
            </section>

            <section className="ride-footnote">
              <h2><Info size={15} aria-hidden="true" /> How this works, and what it cannot know</h2>
              <ul>
                <li>
                  <strong>The sticker is the route, not the bus.</strong> One sticker per route, so any
                  bus on that route opens the same screen. Which bus it is comes from your stop and
                  the clock.
                </li>
                <li>
                  <strong>Your position is used once, on your phone.</strong> It picks the nearest stop
                  of this route within {AT_STOP_RADIUS_METRES} m ({NEAR_STOP_RADIUS_METRES} m counts as beside it).
                  Nothing is sent anywhere, and the screen works with no signal.
                </li>
                <li>
                  <strong>No live tracking.</strong> A published timetable says when a bus should pass.
                  It cannot say where the bus is now, so the match is a best guess, and every
                  alternative is listed beside it.
                </li>
                <li>
                  <strong>Buses run late, rarely early.</strong> A run up to 25 minutes behind its
                  published time still counts as a possible match; a run more than a few minutes early
                  is marked unusual.
                </li>
                <li>
                  <strong>Future stickers will carry the bus registration.</strong> When the fleet is
                  numbered, the sticker will name the exact bus and this screen will show it; today it
                  shows whatever registration the sticker was printed with, if any.
                </li>
              </ul>
              <p className="ride-footnote-sign">
                Not live tracking, and not official travel advice. Confirm with the conductor before you travel.
              </p>
            </section>
          </>
        )}
      </main>

      {!online && <span className="qr-offline-note">Working offline — the timetable is in this page.</span>}
    </div>
  );
}

export default function OnBusPage() {
  return (
    <Suspense
      fallback={
        <div className="ride-page">
          <div className="ride-loading">Loading this bus…</div>
        </div>
      }
    >
      <OnBusScreen />
    </Suspense>
  );
}
