"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Landmark, LocateFixed, Maximize2, Minus, Plus, Route as RouteIcon, Waypoints } from "lucide-react";
import { LandmarkLayer, type DrawnPoint, type DrawnShape } from "@/components/LandmarkLayer";
import { MapStyleToggle, useMapStyle } from "@/components/MapStyleToggle";
import { StopBusesPanel } from "@/components/StopBusesPanel";
import { StopSearchBox } from "@/components/StopSearchBox";
import { formatDistance, type Position } from "@/lib/geo";
import { isMajorWater, KIND_LABEL, LANDMARK_POINTS, LANDMARK_SHAPES, shapeAnchor, shapeLength } from "@/lib/landmarks";
import {
  clampView,
  MAX_ZOOM,
  MIN_ZOOM,
  panBy,
  placeLabels,
  viewBoxOf,
  viewRect,
  zoomAt,
  type Point,
  type Rect,
  type View,
} from "@/lib/mapView";
import { inCityWindow, NETWORK_SIZE, networkXY, pathOf, routeLine, UNITS_PER_KM } from "@/lib/networkMap";
import { allRoadLegs } from "@/lib/routeGeometry";
import { nearestStops, ROUTE_STOPS, STOP_INDEX, type NearStop } from "@/lib/stopIndex";

/*
 * The all-stops map: every stop with a published position, the roads the buses use, and
 * the landmarks around them. It needs no tiles and no network: it is drawn from the same
 * bundled data as the ride screen.
 *
 *   - Search a stop, or tap one, to see which buses stop there.
 *   - "Nearest stop" reads the phone's GPS once and highlights the closest stops.
 *   - Day, night or automatic map style; roads and landmarks can be switched off.
 */

const SIZE = NETWORK_SIZE;
const HOME: View = {
  zoom: 2.6,
  cx: networkXY({ lat: 22.5726, lng: 88.3639 }).x,
  cy: networkXY({ lat: 22.5726, lng: 88.3639 }).y,
};
const BUTTON_ZOOM = 1.7;
const LABEL_ZOOM = 5;
const LANDMARK_LABEL_ZOOM = 4.5;
const TAP_SLOP_PX = 5;

type Locating = "idle" | "locating" | "denied" | "unavailable" | "unsupported";

interface User {
  position: Position;
  accuracy: number | null;
}

interface StopDrawItem {
  stop: NearStop["stop"];
  x: number;
  y: number;
}

interface StopsLayerProps {
  stops: StopDrawItem[];
  selected: string | null;
  nearestName: string | null;
  routeStopSet: Set<string>;
  k: number;
  onTapStop: (name: string) => void;
}

/**
 * Memoized stops layer. The 2,000+ stops don't change during panning,
 * so memoizing them prevents thousands of SVG nodes from re-diffing on every gesture frame.
 */
const StopsLayer = memo(function StopsLayer({
  stops,
  selected,
  nearestName,
  routeStopSet,
  k,
  onTapStop,
}: StopsLayerProps) {
  return (
    <>
      {stops.map(({ stop, x, y }) => {
        const isSelected = stop.name === selected;
        const isNear = stop.name === nearestName;
        const onRoute = routeStopSet.has(stop.name);
        return (
          <g key={stop.name} onClick={() => onTapStop(stop.name)}>
            <circle className="net-map-hit" cx={x} cy={y} r={9 * k} />
            <circle
              className={`net-map-stop${isSelected ? " selected" : ""}${isNear ? " nearest" : ""}${onRoute ? " on-route" : ""}`}
              cx={x}
              cy={y}
              r={(isSelected || isNear ? 5.2 : onRoute ? 3.6 : 2.6) * k}
            >
              <title>{`${stop.name} · ${stop.buses.length} bus${stop.buses.length === 1 ? "" : "es"}`}</title>
            </circle>
          </g>
        );
      })}
    </>
  );
});

function clientToDrawing(svg: SVGSVGElement, rect: Rect, clientX: number, clientY: number): Point | null {
  const box = svg.getBoundingClientRect();
  if (box.width <= 0 || box.height <= 0) return null;
  const scale = Math.min(box.width / rect.w, box.height / rect.h);
  return {
    x: rect.x + (clientX - box.left - (box.width - rect.w * scale) / 2) / scale,
    y: rect.y + (clientY - box.top - (box.height - rect.h * scale) / 2) / scale,
  };
}

const isReducedMotionOrTest = () =>
  typeof window === "undefined" ||
  !window.matchMedia ||
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function NetworkMap() {
  const { preference, style, cycle } = useMapStyle();
  const [view, setView] = useState<View>(HOME);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedLandmark, setSelectedLandmark] = useState<string | null>(null);
  const [shownRoute, setShownRoute] = useState<string | null>(null);
  const [showRoads, setShowRoads] = useState(true);
  const [showLandmarks, setShowLandmarks] = useState(true);
  const [locating, setLocating] = useState<Locating>("idle");
  const [user, setUser] = useState<User | null>(null);
  const [near, setNear] = useState<NearStop[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const viewRef = useRef<View>(HOME);
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<number | null>(null);
  const moved = useRef(false);
  const origin = useRef<Point | null>(null);
  const velocity = useRef({ vx: 0, vy: 0, lastX: 0, lastY: 0, lastTime: 0 });

  const rafRef = useRef<number | null>(null);
  const momentumRaf = useRef<number | null>(null);
  const animRaf = useRef<number | null>(null);

  const current = clampView(view, SIZE);
  const rect = viewRect(current, SIZE);
  const k = 1 / current.zoom;

  // Direct DOM viewBox updater for 60/120fps hardware-accelerated movement
  const updateSvgDom = useCallback((targetView: View) => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.setAttribute("viewBox", viewBoxOf(targetView, SIZE));
    const currentK = 1 / targetView.zoom;
    svg.style.setProperty("--k", String(currentK));
  }, []);

  // Sync ref when React view state updates from outside
  useEffect(() => {
    viewRef.current = current;
    updateSvgDom(current);
  }, [current, updateSvgDom]);

  // Clean up any pending animation frames on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (momentumRaf.current !== null) cancelAnimationFrame(momentumRaf.current);
      if (animRaf.current !== null) cancelAnimationFrame(animRaf.current);
    };
  }, []);

  // Coalesce React state renders to requestAnimationFrame to avoid main-thread saturation
  const scheduleCommit = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setView(viewRef.current);
    });
  }, []);

  // Smooth animation for zoom buttons, reset view, and focusing on stops
  const animateTo = useCallback(
    (target: View, durationMs = 260) => {
      if (momentumRaf.current !== null) {
        cancelAnimationFrame(momentumRaf.current);
        momentumRaf.current = null;
      }
      if (animRaf.current !== null) {
        cancelAnimationFrame(animRaf.current);
        animRaf.current = null;
      }
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      const clampedTarget = clampView(target, SIZE);
      if (isReducedMotionOrTest() || durationMs <= 0) {
        viewRef.current = clampedTarget;
        updateSvgDom(clampedTarget);
        setView(clampedTarget);
        return;
      }

      const start = viewRef.current;
      const startTime = performance.now();
      const startLogZoom = Math.log(start.zoom);
      const targetLogZoom = Math.log(clampedTarget.zoom);

      const step = () => {
        const now = performance.now();
        const progress = Math.min((now - startTime) / durationMs, 1);
        // Cubic ease-out
        const ease = 1 - Math.pow(1 - progress, 3);
        const currentZoom = Math.exp(startLogZoom + (targetLogZoom - startLogZoom) * ease);
        const currentCx = start.cx + (clampedTarget.cx - start.cx) * ease;
        const currentCy = start.cy + (clampedTarget.cy - start.cy) * ease;
        const nextView = clampView({ zoom: currentZoom, cx: currentCx, cy: currentCy }, SIZE);

        viewRef.current = nextView;
        updateSvgDom(nextView);

        if (progress < 1) {
          animRaf.current = requestAnimationFrame(step);
        } else {
          animRaf.current = null;
          setView(clampedTarget);
        }
      };
      animRaf.current = requestAnimationFrame(step);
    },
    [updateSvgDom],
  );

  // Smooth inertia momentum glide after a swipe/fling
  const startMomentum = useCallback(
    (initialVx: number, initialVy: number) => {
      if (isReducedMotionOrTest()) {
        setView(viewRef.current);
        return;
      }
      let vx = initialVx;
      let vy = initialVy;
      let lastTime = performance.now();

      const step = () => {
        const now = performance.now();
        const dt = Math.min(now - lastTime, 40);
        lastTime = now;
        const svg = svgRef.current;
        if (!svg) {
          momentumRaf.current = null;
          setView(viewRef.current);
          return;
        }

        const box = svg.getBoundingClientRect();
        const currentView = viewRef.current;
        const currentRect = viewRect(currentView, SIZE);
        const scale = Math.min(box.width / currentRect.w, box.height / currentRect.h);
        if (scale <= 0) {
          momentumRaf.current = null;
          setView(currentView);
          return;
        }

        const unit = 1 / scale;
        const dx = vx * dt * unit;
        const dy = vy * dt * unit;
        const nextView = panBy(currentView, SIZE, dx, dy);

        // Stop momentum if stopped by boundary
        if (Math.abs(nextView.cx - currentView.cx) < 0.001 && Math.abs(nextView.cy - currentView.cy) < 0.001) {
          momentumRaf.current = null;
          setView(currentView);
          return;
        }

        viewRef.current = nextView;
        updateSvgDom(nextView);

        const friction = Math.pow(0.92, dt / 16);
        vx *= friction;
        vy *= friction;

        if (Math.hypot(vx, vy) > 0.05) {
          momentumRaf.current = requestAnimationFrame(step);
        } else {
          momentumRaf.current = null;
          setView(viewRef.current);
        }
      };
      momentumRaf.current = requestAnimationFrame(step);
    },
    [updateSvgDom],
  );

  // Everything below is projected once; panning and zooming only change the viewBox.
  const stops = useMemo<StopDrawItem[]>(
    () =>
      STOP_INDEX.located
        .filter((stop) => inCityWindow(stop.position as Position))
        .map((stop) => ({ stop, ...networkXY(stop.position as Position) })),
    [],
  );
  const outside = STOP_INDEX.located.length - stops.length;
  const roadsPath = useMemo(() => pathOf(allRoadLegs().map((leg) => leg.points)), []);
  const landmarkPoints: DrawnPoint[] = useMemo(
    () =>
      LANDMARK_POINTS.filter(inCityWindow).map((p) => ({ id: p.id, name: p.name, kind: p.kind, ...networkXY(p) })),
    [],
  );

  const landmarkShapes: DrawnShape[] = useMemo(
    () =>
      LANDMARK_SHAPES.map((s) => {
        const anchor = networkXY(shapeAnchor(s));
        return {
          id: s.id,
          name: s.name,
          kind: s.kind,
          closed: s.closed,
          d: pathOf([s.points]),
          labelX: anchor.x,
          labelY: anchor.y,
          weight: shapeLength(s),
          major: isMajorWater(s),
        };
      }).filter((s) => s.d),
    [],
  );
  const route = useMemo(() => (shownRoute ? routeLine(ROUTE_STOPS.get(shownRoute) ?? []) : null), [shownRoute]);

  const selectedStop = selected ? STOP_INDEX.byName.get(selected) ?? null : null;
  const selectedXY = selectedStop?.position ? networkXY(selectedStop.position) : null;
  const nearestName = near[0]?.stop.name ?? null;
  const landmark = selectedLandmark
    ? LANDMARK_POINTS.find((p) => p.id === selectedLandmark) ?? LANDMARK_SHAPES.find((s) => s.id === selectedLandmark) ?? null
    : null;

  // Wheel zoom listener with live view ref to avoid stale zoom jumps
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (momentumRaf.current !== null) {
        cancelAnimationFrame(momentumRaf.current);
        momentumRaf.current = null;
      }
      if (animRaf.current !== null) {
        cancelAnimationFrame(animRaf.current);
        animRaf.current = null;
      }
      const currentView = viewRef.current;
      const currentRect = viewRect(currentView, SIZE);
      const anchor = clientToDrawing(svg, currentRect, event.clientX, event.clientY);
      if (!anchor) return;
      const factor = Math.exp(-event.deltaY * 0.002);
      const nextView = zoomAt(currentView, SIZE, factor, anchor);
      viewRef.current = nextView;
      updateSvgDom(nextView);
      scheduleCommit();
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [scheduleCommit, updateSvgDom]);

  const focusOn = useCallback(
    (xy: { x: number; y: number }, zoom = 7) => {
      animateTo({ zoom, cx: xy.x, cy: xy.y }, 280);
    },
    [animateTo],
  );

  const chooseStop = useCallback(
    (name: string) => {
      const stop = STOP_INDEX.byName.get(name);
      setSelected(name);
      setSelectedLandmark(null);
      setShownRoute(null);
      if (stop?.position && inCityWindow(stop.position)) {
        setNotice(null);
        focusOn(networkXY(stop.position));
      } else if (stop?.position) {
        setNotice(`${name} is outside the Kolkata map area, so it is listed here but not drawn.`);
      } else {
        setNotice(`${name} has no published position yet, so it is listed here but not drawn.`);
      }
    },
    [focusOn],
  );

  const handleTapStop = useCallback(
    (name: string) => {
      if (!moved.current) {
        chooseStop(name);
      }
    },
    [chooseStop],
  );

  const locate = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocating("unsupported");
      return;
    }
    setLocating("locating");
    setNotice(null);
    navigator.geolocation.getCurrentPosition(
      (result) => {
        const position = { lat: result.coords.latitude, lng: result.coords.longitude };
        const accuracy = Number.isFinite(result.coords.accuracy) ? result.coords.accuracy : null;
        setUser({ position, accuracy });
        setLocating("idle");
        const list = nearestStops(STOP_INDEX, position, { limit: 5, maxMetres: 3000 });
        setNear(list);
        if (list.length) {
          setSelected(list[0].stop.name);
          setSelectedLandmark(null);
          setShownRoute(null);
          const from = networkXY(position);
          const to = networkXY(list[0].stop.position as Position);
          focusOn({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, 8);
          setNotice(null);
        } else if (!inCityWindow(position)) {
          setNotice("You are outside the Kolkata map area, so there is no mapped stop near you.");
        } else {
          setNotice("No stop with a published position within 3 km of you.");
        }
      },
      (error) => setLocating(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 },
    );
  };

  const zoomBy = (factor: number) => {
    const currentView = viewRef.current;
    const target = zoomAt(currentView, SIZE, factor, { x: currentView.cx, y: currentView.cy });
    animateTo(target, 220);
  };

  const onDoubleClick = (event: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const currentView = viewRef.current;
    const currentRect = viewRect(currentView, SIZE);
    const anchor = clientToDrawing(svg, currentRect, event.clientX, event.clientY);
    if (!anchor) return;
    const target = zoomAt(currentView, SIZE, BUTTON_ZOOM * 1.2, anchor);
    animateTo(target, 240);
  };

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    const hadActiveMotion = momentumRaf.current !== null || animRaf.current !== null;
    if (momentumRaf.current !== null) {
      cancelAnimationFrame(momentumRaf.current);
      momentumRaf.current = null;
    }
    if (animRaf.current !== null) {
      cancelAnimationFrame(animRaf.current);
      animRaf.current = null;
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    // If stopping momentum, mark as moved so tapping to halt doesn't select a stop
    moved.current = hadActiveMotion;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    origin.current = { x: event.clientX, y: event.clientY };
    velocity.current = { vx: 0, vy: 0, lastX: event.clientX, lastY: event.clientY, lastTime: performance.now() };
    pinch.current = null;
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    const previous = pointers.current.get(event.pointerId);
    if (!svg || !previous) return;
    const next = { x: event.clientX, y: event.clientY };

    const now = performance.now();
    const dt = now - velocity.current.lastTime;
    if (dt > 8) {
      const vx = (next.x - velocity.current.lastX) / dt;
      const vy = (next.y - velocity.current.lastY) / dt;
      velocity.current.vx = velocity.current.vx * 0.4 + vx * 0.6;
      velocity.current.vy = velocity.current.vy * 0.4 + vy * 0.6;
      velocity.current.lastX = next.x;
      velocity.current.lastY = next.y;
      velocity.current.lastTime = now;
    }

    if (!moved.current && origin.current && Math.hypot(next.x - origin.current.x, next.y - origin.current.y) > TAP_SLOP_PX) {
      moved.current = true;
      try {
        svg.setPointerCapture?.(event.pointerId);
      } catch (_) {}
      svg.classList.add("is-dragging");
    }

    pointers.current.set(event.pointerId, next);
    if (!moved.current) return;

    const box = svg.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return;
    const currentView = viewRef.current;
    const currentRect = viewRect(currentView, SIZE);
    const scale = Math.min(box.width / currentRect.w, box.height / currentRect.h);
    if (scale <= 0) return;
    const unit = 1 / scale;

    if (pointers.current.size === 1) {
      const nextView = panBy(currentView, SIZE, (next.x - previous.x) * unit, (next.y - previous.y) * unit);
      viewRef.current = nextView;
      updateSvgDom(nextView);
      scheduleCommit();
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const before = pinch.current ?? distance;
      pinch.current = distance;
      const anchor = clientToDrawing(svg, currentRect, (a.x + b.x) / 2, (a.y + b.y) / 2);
      if (anchor && before > 0) {
        const nextView = zoomAt(currentView, SIZE, distance / before, anchor);
        viewRef.current = nextView;
        updateSvgDom(nextView);
        scheduleCommit();
      }
    }
  };

  const onPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    try {
      svg?.releasePointerCapture?.(event.pointerId);
    } catch (_) {}
    pointers.current.delete(event.pointerId);

    if (pointers.current.size === 0) {
      pinch.current = null;
      svg?.classList.remove("is-dragging");
      const now = performance.now();
      const elapsed = now - velocity.current.lastTime;
      const speed = Math.hypot(velocity.current.vx, velocity.current.vy);
      if (moved.current && elapsed < 100 && speed > 0.15) {
        const maxSpeed = 2.5;
        const currentSpeed = speed;
        const scale = currentSpeed > maxSpeed ? maxSpeed / currentSpeed : 1;
        startMomentum(velocity.current.vx * scale, velocity.current.vy * scale);
      } else {
        setView(viewRef.current);
      }
    }
  };

  // Stop names: only when zoomed in, only the ones that fit, busiest first.
  const labelled = useMemo(() => {
    if (current.zoom < LABEL_ZOOM) return [];
    const inView = stops.filter((s) => s.x >= rect.x && s.x <= rect.x + rect.w && s.y >= rect.y && s.y <= rect.y + rect.h);
    return placeLabels(
      inView.map((s) => ({
        id: s.stop.name,
        x: s.x,
        y: s.y,
        text: s.stop.name,
        priority: s.stop.name === selected ? 0 : s.stop.name === nearestName ? 1 : 10 + (1000 - s.stop.buses.length),
      })),
      rect,
      8.5 * k,
      6 * k,
    );
  }, [stops, rect.x, rect.y, rect.w, rect.h, current.zoom, k, selected, nearestName]);

  const userXY = user ? networkXY(user.position) : null;
  const nearXY = near[0]?.stop.position ? networkXY(near[0].stop.position) : null;
  const accuracyUnits = user?.accuracy ? Math.min((user.accuracy / 1000) * UNITS_PER_KM, 30) : 0;
  const routeD = route && route.line.length > 1 ? pathOf([route.line]) : "";
  const routeStopSet = useMemo(() => new Set(shownRoute ? ROUTE_STOPS.get(shownRoute) ?? [] : []), [shownRoute]);
  const zoomed =
    Math.abs(current.zoom - HOME.zoom) > 0.01 || Math.abs(current.cx - HOME.cx) > 1 || Math.abs(current.cy - HOME.cy) > 1;

  return (
    <div className="net-map" data-map-style={style}>
      <div className="net-map-tools">
        <StopSearchBox onPick={chooseStop} placeholder="Search a stop, e.g. Esplanade" />
        <div className="net-map-buttons" role="group" aria-label="Map tools">
          <button type="button" className="net-map-locate" onClick={locate} disabled={locating === "locating"}>
            <LocateFixed size={15} aria-hidden="true" /> {locating === "locating" ? "Finding you…" : "Nearest stop to me"}
          </button>
          <button
            type="button"
            onClick={() => setShowRoads((v) => !v)}
            aria-pressed={showRoads}
            title="Roads the buses use"
            aria-label="Roads"
          >
            <Waypoints size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setShowLandmarks((v) => !v)}
            aria-pressed={showLandmarks}
            title="Landmarks"
            aria-label="Landmarks"
          >
            <Landmark size={16} aria-hidden="true" />
          </button>
          <MapStyleToggle preference={preference} onCycle={cycle} />
        </div>
      </div>

      {locating === "denied" && (
        <p className="net-map-note warn">
          Location is blocked for this site. Allow it to find the stop nearest to you, or search for a stop instead.
        </p>
      )}
      {locating === "unavailable" && (
        <p className="net-map-note warn">The phone could not get a GPS reading. Outdoors, with a clear sky, it usually can.</p>
      )}
      {locating === "unsupported" && <p className="net-map-note warn">This browser has no location. Search for a stop instead.</p>}
      {notice && <p className="net-map-note">{notice}</p>}

      <div className="net-map-frame">
        <svg
          ref={svgRef}
          className="net-map-svg"
          viewBox={viewBoxOf(current, SIZE)}
          preserveAspectRatio="xMidYMid meet"
          style={{ "--k": k, touchAction: "none" } as React.CSSProperties}
          role="img"
          aria-label={`Map of ${stops.length} Kolkata bus stops${showRoads ? " and the roads the buses use" : ""}. Tap a stop to see the buses that stop there.`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onLostPointerCapture={onPointerUp}
          onDoubleClick={onDoubleClick}
        >
          <rect className="net-map-ground" x={0} y={0} width={SIZE.width} height={SIZE.height} />

          {showLandmarks && (
            <LandmarkLayer
              points={landmarkPoints}
              shapes={landmarkShapes}
              k={k}
              rect={rect}
              showLabels={current.zoom >= LANDMARK_LABEL_ZOOM}
              selectedId={selectedLandmark}
              onSelect={(id) => {
                if (moved.current) return;
                setSelectedLandmark(id);
                setSelected(null);
              }}
            />
          )}

          {showRoads && roadsPath && <path className="net-map-roads" d={roadsPath} />}
          {routeD && <path className="net-map-route" d={routeD} />}

          <StopsLayer
            stops={stops}
            selected={selected}
            nearestName={nearestName}
            routeStopSet={routeStopSet}
            k={k}
            onTapStop={handleTapStop}
          />

          {nearXY && <circle className="net-map-nearest-ring" cx={nearXY.x} cy={nearXY.y} r={11 * k} />}
          {userXY && nearXY && <line className="net-map-link" x1={userXY.x} y1={userXY.y} x2={nearXY.x} y2={nearXY.y} />}
          {userXY && (
            <g className="net-map-user">
              {accuracyUnits > 0 && <circle className="net-map-accuracy" cx={userXY.x} cy={userXY.y} r={accuracyUnits} />}
              <circle className="net-map-user-dot" cx={userXY.x} cy={userXY.y} r={5 * k} />
            </g>
          )}
          {selectedXY && <circle className="net-map-selected-ring" cx={selectedXY.x} cy={selectedXY.y} r={9 * k} />}

          {labelled.map((label) => (
            <text key={`label-${label.id}`} className="net-map-label" x={label.tx} y={label.ty} textAnchor={label.anchor}>
              {label.text}
            </text>
          ))}
        </svg>

        <div className="net-map-zoom" role="group" aria-label="Zoom">
          <button type="button" onClick={() => zoomBy(BUTTON_ZOOM)} aria-label="Zoom in" disabled={current.zoom >= MAX_ZOOM}>
            <Plus size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => zoomBy(1 / BUTTON_ZOOM)}
            aria-label="Zoom out"
            disabled={current.zoom <= MIN_ZOOM}
          >
            <Minus size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => animateTo(HOME, 300)}
            aria-label="Back to the city view"
            disabled={!zoomed}
          >
            <Maximize2 size={15} aria-hidden="true" />
          </button>
        </div>
      </div>

      {near.length > 0 && (
        <section className="net-near" aria-label="Stops nearest to you">
          <h2>Nearest stops to you</h2>
          <ul>
            {near.map(({ stop, metres }, i) => (
              <li key={stop.name}>
                <button
                  type="button"
                  onClick={() => chooseStop(stop.name)}
                  className={stop.name === selected ? "active" : ""}
                >
                  <span>
                    {stop.name}
                    {i === 0 ? <em> nearest</em> : null}
                  </span>
                  <small>
                    {formatDistance(metres)} · {stop.buses.length} bus{stop.buses.length === 1 ? "" : "es"}
                  </small>
                </button>
              </li>
            ))}
          </ul>
          <p>Distances are in a straight line from your phone to the stop&apos;s published position, not the walk.</p>
        </section>
      )}

      {selected && (
        <StopBusesPanel
          stopName={selected}
          onClose={() => {
            setSelected(null);
            setShownRoute(null);
          }}
          shownRoute={shownRoute}
          onShowRoute={setShownRoute}
        />
      )}

      {shownRoute && route && (
        <p className="net-map-note">
          <RouteIcon size={12} aria-hidden="true" /> Route {shownRoute}: {route.roadLegs} leg
          {route.roadLegs === 1 ? "" : "s"} follow a road shape
          {route.straightLegs
            ? `, ${route.straightLegs} drawn straight because no road shape is bundled for ${route.straightLegs === 1 ? "it" : "them"}`
            : ""}
          .
        </p>
      )}

      {landmark && (
        <section className="net-landmark" aria-label="Landmark">
          <strong>{landmark.name}</strong>
          <span>{KIND_LABEL[landmark.kind]}</span>
          <small>
            {landmark.source === "stop"
              ? "Marked at the published position of a bus stop with this name: a place near the landmark, not its outline."
              : "Outline from OpenStreetMap contributors."}
          </small>
          <button type="button" onClick={() => setSelectedLandmark(null)}>
            Close
          </button>
        </section>
      )}

      <p className="net-map-foot">
        {stops.length} stops are on this map
        {outside > 0 ? `; ${outside} intercity stops outside it are searchable but not drawn` : ""}.{" "}
        {STOP_INDEX.stops.length - STOP_INDEX.located.length} stops have no published position yet and are left off rather than
        guessed. The rivers, canals, {LANDMARK_SHAPES.filter((s) => s.kind === "water").length} named lakes and the station
        buildings drawn around them come from OpenStreetMap too, as do{" "}
        {LANDMARK_POINTS.filter((p) => p.source === "osm").length} of the landmark places. Roads, water and buildings: ©{" "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          OpenStreetMap contributors
        </a>
        , ODbL. Stop positions are street-accurate, not surveyed; times are not live.
      </p>
    </div>
  );
}
