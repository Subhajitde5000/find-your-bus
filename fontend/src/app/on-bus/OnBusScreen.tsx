"use client";

import { Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BellRing,
  BusFront,
  Check,
  ChevronDown,
  Compass,
  Crosshair,
  Flag,
  Gauge,
  Info,
  LocateFixed,
  MapPin,
  MapPinOff,
  Navigation2,
  QrCode,
  RotateCcw,
  Signal,
  Timer,
  TriangleAlert,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { RideProgress, RideStopList } from "@/components/RideMap";
import { RideRouteMap } from "@/components/RideRouteMap";
import { OpenInApp } from "@/components/OpenInApp";
import { StopSearchBox } from "@/components/StopSearchBox";
import { ThemeToggle } from "@/components/ThemeToggle";
import { formatClock, formatDuration, getRoute, getRouteRuns, type Direction } from "@/lib/timetables";
import {
  advanceTracker,
  buildRide,
  destinationIndex,
  initTracker,
  matchRide,
  rideLegs,
  rideSummary,
  type RideRoute,
  type TrackerState,
} from "@/lib/ride";
import { formatDistance, formatRideMinutes, type GeoFix } from "@/lib/geo";
import { keepScreenAwake } from "@/lib/keepAwake";
import { useKolkataMinute } from "@/lib/useKolkataMinute";
import { kolkataNowMinutes } from "@/lib/clock";
import { stopAlert, vibrationFor, type StopAlertLevel } from "@/lib/alerts";
import {
  describeIdentification,
  identifyBus,
  minuteOfDay,
  passageClock,
  runLabel,
  runTimesAtMetres,
  runTimesAtIndex,
  stopsAhead,
  type BusCandidate,
} from "@/lib/onBus";
import { parseQrValue, SITE_ORIGIN } from "@/lib/qrLinks";

/*
 * /on-bus?route=1 — the "set on bus" screen a sticker inside a bus opens.
 *
 * The sticker can only say which route this is: one sticker per route, stuck on every
 * bus of that route. So the screen works out the rest the way a passenger would:
 *
 *   1. the phone's GPS says where along the route the passenger is;
 *   2. the route's published runs say when each bus is at that point;
 *   3. the run nearest the clock is the bus the passenger is most likely sitting in.
 *
 * It then does the one thing the sticker cannot: asks where the passenger is getting
 * off, and counts down to that stop. The destination is optional — skipping it follows
 * the bus to the terminus, which is what the plain ride screen already does.
 *
 * The whole page is offline. The timetable, the stop coordinates and the road shapes
 * are inside the bundle; the only live input is the phone's own GPS. Nothing here knows
 * where any bus actually is, and the identification card says so in as many words,
 * because a printed time is not a live position.
 *
 * The screen is laid out in the order a passenger needs it, not the order the data
 * arrives: the answer to "which bus am I in" sits directly under the status, and the
 * way to get that answer without GPS is one tap away rather than somewhere below the
 * fold. Every state has a way forward — no signal, blocked location, a bus that is not
 * on the timetable — because a QR that leaves a passenger on a dead screen is worse
 * than no QR at all.
 */

type Permission = "idle" | "watching" | "denied" | "unavailable" | "unsupported" | "stopped";

interface StickerParams {
  route: string | null;
  bus: string | null;
  direction: Direction;
  destination: string | null;
  failure: string | null;
}

/**
 * Reads the sticker's own query string.
 *
 * The route and bus number go through the same strict parser the scanner uses, so a
 * URL typed by hand cannot put anything unexpected on screen. The direction and the
 * destination are this screen's own extras (a shared link can carry them); they are
 * checked against the directory further down.
 */
function readSticker(search: URLSearchParams): StickerParams {
  const direction: Direction = search.get("dir") === "return" ? "return" : "outbound";
  const destination = (search.get("to") ?? "").trim() || null;
  const parsed = parseQrValue(`/on-bus?${search.toString()}`, SITE_ORIGIN);
  if (!parsed.ok || parsed.target.kind !== "on-bus") {
    return {
      route: null,
      bus: null,
      direction,
      destination,
      failure: parsed.ok ? "That link is not a bus code." : "This link has no bus route in it. Scan the QR sticker inside the bus.",
    };
  }
  return { route: parsed.target.route, bus: parsed.target.bus, direction, destination, failure: null };
}

const CONFIDENCE_TEXT: Record<BusCandidate["confidence"], string> = {
  likely: "Most likely",
  possible: "Probably",
  unclear: "Not sure",
};

function OnBusScreen() {
  const search = useSearchParams();
  const sticker = useMemo(() => readSticker(new URLSearchParams(search.toString())), [search]);
  const pickerId = useId();

  const nowMinutes = useKolkataMinute();
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  const [direction, setDirection] = useState<Direction>(sticker.direction);
  const [permission, setPermission] = useState<Permission>("idle");
  const [tracker, setTracker] = useState<TrackerState>(initTracker);
  const [online, setOnline] = useState(true);
  const [ended, setEnded] = useState(false);
  const [manualStop, setManualStop] = useState<string | null>(null);
  const [pickingStop, setPickingStop] = useState(false);
  const [pickedRun, setPickedRun] = useState<string | null>(null);
  const [runChooserOpen, setRunChooserOpen] = useState(false);
  const [identifiedAsNone, setIdentifiedAsNone] = useState(false);
  const [destination, setDestination] = useState<string | null>(sticker.destination);
  const [skippedDestination, setSkippedDestination] = useState(false);
  const [dismissedAlert, setDismissedAlert] = useState<StopAlertLevel>("none");
  const [directionConfirmed, setDirectionConfirmed] = useState(false);
  const [autoSwitched, setAutoSwitched] = useState(false);
  const watchId = useRef<number | null>(null);
  const announced = useRef<StopAlertLevel>("none");

  const routeNumber = sticker.route;
  const directory = useMemo(() => (routeNumber ? getRoute(routeNumber) : undefined), [routeNumber]);
  const runsForDirection = useMemo(
    () => (routeNumber ? getRouteRuns(routeNumber, direction) : undefined),
    [routeNumber, direction],
  );

  // Geometry: the corridor for this direction. Deliberately built without a run code, so
  // the corridor, the distances and therefore the GPS match stay put while the clock
  // moves on and a different scheduled run becomes the nearest one.
  const geometry = useMemo(
    () => (routeNumber ? buildRide({ number: routeNumber, direction, atMinute: openedAt ?? undefined }) : null),
    [routeNumber, direction, openedAt],
  );
  const baseRide: RideRoute | null = geometry?.ok ? geometry.ride : null;

  // The other direction of the same route. A sticker cannot say which way the bus is
  // pointing, and both directions often run on the same road, so the phone's position is
  // checked against both before the timetable is trusted.
  const oppositeDirection: Direction = direction === "outbound" ? "return" : "outbound";
  const otherGeometry = useMemo(
    () =>
      routeNumber
        ? buildRide({ number: routeNumber, direction: oppositeDirection, atMinute: openedAt ?? undefined })
        : null,
    [routeNumber, oppositeDirection, openedAt],
  );
  const otherRide: RideRoute | null = otherGeometry?.ok ? otherGeometry.ride : null;

  const geometryRef = useRef<RideRoute | null>(null);
  useEffect(() => {
    geometryRef.current = baseRide;
  }, [baseRide]);

  // Fixing the opening minute is a state change during render, the pattern React
  // recommends for "reset this when that changes".
  if (nowMinutes > 0 && openedAt === null) setOpenedAt(nowMinutes);

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

  useEffect(
    () => () => {
      if (watchId.current !== null && typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    if (permission !== "watching") return;
    return keepScreenAwake();
  }, [permission]);

  // Switching direction makes the fixes collected so far describe the other corridor.
  const [trackedDirection, setTrackedDirection] = useState<Direction>(direction);
  if (trackedDirection !== direction) {
    setTrackedDirection(direction);
    setTracker(initTracker());
    setPickedRun(null);
    setIdentifiedAsNone(false);
    setManualStop(null);
    setDismissedAlert("none");
  }

  const startTracking = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setPermission("unsupported");
      return;
    }
    setEnded(false);
    setPermission("watching");
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        const fix: GeoFix = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : 0,
          timestamp: position.timestamp || Date.now(),
        };
        setTracker((current) => (geometryRef.current ? advanceTracker(current, geometryRef.current, fix) : current));
      },
      (error) => setPermission(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable"),
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

  const match = tracker.match;
  const gpsOnBus = tracker.status === "on-bus" && match?.state === "on-bus" && match.metresAlong !== null;

  /* ---------------------------------------------------------- which way is this bus going */

  // One fix, read against both corridors. A passenger whose position is only on the
  // other direction's corridor is in a bus going the other way; the screen switches and
  // says so. Where both match (a terminus, a road the route retraces) the answer is
  // genuinely unknowable from the position, so the screen asks instead of guessing.
  const fixPosition = tracker.smoothed ?? tracker.fixes[tracker.fixes.length - 1] ?? null;
  const directionReading = useMemo(() => {
    if (!baseRide || !otherRide || !fixPosition) return null;
    const here = matchRide(baseRide, fixPosition);
    const there = matchRide(otherRide, fixPosition);
    const hereOn = here.state === "on-bus";
    const thereOn = there.state === "on-bus";
    return { hereOn, thereOn, oppositeOnly: !hereOn && thereOn, both: hereOn && thereOn };
  }, [baseRide, otherRide, fixPosition]);

  if (directionReading?.oppositeOnly && !directionConfirmed && permission === "watching") {
    setDirection(oppositeDirection);
    setDirectionConfirmed(true);
    setAutoSwitched(true);
  }

  const needsDirectionChoice = Boolean(directionReading?.both) && !directionConfirmed && tracker.status === "on-bus";

  /* ---------------------------------------------------------- which stop, then which bus */

  const manualIndex = useMemo(() => {
    if (!baseRide || !manualStop) return null;
    const found = baseRide.stops.find((stop) => stop.name === manualStop);
    return found ? found.index : null;
  }, [baseRide, manualStop]);

  // A GPS match wins over a stop the passenger picked by hand: it is the more specific
  // answer, and after a manual pick the GPS often starts working again a minute later.
  const placeIndex = gpsOnBus ? match!.stopIndex : manualIndex;
  const usingGps = gpsOnBus && placeIndex !== null;

  const identification = useMemo(() => {
    if (!baseRide || !runsForDirection || placeIndex === null) return null;
    const times = usingGps
      ? runTimesAtMetres(baseRide, runsForDirection.runs, match?.metresAlong ?? null)
      : runTimesAtIndex(runsForDirection.runs, placeIndex);
    const identified = identifyBus(times, nowMinutes, runsForDirection.headway);
    const chosen = pickedRun
      ? identified.candidates.find((candidate) => candidate.runCode === pickedRun) ?? identified.best
      : identified.best;
    const printedAtStop =
      chosen && chosen.runCode
        ? runsForDirection.runs.find((run) => run.runCode === chosen.runCode)?.times[placeIndex] ?? null
        : null;
    return {
      ...identified,
      chosen,
      followedRunCode: identifiedAsNone ? null : chosen?.runCode ?? null,
      printedAtStop,
      stopName: baseRide.stops[placeIndex]?.name ?? null,
    };
  }, [baseRide, runsForDirection, placeIndex, usingGps, match, nowMinutes, pickedRun, identifiedAsNone]);

  const followedRun = identifiedAsNone ? null : pickedRun ?? identification?.chosen?.runCode ?? null;

  // The screen's ride: the same corridor as `geometry`, but with the identified run's
  // printed times, so every ETA and every stop row is that bus's own timetable.
  const display = useMemo(
    () =>
      routeNumber
        ? buildRide({
            number: routeNumber,
            direction,
            atMinute: openedAt ?? undefined,
            runCode: followedRun,
            alighting: destination,
          })
        : null,
    [routeNumber, direction, openedAt, followedRun, destination],
  );
  const ride: RideRoute | null = display?.ok ? display.ride : baseRide;

  const destinationIdx = ride ? destinationIndex(ride, destination) : 0;
  const aboard = Boolean(ride) && usingGps && match?.state === "on-bus";
  const legs = useMemo(
    () =>
      ride && nowMinutes > 0
        ? rideLegs(ride, aboard ? match : null, {
            nowMinutes,
            destinationIndex: destinationIdx,
            nextStopIndex: match?.nextStopIndex ?? null,
          })
        : [],
    [ride, aboard, match, nowMinutes, destinationIdx],
  );
  const summary = useMemo(
    () => (ride && nowMinutes > 0 ? rideSummary(ride, aboard ? match : null, nowMinutes) : null),
    [ride, aboard, match, nowMinutes],
  );

  const alert = useMemo(
    () =>
      aboard && ride && match && match.state === "on-bus"
        ? stopAlert({
            stopIndex: match.stopIndex,
            atStop: match.atStop,
            destinationIndex: destinationIdx,
            destinationName: ride.stops[destinationIdx]?.name ?? ride.destination,
            metresToDestination:
              ride.stops[destinationIdx]?.distanceAlongMetres != null && match.metresAlong !== null
                ? Math.max(0, (ride.stops[destinationIdx].distanceAlongMetres as number) - match.metresAlong)
                : null,
          })
        : stopAlert(null),
    [aboard, ride, match, destinationIdx],
  );
  const showAlert = alert.level !== "none" && alert.level !== dismissedAlert;

  useEffect(() => {
    if (!alert || alert.level === "none") {
      announced.current = "none";
      return;
    }
    if (alert.level === announced.current) return;
    announced.current = alert.level;
    try {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate(vibrationFor(alert.level));
      }
    } catch {
      /* vibration is a courtesy, never an error */
    }
  }, [alert]);

  /* ---------------------------------------------------------- the states with no route */

  if (!routeNumber || sticker.failure) {
    return (
      <div className="ride-page">
        <OnBusHeader online={online} />
        <main className="ride-body">
          <div className="ride-notice-block">
            <span className="ride-notice-icon"><QrCode size={24} /></span>
            <h1>This is not a bus sticker</h1>
            <p>{sticker.failure ?? "The link is missing its route number."}</p>
            <p className="ride-notice-detail">
              The QR code inside a bus contains the route number it belongs to. Scan it again, or
              use the scanner to find a bus or a bus stop.
            </p>
            <div className="qr-notice-actions">
              <Link className="ride-primary" href="/scan"><QrCode size={15} /> Scan a QR code</Link>
              <Link className="ride-secondary" href="/"><ArrowLeft size={15} /> Home</Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!directory) {
    return (
      <div className="ride-page">
        <OnBusHeader online={online} />
        <main className="ride-body">
          <div className="ride-notice-block">
            <span className="ride-notice-icon"><MapPinOff size={24} /></span>
            <h1>Route {routeNumber} is not in this directory</h1>
            <p>
              The sticker names route {routeNumber}, but the timetable bundled with this copy of
              Cholo does not have it. The sticker may belong to a route added after this copy was
              released.
            </p>
            <p className="ride-notice-detail">
              Update the app from the store, or open Cholo in a browser once with a signal to
              refresh the site. Nothing has been guessed in the meantime.
            </p>
            <div className="qr-notice-actions">
              <Link className="ride-primary" href="/scan"><QrCode size={15} /> Scan again</Link>
              <Link className="ride-secondary" href="/">Search the timetable</Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!baseRide) {
    return (
      <div className="ride-page">
        <OnBusHeader online={online} />
        <main className="ride-body">
          <div className="ride-notice-block">
            <span className="ride-notice-icon"><MapPinOff size={24} /></span>
            <h1>This route cannot be followed yet</h1>
            <p>
              {geometry && !geometry.ok
                ? geometry.failure.message
                : "The stops of this route have no positions that this copy of Cholo can use."}
            </p>
            <p className="ride-notice-detail">
              Without positions the app cannot say where on the route you are, so it will not
              guess. The route&apos;s own times are still in the timetable.
            </p>
            <div className="qr-notice-actions">
              <Link className="ride-primary" href={`/ride?route=${encodeURIComponent(directory.number)}&dir=${direction}`}>
                <ArrowRight size={15} /> See the route and its times
              </Link>
              <Link className="ride-secondary" href="/scan"><QrCode size={15} /> Scan again</Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (nowMinutes === 0) {
    return (
      <div className="ride-page">
        <OnBusHeader online={online} />
        <main className="ride-body">
          <div className="ride-loading">Reading the timetable for route {directory.number}…</div>
        </main>
      </div>
    );
  }

  /* ---------------------------------------------------------- what to say */

  const nextStopIndex =
    aboard && match?.nextStopIndex !== null && match?.nextStopIndex !== undefined ? match.nextStopIndex : null;
  const nextStop = nextStopIndex === null ? null : ride?.stops[nextStopIndex] ?? null;
  const currentStop = aboard && match ? ride?.stops[match.stopIndex] ?? null : null;
  const passedStops = new Set(aboard ? legs.filter((leg) => leg.passed).map((leg) => leg.index) : []);
  const arrival = summary?.eta !== null && summary?.eta !== undefined ? formatClock(summary.eta) : null;
  const nowClock = formatClock(nowMinutes);
  const destinationStop = ride?.stops[destinationIdx] ?? null;
  const away = stopsAhead(baseRide, placeIndex).filter((stop) => stop.name !== destination);
  const lastFix = tracker.fixes[tracker.fixes.length - 1] ?? null;
  const towards = direction === "outbound" ? directory.destination : directory.origin;

  const headline = (() => {
    if (ended)
      return { title: "Following stopped", body: "Location tracking is off. The route and its timetable are still below." };
    if (permission === "denied")
      return { title: "Location is blocked", body: "Choose your stop below instead, or allow location for this site and try again." };
    if (permission === "unsupported")
      return { title: "This browser has no location", body: "Choose your stop below; the timetable and the destination countdown still work." };
    if (permission === "unavailable") {
      // A fix that stopped arriving is a different problem from a phone that never gave
      // one. The age comes from the ticking minute, never from a clock read during render.
      const ageMinutes = lastFix
        ? Math.max(0, nowMinutes - kolkataNowMinutes(new Date(lastFix.timestamp)))
        : null;
      if (ageMinutes !== null)
        return {
          title: "Position lost",
          body:
            ageMinutes < 1
              ? "The last reading was moments ago. Cholo keeps using it; a fresh one tells the buses apart better."
              : `The last reading was ${ageMinutes} minute${ageMinutes === 1 ? "" : "s"} ago. Cholo keeps using it, but a fresh reading is what tells the buses apart.`,
        };
      return {
        title: "No position yet",
        body: "This phone has not given a position yet. Near a window or outside usually fixes it — or choose your stop instead.",
      };
    }
    if (permission === "idle" || permission === "stopped")
      return {
        title: "Find yourself on this bus",
        body: "Cholo matches your position with this route's timetable to say which bus you are in.",
      };
    if (tracker.status === "waiting")
      return { title: "Finding you on this route…", body: tracker.notice ?? "Waiting for a clear GPS signal." };
    if (tracker.status === "on-bus")
      return {
        title: `You are on route ${directory.number}`,
        body: tracker.notice ?? (nextStop ? `Next stop: ${nextStop.name}` : "Approaching the terminus."),
      };
    return {
      title: "You are not on this route",
      body: tracker.notice ?? "Your position is not on this route's corridor. Pick your stop below if the GPS is wrong.",
    };
  })();

  const identified = identification?.chosen ?? null;
  const wording = describeIdentification(identified, {
    stopName: identification?.stopName ?? null,
    stopMinutes: identification?.printedAtStop ?? null,
    nowMinutes,
  });
  const showIdentification = Boolean(identification?.chosen) && !identifiedAsNone && placeIndex !== null;
  const choosingDestination = !destination && !skippedDestination;
  const showJourney = Boolean(destination) && aboard;
  const canChooseRun = Boolean(identified?.runCode) && (identification?.candidates.length ?? 0) > 1;
  const statusState = ended ? "ended" : tracker.status;
  // The picker is the way in until something has placed the passenger, so it starts open.
  const pickerOpen = pickingStop || (placeIndex === null && permission === "denied");
  const favouriteStops = baseRide.stops.slice(0, 6);

  /* ---------------------------------------------------------- the screen */

  return (
    <div className="ride-page on-bus-page">
      <OnBusHeader online={online} />

      <main className="ride-body">
        <header className="ob-hero">
          <div className="ob-hero-top">
            <span className={`route-square ${directory.type === "AC" ? "ac" : ""}`}>
              <BusFront size={19} strokeWidth={2.1} aria-hidden="true" />
            </span>
            <div className="ob-hero-id">
              <div className="ob-hero-line">
                <strong>{directory.number}</strong>
                <span className={`type-badge ${directory.type === "AC" ? "ac" : ""}`}>{directory.type}</span>
                {sticker.bus && (
                  <span className="qr-sticker-chip" title="This is the bus the sticker is fixed to">{sticker.bus}</span>
                )}
              </div>
              <span className="ob-hero-termini">
                {directory.origin} <ArrowRight size={11} aria-hidden="true" /> {directory.destination}
              </span>
            </div>
          </div>
          <div className="ob-hero-foot">
            <span>
              {directory.operator}
              {runsForDirection?.kind === "sample" ? " · sample frequency" : ""}
            </span>
            <span className="ob-hero-clock">
              <Signal size={11} aria-hidden="true" /> {nowClock.time} {nowClock.period}
            </span>
          </div>
        </header>

        <section className="ob-status" data-state={statusState} aria-live="polite">
          <span className="ob-status-icon" aria-hidden="true">
            {ended ? <Crosshair size={20} /> : aboard ? <Navigation2 size={20} /> : tracker.status === "not-seated" ? <MapPinOff size={20} /> : <Crosshair size={20} />}
          </span>
          <div className="ob-status-text">
            <h1>{headline.title}</h1>
            <p>{headline.body}</p>
          </div>
          <div className="ob-status-meta">
            {permission === "watching" && lastFix && lastFix.accuracy > 0 && (
              <span title="How precise the phone's last position was">±{Math.round(lastFix.accuracy)} m</span>
            )}
            {permission === "watching" && (
              <span>{tracker.fixes.length} reading{tracker.fixes.length === 1 ? "" : "s"}</span>
            )}
          </div>
          <div className="ob-status-actions">
            {permission === "watching" ? (
              <button type="button" className="ob-action secondary" onClick={stopTracking}>
                <X size={15} aria-hidden="true" /> Stop following
              </button>
            ) : (
              permission !== "denied" &&
              permission !== "unsupported" && (
                <button type="button" className="ob-action primary" onClick={startTracking}>
                  <LocateFixed size={16} aria-hidden="true" /> {permission === "idle" ? "Find my bus" : "Try again"}
                </button>
              )
            )}
            {placeIndex === null && (
              <button
                type="button"
                className="ob-action quiet"
                aria-expanded={pickerOpen}
                aria-controls={pickerId}
                onClick={() => setPickingStop((open) => !open)}
              >
                <Flag size={15} aria-hidden="true" /> Use my stop instead
              </button>
            )}
          </div>
        </section>

        {autoSwitched && !needsDirectionChoice && (
          <div className="ob-note" role="status">
            <Compass size={15} aria-hidden="true" />
            <span>
              Switched to the direction your position is on: towards <strong>{towards}</strong>. Change it
              at the bottom if that is wrong.
            </span>
          </div>
        )}

        {needsDirectionChoice && (
          <section className="ob-ask" aria-live="polite">
            <h2><Compass size={16} aria-hidden="true" /> Which way is this bus going?</h2>
            <p>
              Both directions of route {directory.number} run on this road, so your position cannot
              tell them apart — and the times differ.
            </p>
            <div className="qr-direction-switch">
              <button
                type="button"
                className={direction === "outbound" ? "on" : undefined}
                onClick={() => {
                  setDirection("outbound");
                  setDirectionConfirmed(true);
                }}
              >
                towards {directory.destination}
              </button>
              <button
                type="button"
                className={direction === "return" ? "on" : undefined}
                onClick={() => {
                  setDirection("return");
                  setDirectionConfirmed(true);
                }}
              >
                towards {directory.origin}
              </button>
            </div>
          </section>
        )}

        {/*
          The answer first. "Which bus am I in" is what the passenger scanned the sticker
          for, so the card sits directly under the status, not below the tools that
          produced it.
        */}
        {showIdentification && identified && (
          <section className="ob-ident" data-confidence={identified.confidence} aria-live="polite">
            <header className="ob-ident-head">
              <h2>{wording.title}</h2>
              <span className="ob-confidence">{CONFIDENCE_TEXT[identified.confidence]}</span>
            </header>

            <p>{wording.detail}</p>

            <ul className="ob-ident-facts">
              <li>
                <Timer size={12} aria-hidden="true" />
                <span>timetable {passageClock(identified.scheduledMinutes)}</span>
              </li>
              <li>
                <Signal size={12} aria-hidden="true" />
                <span>now {nowClock.time} {nowClock.period}</span>
              </li>
              <li>
                {usingGps ? <Navigation2 size={12} aria-hidden="true" /> : <Flag size={12} aria-hidden="true" />}
                <span>{usingGps ? "from your location" : `from ${identification?.stopName ?? "the stop you picked"}`}</span>
              </li>
            </ul>

            <p className="ob-ident-run">
              <BusFront size={12} aria-hidden="true" />
              <span>
                {identified.bus
                  ? `Bus ${identified.bus}`
                  : identified.runCode
                    ? `Run ${identified.runCode}`
                    : "Frequency service"}
                {identification?.printedAtStop != null
                  ? ` · printed ${passageClock(identification.printedAtStop)} at ${identification.stopName}`
                  : ""}
              </span>
            </p>

            <div className="ob-ident-actions">
              {canChooseRun && (
                <button type="button" className="ob-link" onClick={() => setRunChooserOpen((open) => !open)}>
                  {runChooserOpen ? "Hide the other buses" : "Not this bus?"}
                </button>
              )}
              <button
                type="button"
                className="ob-link"
                aria-expanded={pickerOpen}
                aria-controls={pickerId}
                onClick={() => setPickingStop((open) => !open)}
              >
                {usingGps ? "I am at a different stop" : "Change the stop I am at"}
              </button>
            </div>

            {runChooserOpen && identification && (
              <ul className="ob-run-list">
                {identification.candidates.slice(0, 4).map((candidate, index) => (
                  <li key={`${candidate.runCode ?? index}`}>
                    <div>
                      <strong>{runLabel(candidate, index)}</strong>
                      <span>
                        {passageClock(candidate.scheduledMinutes)}
                        {candidate.offsetMinutes !== null
                          ? ` · ${Math.abs(Math.round(candidate.offsetMinutes))} min ${candidate.offsetMinutes >= 0 ? "ahead of" : "behind"} the clock`
                          : ""}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="ob-pick"
                      aria-pressed={identified.runCode === candidate.runCode}
                      onClick={() => {
                        setPickedRun(candidate.runCode);
                        setIdentifiedAsNone(false);
                        setRunChooserOpen(false);
                      }}
                    >
                      {identified.runCode === candidate.runCode ? <Check size={14} aria-hidden="true" /> : "This one"}
                    </button>
                  </li>
                ))}
                <li>
                  <div>
                    <strong>None of these</strong>
                    <span>The bus is not on the timetable, or is very late.</span>
                  </div>
                  <button
                    type="button"
                    className="ob-pick"
                    onClick={() => {
                      setIdentifiedAsNone(true);
                      setRunChooserOpen(false);
                    }}
                  >
                    Use nearest
                  </button>
                </li>
              </ul>
            )}
          </section>
        )}

        {choosingDestination && placeIndex !== null && (
          <section className="ob-destination">
            <header>
              <div>
                <h2>Where are you getting off?</h2>
                <p>Optional. Choose a stop and Cholo counts down the journey to it.</p>
              </div>
              <span className="ob-optional">optional</span>
            </header>
            <StopSearchBox
              label="Your destination stop"
              placeholder="Search stops ahead on this route"
              only={new Set(away.map((stop) => stop.name))}
              onPick={(name) => {
                setDestination(name);
                setSkippedDestination(false);
              }}
            />
            {away.length > 0 && (
              <div className="qr-stop-shortlist">
                {away.slice(0, 6).map((stop) => (
                  <button
                    key={`${stop.index}-${stop.name}`}
                    type="button"
                    onClick={() => setDestination(stop.name)}
                  >
                    {stop.name}
                    {stop.minutes !== null && <span>{passageClock(minuteOfDay(stop.minutes))}</span>}
                  </button>
                ))}
              </div>
            )}
            <button type="button" className="ob-link" onClick={() => setSkippedDestination(true)}>
              Skip — follow this bus to {directory.destination}
            </button>
          </section>
        )}

        {showAlert && (
          <div className="ob-alert" data-level={alert.level} role={alert.level === "soon" ? "status" : "alert"}>
            <BellRing size={17} aria-hidden="true" />
            <div className="ob-alert-body">
              <strong>{alert.title}</strong>
              <span>{alert.detail}</span>
            </div>
            <button type="button" className="ob-alert-close" onClick={() => setDismissedAlert(alert.level)} aria-label="Dismiss this alert">
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        )}

        {!aboard && tracker.status === "not-seated" && placeIndex === null && (
          <div className="ob-alert" data-level="check" role="status">
            <TriangleAlert size={17} aria-hidden="true" />
            <div className="ob-alert-body">
              <strong>Not on this route&apos;s road</strong>
              <span>Either you are on a different bus, or the GPS is out. Choose your stop below if you know it.</span>
            </div>
          </div>
        )}

        {showJourney && (
          <section className="ob-journey" aria-label="Your journey">
            <div className="ob-journey-main">
              <span className="ob-label"><Flag size={12} aria-hidden="true" /> {summary?.destinationName ?? destinationStop?.name ?? "Your stop"}</span>
              <strong>
                {summary?.minutesToDestination !== null && summary?.minutesToDestination !== undefined
                  ? formatRideMinutes(summary.minutesToDestination)
                  : "—"}
              </strong>
              <span className="ob-meta">
                {summary?.metresToDestination !== null && summary?.metresToDestination !== undefined
                  ? `${formatDistance(summary.metresToDestination)} away`
                  : "distance not mapped"}
                {arrival ? ` · about ${arrival.time} ${arrival.period}` : ""}
              </span>
            </div>
            <div className="ob-journey-grid">
              <div>
                <span className="ob-label"><Navigation2 size={12} aria-hidden="true" /> Next stop</span>
                <strong>{nextStop?.name ?? "—"}</strong>
                <span className="ob-meta">
                  {match?.metresToNextStop !== null && match?.metresToNextStop !== undefined
                    ? `${formatDistance(match.metresToNextStop)} ahead`
                    : "waiting for your position"}
                </span>
              </div>
              <div>
                <span className="ob-label"><Gauge size={12} aria-hidden="true" /> Bus</span>
                <strong>{identified?.bus ?? ride?.bus ?? "Registration not printed"}</strong>
                <span className="ob-meta">
                  {ride?.runCode ? `run ${ride.runCode}` : "no published run"}
                  {" · "}
                  {ride?.kind === "scheduled" ? "published timetable" : ride?.kind === "sample" ? "sample frequency" : "no times published"}
                </span>
              </div>
              <div>
                <span className="ob-label"><Flag size={12} aria-hidden="true" /> Get off at</span>
                <strong>{destinationStop?.name ?? destination}</strong>
                <span className="ob-meta">
                  stop {(destinationIdx ?? 0) + 1} of {ride?.stops.length ?? 0}
                  <button type="button" className="ob-link inline" onClick={() => setDestination(null)}>
                    change
                  </button>
                </span>
              </div>
            </div>

            {ride && (
              <>
                <div className="ob-journey-block" aria-label="Route map">
                  <RideRouteMap
                    ride={ride}
                    metresAlong={match?.metresAlong ?? null}
                    onBus={aboard}
                    currentStop={currentStop?.index ?? null}
                    destinationIndex={destinationIdx}
                    nextStopIndex={nextStopIndex}
                    passed={passedStops}
                    userPosition={tracker.smoothed ?? tracker.fixes[tracker.fixes.length - 1] ?? null}
                  />
                </div>
                <RideProgress ride={ride} metresAlong={aboard ? match?.metresAlong ?? null : null} onBus={aboard} />
                <div className="ob-journey-block" aria-label="Stops on this route">
                  <RideStopList ride={ride} legs={legs} currentStop={currentStop?.index ?? null} onBus={aboard} />
                </div>
              </>
            )}
          </section>
        )}

        {/*
          The stop picker is a first-class fallback, not a footnote: a phone in a bus is
          exactly where GPS fails, and a passenger who knows which stop they just left can
          identify their bus without it. It stays closed until asked for, or until the phone
          refuses to give a position at all, so the answer is never pushed off the first screen.
        */}
        <section className={`ob-picker ${pickerOpen ? "open" : ""}`} id={pickerId}>
          <button
            type="button"
            className="ob-picker-head"
            aria-expanded={pickerOpen}
            onClick={() => setPickingStop((open) => !open)}
          >
            <Flag size={15} aria-hidden="true" />
            <span>
              No signal? Choose your stop instead
              {manualStop && <em>{manualStop}</em>}
            </span>
            <ChevronDown size={16} aria-hidden="true" className={pickerOpen ? "open" : undefined} />
          </button>
          {pickerOpen && (
            <div className="ob-picker-body">
              <p>
                Choose the stop you are at or have just left. The screen then reads this route&apos;s
                timetable from that stop, without needing a position.
              </p>
              <StopSearchBox
                label="Which stop are you at?"
                placeholder="Search this route's stops"
                only={new Set(baseRide.stops.map((stop) => stop.name))}
                onPick={(name) => {
                  setManualStop(name);
                  setPickingStop(false);
                  setPickedRun(null);
                  setIdentifiedAsNone(false);
                }}
              />
              <div className="qr-stop-shortlist">
                {favouriteStops.map((stop) => (
                  <button
                    key={`${stop.index}-${stop.name}`}
                    type="button"
                    className={manualStop === stop.name ? "on" : undefined}
                    onClick={() => {
                      setManualStop(stop.name);
                      setPickingStop(false);
                      setPickedRun(null);
                      setIdentifiedAsNone(false);
                    }}
                  >
                    {stop.name}
                    {stop.minutes !== null && <span>{passageClock(minuteOfDay(stop.minutes))}</span>}
                  </button>
                ))}
              </div>
              {manualStop && (
                <button type="button" className="ob-link" onClick={() => setManualStop(null)}>
                  <RotateCcw size={13} aria-hidden="true" /> Clear the picked stop
                </button>
              )}
            </div>
          )}
        </section>

        {placeIndex === null && (
          <details className="ob-peek" aria-label="This route's timetable">
            <summary>
              <span className="ob-peek-icon" aria-hidden="true"><BusFront size={15} /></span>
              <span className="ob-peek-text">
                <strong>This route, both ways</strong>
                <em>
                  {runsForDirection?.runs.length
                    ? `${runsForDirection.runs.length}${runsForDirection.kind === "sample" ? " sample" : ""} buses this way today${runsForDirection.headway ? `, about every ${formatDuration(runsForDirection.headway)}` : ""}`
                    : "No clock times published for this route"}
                </em>
              </span>
              <ChevronDown size={16} aria-hidden="true" className="ob-peek-chevron" />
            </summary>
            <div className="ob-peek-body">
            <div className="qr-direction-switch">
              <button type="button" className={direction === "outbound" ? "on" : undefined} onClick={() => setDirection("outbound")}>
                towards {directory.destination}
              </button>
              <button type="button" className={direction === "return" ? "on" : undefined} onClick={() => setDirection("return")}>
                towards {directory.origin}
              </button>
            </div>
            <ol className="ob-peek-stops">
              {baseRide.stops.map((stop) => (
                <li key={`${stop.index}-${stop.name}`} className={manualStop === stop.name ? "on" : undefined}>
                  <span>{stop.name}</span>
                  <span>{stop.minutes !== null ? passageClock(stop.minutes) : "—"}</span>
                </li>
              ))}
            </ol>
            </div>
          </details>
        )}

        {placeIndex !== null && !destination && !choosingDestination && (
          <button type="button" className="ob-link" onClick={() => setSkippedDestination(false)}>
            <RotateCcw size={13} aria-hidden="true" /> Choose a destination again
          </button>
        )}

        <details className="ob-footnote">
          <summary>
            <Info size={15} aria-hidden="true" /> How Cholo knows which bus this is, and when it does not
          </summary>
          <ul>
            <li>
              <strong>The sticker only names the route.</strong> One QR is stuck inside every bus of
              route {directory.number}, so it cannot say which bus by itself. Your phone&apos;s
              position and this route&apos;s published times narrow it down.
            </li>
            <li>
              <strong>Not live tracking.</strong> No bus sends its position to Cholo. The screen
              compares your GPS with the timetable; it never claims to see the vehicle.
            </li>
            <li>
              <strong>Buses drift.</strong> The identification card shows how far the printed time
              is from the clock. When no bus is close, it says so instead of picking one.
            </li>
            <li>
              <strong>No signal, no problem.</strong> The timetable, the stop positions and the road
              shapes are bundled with the app. Only the GPS reading is live, and it stays on the
              phone.
            </li>
            {sticker.bus && (
              <li>
                <strong>This sticker names its bus.</strong> It carries {sticker.bus}, so the screen
                can be certain of the vehicle even when the timetable and the clock disagree.
              </li>
            )}
          </ul>
          <p className="ob-footnote-sign">
            Scheduled times from the operator&apos;s own directory, not live positions. Confirm with the conductor.
          </p>
        </details>

        <nav className="ob-ways" aria-label="Other ways to use this screen">
          <Link className="ob-way" href="/scan">
            <QrCode size={15} aria-hidden="true" /> Scan another code
          </Link>
          <Link className="ob-way" href={`/stop?stop=${encodeURIComponent(baseRide.stops[placeIndex ?? 0]?.name ?? directory.origin)}`}>
            <MapPin size={15} aria-hidden="true" /> Buses at your stop
          </Link>
          <button
            type="button"
            className="ob-way"
            onClick={() => {
              setDirection((current) => (current === "outbound" ? "return" : "outbound"));
              setDirectionConfirmed(true);
              setAutoSwitched(false);
            }}
          >
            <Compass size={15} aria-hidden="true" /> Towards {towards === directory.destination ? directory.origin : directory.destination}
          </button>
        </nav>

        <OpenInApp />
      </main>
    </div>
  );
}

function OnBusHeader({ online }: { online: boolean }) {
  return (
    <header className="ride-header">
      <Link className="ride-back" href="/" aria-label="Home">
        <ArrowLeft size={17} aria-hidden="true" />
        <span className="ride-back-text">Home</span>
      </Link>
      <span className="ride-header-title">On bus</span>
      <Link className="ride-header-scan" href="/scan" aria-label="Scan a QR code" title="Scan a QR code">
        <QrCode size={17} />
      </Link>
      <span
        className={`ride-online ${online ? "" : "off"}`}
        title={online ? "You are online, but this screen does not need it" : "Offline — this screen still works"}
      >
        {online ? <Wifi size={13} aria-hidden="true" /> : <WifiOff size={13} aria-hidden="true" />}
        <span className="ride-online-text">{online ? "Online" : "Offline"}</span>
      </span>
      <ThemeToggle />
    </header>
  );
}

export default function OnBusPage() {
  return (
    <Suspense
      fallback={
        <div className="ride-page">
          <div className="ride-loading">Opening the bus…</div>
        </div>
      }
    >
      <OnBusScreen />
    </Suspense>
  );
}
