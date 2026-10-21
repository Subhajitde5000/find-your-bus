#!/usr/bin/env python3
"""Build the landmark layer of the map: rivers, canals, bridges, buildings and places.

The route map is drawn from stop positions and road shapes alone. This script adds the
things people actually recognise on a map -- the Hooghly, the canals, Howrah Bridge, a
hospital, a station -- and writes them to ``fontend/src/data/landmarks.json``. The map
draws that file as an optional layer and the site stays fully offline.

Nothing here is guessed. There are two sources, and each feature records which one it
came from:

``--from-stops`` (works offline, run it anywhere)
    Looks at the stops that already have a reviewed position (confidence high or medium)
    and keeps the ones whose *name* says what they are: "Howrah Bridge", "AMRI Hospital",
    "Sealdah Station". The feature is placed at the stop's published position and named
    after the stop. It is a place *near* the landmark, not the outline of a building, and
    the file says so (``source: "stop"``). Ambiguous words ("Park", "Market", "Bazar" -- also
    neighbourhood names) are not used.

``--overpass`` (needs internet: run it on your own computer)
    Asks OpenStreetMap, through the Overpass API, for named rivers, canals, bridges and
    named buildings (hospitals, universities, places of worship, museums, heritage
    buildings) inside Kolkata and its neighbours. Rivers, canals and bridges come back as
    lines; buildings come back as their real footprint, which is what lets the map draw
    a building's facade outline. The raw reply is cached so a second run costs nothing.
    ``--from-file reply.json`` reads a saved reply instead of calling the API.

Run from the repository root::

    python scripts/build_landmarks.py --from-stops
    python scripts/build_landmarks.py --overpass          # on a machine with internet
    python scripts/build_landmarks.py --overpass --from-stops

Features are never edited by hand in the output. To drop or correct one, fix it in
OpenStreetMap or change the stop's name/position in the dataset, then re-run.

Data from OpenStreetMap is (c) OpenStreetMap contributors, ODbL 1.0. Standard library only.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATASET = ROOT / "fontend" / "src" / "data" / "kolkata-bus-data.json"
OUTPUT = ROOT / "fontend" / "src" / "data" / "landmarks.json"
CACHE = ROOT / ".cache" / "landmarks"

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
# south, west, north, east: Kolkata, Howrah, Salt Lake, Dum Dum, Behala and Garia.
BBOX = (22.40, 88.20, 22.75, 88.55)
USER_AGENT = "find-your-bus/1.0 (Kolkata bus guide landmark layer; contact: repository owner)"

LINE_SIMPLIFY_M = 10.0
SHAPE_SIMPLIFY_M = 3.0
MAX_BUILDINGS = 600

# Words that, in a stop's name, say what the place is. Order matters: first match wins.
STOP_KINDS: list[tuple[str, re.Pattern[str]]] = [
    ("bridge", re.compile(r"\b(bridge|setu|flyover|overbridge)\b", re.I)),
    ("airport", re.compile(r"\bairport\b", re.I)),
    ("hospital", re.compile(r"\b(hospital|medical college|nursing home)\b", re.I)),
    ("station", re.compile(r"\b(railway station|station|junction)\b(?!.*\b(police|bus|metro)\b)|\bhalt\b", re.I)),
    ("education", re.compile(r"\b(university|college|institute)\b", re.I)),
    ("stadium", re.compile(r"\b(stadium|maidan)\b", re.I)),
    ("museum", re.compile(r"\b(museum|memorial|planetarium|zoo)\b", re.I)),
    ("worship", re.compile(r"\b(temple|mandir|church|mosque|masjid|gurudwara)\b", re.I)),
    ("mall", re.compile(r"\bmall\b", re.I)),
]
STOP_EXCLUDE = re.compile(r"\b(police|bus stand|bus stop|bus station)\b", re.I)


# --------------------------------------------------------------------------- geometry


def haversine(a: tuple[float, float], b: tuple[float, float]) -> float:
    r = 6_371_000.0
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dphi, dl = p2 - p1, math.radians(b[1] - a[1])
    h = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(h)))


def simplify(points: list[tuple[float, float]], tolerance_m: float) -> list[tuple[float, float]]:
    """Douglas-Peucker, iterative. Always keeps the first and last point."""
    if len(points) < 3:
        return points[:]
    lat0 = points[0][0]
    xy = [(p[1] * 111_320 * math.cos(math.radians(lat0)), p[0] * 110_574) for p in points]
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        lo, hi = stack.pop()
        ax, ay = xy[lo]
        bx, by = xy[hi]
        dx, dy = bx - ax, by - ay
        length_sq = dx * dx + dy * dy
        far, far_d = -1, 0.0
        for i in range(lo + 1, hi):
            px, py = xy[i]
            t = 0.0 if length_sq == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length_sq))
            d = math.hypot(px - (ax + t * dx), py - (ay + t * dy))
            if d > far_d:
                far, far_d = i, d
        if far_d > tolerance_m and far != -1:
            keep[far] = True
            stack.append((lo, far))
            stack.append((far, hi))
    return [p for p, k in zip(points, keep) if k]


def _round(points: list[tuple[float, float]]) -> list[list[float]]:
    return [[round(lat, 5), round(lng, 5)] for lat, lng in points]


# --------------------------------------------------------------------------- from the stops


def from_stops(dataset: dict) -> list[dict]:
    """Landmarks named by a stop that has a reviewed position. Placed at the stop."""
    found: list[dict] = []
    for stop in dataset.get("stops", []):
        name = stop.get("name", "")
        lat, lng = stop.get("lat"), stop.get("lng")
        if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
            continue
        if stop.get("coordConfidence") not in ("high", "medium"):
            continue
        if STOP_EXCLUDE.search(name):
            continue
        for kind, pattern in STOP_KINDS:
            if pattern.search(name):
                found.append(
                    {
                        "id": f"stop:{name}",
                        "name": name,
                        "kind": kind,
                        "lat": round(float(lat), 5),
                        "lng": round(float(lng), 5),
                        "source": "stop",
                    }
                )
                break
    return found


# --------------------------------------------------------------------------- from OpenStreetMap


def overpass_query() -> str:
    s, w, n, e = BBOX
    box = f"({s},{w},{n},{e})"
    return f"""[out:json][timeout:240];
(
  way["waterway"~"^(river|canal)$"]["name"]{box};
  way["natural"="water"]["name"]{box};
  way["man_made"="bridge"]["name"]{box};
  way["bridge"="yes"]["highway"]["name"]{box};
  way["building"]["name"]["tourism"]{box};
  way["building"]["name"]["historic"]{box};
  way["building"]["name"]["amenity"~"^(hospital|university|college|place_of_worship|townhall|theatre|courthouse)$"]{box};
  way["building"]["name"]["railway"="station"]{box};
  node["tourism"~"^(attraction|museum)$"]["name"]{box};
  node["historic"]["name"]{box};
);
out geom tags;
"""


def fetch_overpass(refresh: bool) -> dict:
    CACHE.mkdir(parents=True, exist_ok=True)
    cached = CACHE / "overpass.json"
    if cached.exists() and not refresh:
        return json.loads(cached.read_text(encoding="utf-8"))
    body = urllib.parse.urlencode({"data": overpass_query()}).encode()
    request = urllib.request.Request(OVERPASS_URL, data=body, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=300) as response:
        reply = json.load(response)
    cached.write_text(json.dumps(reply), encoding="utf-8")
    return reply


def _kind_of(tags: dict[str, str]) -> str | None:
    waterway = tags.get("waterway")
    if waterway == "river":
        return "river"
    if waterway == "canal":
        return "canal"
    if tags.get("natural") == "water":
        return "water"
    if tags.get("man_made") == "bridge" or tags.get("bridge") == "yes":
        return "bridge"
    amenity = tags.get("amenity", "")
    if amenity == "hospital":
        return "hospital"
    if amenity in ("university", "college"):
        return "education"
    if amenity == "place_of_worship":
        return "worship"
    if tags.get("tourism") == "museum":
        return "museum"
    if tags.get("railway") == "station":
        return "station"
    if tags.get("tourism") == "attraction" or tags.get("historic") or tags.get("building"):
        return "landmark"
    return None


def _name_of(tags: dict[str, str]) -> str:
    return (tags.get("name:en") or tags.get("name") or "").strip()


def from_overpass(reply: dict) -> tuple[list[dict], list[dict]]:
    """Points and shapes from an Overpass reply (``out geom tags``)."""
    points: list[dict] = []
    shapes: list[dict] = []
    buildings = 0
    for element in reply.get("elements", []):
        tags = element.get("tags") or {}
        name = _name_of(tags)
        kind = _kind_of(tags)
        if not name or not kind:
            continue
        ident = f"osm:{element.get('type', 'x')}/{element.get('id')}"
        if element.get("type") == "node":
            lat, lng = element.get("lat"), element.get("lon")
            if isinstance(lat, (int, float)) and isinstance(lng, (int, float)):
                points.append({"id": ident, "name": name, "kind": kind, "lat": round(lat, 5), "lng": round(lng, 5), "source": "osm"})
            continue
        geometry = element.get("geometry") or []
        raw = [(g["lat"], g["lon"]) for g in geometry if "lat" in g and "lon" in g]
        if len(raw) < 2:
            continue
        closed = len(raw) >= 4 and raw[0] == raw[-1]
        is_area = closed and (tags.get("building") is not None or tags.get("natural") == "water")
        if is_area and tags.get("building") is not None:
            buildings += 1
            if buildings > MAX_BUILDINGS:
                continue
        tolerance = SHAPE_SIMPLIFY_M if is_area and kind != "water" else LINE_SIMPLIFY_M
        simple = simplify(raw, tolerance)
        if len(simple) < (4 if is_area else 2):
            continue
        shapes.append(
            {"id": ident, "name": name, "kind": kind, "closed": bool(is_area), "points": _round(simple), "source": "osm"}
        )
    return points, shapes


def drop_stop_duplicates(stop_points: list[dict], osm_points: list[dict], shapes: list[dict]) -> list[dict]:
    """Prefer OpenStreetMap: a stop-derived point is dropped when OSM has a feature of the
    same name within 400 m, so one landmark is never drawn twice."""

    def near(point: dict, other_name: str, other_points: list[tuple[float, float]]) -> bool:
        if point["name"].lower() != other_name.lower() and other_name.lower() not in point["name"].lower():
            return False
        return any(haversine((point["lat"], point["lng"]), p) <= 400 for p in other_points)

    keep: list[dict] = []
    for point in stop_points:
        clash = any(near(point, p["name"], [(p["lat"], p["lng"])]) for p in osm_points) or any(
            near(point, s["name"], [tuple(p) for p in s["points"]]) for s in shapes
        )
        if not clash:
            keep.append(point)
    return keep


# --------------------------------------------------------------------------- output


def write_output(points: list[dict], shapes: list[dict], sources: list[str], path: Path) -> None:
    points = sorted(points, key=lambda p: (p["kind"], p["name"], p["id"]))
    shapes = sorted(shapes, key=lambda s: (s["kind"], s["name"], s["id"]))
    meta = {
        "description": (
            "Landmarks drawn as an optional map layer. Points with source 'stop' are placed at the "
            "published position of a bus stop whose name says what it is; they mark a place near the "
            "landmark, not its outline. Shapes with source 'osm' are real outlines from OpenStreetMap."
        ),
        "sources": sources,
        "licence": "OpenStreetMap features: (c) OpenStreetMap contributors, ODbL 1.0. Stop-derived points come from this site's own reviewed stop dataset.",
        "generatedBy": "scripts/build_landmarks.py",
        "points": len(points),
        "shapes": len(shapes),
    }
    document = {"meta": meta, "points": points, "shapes": shapes}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(document, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--from-stops", action="store_true", help="derive landmarks from reviewed stop names (offline)")
    parser.add_argument("--overpass", action="store_true", help="fetch rivers, bridges and buildings from OpenStreetMap")
    parser.add_argument("--from-file", type=Path, help="read a saved Overpass reply instead of calling the API")
    parser.add_argument("--refresh", action="store_true", help="ignore the cached Overpass reply")
    parser.add_argument("--dataset", type=Path, default=DATASET)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()

    if not (args.from_stops or args.overpass or args.from_file):
        parser.error("choose --from-stops, --overpass or --from-file")

    points: list[dict] = []
    shapes: list[dict] = []
    sources: list[str] = []

    osm_points: list[dict] = []
    if args.overpass or args.from_file:
        if args.from_file:
            reply = json.loads(args.from_file.read_text(encoding="utf-8"))
            sources.append(f"OpenStreetMap, from {args.from_file.name}")
        else:
            reply = fetch_overpass(args.refresh)
            sources.append("OpenStreetMap via the Overpass API")
        osm_points, shapes = from_overpass(reply)
        points.extend(osm_points)
        print(f"OpenStreetMap: {len(osm_points)} points, {len(shapes)} shapes")

    if args.from_stops:
        dataset = json.loads(args.dataset.read_text(encoding="utf-8"))
        derived = from_stops(dataset)
        derived = drop_stop_duplicates(derived, osm_points, shapes)
        points.extend(derived)
        sources.append("Reviewed stop names and positions in kolkata-bus-data.json")
        print(f"Stops: {len(derived)} landmark-named stops kept")

    write_output(points, shapes, sources, args.output)
    print(f"wrote {args.output.relative_to(ROOT) if args.output.is_relative_to(ROOT) else args.output}: "
          f"{len(points)} points, {len(shapes)} shapes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
