#!/usr/bin/env python3
"""Give every timed bus route the real shape of the roads it runs on.

The ride screen needs the route as a line the bus can actually travel. The stops say
where a route calls, but not which streets it uses between them: joining the stops
directly cuts across blocks, rivers and one-way systems, puts the bus marker off the
road, and under-measures every leg. This script replaces that straight line with the
road itself.

What it does
------------
1. Takes every route that has a timetable (``runs`` or ``frequency`` in the site
   dataset), in both directions, and lists the legs between consecutive *located*
   stops -- the same legs the ride engine builds its corridor from.
2. Loads an OpenStreetMap road network and keeps the ways a bus can drive on.
3. Snaps each stop to the nearest few points on that network, splitting the road at
   each point so a stop is a junction like any other.
4. Routes each leg over the network with A*, once in each direction; one-way tags are
   obeyed and a penalty on minor roads keeps the result on the streets a bus would use.
5. Removes the points that add nothing at the map's scale (Douglas-Peucker, 5 m) and
   writes the result to ``fontend/src/data/route-geometry.json``.

The output is bundled with the site, so the ride screen and its map keep working with
no network at all. Legs no source can route -- the intercity stops outside this road
export -- are simply absent from the file and the ride screen draws those straight.

Where the roads come from
-------------------------
``--osm`` takes any of: an ``.osm``/``.osm.xml`` file (optionally ``.gz``/``.bz2``), an
``.osm.pbf`` (needs ``osmium``), a shapefile, or a zip containing one. Without it the
script downloads a pinned OpenStreetMap export of Kolkata made through the HOT
raw-data-api on 2025-09-21 and cached under ``.cache/route_geometry/``. The download is
checked against the SHA-256 of the archived shapefile, so a changed or truncated file
stops the build instead of quietly changing the map.

Both sources are OpenStreetMap data under the ODbL 1.0, (c) OpenStreetMap contributors.
That attribution is written into the output's ``meta`` block and is shown on the site.

Run from the repository root::

    .venv/bin/pip install pyshp                # once; osmium as well for .osm.pbf
    .venv/bin/python scripts/build_route_geometry.py
    .venv/bin/python scripts/build_route_geometry.py --osm kolkata.osm.pbf

Re-run it whenever the routes, their stops or the stop coordinates change, then rebuild
the site. The output is ordered and rounded, so an unchanged input produces no diff.
"""

from __future__ import annotations

import argparse
import bz2
import collections
import gzip
import hashlib
import heapq
import json
import math
import shutil
import sys
import tempfile
import urllib.error
import urllib.request
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator, Sequence

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DATASET = ROOT / "fontend" / "src" / "data" / "kolkata-bus-data.json"
DEFAULT_OUTPUT = ROOT / "fontend" / "src" / "data" / "route-geometry.json"
CACHE = ROOT / ".cache" / "route_geometry"

# A Raw-data-api export of the Kolkata road network, 2025-09-21. Pinned by commit, and
# verified by the hash of the shapefile archive inside it, because a branch download
# would silently change the map from one run to the next.
EXPORT_COMMIT = "47c7c7af9098e6a3c68c421fde30cd27dce26d2b"
EXPORT_URL = (
    "https://codeload.github.com/rakesh765483/"
    "Spatial-Analysis-of-Kolkata-Metro-Bus-Interconnectivity/zip/" + EXPORT_COMMIT
)
EXPORT_ARCHIVE = CACHE / "kolkata-road-export.zip"
EXPORT_SHAPEFILE_ZIP = CACHE / "kolkata-road-network.zip"
EXPORT_SHAPEFILE_SHA256 = "955a4218dca3e443567b79f64c2e7934c52b5dc8b4509f4fb4f14bbd2e7b9d21"
EXPORT_DIR = CACHE / "kolkata-road-network"

LICENCE = "ODbL 1.0 (c) OpenStreetMap contributors"

# The highway classes a bus can use. Footways, cycleways, steps and tracks are not
# roads a bus route follows, and including them would let the route cut through a park.
DRIVABLE = {
    "motorway", "trunk", "primary", "secondary", "tertiary", "unclassified",
    "residential", "service", "living_street", "road",
    "motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary_link",
}

# Multipliers on a way's length when choosing a route. Distance alone would send a bus
# down every back lane; the penalty expresses what a bus route is: a main road wherever
# there is one, a residential street to reach a stop, a service lane only at the end.
PENALTY = {
    "motorway": 1.0, "trunk": 1.0, "primary": 1.0, "secondary": 1.05,
    "tertiary": 1.1, "unclassified": 1.2, "road": 1.3, "residential": 1.3,
    "living_street": 1.6, "service": 1.9,
    "motorway_link": 1.1, "trunk_link": 1.1, "primary_link": 1.1,
    "secondary_link": 1.15, "tertiary_link": 1.2,
}

EARTH_RADIUS_METRES = 6_371_000.0
# Stops are mapped at the shelter, which is a few metres from the carriageway. Beyond
# this the coordinate is not describing this piece of road, and using it would put the
# bus on a different street; the stop is left unplaced instead.
MAX_SNAP_METRES = 130.0
# How many nearby pieces of road a stop may be placed on. The right one is not always
# the nearest when a stop sits between a main road and the service lane behind it, so
# the route decides -- but a handful is enough, and every extra one costs a search.
CANDIDATES_PER_STOP = 3
# The drawn map is a few hundred pixels wide for a route of tens of kilometres, so a
# point this close to the line between its neighbours cannot be seen.
SIMPLIFY_METRES = 5.0
# A road route longer than this multiple of the straight line is not a road route; it
# is a broken snap, and drawing it would be worse than drawing the straight line.
MAX_DETOUR_RATIO = 6.0
MAX_DETOUR_SLACK_METRES = 500.0
# Raw-data-api exports this area in a 0.004 degree grid; cells are about 440 m.
GRID_CELL_DEGREES = 0.004

Point = tuple[float, float]


# --------------------------------------------------------------------------- sources


def timed_legs(dataset: dict) -> dict[str, list[str]]:
    """Every stop pair the ride screen measures between, for every timed route.

    The ride engine drops a stop with no coordinate and measures straight from the
    located stop before it to the located stop after it, so those are the pairs that
    need a road shape. Both directions are listed separately: a return trip often uses
    a different carriageway, and a one-way street gives it a different road entirely.
    """
    stops = {stop["name"]: stop for stop in dataset.get("stops", [])}
    located = lambda name: isinstance(stops.get(name, {}).get("lat"), (int, float))

    legs: dict[str, list[str]] = collections.defaultdict(list)
    for route in dataset.get("routes", []):
        if not (route.get("runs") or route.get("frequency")):
            continue
        names = route.get("stops", [])
        for chain in (names, list(reversed(names))):
            previous: str | None = None
            for name in chain:
                if not located(name):
                    continue
                if previous is not None:
                    legs[route["number"]].append(f"{previous}|{name}")
                previous = name
    return legs


def _download(url: str, destination: Path) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": "find-your-bus/1.0"})
    with urllib.request.urlopen(request) as response, destination.open("wb") as handle:
        shutil.copyfileobj(response, handle)


def download_export() -> Path:
    """Fetch and unpack the pinned OSM export, or reuse what is already cached."""
    CACHE.mkdir(parents=True, exist_ok=True)
    if (EXPORT_DIR / "kolkataborderliine" / "kolkata_line.shp").exists():
        return EXPORT_DIR

    if not EXPORT_ARCHIVE.exists():
        print(f"Downloading the OpenStreetMap road network (~29 MB) to {CACHE} …")
        try:
            _download(EXPORT_URL, EXPORT_ARCHIVE)
        except (urllib.error.URLError, OSError) as error:
            raise SystemExit(
                f"Could not download the OSM export: {error}\n"
                "This build environment may not have internet access. Download a road "
                "extract of the routes' area yourself and pass it with --osm."
            ) from error

    with zipfile.ZipFile(EXPORT_ARCHIVE) as archive:
        members = [name for name in archive.namelist() if name.endswith("Kolkata_shapefiles&layergpx.zip")]
        if not members:
            raise SystemExit(f"{EXPORT_ARCHIVE} does not contain the Kolkata road shapefile.")
        with archive.open(members[0]) as source, EXPORT_SHAPEFILE_ZIP.open("wb") as destination:
            shutil.copyfileobj(source, destination)

    digest = hashlib.sha256(EXPORT_SHAPEFILE_ZIP.read_bytes()).hexdigest()
    if digest != EXPORT_SHAPEFILE_SHA256:
        EXPORT_SHAPEFILE_ZIP.unlink(missing_ok=True)
        raise SystemExit(
            "The downloaded road network does not match the pinned SHA-256 "
            f"({digest}). The source has changed; review it before trusting the output."
        )

    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(EXPORT_SHAPEFILE_ZIP) as archive:
        archive.extractall(EXPORT_DIR)
    return EXPORT_DIR


@dataclass(frozen=True)
class Way:
    """One OpenStreetMap way's drawable part: a line, and how the law treats it."""

    points: tuple[Point, ...]
    oneway: int  # 1 forward only, -1 backward only, 0 both ways
    highway: str


def read_shapefile(path: Path) -> Iterator[Way]:
    try:
        import shapefile  # pyshp
    except ImportError as error:  # pragma: no cover - environment problem, not logic
        raise SystemExit("Reading a shapefile needs pyshp: .venv/bin/pip install pyshp") from error

    reader = shapefile.Reader(str(path))
    fields = {field[0] for field in reader.fields[1:]}
    if not {"highway", "oneway"} <= fields:
        raise SystemExit(f"{path} has no highway/oneway columns, so it is not a road network.")
    for item in reader.iterShapeRecords():
        shape = item.shape
        tags = item.record.as_dict()
        highway = tags.get("highway") or ""
        if highway not in DRIVABLE:
            continue
        oneway = 1 if tags.get("oneway") == "yes" else (-1 if tags.get("oneway") == "-1" else 0)
        bounds = list(shape.parts) + [len(shape.points)]
        for start, end in zip(bounds, bounds[1:]):
            # Shapefiles store x=lng, y=lat; the rest of this script works in lat/lng.
            points = tuple((round(y, 7), round(x, 7)) for x, y in shape.points[start:end])
            if len(points) >= 2:
                yield Way(points, oneway, highway)


def read_osm_xml(path: Path) -> Iterator[Way]:
    import xml.etree.ElementTree as element_tree

    opener = gzip.open if path.suffix == ".gz" else (bz2.open if path.suffix == ".bz2" else open)
    nodes: dict[str, Point] = {}
    with opener(path, "rb") as handle:  # type: ignore[operator]
        for _, element in element_tree.iterparse(handle, events=("end",)):
            if element.tag == "node":
                nodes[element.get("id", "")] = (float(element.get("lat")), float(element.get("lon")))
                element.clear()
            elif element.tag == "way":
                tags = {child.get("k"): child.get("v") for child in element.findall("tag")}
                highway = tags.get("highway") or ""
                if highway in DRIVABLE:
                    refs = [child.get("ref", "") for child in element.findall("nd")]
                    points = tuple(nodes[ref] for ref in refs if ref in nodes)
                    if len(points) >= 2:
                        yield Way(points, _oneway(tags), highway)
                element.clear()


def read_osm_pbf(path: Path) -> Iterator[Way]:
    try:
        import osmium
    except ImportError as error:  # pragma: no cover - environment problem, not logic
        raise SystemExit("Reading a .osm.pbf needs osmium: .venv/bin/pip install osmium") from error

    ways: list[Way] = []

    class Collector(osmium.SimpleHandler):
        def way(self, way) -> None:  # noqa: ANN001 - osmium's type
            tags = {tag.k: tag.v for tag in way.tags}
            highway = tags.get("highway") or ""
            if highway not in DRIVABLE:
                return
            points = tuple((round(node.lat, 7), round(node.lon, 7)) for node in way.nodes)
            if len(points) >= 2:
                ways.append(Way(points, _oneway(tags), highway))

    Collector().apply_file(str(path), locations=True)
    return iter(ways)


def _oneway(tags: dict[str, str]) -> int:
    value = tags.get("oneway", "")
    if value == "yes":
        return 1
    if value == "-1":
        return -1
    return 0


def read_roads(source: Path) -> Iterator[Way]:
    """Read a road network from any supported file, unpacking a zip if need be."""
    suffix = source.suffix.lower()
    if suffix == ".zip":
        with tempfile.TemporaryDirectory() as directory:
            with zipfile.ZipFile(source) as archive:
                shapes = [name for name in archive.namelist() if name.lower().endswith(".shp")]
                if len(shapes) != 1:
                    raise SystemExit(f"{source} should contain exactly one .shp file, found {len(shapes)}.")
                archive.extractall(directory)
            yield from read_shapefile(Path(directory) / shapes[0])
    elif suffix == ".shp":
        yield from read_shapefile(source)
    elif suffix == ".pbf":
        yield from read_osm_pbf(source)
    elif suffix in {".osm", ".xml", ".gz", ".bz2"}:
        yield from read_osm_xml(source)
    else:
        raise SystemExit(
            f"Cannot read {source.name}. Pass an .osm, .osm.xml, .osm.pbf, .shp or a zip of a shapefile."
        )


# --------------------------------------------------------------------------- network


def haversine_metres(a: Point, b: Point) -> float:
    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])
    d_lat, d_lon = lat2 - lat1, lon2 - lon1
    h = math.sin(d_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(d_lon / 2) ** 2
    return 2 * EARTH_RADIUS_METRES * math.asin(min(1.0, math.sqrt(h)))


def line_metres(points: Sequence[Point]) -> float:
    return sum(haversine_metres(points[index - 1], points[index]) for index in range(1, len(points)))


@dataclass
class Edge:
    """A stretch of road between two junctions, which is the unit the search walks."""

    points: tuple[Point, ...]
    metres: float
    cost: float
    oneway: int


@dataclass
class Snap:
    """One place a stop could be: a point on a road, and how far it is from the stop."""

    point: Point
    offset_metres: float
    edge: int
    along: float
    node: int = -1


class Network:
    """The drivable roads, with a grid index for finding them by position.

    The graph is built in two steps. Roads are first cut at the junctions the data
    already has, which is what snapping searches against. Then every stop's snap points
    are inserted as junctions too, so a stop is as connected as any crossroads; only
    after that is the adjacency built that the route search walks.
    """

    def __init__(self, ways: Sequence[Way]) -> None:
        self.roads = self._split_at_junctions(ways)
        self.nodes: list[Point] = []
        self._ids: dict[Point, int] = {}
        self.adjacency: dict[int, list[tuple[int, int, bool]]] = collections.defaultdict(list)
        self.edges: list[Edge] = []
        self._grid = self._index_edges(self.roads)

    @staticmethod
    def _split_at_junctions(ways: Sequence[Way]) -> list[Edge]:
        """Cut every way where it meets another, so junctions are graph boundaries.

        OpenStreetMap ways run from junction to junction already; this also joins the
        parts of one street the data has left as two ways, which is what makes the
        network connected rather than a pile of separate lines.
        """
        shared = collections.Counter()
        for way in ways:
            shared.update(way.points)

        edges: list[Edge] = []
        for way in ways:
            cuts = sorted(
                {0, len(way.points) - 1}
                | {index for index, point in enumerate(way.points) if shared[point] >= 2}
            )
            for start, end in zip(cuts, cuts[1:]):
                if end <= start:
                    continue
                points = way.points[start : end + 1]
                metres = line_metres(points)
                if metres > 0:
                    edges.append(Edge(points, metres, metres * PENALTY[way.highway], way.oneway))
        return edges

    def _node(self, point: Point) -> int:
        node = self._ids.get(point)
        if node is None:
            node = len(self.nodes)
            self._ids[point] = node
            self.nodes.append(point)
        return node

    @staticmethod
    def _index_edges(edges: Sequence[Edge]) -> dict[tuple[int, int], list[int]]:
        grid: dict[tuple[int, int], list[int]] = collections.defaultdict(list)
        for index, edge in enumerate(edges):
            latitudes = [point[0] for point in edge.points]
            longitudes = [point[1] for point in edge.points]
            for row in range(_cell(min(latitudes)), _cell(max(latitudes)) + 1):
                for column in range(_cell(min(longitudes)), _cell(max(longitudes)) + 1):
                    grid[(row, column)].append(index)
        return grid

    def _nearby_edges(self, point: Point, radius: int) -> Iterator[int]:
        row, column = _cell(point[0]), _cell(point[1])
        seen: set[int] = set()
        for d_row in range(-radius, radius + 1):
            for d_column in range(-radius, radius + 1):
                for index in self._grid.get((row + d_row, column + d_column), ()):
                    if index not in seen:
                        seen.add(index)
                        yield index

    def project(self, point: Point, edge_index: int) -> tuple[float, float, Point]:
        """Perpendicular distance, distance along the edge, and the nearest point."""
        latitude = math.radians(point[0])
        metres_per_degree_lng = 111_320.0 * math.cos(latitude)
        metres_per_degree_lat = 110_574.0
        best = (math.inf, 0.0, point)
        travelled = 0.0
        points = self.roads[edge_index].points
        for start, end in zip(points, points[1:]):
            ax = (start[1] - point[1]) * metres_per_degree_lng
            ay = (start[0] - point[0]) * metres_per_degree_lat
            bx = (end[1] - point[1]) * metres_per_degree_lng
            by = (end[0] - point[0]) * metres_per_degree_lat
            dx, dy = bx - ax, by - ay
            length_squared = dx * dx + dy * dy
            t = 0.0 if length_squared == 0 else min(1.0, max(0.0, -(ax * dx + ay * dy) / length_squared))
            offset = math.hypot(ax + t * dx, ay + t * dy)
            if offset < best[0]:
                best = (
                    offset,
                    travelled + t * math.sqrt(length_squared),
                    (start[0] + t * (end[0] - start[0]), start[1] + t * (end[1] - start[1])),
                )
            travelled += haversine_metres(start, end)
        return best

    def snap(self, stop: Point, max_metres: float, limit: int) -> list[Snap]:
        """The nearest few distinct pieces of road to a stop."""
        found: list[tuple[float, int, float, Point]] = []
        radius = 1
        while radius <= 16:
            for edge_index in self._nearby_edges(stop, radius):
                offset, along, nearest = self.project(stop, edge_index)
                if offset <= max_metres:
                    found.append((offset, edge_index, along, nearest))
            if found:
                break
            radius *= 2

        candidates: list[Snap] = []
        seen_edges: set[int] = set()
        for offset, edge_index, along, nearest in sorted(found):
            if edge_index in seen_edges:
                continue
            if any(haversine_metres(nearest, candidate.point) < 2 for candidate in candidates):
                continue
            seen_edges.add(edge_index)
            candidates.append(Snap(nearest, offset, edge_index, along))
            if len(candidates) == limit:
                break
        return candidates

    def connect(self, snaps: Sequence[Snap]) -> None:
        """Insert the snap points as junctions, then build the routable graph."""
        cuts: dict[int, list[tuple[float, Point]]] = collections.defaultdict(list)
        for snap in snaps:
            cuts[snap.edge].append((snap.along, snap.point))

        self.edges = []
        for index, road in enumerate(self.roads):
            points = sorted(set(cuts.get(index, ())))
            self.edges.extend(self._burst(road, points))

        for index, edge in enumerate(self.edges):
            start = self._node(edge.points[0])
            end = self._node(edge.points[-1])
            if edge.oneway >= 0:
                self.adjacency[start].append((end, index, True))
            if edge.oneway <= 0:
                self.adjacency[end].append((start, index, False))

        for snap in snaps:
            snap.node = self._ids[snap.point]
        del self.roads

    @staticmethod
    def _burst(edge: Edge, cuts: Sequence[tuple[float, Point]]) -> list[Edge]:
        """Cut one road edge at the given (distance along, point) positions."""
        if not cuts:
            return [edge]

        cumulative = [0.0]
        for index in range(len(edge.points) - 1):
            cumulative.append(cumulative[-1] + haversine_metres(edge.points[index], edge.points[index + 1]))

        pieces: list[Edge] = []
        previous_along, previous_point = 0.0, edge.points[0]
        for along, point in list(cuts) + [(cumulative[-1], edge.points[-1])]:
            if along <= previous_along:
                continue
            between = [
                vertex
                for index, vertex in enumerate(edge.points)
                if previous_along < cumulative[index] < along
            ]
            points = _dedupe((previous_point, *between, point))
            metres = line_metres(points)
            if len(points) >= 2 and metres > 0:
                pieces.append(Edge(points, metres, metres * (edge.cost / edge.metres), edge.oneway))
            previous_along, previous_point = along, point
        return pieces

    def route(self, starts: set[int], goals: set[int]) -> tuple[list[Point], float] | None:
        """Cheapest road path from any start node to any goal node, and its cost."""
        goal_points = [self.nodes[node] for node in goals]
        heuristic_cache: dict[int, float] = {}

        def heuristic(node: int) -> float:
            cached = heuristic_cache.get(node)
            if cached is None:
                here = self.nodes[node]
                cached = min(haversine_metres(here, goal) for goal in goal_points)
                heuristic_cache[node] = cached
            return cached

        queue = [(heuristic(node), 0.0, node) for node in sorted(starts)]
        heapq.heapify(queue)
        cost_so_far = {node: 0.0 for node in starts}
        came_from: dict[int, tuple[int, int, bool]] = {}
        settled: set[int] = set()

        while queue:
            _, cost, node = heapq.heappop(queue)
            if node in settled:
                continue
            settled.add(node)
            if node in goals:
                if node not in came_from:
                    return [self.nodes[node]], cost
                parts: list[list[Point]] = []
                current = node
                while current in came_from:
                    previous, edge_index, forward = came_from[current]
                    road = self.edges[edge_index]
                    parts.append(list(road.points if forward else reversed(road.points)))
                    current = previous
                parts.reverse()
                path = [parts[0][0]]
                for part in parts:
                    path.extend(part[1:])
                return path, cost
            for neighbour, edge_index, forward in self.adjacency.get(node, ()):
                next_cost = cost + self.edges[edge_index].cost
                if next_cost < cost_so_far.get(neighbour, math.inf):
                    cost_so_far[neighbour] = next_cost
                    came_from[neighbour] = (node, edge_index, forward)
                    heapq.heappush(queue, (next_cost + heuristic(neighbour), next_cost, neighbour))
        return None


def _dedupe(points: Sequence[Point]) -> tuple[Point, ...]:
    deduped = [points[0]]
    for point in points[1:]:
        if point != deduped[-1]:
            deduped.append(point)
    return tuple(deduped)


def _cell(degrees: float) -> int:
    return int(math.floor(degrees / GRID_CELL_DEGREES))


# --------------------------------------------------------------------------- routing


def snap_stops(network: Network, stops: dict[str, Point], max_metres: float) -> dict[str, list[Snap]]:
    return {
        name: network.snap(point, max_metres, CANDIDATES_PER_STOP)
        for name, point in sorted(stops.items())
    }


def route_leg(
    network: Network,
    candidates: dict[str, list[Snap]],
    start: str,
    end: str,
) -> tuple[list[Point], float, Snap, Snap] | None:
    """The best road path for one leg, choosing where exactly to put each end.

    All combinations of the two stops' candidates are tried, and the winner is the one
    whose road distance plus both snap offsets is smallest -- a stop that is 40 m from
    a main road is better placed there than on a lane that is 5 m away if the lane
    makes the bus drive three blocks the wrong way.
    """
    starts, ends = candidates.get(start, []), candidates.get(end, [])
    if not starts or not ends:
        return None

    best: tuple[list[Point], float, Snap, Snap] | None = None
    for first in starts:
        for second in ends:
            if first.node == second.node:
                path, cost = [first.point], 0.0
            else:
                result = network.route({first.node}, {second.node})
                if result is None:
                    continue
                path, cost = result
            score = cost + first.offset_metres + second.offset_metres
            if best is None or score < best[1]:
                best = (path, score, first, second)
    if best is None:
        return None
    path, score, first, second = best
    # The snap offsets are part of the choice, not of the leg's length.
    road_cost = score - first.offset_metres - second.offset_metres
    return _join(first.point, path, second.point), road_cost, first, second


def _join(start: Point, path: Sequence[Point], end: Point) -> list[Point]:
    """The path with its two snap points attached, without repeating a point."""
    points = [start, *path, end]
    joined = [points[0]]
    for point in points[1:]:
        if point != joined[-1]:
            joined.append(point)
    return joined


# --------------------------------------------------------------------------- output


def simplify(points: Sequence[Point], tolerance_metres: float) -> list[Point]:
    """Douglas-Peucker: drop the points a reader could not tell were there."""
    if len(points) <= 2:
        return list(points)

    equator_scale = 111_320.0
    latitude = math.radians(points[0][0])
    metres_per_degree_lat = 110_574.0
    metres_per_degree_lng = equator_scale * math.cos(latitude)

    def offset(index: int, start: int, end: int) -> float:
        ax = (points[start][1] - points[index][1]) * metres_per_degree_lng
        ay = (points[start][0] - points[index][0]) * metres_per_degree_lat
        bx = (points[end][1] - points[index][1]) * metres_per_degree_lng
        by = (points[end][0] - points[index][0]) * metres_per_degree_lat
        dx, dy = bx - ax, by - ay
        length_squared = dx * dx + dy * dy
        px = -ax
        py = -ay
        if length_squared == 0:
            return math.hypot(px, py)
        t = min(1.0, max(0.0, (px * dx + py * dy) / length_squared))
        return math.hypot(px - t * dx, py - t * dy)

    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        start, end = stack.pop()
        worst, worst_index = 0.0, None
        for index in range(start + 1, end):
            distance = offset(index, start, end)
            if distance > worst:
                worst, worst_index = distance, index
        if worst_index is not None and worst > tolerance_metres:
            keep[worst_index] = True
            stack.append((start, worst_index))
            stack.append((worst_index, end))
    return [point for point, kept in zip(points, keep) if kept]


def leg_problem(path: Sequence[Point], start: str, end: str, stop_points: dict[str, Point]) -> str | None:
    """Why a routed leg should not be shipped, or None when it is plausible."""
    if len(path) < 2:
        return "fewer than two points"
    straight = haversine_metres(stop_points[start], stop_points[end])
    distance = line_metres(path)
    if distance <= 0:
        return "zero length"
    if distance > straight * MAX_DETOUR_RATIO + MAX_DETOUR_SLACK_METRES:
        return f"{distance:.0f} m of road for {straight:.0f} m apart"
    return None


def write_output(
    path: Path,
    legs: dict[str, list[Point]],
    meta: dict,
) -> None:
    """Write the geometry with one leg per line, so a diff shows which legs changed."""
    meta_lines = json.dumps(meta, indent=2, ensure_ascii=False).splitlines()
    lines = ["{", f'  "meta": {meta_lines[0]}']
    lines.extend("  " + line for line in meta_lines[1:])
    lines[-1] += ","
    lines.append('  "legs": {')
    entries = []
    for key in sorted(legs):
        points = ",".join(f"[{lat:.5f},{lng:.5f}]" for lat, lng in legs[key])
        entries.append(f'    {json.dumps(key, ensure_ascii=False)}: {{"m": {round(line_metres(legs[key]))}, "p": [{points}]}}')
    lines.append(",\n".join(entries))
    lines.append("  }")
    lines.append("}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    # Never leave a file behind that the site cannot parse.
    json.loads(path.read_text(encoding="utf-8"))


# --------------------------------------------------------------------------- main


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET, help="the bundled site dataset")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="where to write the geometry")
    parser.add_argument(
        "--osm",
        type=Path,
        default=None,
        help="a road network file to use instead of the pinned download "
        "(.osm/.osm.xml/.osm.pbf/.shp, or a zip containing a shapefile)",
    )
    parser.add_argument("--max-snap-metres", type=float, default=MAX_SNAP_METRES)
    parser.add_argument("--simplify-metres", type=float, default=SIMPLIFY_METRES)
    args = parser.parse_args()

    dataset = json.loads(args.dataset.read_text(encoding="utf-8"))
    stop_points: dict[str, Point] = {
        stop["name"]: (float(stop["lat"]), float(stop["lng"]))
        for stop in dataset.get("stops", [])
        if isinstance(stop.get("lat"), (int, float)) and isinstance(stop.get("lng"), (int, float))
    }
    if any("|" in name for name in stop_points):
        raise SystemExit("A stop name contains '|', which is this file's leg separator.")

    legs_by_route = timed_legs(dataset)
    wanted: list[tuple[str, str]] = sorted(
        {(leg.split("|")[0], leg.split("|")[1]) for route_legs in legs_by_route.values() for leg in route_legs}
    )
    if not wanted:
        raise SystemExit("No timed routes found; nothing to route.")
    used_stops = sorted({name for leg in wanted for name in leg})
    print(
        f"{len(legs_by_route)} timed routes, {len(wanted)} distinct legs, "
        f"{len(used_stops)} stops to place."
    )

    if args.osm is not None:
        road_source = args.osm
        source_note = f"{args.osm.name} (OpenStreetMap)"
        if not road_source.exists():
            raise SystemExit(f"{road_source} does not exist.")
        ways = list(read_roads(road_source))
    else:
        export = download_export()
        shapefiles = sorted(export.rglob("kolkata_line.shp"))
        if not shapefiles:
            raise SystemExit(f"{export} does not contain kolkata_line.shp.")
        road_source = shapefiles[0]
        source_note = f"OpenStreetMap road network, Kolkata export of 2025-09-21 (HOT raw-data-api, commit {EXPORT_COMMIT[:7]})"
        ways = list(read_roads(road_source))
    print(f"Loaded {len(ways)} drivable ways from {road_source.name}.")

    network = Network(ways)
    del ways

    candidates = snap_stops(network, {name: stop_points[name] for name in used_stops}, args.max_snap_metres)
    snapped = sum(1 for options in candidates.values() if options)
    print(f"Placed {snapped} of {len(used_stops)} stops on the network (within {args.max_snap_metres:.0f} m).")

    network.connect([snap for options in candidates.values() for snap in options])
    print(f"Graph: {len(network.nodes)} junctions, {len(network.edges)} road edges.")

    routed: dict[tuple[str, str], tuple[list[Point], float, Snap, Snap]] = {}
    unavailable = 0
    for start, end in wanted:
        result = route_leg(network, candidates, start, end)
        if result is None:
            unavailable += 1
            continue
        routed[(start, end)] = result
    print(f"Routed {len(routed)} legs; {unavailable} have no road in this network.")

    shipped: dict[str, list[Point]] = {}
    warnings: list[str] = []
    for (start, end), (path, _, _, _) in sorted(routed.items()):
        problem = leg_problem(path, start, end, stop_points)
        if problem is not None:
            print(f"  dropped {start} -> {end}: {problem}")
            continue
        straight = haversine_metres(stop_points[start], stop_points[end])
        if straight > 0 and line_metres(path) > straight * 3.5:
            warnings.append(f"{start} -> {end}")
        shipped[f"{start}|{end}"] = simplify(path, args.simplify_metres)

    if not shipped:
        raise SystemExit("No leg could be routed; refusing to write an empty map.")

    points_written = sum(len(points) for points in shipped.values())
    meta = {
        "source": source_note,
        "licence": LICENCE,
        "method": (
            "Stops snapped to the nearest drivable roads (max "
            f"{args.max_snap_metres:.0f} m); shortest road path between consecutive stops with a "
            "penalty for minor roads; both directions routed separately; simplified to "
            f"{args.simplify_metres:.0f} m. No turn restrictions."
        ),
        "dataset": args.dataset.name,
        "routes": len(legs_by_route),
        "legs": len(shipped),
        "legsWithoutRoad": len(wanted) - len(shipped),
        "stopsSnapped": snapped,
        "stopsNotSnapped": len(used_stops) - snapped,
        "points": points_written,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    write_output(args.output, shipped, meta)

    print(
        f"Wrote {args.output.relative_to(ROOT) if args.output.is_relative_to(ROOT) else args.output}: "
        f"{len(shipped)} legs, {points_written} points, {args.output.stat().st_size / 1024:.0f} KB."
    )
    if warnings:
        print(f"  {len(warnings)} legs run more than 3.5x the straight-line distance; check these:")
        print("   ", ", ".join(warnings[:10]), "(and more)" if len(warnings) > 10 else "")
    return 0


if __name__ == "__main__":
    sys.exit(main())
