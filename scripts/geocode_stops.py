#!/usr/bin/env python3
"""Give every bus stop in the site dataset a latitude/longitude.

The offline "ride" screen matches the phone's GPS position against the stops of the
route the passenger is on, so a stop without a coordinate cannot take part in that
match. This script produces those coordinates and keeps a record of where each one
came from.

Where the coordinates come from
------------------------------
Everything is copied from openly published datasets. **Nothing here invents a
position.** A stop that no source can place stays out of the file, and the ride
screen then says so instead of pretending.

1. ``arkodeepg/calcutta-transport`` -- already a source of this project (see
   ``scripts/import_external_routes.py``). Used files:

   ============================  ================================================
   ``data/bus/stops.csv``        2,362 bus stops with ``lat``/``lon``, a
                                 ``coord_method`` (``nominatim``, ``osm_place``,
                                 ``osm_stop``, ``wikidata``, ...) and a
                                 ``coord_confidence`` (``high``/``medium``).
   ``data/bus/stop_aliases.csv`` Their own evidenced alias rows, e.g. ``Dalhousie``
                                 = ``B.B.D. Bagh`` (OSM node + Wikidata + Wikipedia).
   ``data/{rail,metro,tram,      Other modes' stop coordinates; the same crossing
   auto,ferry}/stops.csv``       is often the bus stop too.
   ``gtfs/stops.txt``            Their generated GTFS feed, for stops the CSVs miss.
   ``docs/data/places.json``     18,179-place Kolkata gazetteer with alternate names.
   ============================  ================================================

   Licence, quoted from their own metadata: ``ODbL 1.0: (c) OpenStreetMap
   contributors; GeoNames (geonames.org) CC BY 4.0; Wikidata CC0``.

2. ``murmusuvash2-wq/busjatri-open-data`` -- also already a source of this project.
   ``data/stops.csv`` is the only usable coordinate list for the long-distance towns
   (Durgapur, Siliguri, Malda, Farakka, ...) that appear on the intercity routes.

Run from the repository root::

    .venv/bin/python scripts/geocode_stops.py                  # datasets only
    .venv/bin/python scripts/geocode_stops.py --osm            # + OpenStreetMap lookups
    .venv/bin/python scripts/geocode_stops.py --scope timed    # only timed-route stops
    .venv/bin/python scripts/geocode_stops.py --print-unresolved

Output
------
``data/stop_coordinates.json``
    The reviewed table, keyed by the exact stop name the site uses. Merged into the
    site dataset by ``scripts/build_static_data.py``. Ordered by stop name and free
    of timestamps, so re-running it produces no diff unless a source changed.
``data/stop_coordinates_review.csv``
    One row per stop, with the coordinate chosen, its source and confidence, and the
    alternatives that were considered. **Read this before you trust the output**:
    Kolkata stop names are short, duplicated and spelled several ways, and a name
    match can pick the wrong crossing.

OpenStreetMap mode
------------------
``--osm`` fills the gaps the datasets leave by querying Nominatim (and, for stops
still unresolved, the Overpass API for nearby ``highway=bus_stop`` nodes). It needs
full internet access, which this repository's build environment does not have, so
it is opt-in and runs from your machine. Responses are cached under
``.cache/geocode/`` and every hit is written to the review CSV as
``confidence=review`` -- an OSM answer is a *candidate* until a human has looked at
it, because Nominatim matches on names, not on bus routes.

Data rules
----------
* A coordinate is copied, never computed, averaged or interpolated. When two
  sources disagree the higher-ranked one wins and the other is recorded in the
  review CSV.
* A match through an abbreviation or a noise word (``Rd`` -> ``Road``, dropping
  ``Gate``/``Bus Stand``) is marked ``medium``. A match through the gazetteer or a
  fuzzy token match is marked ``review``.
* Coordinates outside a generous West Bengal box (21.0-27.5 N, 86.0-90.0 E) are
  dropped: they are a name collision in another part of India, not our stop.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
CACHE = ROOT / ".cache" / "geocode"
DEFAULT_DATASET = ROOT / "fontend" / "src" / "data" / "kolkata-bus-data.json"
DEFAULT_OUTPUT = DATA_DIR / "stop_coordinates.json"
DEFAULT_REVIEW = DATA_DIR / "stop_coordinates_review.csv"

CALCUTTA_URL = "https://codeload.github.com/arkodeepg/calcutta-transport/tar.gz/refs/heads/main"
BUSJATRI_URL = "https://codeload.github.com/murmusuvash2-wq/busjatri-open-data/tar.gz/refs/heads/main"
CALCUTTA_DIR = CACHE / "calcutta-transport"
BUSJATRI_DIR = CACHE / "busjatri-open-data"
NOMINATIM_CACHE = CACHE / "nominatim"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "find-your-bus/1.0 (offline Kolkata bus guide; contact: repository owner)"

LAT_BOX = (21.0, 27.5)
LON_BOX = (86.0, 90.0)

LICENCE = (
    "Stop coordinates are copied from openly published datasets: "
    "arkodeepg/calcutta-transport and murmusuvash2-wq/busjatri-open-data "
    "(ODbL 1.0 (c) OpenStreetMap contributors; GeoNames CC BY 4.0; Wikidata CC0)."
    + " Entries fetched with --osm are (c) OpenStreetMap contributors, ODbL 1.0."
)


# --------------------------------------------------------------------------- names

# Abbreviations that the workbooks and the open datasets do not spell the same way.
# Only expansions that cannot mean two different things.
EXPANSIONS = {
    "rd": "road",
    "rd.": "road",
    "road": "road",
    "ave": "avenue",
    "av": "avenue",
    "stn": "station",
    "sta": "station",
    "station": "station",
    "xing": "crossing",
    "x-ing": "crossing",
    "mor": "more",
    "coll": "college",
    "univ": "university",
    "hosp": "hospital",
    "mkt": "market",
    "phari": "market",  # Kolkata "phari" is a street market, e.g. Tollygunge Phari
    "sq": "square",
    "sqr": "square",
    "sqre": "square",
    "brg": "bridge",
    "chwrasta": "chowrasta",
    "chourasta": "chowrasta",
    "bypass": "bypass",
    "flyover": "flyover",
    "depot": "depot",
}

# Tokens that describe the furniture at a stop rather than the place, so
# "Airport 1 No." and "Airport Gate No. 1" can meet. Removed only in the
# least-specific variant, never in the first one.
NOISE_TOKENS = {
    "bus", "stand", "stop", "stopping", "stoppage", "terminus", "terminal",
    "gate", "gates", "point", "points", "no", "nos", "number", "the",
    "and", "of", "at", "near", "junction", "jbn",
}

# Certain renames only, each one a name the open datasets publish for the same
# place. Evidence is quoted so a reviewer can check it without leaving the file.
STOP_ALIASES: dict[str, str] = {
    # Our canonical name -> the name the open dataset publishes.
    "B.B.D. Bagh": "Dalhousie",
    # calcutta-transport stop_aliases.csv: "Dalhousie, B. B. D. Bagh, OSM node/1189036944
    # (place=suburb B. B. D. Bagh); Wikidata Q3341530; Wikipedia: B. B. D. Bagh was
    # formerly called Dalhousie Square".
    "Howrah Railway Station": "Howrah Station",
    "Moulali": "Maulali",
    "Baghbazar": "Bagbazar",
    "Garia Station": "Garia",
    "Parnasree": "Parnasree Pally",
    "Ruby": "Ruby Hospital",
    "Exide": "Exide Crossing",
    "R.G. Kar Hospital": "R G Kar Medical College and Hospital",
    "SSKM Hospital": "SSKM College and Hospital",
    "NRS Medical College": "NRS Medical College Hospital",
    "Thakurpukur Hospital": "Thakurpukur Cancer Hospital",
    "Apollo Gleneagles": "Apollo Gleneagles Hospitals",
    "Charu Market": "Charu Market Area",
    "Ruby / Chittaranjan Cancer Inst": "Chittaranjan National Cancer Institute",
    "Ruby / GST Bhawan": "Ruby Hospital",
    "Exide / Rabindra Sadan": "Rabindra Sadan Exide More",
    "Park Circus 7-Point": "Park Circus 7 Point",
    "Prince Anwar Shah Rd": "Prince Anwar Shah Road",
    "Southern Ave": "Southern Avenue",
    "Central Ave": "Chittaranjan Avenue",
    "Salt Lake Sector V": "Salt Lake Sector V Bus Terminus",
    "Airport 1 No.": "Airport Gate No. 1",
    "Tollygunge Phari": "Tollygunge",
    "Garia Dhalai Bridge": "Dhalai Bridge",
    "Garia 6 No.": "Garia 6 No Bus Terminus",
    "Sinthi More": "Sinthi",
    "Lake Town": "Lake Town Xing",
    "Nilgunge": "Nilgunge Road",
    "Belghoria": "Belghoria Expressway",
    "E.M. Bypass": "Eastern Metropolitan Bypass",
    "BT Road": "Barrackpore Trunk Road",
    "Bandhaghat": "Bandhaghat Rail Overbridge",
    "Chiriamore": "Chiria More",
    "Sakherbazar": "Sakher Bazar",
    "Rathtala": "Rathtala Mor",
    "Salkia": "Salkia Howrah",
    "Bonhooghly": "Bonhooghly Crossing",
    "Mechogram": "Uttar Mechogram",
    "Chandrakona Town": "Chandrakona",
    "Goura": "Goura Bazar",
    "Makardah": "Makardaha",
    # Berhampore is the anglicised spelling of Baharampur, Murshidabad. The intercity
    # routes print one or the other for the same town.
    "Berhampore": "Baharampur",
    # MG Road in central Kolkata, not the two northern "MG Road"s the gazetteer also has.
    "MG Road": "Mahatma Gandhi Road",
}


def normalise(value: str) -> str:
    """Lowercase, punctuation to spaces, whitespace collapsed."""
    if not isinstance(value, str):
        return ""
    text = re.sub(r"[^a-z0-9\u0980-\u09ff]+", " ", value.lower())
    return re.sub(r"\s+", " ", text).strip()


def expand(value: str) -> str:
    """Normalise, then spell out the abbreviations both datasets use."""
    tokens = normalise(value).split(" ")
    return " ".join(EXPANSIONS.get(token, token) for token in tokens)


def strip_noise(value: str) -> str:
    tokens = [token for token in expand(value).split(" ") if token not in NOISE_TOKENS]
    return " ".join(tokens)


def variants(name: str) -> list[str]:
    """Matching keys for one stop name, most specific first.

    The order matters: a match found on the first variant outranks a match found on
    a later one, so a stop keeps its coordinate even when a looser form also exists.
    """
    alias = STOP_ALIASES.get(name)
    ordered: list[str] = []
    for candidate in ([alias] if alias else []) + [name]:
        for form in (normalise(candidate), expand(candidate), strip_noise(candidate)):
            if form and form not in ordered:
                ordered.append(form)
    # "Ruby / GST Bhawan" is two names for one stop; either half is a fair match.
    if "/" in name:
        for part in name.split("/"):
            for form in (expand(part), strip_noise(part)):
                if form and form not in ordered:
                    ordered.append(form)
    return ordered


def in_west_bengal(lat: float, lon: float) -> bool:
    return LAT_BOX[0] <= lat <= LAT_BOX[1] and LON_BOX[0] <= lon <= LON_BOX[1]


# --------------------------------------------------------------------------- sources

# Lower tier = better. A bus stop is the right kind of feature; a gazetteer "Area"
# is a district centroid and is only a fallback.
TIER_BUS = 0          # a bus stop / bus stand in their own bus dataset
TIER_ALIAS = 1        # their evidenced alias table
TIER_GTFS = 2         # their generated GTFS feed
TIER_OTHER_MODE = 3   # rail / metro / tram / auto / ferry stop
TIER_LONGDIST = 4     # busjatri towns (intecity services only)
TIER_GAZETTEER = 5    # the places.json gazetteer

SOURCE_CONFIDENCE = {"high": 0, "medium": 1, "": 2}


@dataclass
class Candidate:
    name: str
    lat: float
    lon: float
    source: str
    method: str
    confidence: str
    tier: int
    detail: str = ""


@dataclass
class CandidateIndex:
    by_key: dict[str, list[Candidate]] = field(default_factory=dict)

    def add(self, candidate: Candidate) -> None:
        if not in_west_bengal(candidate.lat, candidate.lon):
            return
        for key in {normalise(candidate.name), expand(candidate.name), strip_noise(candidate.name)}:
            if not key:
                continue
            self.by_key.setdefault(key, []).append(candidate)

    def lookup(self, key: str) -> list[Candidate]:
        return self.by_key.get(key, [])

    def keys(self) -> Iterable[str]:
        return self.by_key.keys()


def _rows(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8-sig") as handle:
        return list(csv.DictReader(handle))


def _number(value: object) -> float | None:
    try:
        text = str(value or "").strip()
        return float(text) if text else None
    except ValueError:
        return None


def build_index(calcutta: Path, busjatri: Path) -> tuple[CandidateIndex, list[str]]:
    index = CandidateIndex()
    loaded: list[str] = []

    bus_stops = _rows(calcutta / "data" / "bus" / "stops.csv")
    if bus_stops:
        loaded.append("calcutta-transport/data/bus/stops.csv")
    for row in bus_stops:
        lat, lon = _number(row.get("lat")), _number(row.get("lon"))
        if lat is None or lon is None:
            continue
        confidence = (row.get("coord_confidence") or "").strip().lower()
        index.add(
            Candidate(
                name=row["stop_name"],
                lat=lat,
                lon=lon,
                source="calcutta-transport:data/bus/stops.csv",
                method=(row.get("coord_method") or "").strip(),
                confidence=confidence,
                tier=TIER_BUS,
                detail=(row.get("notes") or "")[:160],
            )
        )

    aliases = _rows(calcutta / "data" / "bus" / "stop_aliases.csv")
    coords_by_their_name = {row["stop_name"]: row for row in bus_stops if row.get("lat")}
    if aliases:
        loaded.append("calcutta-transport/data/bus/stop_aliases.csv")
    for row in aliases:
        base = coords_by_their_name.get(row["stop_name"])
        if base is None:
            continue
        index.add(
            Candidate(
                name=row["alias"],
                lat=float(base["lat"]),
                lon=float(base["lon"]),
                source="calcutta-transport:data/bus/stop_aliases.csv",
                method=(base.get("coord_method") or "").strip(),
                confidence=(base.get("coord_confidence") or "").strip().lower(),
                tier=TIER_ALIAS,
                detail=(row.get("evidence") or "")[:160],
            )
        )

    gtfs = _rows(calcutta / "gtfs" / "stops.txt")
    if gtfs:
        loaded.append("calcutta-transport/gtfs/stops.txt")
    for row in gtfs:
        lat, lon = _number(row.get("stop_lat")), _number(row.get("stop_lon"))
        if lat is None or lon is None:
            continue
        index.add(
            Candidate(
                name=row["stop_name"],
                lat=lat,
                lon=lon,
                source="calcutta-transport/gtfs/stops.txt",
                method="gtfs",
                confidence="medium",
                tier=TIER_GTFS,
                detail=row.get("stop_id", ""),
            )
        )

    for mode in ("rail", "metro", "tram", "auto", "ferry"):
        rows = _rows(calcutta / "data" / mode / "stops.csv")
        if not rows:
            continue
        loaded.append(f"calcutta-transport/data/{mode}/stops.csv")
        for row in rows:
            lat, lon = _number(row.get("lat")), _number(row.get("lon"))
            if lat is None or lon is None:
                continue
            index.add(
                Candidate(
                    name=row["stop_name"],
                    lat=lat,
                    lon=lon,
                    source=f"calcutta-transport/data/{mode}/stops.csv",
                    method=(row.get("coord_method") or mode).strip(),
                    confidence=(row.get("coord_confidence") or "medium").strip().lower(),
                    tier=TIER_OTHER_MODE,
                    detail=(row.get("notes") or "")[:160],
                )
            )

    towns = _rows(busjatri / "data" / "stops.csv")
    if towns:
        loaded.append("busjatri-open-data/data/stops.csv")
    for row in towns:
        lat, lon = _number(row.get("lat")), _number(row.get("lon"))
        if lat is None or lon is None:
            continue
        index.add(
            Candidate(
                name=row["stop_name"],
                lat=lat,
                lon=lon,
                source="busjatri-open-data/data/stops.csv",
                method="busjatri",
                confidence="medium",
                tier=TIER_LONGDIST,
            )
        )

    places_path = calcutta / "docs" / "data" / "places.json"
    if places_path.exists():
        loaded.append("calcutta-transport/docs/data/places.json")
        payload = json.loads(places_path.read_text(encoding="utf-8"))
        types = payload.get("meta", {}).get("types", [])
        for entry in payload.get("p", []):
            name, lat, lon = entry[0], _number(entry[1]), _number(entry[2])
            if lat is None or lon is None:
                continue
            kind = types[entry[3]] if entry[3] < len(types) else "Place"
            names = [name] + (entry[6].split("|") if len(entry) > 6 and entry[6] else [])
            for alias in names:
                index.add(
                    Candidate(
                        name=alias,
                        lat=lat,
                        lon=lon,
                        source="calcutta-transport/docs/data/places.json",
                        method="gazetteer",
                        confidence="review",
                        tier=TIER_GAZETTEER,
                        detail=kind,
                    )
                )

    return index, loaded


# --------------------------------------------------------------------------- scoring

def rank_key(candidate: Candidate) -> tuple[int, int, float]:
    """Sort key for candidates at one matching key: better sorts first."""
    # Gazetteer features that are actually a transport feature outrank an "Area".
    kind_bonus = 0 if candidate.detail in {"Bus stop", "Station", "Crossing", "Landmark"} else 1
    return (
        candidate.tier,
        SOURCE_CONFIDENCE.get(candidate.confidence, 2),
        kind_bonus,
    )


def token_score(query: str, candidate: str) -> float:
    """Jaccard similarity of the tokens, used only when no key matches exactly."""
    a, b = set(query.split()), set(candidate.split())
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


@dataclass
class Match:
    stop: str
    candidate: Candidate
    matched_on: str
    score: float
    alternatives: list[Candidate]


def match_stop(name: str, index: CandidateIndex) -> Match | None:
    for position, key in enumerate(variants(name)):
        found = index.lookup(key)
        if not found:
            continue
        ordered = sorted(found, key=rank_key)
        best = ordered[0]
        # An exact match on the primary spelling is as good as it gets; a later
        # variant is an abbreviation or a noise-stripped form, so it is capped.
        confidence = best.confidence
        if position > 0 and confidence == "high":
            confidence = "medium"
        return Match(
            stop=name,
            candidate=Candidate(
                name=best.name,
                lat=best.lat,
                lon=best.lon,
                source=best.source,
                method=best.method,
                confidence=confidence,
                tier=best.tier,
                detail=best.detail,
            ),
            matched_on=key,
            score=1.0,
            alternatives=[
                candidate
                for candidate in ordered[1:4]
                if abs(candidate.lat - best.lat) > 1e-4 or abs(candidate.lon - best.lon) > 1e-4
            ],
        )

    # No key matched. Try a token match against the bus stops only, so a gazetteer
    # entry can never win a fuzzy contest; it needs its name to match exactly.
    query = strip_noise(name)
    if len(query.split()) < 1:
        return None
    scored: list[tuple[float, Candidate]] = []
    for key, candidates in index.by_key.items():
        score = token_score(query, key)
        if score < 0.66:
            continue
        for candidate in candidates:
            if candidate.tier != TIER_BUS:
                continue
            scored.append((score, candidate))
    if not scored:
        return None
    scored.sort(key=lambda item: (-item[0], rank_key(item[1])))
    best_score, best = scored[0]
    runner_up = next(
        (item for item in scored[1:] if abs(item[1].lat - best.lat) > 1e-4 or abs(item[1].lon - best.lon) > 1e-4),
        None,
    )
    # Two different places scoring equally well means the name is ambiguous.
    if runner_up and runner_up[0] >= best_score - 0.001:
        return None
    return Match(
        stop=name,
        candidate=Candidate(
            name=best.name,
            lat=best.lat,
            lon=best.lon,
            source=best.source,
            method=best.method,
            confidence="review",
            tier=best.tier,
            detail=best.detail,
        ),
        matched_on=f"~{best.name}",
        score=round(best_score, 3),
        alternatives=[],
    )


# --------------------------------------------------------------------------- OpenStreetMap

def _download(url: str, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=120) as response:
        target.write_bytes(response.read())


def _untar(archive: Path, target: Path) -> None:
    """Unpack a GitHub tarball, dropping its single top-level directory.

    Done member by member rather than with ``extractall(filter=...)`` so the script
    also runs on Python 3.11.0-3.11.3, where that keyword does not exist yet.
    """
    import tarfile

    target.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive, "r:gz") as tar:
        for member in tar.getmembers():
            if not member.isfile():
                continue
            parts = member.name.split("/")
            if len(parts) < 2:
                continue  # the repository root itself
            relative = "/".join(parts[1:])
            if relative.startswith("/") or ".." in parts:
                continue
            destination = target / relative
            if not destination.resolve().is_relative_to(target.resolve()):
                continue
            destination.parent.mkdir(parents=True, exist_ok=True)
            with tar.extractfile(member) as source, destination.open("wb") as output:
                output.write(source.read())


def ensure_datasets(refresh: bool = False) -> tuple[Path, Path, list[str]]:
    """Make sure both source repositories are unpacked under .cache/, and say where from."""
    notes: list[str] = []
    shared = ROOT / ".cache" / "external"
    found: list[Path] = []
    for url, target, shared_target in (
        (CALCUTTA_URL, CALCUTTA_DIR, shared / "calcutta-transport"),
        (BUSJATRI_URL, BUSJATRI_DIR, shared / "busjatri-open-data"),
    ):
        name = target.name
        if not refresh:
            if (target / "data").exists():
                notes.append(f"{name}: cached in {target.relative_to(ROOT)}")
                found.append(target)
                continue
            # import_external_routes.py may already have fetched this repository.
            if (shared_target / "data").exists():
                notes.append(f"{name}: reusing {shared_target.relative_to(ROOT)}")
                found.append(shared_target)
                continue
        notes.append(f"{name}: downloading {url}")
        archive = CACHE / f"{name}.tar.gz"
        _download(url, archive)
        _untar(archive, target)
        found.append(target)
    return found[0], found[1], notes


def nominatim_lookup(stop: str) -> Candidate | None:
    """One Nominatim search. Cached on disk; rate limited to their usage policy."""
    NOMINATIM_CACHE.mkdir(parents=True, exist_ok=True)
    slug = re.sub(r"[^a-z0-9]+", "-", normalise(stop)).strip("-")[:80]
    cache_file = NOMINATIM_CACHE / f"{slug}.json"
    if cache_file.exists():
        payload = json.loads(cache_file.read_text(encoding="utf-8"))
    else:
        query = urllib.parse.urlencode(
            {"q": f"{stop}, Kolkata, West Bengal, India", "format": "jsonv2", "limit": 3, "addressdetails": 0}
        )
        request = urllib.request.Request(f"{NOMINATIM_URL}?{query}", headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                payload = json.loads(response.read())
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as error:
            print(f"  nominatim: {stop}: {error}", file=sys.stderr)
            return None
        cache_file.write_text(json.dumps(payload, indent=1), encoding="utf-8")
        time.sleep(1.1)  # Nominatim asks for no more than one request per second.
    if not payload:
        return None
    best = payload[0]
    lat, lon = _number(best.get("lat")), _number(best.get("lon"))
    if lat is None or lon is None or not in_west_bengal(lat, lon):
        return None
    return Candidate(
        name=best.get("display_name", stop).split(",")[0],
        lat=lat,
        lon=lon,
        source="nominatim.openstreetmap.org",
        method=f"nominatim:{best.get('category', '')}/{best.get('type', '')}",
        confidence="review",
        tier=TIER_BUS,
        detail=best.get("display_name", "")[:160],
    )


def overpass_nearby_bus_stop(lat: float, lon: float, radius: int = 250) -> Candidate | None:
    """The nearest mapped bus stop to a Nominatim hit, when one is mapped there."""
    query = f"""
[out:json][timeout:25];
(
  node["highway"="bus_stop"](around:{radius},{lat},{lon});
  node["public_transport"="platform"](around:{radius},{lat},{lon});
);
out center 5;
"""
    cache_file = NOMINATIM_CACHE / f"overpass-{round(lat, 4)}-{round(lon, 4)}.json"
    if cache_file.exists():
        payload = json.loads(cache_file.read_text(encoding="utf-8"))
    else:
        request = urllib.request.Request(
            OVERPASS_URL,
            data=urllib.parse.urlencode({"data": query}).encode(),
            headers={"User-Agent": USER_AGENT},
        )
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                payload = json.loads(response.read())
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as error:
            print(f"  overpass: {lat},{lon}: {error}", file=sys.stderr)
            return None
        cache_file.write_text(json.dumps(payload, indent=1), encoding="utf-8")
        time.sleep(1.0)
    elements = payload.get("elements", [])
    if not elements:
        return None

    def distance(element: dict[str, Any]) -> float:
        other_lat = _number(element.get("lat")) or lat
        other_lon = _number(element.get("lon")) or lon
        return (other_lat - lat) ** 2 + (other_lon - lon) ** 2

    best = min(elements, key=distance)
    best_lat, best_lon = _number(best.get("lat")), _number(best.get("lon"))
    if best_lat is None or best_lon is None:
        return None
    tags = best.get("tags", {})
    return Candidate(
        name=tags.get("name") or "mapped bus stop",
        lat=best_lat,
        lon=best_lon,
        source="overpass-api.de",
        method="osm_bus_stop",
        confidence="review",
        tier=TIER_BUS,
        detail=tags.get("name", ""),
    )


# --------------------------------------------------------------------------- geometry check
#
# A name match can be perfectly spelled and still be the wrong place: Kolkata, its
# suburbs and the districts around them reuse short names, and a gazetteer has a
# "Ramnagar", an "MG Road" and a "B.T. College" that are not ours. The route chains
# already in the dataset expose those, because a bus cannot be 60 km from the stop
# before it.
#
# The test is relative to each route's own spacing, so a city route with stops every
# 1 km and an intercity route with legs of 50 km are both judged fairly. A stop is
# rejected when it is off its own corridor more often than it sits on one.

EARTH_RADIUS_KM = 6371.0
GEOMETRY_SCALE_MULTIPLIER = 3.0   # how far off the corridor, in units of the route's median leg
GEOMETRY_MARGIN_KM = 5.0          # plus a flat allowance, so a 1 km median is not held to 3 km


def haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(h))


def cross_track_km(a: tuple[float, float], b: tuple[float, float], point: tuple[float, float]) -> float:
    """Distance from `point` to the segment a-b, on a local flat approximation.

    Exact enough at city scale, and it clamps to the segment so a stop beyond the end
    of the leg is measured from the nearest endpoint rather than from an extended line.
    """
    cos_lat = math.cos(math.radians((a[0] + b[0]) / 2))
    to_xy = lambda p: ((p[1] - a[1]) * math.radians(1) * EARTH_RADIUS_KM * cos_lat,  # noqa: E731
                       (p[0] - a[0]) * math.radians(1) * EARTH_RADIUS_KM)
    ax, ay = 0.0, 0.0
    bx, by = to_xy(b)
    px, py = to_xy(point)
    length_sq = (bx - ax) ** 2 + (by - ay) ** 2
    if length_sq == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / length_sq))
    return math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay)))


@dataclass
class Rejection:
    stop: str
    off_corridor: int
    on_corridor: int
    worst: str


def geometry_rejections(
    routes: list[list[str]],
    resolved: dict[str, "Match"],
) -> dict[str, Rejection]:
    """Stops whose coordinate the route chains contradict more often than they support."""
    position = {name: (match.candidate.lat, match.candidate.lon) for name, match in resolved.items()}
    off: dict[str, int] = {}
    on: dict[str, int] = {}
    worst: dict[str, tuple[float, str]] = {}

    for stops in routes:
        located = [index for index, name in enumerate(stops) if name in position]
        if len(located) < 3:
            continue
        legs = [
            haversine_km(position[stops[i]], position[stops[i + 1]])
            for i, j in zip(located, located[1:])
            if j == i + 1
        ]
        if not legs:
            continue
        scale = max(sorted(legs)[len(legs) // 2], 1.0)
        limit = max(scale * GEOMETRY_SCALE_MULTIPLIER, scale + GEOMETRY_MARGIN_KM)
        for slot in range(1, len(located) - 1):
            previous, index, following = located[slot - 1], located[slot], located[slot + 1]
            name = stops[index]
            offset = cross_track_km(position[stops[previous]], position[stops[following]], position[name])
            if offset > limit:
                off[name] = off.get(name, 0) + 1
                if offset > worst.get(name, (0.0, ""))[0]:
                    worst[name] = (offset, f"{scale:.1f} km median leg")
            else:
                on[name] = on.get(name, 0) + 1

    rejected: dict[str, Rejection] = {}
    for name, off_count in off.items():
        if off_count > on.get(name, 0):
            offset, note = worst[name]
            rejected[name] = Rejection(
                stop=name,
                off_corridor=off_count,
                on_corridor=on.get(name, 0),
                worst=f"{offset:.1f} km off its corridor ({note})",
            )
    return rejected


# --------------------------------------------------------------------------- output

CONFIDENCE_ORDER = {"high": 0, "medium": 1, "review": 2}
MIN_CONFIDENCE = {"high": 0, "medium": 1, "review": 2}


def write_output(
    output: Path,
    review: Path,
    resolved: dict[str, Match],
    unresolved: list[str],
    sources: list[str],
    timed_stops: set[str],
    rejections: dict[str, Rejection],
    osm_used: bool,
) -> None:
    stops: dict[str, dict[str, Any]] = {}
    for name in sorted(resolved, key=lambda value: value.lower()):
        match = resolved[name]
        candidate = match.candidate
        stops[name] = {
            "lat": round(candidate.lat, 5),
            "lng": round(candidate.lon, 5),
            "source": candidate.source,
            "method": candidate.method,
            "confidence": candidate.confidence,
            "matchedName": candidate.name,
            "matchedOn": match.matched_on,
        }
    payload = {
        "meta": {
            "description": "Reviewed latitude/longitude for the bus stops the site lists.",
            "generatedBy": "scripts/geocode_stops.py",
            "licence": LICENCE,
            "sources": sorted(sources) + (["OpenStreetMap (Nominatim/Overpass)"] if osm_used else []),
            "counts": {
                "stops": len(stops),
                "high": sum(1 for stop in stops.values() if stop["confidence"] == "high"),
                "medium": sum(1 for stop in stops.values() if stop["confidence"] == "medium"),
                "review": sum(1 for stop in stops.values() if stop["confidence"] == "review"),
                "unresolved": len(unresolved),
                "rejectedByRouteGeometry": len(rejections),
                "timedRouteStops": len(timed_stops),
                "timedRouteStopsResolved": len(timed_stops & set(stops)),
            },
            "rules": [
                "A coordinate is copied from a source, never interpolated or averaged.",
                "A match found through an abbreviation or a dropped noise word is capped at 'medium'.",
                "A gazetteer or fuzzy match is 'review': check it in stop_coordinates_review.csv.",
                "Coordinates outside 21.0-27.5 N / 86.0-90.0 E are dropped as name collisions.",
                "A coordinate the route chains contradict is rejected: a bus cannot be 60 km from its previous stop.",
                "An unresolved stop is absent, not estimated. The ride screen says so.",
            ],
        },
        "stops": stops,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    review.parent.mkdir(parents=True, exist_ok=True)
    with review.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            [
                "stop", "on_timed_route", "lat", "lng", "confidence", "source", "method",
                "matched_name", "matched_on", "score", "alternatives", "verdict",
            ]
        )
        for name in sorted(set(resolved) | set(unresolved), key=lambda value: value.lower()):
            match = resolved.get(name)
            if match is None:
                rejection = rejections.get(name)
                verdict = (
                    f"rejected_geometry: {rejection.worst}, {rejection.off_corridor} routes against "
                    f"{rejection.on_corridor} for"
                    if rejection
                    else ""
                )
                writer.writerow(
                    [name, int(name in timed_stops), "", "", "rejected" if rejection else "unresolved",
                     "", "", "", "", "", "", verdict]
                )
                continue
            candidate = match.candidate
            writer.writerow(
                [
                    name,
                    int(name in timed_stops),
                    round(candidate.lat, 5),
                    round(candidate.lon, 5),
                    candidate.confidence,
                    candidate.source,
                    candidate.method,
                    candidate.name,
                    match.matched_on,
                    match.score,
                    "; ".join(f"{c.name}@{c.source}:{round(c.lat, 4)},{round(c.lon, 4)}" for c in match.alternatives),
                    "",
                ]
            )


def read_dataset(path: Path, scope: str) -> tuple[list[str], set[str], list[list[str]]]:
    """The stop names to geocode, the stops on timed routes, and every route's stop chain."""
    payload = json.loads(path.read_text(encoding="utf-8"))
    stops = [stop["name"] for stop in payload.get("stops", [])]
    chains = [route["stops"] for route in payload.get("routes", [])]
    timed: set[str] = set()
    for route in payload.get("routes", []):
        has_times = bool(route.get("runs")) or (route.get("source") == "preview" and route.get("frequency"))
        if has_times:
            timed.update(route["stops"])
    return (sorted(timed, key=lambda value: value.lower()) if scope == "timed" else stops), timed, chains


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET, help="site JSON to read stop names from")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--review-csv", type=Path, default=DEFAULT_REVIEW)
    parser.add_argument("--scope", choices=("all", "timed"), default="all",
                        help="geocode every stop, or only the stops on routes that have times")
    parser.add_argument("--osm", action="store_true",
                        help="also query Nominatim/Overpass for stops the datasets leave unresolved")
    parser.add_argument("--min-confidence", choices=tuple(MIN_CONFIDENCE), default="review",
                        help="drop weaker matches from the output (they stay in the review CSV)")
    parser.add_argument("--no-geometry-check", action="store_true",
                        help="keep coordinates the route chains contradict (they are rejected by default)")
    parser.add_argument("--refresh", action="store_true", help="re-download the source datasets")
    parser.add_argument("--print-unresolved", action="store_true")
    args = parser.parse_args()

    if not args.dataset.exists():
        print(f"ERROR: {args.dataset} not found. Run scripts/build_static_data.py first.", file=sys.stderr)
        return 1

    calcutta, busjatri, notes = ensure_datasets(args.refresh)
    for note in notes:
        print(note)
    index, sources = build_index(calcutta, busjatri)
    print(f"Candidate coordinates indexed: {sum(len(v) for v in index.by_key.values())} "
          f"names from {len(sources)} files")

    names, timed, chains = read_dataset(args.dataset, args.scope)
    resolved: dict[str, Match] = {}
    unresolved: list[str] = []
    for name in names:
        match = match_stop(name, index)
        if match is None and args.osm:
            candidate = nominatim_lookup(name)
            if candidate is not None:
                nearby = overpass_nearby_bus_stop(candidate.lat, candidate.lon)
                if nearby is not None:
                    candidate = nearby
                    candidate.confidence = "medium"  # a mapped bus stop is better than a name hit
                match = Match(stop=name, candidate=candidate, matched_on="osm", score=0.0, alternatives=[])
        if match is None:
            unresolved.append(name)
        else:
            resolved[name] = match

    threshold = MIN_CONFIDENCE[args.min_confidence]
    dropped = [name for name, match in resolved.items() if CONFIDENCE_ORDER[match.candidate.confidence] > threshold]
    for name in dropped:
        resolved.pop(name)

    rejections: dict[str, Rejection] = {}
    if not args.no_geometry_check:
        rejections = geometry_rejections(chains, resolved)
        for name in rejections:
            resolved.pop(name)

    unresolved = sorted(set(unresolved) | set(dropped) | set(rejections), key=lambda value: value.lower())

    write_output(
        args.output, args.review_csv, resolved, unresolved, sources, timed, rejections, args.osm
    )

    if rejections:
        print(f"Rejected by the route-geometry check: {len(rejections)} "
              f"({', '.join(sorted(rejections)[:6])}{' ...' if len(rejections) > 6 else ''})")
    timed_resolved = len(timed & set(resolved))
    print(f"Stops geocoded: {len(resolved)} of {len(names)} in scope "
          f"({sum(1 for m in resolved.values() if m.candidate.confidence == 'high')} high, "
          f"{sum(1 for m in resolved.values() if m.candidate.confidence == 'medium')} medium, "
          f"{sum(1 for m in resolved.values() if m.candidate.confidence == 'review')} review)")
    print(f"Stops on timed routes: {timed_resolved} of {len(timed)}")
    print(f"Wrote {args.output.relative_to(ROOT)}")
    print(f"Wrote {args.review_csv.relative_to(ROOT)} -- review the 'review' rows before shipping")
    if args.print_unresolved and unresolved:
        print("Unresolved: " + ", ".join(unresolved))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
