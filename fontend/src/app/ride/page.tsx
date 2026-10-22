"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BellRing,
  BusFront,
  Compass,
  Crosshair,
  Flag,
  Gauge,
  Info,
  LocateFixed,
  Map as MapIcon,
  MapPinOff,
  Navigation2,
  PersonStanding,
  Signal,
  Timer,
  TriangleAlert,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { RideProgress, RideStopList } from "@/components/RideMap";
import { RideRouteMap } from "@/components/RideRouteMap";
import { ThemeToggle } from "@/components/ThemeToggle";
import { formatClock, type Direction } from "@/lib/timetables";
import {
  directionWarning,
  isEscalation,
  stopAlert,
  vibrationFor,
  type DirectionWarningLevel,
  type StopAlertLevel,
} from "@/lib/alerts";
import {
  advanceTracker,
  buildRide,
  destinationIndex,
  directionEvidence,
  initTracker,
  rideLegs,
  rideSummary,
  type RideRoute,
  type TrackerState,
} from "@/lib/ride";
import { formatDistance, formatRideMinutes, type GeoFix } from "@/lib/geo";
import { useKolkataMinute } from "@/lib/useKolkataMinute";

/*
 * /ride — the "set on bus" screen.
 *
 * The whole page works with no network. Everything it needs is in the bundled dataset:
 * the stop chain, the published passage times, and the reviewed coordinates. The only
 * live input is the phone's own GPS, which the browser reads locally.
 *
 * Three states matter:
 *   - locating:    waiting for enough good fixes to say anything;
 *   - on-bus:      the position is on this route's corridor, so distances and ETAs are
 *                  measured from it;
 *   - not-seated:  the position is not on the corridor, so the passenger is told
 *                  plainly and given the nearest stop, rather than being shown numbers
 *                  that describe a bus they are not on.
 *
 * The screen is rendered only after the clock is known. The timetable is in Kolkata
 * time and the device may not be, so "now" is read in an effect; until then the page
 * shows its loading placeholder, which is also what the static HTML contains. That
 * keeps the pre-rendered page and the first client render identical.
 */

type Permission = "idle" | "watching" | "denied" | "unavailable" | "unsupported" | "stopped";

interface RideParams {
  number: string;
  direction: Direction;
  boarding: string | null;
  alighting: string | null;
  runCode: string | null;
}

function readParams(search: URLSearchParams): RideParams {
  return {
    number: (search.get("route") ?? "").trim(),
    direction: search.get("dir") === "return" ? "return" : "outbound",
    boarding: (search.get("from") ?? "").trim() || null,
    alighting: (search.get("to") ?? "").trim() || null,
    runCode: (search.get("run") ?? "").trim() || null,
  };
}

function RideScreen() {
  const search = useSearchParams();
  const params = useMemo(() => readParams(new URLSearchParams(search.toString())), [search]);

  const [direction, setDirection] = useState<Direction>(params.direction);
  // 0 until the browser has hydrated, which is when the page starts showing times.
  const nowMinutes = useKolkataMinute();
  /** The minute the screen was opened, fixed so the chosen run does not change mid-ride. */
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  const [permission, setPermission] = useState<Permission>("idle");
  const [tracker, setTracker] = useState<TrackerState>(initTracker);
  const [online, setOnline] = useState(true);
  const [dismissedDirection, setDismissedDirection] = useState<DirectionWarningLevel>("none");
  const [dismissedAlert, setDismissedAlert] = useState<StopAlertLevel>("none");
  const announced = useRef<{ stop: StopAlertLevel; direction: DirectionWarningLevel }>({ stop: "none", direction: "none" });
  const [ended, setEnded] = useState(false);
  const watchId = useRef<number | null>(null);

  const built = useMemo(
    () =>
      buildRide({
        number: params.number,
        direction,
        boarding: params.boarding,
        alighting: params.alighting,
        runCode: params.runCode,
        atMinute: openedAt ?? undefined,
      }),
    [params.number, params.boarding, params.alighting, params.runCode, direction, openedAt],
  );
  const ride: RideRoute | null = built.ok ? built.ride : null;

  // The fix handler inside geolocation.watchPosition is registered once, so it needs
  // the corridor through a ref rather than through its closure.
  const rideRef = useRef<RideRoute | null>(null);
  useEffect(() => {
    rideRef.current = ride;
  }, [ride]);

  // Fixing the opening minute is a state change during render, which is the pattern
  // React recommends for "reset this when that changes": no effect, no extra paint.
  if (nowMinutes > 0 && openedAt === null) setOpenedAt(nowMinutes);

  const destination = ride ? destinationIndex(ride, params.alighting) : 0;

  useEffect(() => {
    const sync = () => setOnline(window.navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  // Switching direction, or the run resolving once the clock is known, means a different
  // corridor: the fixes collected so far describe the old one. Resetting here, during
  // render, keeps the stale corridor off screen for even one frame.
  const [trackedRide, setTrackedRide] = useState<RideRoute | null>(ride);
  if (trackedRide !== ride) {
    setTrackedRide(ride);
    setTracker(initTracker());
    setDismissedDirection("none");
    setDismissedAlert("none");
  }

  useEffect(
    () => () => {
      if (watchId.current !== null && typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
    },
    [],
  );

  const startTracking = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setPermission("unsupported");
      return;
    }
    setEnded(false);
    setTracker(initTracker());
    setPermission("watching");
    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        const fix: GeoFix = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : 0,
          timestamp: position.timestamp || Date.now(),
        };
        setTracker((current) => (rideRef.current ? advanceTracker(current, rideRef.current, fix) : current));
      },
      (error) => {
        setPermission(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      { enableHighAccuracy: true, maximumAge: 2_000, timeout: 20_000 },
    );
  }, []);

  const stopTracking = useCallback(() => {
    if (watchId.current !== null && typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setPermission("stopped");
    setEnded(true);
  }, []);

  const switchDirection = useCallback(() => {
    setDirection((current) => (current === "outbound" ? "return" : "outbound"));
  }, []);

  const match = tracker.match;
  const onBus = tracker.status === "on-bus" && match?.state === "on-bus";
  const ready = nowMinutes > 0;

  const legs = useMemo(
    () =>
      ready && ride
        ? rideLegs(ride, onBus ? match : null, {
            nowMinutes,
            destinationIndex: destination,
            nextStopIndex: match?.nextStopIndex ?? null,
          })
        : [],
    [ready, ride, onBus, match, nowMinutes, destination],
  );
  const summary = useMemo(
    () => (ready && ride ? rideSummary(ride, onBus ? match : null, nowMinutes) : null),
    [ready, ride, onBus, match, nowMinutes],
  );
  const evidence = useMemo(() => directionEvidence(tracker.progress), [tracker.progress]);
  const warning = useMemo(
    () => (onBus && ride ? directionWarning(evidence, ride.origin) : directionWarning({ hint: "unclear", metres: 0, spanMillis: 0 }, "")),
    [evidence, onBus, ride],
  );
  const alert = useMemo(
    () =>
      onBus && ride && match && match.state === "on-bus"
        ? stopAlert({
            stopIndex: match.stopIndex,
            atStop: match.atStop,
            destinationIndex: destination,
            destinationName: ride.stops[destination]?.name ?? ride.destination,
            // along the road to the passenger's own stop, not to the terminus the summary card measures to
            metresToDestination:
              ride.stops[destination]?.distanceAlongMetres != null && match.metresAlong !== null
                ? Math.max(0, (ride.stops[destination].distanceAlongMetres as number) - match.metresAlong)
                : null,
          })
        : stopAlert(null),
    [onBus, ride, match, destination],
  );
  const showWarning = warning.level !== "none" && !(warning.level === dismissedDirection || (warning.level === "check" && dismissedDirection === "wrong"));
  const showAlert = alert.level !== "none" && alert.level !== dismissedAlert;

  // A short buzz when a warning gets more urgent, once per level, so a passenger with the phone
  // in a pocket still notices. Browsers that cannot vibrate (iPhone Safari) simply skip it.
  useEffect(() => {
    const buzz = (pattern: number[]) => {
      try {
        if (pattern.length && typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(pattern);
      } catch {
        /* vibration is a courtesy, never an error */
      }
    };
    if (isEscalation(announced.current.stop, alert.level)) buzz(vibrationFor(alert.level));
    announced.current.stop = alert.level === "none" ? "none" : alert.level;
    if (warning.level === "wrong" && announced.current.direction !== "wrong") buzz([300, 150, 300]);
    announced.current.direction = warning.level;
  }, [alert.level, warning.level]);

  // ------------------------------------------------------------------ failure states

  if (!ride) {
    const notFound = !built.ok && built.failure.code === "route-not-found";
    return (
      <div className="ride-page">
        <RideHeader online={online} />
        <main className="ride-body">
          <div className="ride-notice-block">
            <span className="ride-notice-icon"><MapPinOff size={24} /></span>
            <h1>{notFound ? "That route is not in this directory" : "This route cannot be followed yet"}</h1>
            {!built.ok && <p>{built.failure.message}</p>}
            <p className="ride-notice-detail">
              The ride screen needs at least two stops with a published position. Coordinates are
              copied from open datasets and reviewed; where no source can place a stop it is left
              blank rather than guessed, and the ride screen says so.
            </p>
            <Link className="ride-primary" href="/"><ArrowRight size={15} aria-hidden="true" /> Back to the timetable</Link>
          </div>
        </main>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="ride-page">
        <RideHeader online={online} />
        <main className="ride-body">
          <div className="ride-loading">Loading route {ride.number}…</div>
        </main>
      </div>
    );
  }

  const currentStop = onBus && match ? ride.stops[match.stopIndex] : null;
  const nextStopIndex = onBus && match?.nextStopIndex !== null && match?.nextStopIndex !== undefined ? match.nextStopIndex : null;
  const nextStop = nextStopIndex === null ? null : ride.stops[nextStopIndex];
  // Stops already behind the bus. The map dims them and the list strikes them through,
  // and both must agree, so the set is computed once here.
  const passedStops = new Set(onBus ? legs.filter((leg) => leg.passed).map((leg) => leg.index) : []);
  const status = tracker.status;
  const arrival = summary?.eta !== null && summary?.eta !== undefined ? formatClock(summary.eta) : null;
  const nowClock = formatClock(nowMinutes);

  const headline = (() => {
    if (ended) return { title: "Ride ended", body: "Location tracking is off. The route and its times are still below." };
    if (permission === "denied")
      return { title: "Location is blocked", body: "Allow location for this site to follow the bus. The timetable below does not need it." };
    if (permission === "unsupported")
      return { title: "This browser has no location", body: "The route and its times are below; the position marker needs a browser with GPS." };
    if (permission === "unavailable")
      return { title: "No position available", body: "The phone could not get a GPS reading. Outdoors, with a clear sky, it usually can." };
    if (permission === "idle" || permission === "stopped")
      return { title: "Ready when you are", body: "Start tracking to match your position against this route." };
    if (status === "waiting") return { title: "Finding you on this route…", body: tracker.notice ?? "Waiting for a clear GPS signal." };
    if (status === "on-bus")
      return { title: `On bus ${ride.number}`, body: tracker.notice ?? (nextStop ? `Next stop: ${nextStop.name}` : "Approaching the terminus.") };
    return { title: "You are not seated in this bus", body: tracker.notice ?? "Your position is not on this route's corridor." };
  })();

  return (
    <div className="ride-page">
      <RideHeader online={online} />

      <main className="ride-body">
        <header className="ride-route">
          <span className={`route-square ${ride.type === "AC" ? "ac" : ""}`}><BusFront size={20} strokeWidth={2.1} /></span>
          <div className="ride-route-text">
            <div className="ride-route-row">
              <strong>Bus {ride.number}</strong>
              <span className={`type-badge ${ride.type === "AC" ? "ac" : ""}`}>{ride.type}</span>
              {ride.kind === "sample" && <span className="type-badge">Sample</span>}
            </div>
            <span className="ride-termini">
              {ride.origin} <ArrowRight size={13} aria-hidden="true" /> {ride.destination}
            </span>
            <span className="ride-operator">{ride.operator}</span>
          </div>
        </header>

        <section className="ride-status" aria-live="polite" data-state={ended ? "ended" : status}>
          <span className="ride-status-icon">
            {ended ? (
              <Crosshair size={22} />
            ) : status === "on-bus" ? (
              <Navigation2 size={22} />
            ) : status === "not-seated" ? (
              <PersonStanding size={22} />
            ) : (
              <Crosshair size={22} />
            )}
          </span>
          <div className="ride-status-text">
            <h1>{headline.title}</h1>
            <p>{headline.body}</p>
          </div>
          {permission !== "denied" && permission !== "unsupported" && (
            <div className="ride-status-actions">
              {permission === "watching" ? (
                <button type="button" className="ride-secondary" onClick={stopTracking}><X size={15} /> End ride</button>
              ) : (
                <button type="button" className="ride-primary" onClick={startTracking}>
                  <LocateFixed size={16} /> {permission === "idle" ? "Set on bus" : "Try again"}
                </button>
              )}
            </div>
          )}
        </section>

        {showAlert && (
          <div className="ride-alert" data-level={alert.level} role={alert.level === "soon" ? "status" : "alert"}>
            <BellRing size={18} aria-hidden="true" />
            <div className="ride-alert-body">
              <strong>{alert.title}</strong>
              <span>{alert.detail}</span>
            </div>
            <button type="button" className="ride-alert-close" onClick={() => setDismissedAlert(alert.level)} aria-label="Dismiss this alert">
              <X size={14} />
            </button>
          </div>
        )}

        {showWarning && (
          <div className="ride-alert" data-level={warning.level} role={warning.level === "wrong" ? "alert" : "status"}>
            <TriangleAlert size={18} aria-hidden="true" />
            <div className="ride-alert-body">
              <strong>{warning.title}</strong>
              <span>{warning.detail}</span>
              <div className="ride-alert-actions">
                <button type="button" onClick={switchDirection}>Switch direction</button>
              </div>
            </div>
            <button type="button" className="ride-alert-close" onClick={() => setDismissedDirection(warning.level)} aria-label="Dismiss this warning">
              <X size={14} />
            </button>
          </div>
        )}

        <section className="ride-cards" aria-label="Remaining journey">
          <div className="ride-card main">
            <span className="ride-card-label"><Flag size={12} aria-hidden="true" /> {summary?.destinationName ?? ride.destination}</span>
            <strong>
              {summary?.minutesToDestination !== null && summary?.minutesToDestination !== undefined
                ? formatRideMinutes(summary.minutesToDestination)
                : "—"}
            </strong>
            <span className="ride-card-meta">
              {summary?.metresToDestination !== null && summary?.metresToDestination !== undefined
                ? `${formatDistance(summary.metresToDestination)} away`
                : "distance not mapped"}
              {arrival ? ` · about ${arrival.time} ${arrival.period}` : ""}
            </span>
          </div>
          <div className="ride-card">
            <span className="ride-card-label"><Navigation2 size={12} aria-hidden="true" /> Next stop</span>
            <strong className="ride-card-small">{nextStop?.name ?? "—"}</strong>
            <span className="ride-card-meta">
              {onBus && match?.metresToNextStop !== null && match?.metresToNextStop !== undefined
                ? `${formatDistance(match.metresToNextStop)} ahead`
                : onBus
                  ? "last stop on this route"
                  : "waiting for your position"}
            </span>
          </div>
          <div className="ride-card">
            <span className="ride-card-label"><Timer size={12} aria-hidden="true" /> Times from</span>
            <strong className="ride-card-small">
              {ride.kind === "scheduled"
                ? "Published timetable"
                : ride.kind === "sample"
                  ? "Sample frequency"
                  : ride.speedBasis === "published"
                    ? "This route's own times"
                    : "Distance estimate"}
            </strong>
            <span className="ride-card-meta">
              {ride.speedBasis === "published"
                ? `about ${(ride.speedMps * 3.6).toFixed(0)} km/h, measured from them`
                : `assumed ${(ride.speedMps * 3.6).toFixed(0)} km/h`}
            </span>
          </div>
          <div className="ride-card">
            <span className="ride-card-label"><Gauge size={12} aria-hidden="true" /> Position</span>
            <strong className="ride-card-small">
              {onBus && match?.metresOffRoute !== null && match?.metresOffRoute !== undefined
                ? `${Math.round(match.metresOffRoute)} m off route`
                : status === "not-seated" && match?.metresOffRoute
                  ? `${Math.round(match.metresOffRoute)} m off route`
                  : "—"}
            </strong>
            <span className="ride-card-meta">
              {tracker.fixes.length} recent fixes
              {tracker.rejected > 0 ? ` · ${tracker.rejected} ignored` : ""}
            </span>
          </div>
        </section>

        <section className="ride-map-section" aria-label="Route map">
          <RideRouteMap
            ride={ride}
            metresAlong={onBus ? match?.metresAlong ?? null : null}
            onBus={onBus}
            currentStop={currentStop?.index ?? null}
            destinationIndex={destination}
            nextStopIndex={nextStopIndex}
            passed={passedStops}
            userPosition={tracker.smoothed ?? tracker.fixes[tracker.fixes.length - 1] ?? null}
          />
        </section>

        <RideProgress ride={ride} metresAlong={onBus ? match?.metresAlong ?? null : null} onBus={onBus} />

        <section className="ride-controls">
          <button type="button" onClick={switchDirection}>
            <Compass size={14} aria-hidden="true" />
            Travelling towards {ride.direction === "outbound" ? ride.origin : ride.destination} instead
          </button>
          <Link className="ride-map-link" href="/map"><MapIcon size={14} aria-hidden="true" /> All stops map</Link>
          <span className="ride-run">
            {ride.runCode ? `Run ${ride.runCode}` : ride.kind === "sample" ? "Sample frequency" : "No run recorded"}
            {ride.headway ? ` · every ${ride.headway} min` : ""}
            {ride.bus ? ` · bus ${ride.bus}` : ""}
          </span>
          <span className="ride-clock">
            <Signal size={12} aria-hidden="true" /> Kolkata {nowClock.time} {nowClock.period}
          </span>
        </section>

        <section className="ride-map" aria-label="Route and stops">
          <RideStopList ride={ride} legs={legs} currentStop={currentStop?.index ?? null} onBus={onBus} />
        </section>

        <section className="ride-footnote">
          <h2><Info size={15} aria-hidden="true" /> How this works, and what it cannot know</h2>
          <ul>
            <li>
              <strong>Offline by design.</strong> This page reads the timetable and the stop
              coordinates bundled with the site, plus your phone&apos;s own GPS. It makes no network
              call, so it works with no signal at all.
            </li>
            <li>
              <strong>Nothing is tracked.</strong> The only moving thing on this screen is you. The
              site does not know where any bus is; it assumes the bus you are on follows its route.
            </li>
            <li>
              <strong>On the bus or not.</strong> You count as being on this bus while your position
              is within about 75 m of its corridor. Stay off it for more than 20 seconds and the
              screen says you are not seated, rather than showing times for a bus you are not on.
            </li>
            <li>
              <strong>Times.</strong>{" "}
              {ride.kind === "scheduled"
                ? "This route publishes a passage time at every stop, so those times are used."
                : ride.kind === "sample"
                  ? "This route has an illustrative sample frequency, so its times are approximate."
                  : "No times are published for this route, so the times below are estimated from the distance between stops."}
            </li>
            <li>
              <strong>Positions.</strong> Stop coordinates are copied from open datasets
              (OpenStreetMap contributors, GeoNames, Wikidata) and checked against the route chains.
              They are street-accurate, not surveyed; treat the distances as close rather than exact.
            </li>
            <li>
              <strong>The line on the map.</strong> Roads between stops were routed once, offline,
              over OpenStreetMap and bundled as a simplified line: no tiles, no download at the
              roadside. Distances and the map are measured along that line, so a curved road reads
              as its true length. Map data © OpenStreetMap contributors, available under the{" "}
              <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer">
                Open Database Licence
              </a>.
            </li>
          </ul>
          <p className="ride-footnote-sign">
            Not live tracking, and not official travel advice. Confirm with the operator before you travel.
          </p>
        </section>
      </main>
    </div>
  );
}

/** The compact header used by every state of the screen, including the loading one. */
function RideHeader({ online }: { online: boolean }) {
  return (
    <header className="ride-header">
      <Link className="ride-back" href="/"><ArrowLeft size={17} /> Home</Link>
      <span className="ride-header-title">Ride along</span>
      <span
        className={`ride-online ${online ? "" : "off"}`}
        title={online ? "You are online, but this screen does not need it" : "Offline — this screen still works"}
      >
        {online ? <Wifi size={13} aria-hidden="true" /> : <WifiOff size={13} aria-hidden="true" />}
        {online ? "Online" : "Offline"}
      </span>
      <ThemeToggle />
    </header>
  );
}

export default function RidePage() {
  return (
    <Suspense
      fallback={
        <div className="ride-page">
          <div className="ride-loading">Loading the route…</div>
        </div>
      }
    >
      <RideScreen />
    </Suspense>
  );
}
