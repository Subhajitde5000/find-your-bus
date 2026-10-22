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

``--geojson PATH`` (repeatable; offline once the file is downloaded)
    Reads an OpenStreetMap-derived GeoJSON layer -- a river system, a canal network, the
    named water bodies of the city. Lines (rivers, canals) become line shapes and closed
    rings (lakes, ponds) become filled outlines, clipped to the map's city window so a
    140 km river does not drag the file out to the edge of the state. Every feature keeps
    its OpenStreetMap name (``source: "osm"``).

``--hot-export DIR`` (offline once the zip from the Humanitarian OpenStreetMap Team's
raw-data-api is unpacked)
    Reads a HOT raw-data-api shapefile export: ``*_point.{shp,dbf}`` for named stations
    and ``*_poly.{shp,dbf}`` for the real outlines of station buildings. Stops and
    platforms are ignored: the bus-stop dataset already knows where the buses stop.

``--overpass`` (needs internet: run it on your own computer)
    Asks OpenStreetMap, through the Overpass API, for named rivers, canals, bridges and
    named buildings (hospitals, universities, places of worship, museums, heritage
    buildings) inside Kolkata and its neighbours. Rivers, canals and bridges come back as
    lines; buildings come back as their real footprint, which is what lets the map draw
    a building's facade outline. The raw reply is cached so a second run costs nothing.
    ``--from-file reply.json`` reads a saved reply instead of calling the API.

Run from the repository root::

    python scripts/build_landmarks.py --from-stops
    python scripts/build_landmarks.py --from-stops --geojson rivers.geojson \
        --geojson canals.geojson --geojson water-bodies.geojson --hot-export kolkata-export
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

# The map's city window (south, west, north, east), the same box the /map drawing covers.
# Features are clipped to it so a 140 km river costs a few hundred points, not thousands.
MAP_WINDOW = (22.30, 88.15, 22.85, 88.60)
WATER_SIMPLIFY_M = 12.0
LAKE_SIMPLIFY_M = 6.0
STATION_SIMPLIFY_M = 2.0
# Small tanks and fish ponds cover the map in dots; the map is a bus map, not a cadastre.
MIN_LAKE_HA = 0.4
MAX_WATER_SHAPES = 130
GENERIC_WATER_NAME = re.compile(
    r"^(pond|jheel|jhil|tank|talao|talab|dighi|pukur|khal|water body|fish pond|waterbody|pond swiming pool)\s*\d*$",
    re.I,
)
# Zoo moats are tagged as canals in OpenStreetMap; they are not what a bus passenger means.
NOT_A_WATERWAY = re.compile(r"\benclosure\b", re.I)
# A hotel pool is water, but it is not a landmark.
NOT_A_LAKE = re.compile(r"\b(swimming pool|swiming pool|resort)\b", re.I)
BUS_TERMINAL_NAME = re.compile(r"\b(bus\s*(stand|stop|terminus|terminal|depot)|bus stand)\b", re.I)

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


# --------------------------------------------------------------------------- clipping

Point = tuple[float, float]


def _box_edges(window: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
    south, west, north, east = window
    return south, west, north, east


def _inside(point: Point, window: tuple[float, float, float, float]) -> bool:
    south, west, north, east = _box_edges(window)
    return south <= point[0] <= north and west <= point[1] <= east


def _segment_through_box(a: Point, b: Point, window: tuple[float, float, float, float]) -> Point | None:
    """The part of one segment inside the box, or None. Liang-Barsky, so a river that only
    crosses a corner still comes back with the part that is drawn."""
    south, west, north, east = _box_edges(window)
    x0, y0 = a[1], a[0]
    x1, y1 = b[1], b[0]
    dx, dy = x1 - x0, y1 - y0
    t0, t1 = 0.0, 1.0
    for edge_p, edge_q in ((-dx, x0 - west), (dx, east - x0), (-dy, y0 - south), (dy, north - y0)):
        if edge_p == 0:
            if edge_q < 0:
                return None
            continue
        t = edge_q / edge_p
        if edge_p < 0:
            t0 = max(t0, t)
        else:
            t1 = min(t1, t)
        if t0 > t1:
            return None
    return (y0 + t0 * dy, x0 + t0 * dx)


def clip_line(points: list[Point], window: tuple[float, float, float, float]) -> list[list[Point]]:
    """Cut a line into the runs that lie inside the box. Reconnecting where the line leaves
    and later re-enters would invent a shortcut, so each run stays its own shape."""
    runs: list[list[Point]] = []
    current: list[Point] = []
    for a, b in zip(points, points[1:]):
        a_in, b_in = _inside(a, window), _inside(b, window)
        if a_in and b_in:
            if not current:
                current = [a]
            current.append(b)
            continue
        if not a_in and not b_in:
            if current:
                runs.append(current)
                current = []
            entry = _segment_through_box(a, b, window)
            if entry is not None:
                exit_point = _segment_through_box(b, a, window)
                if exit_point is not None and entry != exit_point:
                    runs.append([entry, exit_point])
            continue
        edge = _segment_through_box(a, b, window) if a_in else _segment_through_box(b, a, window)
        if edge is None:  # one end is inside, so this cannot happen; kept for safety
            if current:
                runs.append(current)
                current = []
            continue
        if a_in:
            if not current:
                current = [a]
            current.append(edge)
            runs.append(current)
            current = []
        else:
            if current:
                runs.append(current)
            current = [edge, b]
    if current:
        runs.append(current)
    clean: list[list[Point]] = []
    for run in runs:
        kept: list[Point] = []
        for point in run:
            if not kept or kept[-1] != point:
                kept.append(point)
        if len(kept) >= 2:
            clean.append(kept)
    return clean


def clip_ring(points: list[Point], window: tuple[float, float, float, float]) -> list[Point]:
    """Sutherland-Hodgman: keep the part of a closed ring that lies in the box."""
    south, west, north, east = _box_edges(window)
    edges = (
        (lambda p: p[1] >= west, lambda a, b: _interpolate_lng(a, b, west)),
        (lambda p: p[1] <= east, lambda a, b: _interpolate_lng(a, b, east)),
        (lambda p: p[0] >= south, lambda a, b: _interpolate_lat(a, b, south)),
        (lambda p: p[0] <= north, lambda a, b: _interpolate_lat(a, b, north)),
    )

    def _interpolate_lng(a: Point, b: Point, lng: float) -> Point:
        if b[1] == a[1]:
            return (a[0], lng)
        t = (lng - a[1]) / (b[1] - a[1])
        return (a[0] + t * (b[0] - a[0]), lng)

    def _interpolate_lat(a: Point, b: Point, lat: float) -> Point:
        if b[0] == a[0]:
            return (lat, a[1])
        t = (lat - a[0]) / (b[0] - a[0])
        return (lat, a[1] + t * (b[1] - a[1]))

    ring = points[:]
    for keeps, crossing in edges:
        if not ring:
            return []
        out: list[Point] = []
        previous = ring[-1]
        for current in ring:
            if keeps(current):
                if not keeps(previous):
                    out.append(crossing(previous, current))
                out.append(current)
            elif keeps(previous):
                out.append(crossing(previous, current))
            previous = current
        ring = out
    return ring


def ring_area_ha(points: list[Point]) -> float:
    """Shoelace on a local flat projection: good to a few percent, which is all a size
    filter needs."""
    if len(points) < 3:
        return 0.0
    lat0 = points[0][0]
    sx = 111_320 * math.cos(math.radians(lat0))
    sy = 110_574
    total = 0.0
    for (alat, alng), (blat, blng) in zip(points, points[1:] + points[:1]):
        total += (alng * sx) * (blat * sy) - (blng * sx) * (alat * sy)
    return abs(total) / 2 / 10_000


# --------------------------------------------------------------------------- GeoJSON layers


def _geojson_lines(geometry: dict) -> list[list[Point]]:
    kind = geometry.get("type")
    coords = geometry.get("coordinates") or []
    if kind == "LineString":
        return [[(c[1], c[0]) for c in coords if isinstance(c, list) and len(c) >= 2]]
    if kind == "MultiLineString":
        return [[(c[1], c[0]) for c in line if isinstance(c, list) and len(c) >= 2] for line in coords]
    return []


def _geojson_rings(geometry: dict) -> list[list[Point]]:
    kind = geometry.get("type")
    coords = geometry.get("coordinates") or []
    if kind == "Polygon":
        return [[(c[1], c[0]) for c in coords[0] if isinstance(c, list) and len(c) >= 2]] if coords else []
    if kind == "MultiPolygon":
        out = []
        for polygon in coords:
            if polygon:
                line = [(c[1], c[0]) for c in polygon[0] if isinstance(c, list) and len(c) >= 2]
                if len(line) >= 4:
                    out.append(line)
        return out
    return []


def _geojson_kind(tags: dict) -> str | None:
    """What a layer feature is, from the OpenStreetMap tags the export kept."""
    waterway = (tags.get("waterway") or "").lower()
    if waterway == "river":
        return "river"
    if waterway == "canal":
        return "canal"
    if (tags.get("natural") or "").lower() == "water" or tags.get("water") or tags.get("water_type"):
        return "water"
    return None


def _service_kind(tags: dict, name: str = "") -> str | None:
    """Places that are not water: stations, hospitals, colleges, places of worship.
    Bus terminals are left out: the stop dataset already knows every bus stand."""
    if (tags.get("amenity") or "").lower() == "bus_station" or BUS_TERMINAL_NAME.search(name):
        return None
    operator = (tags.get("operator") or "").lower()
    if tags.get("building") == "train_station" or tags.get("railway") == "station" or tags.get("public_tra") == "station":
        return "metro" if "metro" in operator else "station"
    amenity = (tags.get("amenity") or "").lower()
    return {
        "hospital": "hospital",
        "university": "education",
        "college": "education",
        "place_of_worship": "worship",
        "museum": "museum",
        "stadium": "stadium",
        "bus_station": None,
    }.get(amenity)


def read_geojson_layer(path: Path) -> dict:
    """One OSM-derived layer as features the rest of this script understands."""
    raw = json.loads(path.read_text(encoding="utf-8"))
    features = raw.get("features", []) if isinstance(raw, dict) else raw
    out = {"lines": [], "rings": []}
    for feature in features if isinstance(features, list) else []:
        tags = feature.get("properties") or {}
        name = _geojson_name(tags)
        kind = _geojson_kind(tags)
        geometry = feature.get("geometry") or {}
        if not kind:
            continue
        if kind == "water":
            if not name or GENERIC_WATER_NAME.match(name) or NOT_A_LAKE.search(name):
                continue
            for ring in _geojson_rings(geometry):
                out["rings"].append({"name": name, "kind": "water", "points": ring})
        else:
            if not name:
                continue
            if NOT_A_WATERWAY.search(name):
                continue
            for line in _geojson_lines(geometry):
                out["lines"].append({"name": name, "kind": kind, "points": line})
    return out


def _geojson_name(tags: dict) -> str:
    for key in ("name", "name:en", "name_en", "NAME"):
        value = tags.get(key)
        if isinstance(value, str) and value.strip():
            return " ".join(value.split())
    return ""


# --------------------------------------------------------------------------- HOT shapefiles


def _decode(raw: bytes) -> str:
    """The export writes UTF-8 (Bengali station names included); older files are latin-1."""
    try:
        return raw.decode("utf-8").strip()
    except UnicodeDecodeError:
        return raw.decode("latin-1").strip()


def read_dbf(path: Path) -> list[dict]:
    """A .dbf attribute table. Only the character and numeric fields these exports use."""
    import struct

    blob = path.read_bytes()
    records, header, width = struct.unpack("<IHH", blob[4:12])
    fields: list[tuple[str, int]] = []
    at = 32
    while blob[at] != 0x0D:
        name = blob[at : at + 11].split(b"\0")[0].decode("latin-1")
        fields.append((name, blob[at + 16]))
        at += 32
    rows: list[dict] = []
    at = header
    for _ in range(records):
        row = blob[at : at + width]
        at += width
        values: dict[str, str] = {}
        pos = 1
        for name, length in fields:
            values[name] = _decode(row[pos : pos + length])
            pos += length
        rows.append(values)
    return rows


def read_shp(path: Path) -> list[tuple[int, list[list[Point]]]]:
    """Geometry from a .shp, as (shape type, parts). Points come back as one-point parts."""
    import struct

    blob = path.read_bytes()
    at = 100
    shapes: list[tuple[int, list[list[Point]]]] = []
    length = len(blob)
    while at + 8 <= length:
        content_words = struct.unpack(">i", blob[at + 4 : at + 8])[0]
        body = blob[at + 8 : at + 8 + content_words * 2]
        at += 8 + content_words * 2
        if len(body) < 4:
            continue
        shape_type = struct.unpack("<i", body[:4])[0]
        if shape_type == 0:
            shapes.append((0, []))
            continue
        if shape_type == 1:  # point
            x, y = struct.unpack("<dd", body[4:20])
            shapes.append((1, [[(y, x)]]))
            continue
        if shape_type in (3, 5):  # polyline, polygon
            num_parts, num_points = struct.unpack("<ii", body[36:44])
            parts_at = 44
            starts = list(struct.unpack(f"<{num_parts}i", body[parts_at : parts_at + 4 * num_parts]))
            points_at = parts_at + 4 * num_parts
            coords = struct.unpack(f"<{num_points * 2}d", body[points_at : points_at + 16 * num_points])
            parts: list[list[Point]] = []
            for index, start in enumerate(starts):
                end = starts[index + 1] if index + 1 < len(starts) else num_points
                parts.append([(coords[2 * i + 1], coords[2 * i]) for i in range(start, end)])
            shapes.append((shape_type, parts))
    return shapes


def from_hot_export(directory: Path) -> tuple[list[dict], list[dict]]:
    """Named stations (points) and station buildings (polygons) from a HOT raw-data-api export."""
    points: list[dict] = []
    shapes: list[dict] = []
    seen: set[str] = set()
    for shp in sorted(directory.glob("*_point.shp")):
        rows = read_dbf(shp.with_suffix(".dbf"))
        for (shape_type, parts), row in zip(read_shp(shp), rows):
            if shape_type != 1 or not parts:
                continue
            name = row.get("name", "").strip()
            kind = _service_kind(row, name)
            if not name or not kind or name in seen:
                continue
            seen.add(name)
            lat, lng = parts[0][0]
            if not _inside((lat, lng), MAP_WINDOW):
                continue
            points.append({"id": f"osm:node/{row.get('osm_id', name)}", "name": name, "kind": kind,
                           "lat": round(lat, 5), "lng": round(lng, 5), "source": "osm"})
    for shp in sorted(directory.glob("*_poly.shp")):
        rows = read_dbf(shp.with_suffix(".dbf"))
        for (shape_type, parts), row in zip(read_shp(shp), rows):
            if shape_type != 5 or not parts:
                continue
            name = row.get("name", "").strip()
            kind = _service_kind(row, name)
            if not name or not kind or not row.get("building") or row.get("building") == "no":
                continue
            ring = parts[0]
            if len(ring) < 4:
                continue
            ident = f"osm:way/{row.get('osm_id', name)}"
            if ident in seen:
                continue
            seen.add(ident)
            shapes.append({"id": ident, "name": name, "kind": kind, "closed": True,
                           "points": _round(simplify(ring, STATION_SIMPLIFY_M)), "source": "osm"})
    return points, shapes


def clip_layers(layers: list[dict], window: tuple[float, float, float, float]) -> tuple[list[dict], list[dict]]:
    """Clip every layer feature to the map window and simplify what is kept."""
    lines: list[dict] = []
    rings: list[dict] = []
    for layer in layers:
        for feature in layer["lines"]:
            kept = clip_line(feature["points"], window)
            for line in kept:
                simple = simplify(line, WATER_SIMPLIFY_M)
                if len(simple) >= 2:
                    lines.append({**feature, "points": simple})
        for feature in layer["rings"]:
            clipped = clip_ring(feature["points"], window)
            if len(clipped) < 4 or ring_area_ha(clipped) < MIN_LAKE_HA:
                continue
            simple = simplify(clipped, LAKE_SIMPLIFY_M)
            if len(simple) >= 4:
                rings.append({**feature, "points": simple, "area": ring_area_ha(simple)})
    return lines, rings


def water_shapes(lines: list[dict], rings: list[dict]) -> list[dict]:
    """Water as the map draws it: runs of one line joined into a named river or canal, and
    each named lake its own outline. Lakes too small to mean anything are dropped.

    A river traced in two layers is drawn once: the first layer to name it wins, so the
    river system layer beats the canal layer that also carries the Hooghly's segments."""
    grouped: dict[tuple[str, str], list[list[Point]]] = {}
    named: set[str] = set()
    for feature in lines:
        key = (feature["kind"], feature["name"])
        if feature["name"].lower() in named and key not in grouped:
            continue
        named.add(feature["name"].lower())
        grouped.setdefault(key, []).append(feature["points"])
    shapes: list[dict] = []
    for (kind, name), runs in grouped.items():
        for index, run in enumerate(runs):
            ident = f"osm:{kind}/{_slug(name)}" + (f"-{index + 1}" if len(runs) > 1 else "")
            shapes.append({"id": ident, "name": name, "kind": kind, "closed": False,
                           "points": _round(run), "source": "osm"})
    rings.sort(key=lambda ring: ring["area"], reverse=True)
    for feature in rings[:MAX_WATER_SHAPES]:
        shapes.append({"id": f"osm:water/{_slug(feature['name'])}", "name": feature["name"], "kind": "water",
                       "closed": True, "points": _round(feature["points"]), "source": "osm"})
    return shapes


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "feature"


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
            "landmark, not its outline. Points and shapes with source 'osm' are real features from "
            "OpenStreetMap: rivers, canals and named lake outlines (clipped to the map window), the "
            "footprints of station buildings, and named stations and places."
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
    parser.add_argument("--geojson", action="append", type=Path, default=[],
                        help="an OSM-derived GeoJSON layer of rivers, canals or water bodies (repeatable)")
    parser.add_argument("--hot-export", type=Path,
                        help="a HOT raw-data-api shapefile export directory (*_point.shp, *_poly.shp)")
    parser.add_argument("--overpass", action="store_true", help="fetch rivers, bridges and buildings from OpenStreetMap")
    parser.add_argument("--from-file", type=Path, help="read a saved Overpass reply instead of calling the API")
    parser.add_argument("--refresh", action="store_true", help="ignore the cached Overpass reply")
    parser.add_argument("--dataset", type=Path, default=DATASET)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()

    if not (args.from_stops or args.overpass or args.from_file or args.geojson or args.hot_export):
        parser.error("choose --from-stops, --geojson, --hot-export, --overpass or --from-file")

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

    layers: list[dict] = []
    for path in args.geojson:
        layer = read_geojson_layer(path)
        layers.append(layer)
        sources.append(f"OpenStreetMap, via the {path.name} layer")
        print(f"{path.name}: {len(layer['lines'])} lines, {len(layer['rings'])} outlines")
    if layers:
        lines, rings = clip_layers(layers, MAP_WINDOW)
        water = water_shapes(lines, rings)
        shapes.extend(water)
        rivers = sum(1 for shape in water if shape["kind"] == "river")
        canals = sum(1 for shape in water if shape["kind"] == "canal")
        lakes = sum(1 for shape in water if shape["kind"] == "water")
        print(f"Water: {rivers} river runs, {canals} canal runs, {lakes} lakes")

    if args.hot_export:
        hot_points, hot_shapes = from_hot_export(args.hot_export)
        osm_points.extend(hot_points)
        points.extend(hot_points)
        shapes.extend(hot_shapes)
        sources.append("OpenStreetMap station and station-building export (HOT raw-data-api)")
        print(f"Stations: {len(hot_points)} points, {len(hot_shapes)} building outlines")

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
