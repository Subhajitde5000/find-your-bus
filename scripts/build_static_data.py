#!/usr/bin/env python3
"""Build the static dataset used by the website from the **v2** workbooks.

Inputs
------
``data/Kolkata_Comprehensive_Bus_Routes_and_Fleet_Directory-v2.xlsx``
    One sheet per route. Each sheet has an OUTBOUND and a RETURN timetable, and every
    column between "Bus Reg No" and "Operational Notes" is a stop with a published
    passage time. Blank cells stay blank in the JSON; nothing is interpolated.
``data/Kolkata_Bus_Stands_v2.xlsx``
    Bus stands. Used only to link a stop to its stand, never to invent a time.
``data/timetable_preview_routes.json``
    The illustrative sample routes. A sample is skipped when the v2 directory
    publishes the same route number, because a route number must be unique.

Output
------
``fontend/src/data/kolkata-bus-data.json``

Run from the repository root::

    .venv/bin/python scripts/build_static_data.py

The script is deliberately standalone: it does not import the backend or need a
database. The old ``backend/app/static_export.py`` still reads the old directory and
is kept only for history.

Data rules
----------
* The timetable columns are authoritative. The "Distance Alignment" sentence at the
  top of a v2 sheet sometimes names stops that have no timetable column; those are
  not added (46 of 75 sheets differ from their alignment sentence).
* A run is stored exactly as published: one direction, one bus, one time per stop.
  Outbound and return runs are not paired into a synthetic round trip, because the
  workbook does not publish such a pairing.
* Midnight crossings are kept as published clock times ("23:15", "00:05"). The
  frontend unwraps them when it computes a journey that crosses midnight.
* If a time cell is blank it becomes ``null``. A run with a blank time at a stop is
  still published data; the frontend will not invent a departure at that stop.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, time
from pathlib import Path
from typing import Any, Iterable

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
DEFAULT_ROUTES = DATA_DIR / "Kolkata_Comprehensive_Bus_Routes_and_Fleet_Directory-v2.xlsx"
DEFAULT_STANDS = DATA_DIR / "Kolkata_Bus_Stands_v2.xlsx"
DEFAULT_PREVIEW = DATA_DIR / "timetable_preview_routes.json"
DEFAULT_EXTENSION = DATA_DIR / "Kolkata_Bus_Routes_Extension-v3.xlsx"
DEFAULT_OUTPUT = ROOT / "fontend" / "src" / "data" / "kolkata-bus-data.json"

RUN_PREFIX = "RUN-"
NOTES_HEADER = "Operational Notes"


# --------------------------------------------------------------------------- text helpers


def clean_text(value: object) -> str | None:
    if value is None:
        return None
    text = re.sub(r"\s+", " ", str(value)).strip()
    return text or None


def parse_clock(value: object) -> int | None:
    """Published clock value -> minutes after midnight. ``None`` stays ``None``."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.hour * 60 + value.minute
    if isinstance(value, time):
        return value.hour * 60 + value.minute
    text = str(value).strip().upper().replace(".", "")
    if not text:
        return None
    match = re.match(r"^(\d{1,2}):(\d{2})\s*(AM|PM)?$", text)
    if not match:
        raise ValueError(f"unrecognised time value: {value!r}")
    hour, minute = int(match.group(1)), int(match.group(2))
    if minute > 59 or hour > 23:
        raise ValueError(f"out-of-range time value: {value!r}")
    suffix = match.group(3)
    if suffix == "PM" and hour != 12:
        hour += 12
    elif suffix == "AM" and hour == 12:
        hour = 0
    return hour * 60 + minute


def clock_string(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def stop_key(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


def service_type(category: str) -> str:
    text = category.lower()
    if re.search(r"non-?\s?ac", text):
        return "Non-AC"
    if re.search(r"\bac\b", text):
        return "AC"
    return "Non-AC"


# --------------------------------------------------------------------------- stop names
#
# Only spellings that are certainly the same place are merged. Everything else keeps
# the name the v2 timetable prints. This table is applied to both timetable headers
# and sample-route stop lists, so the two sources share one stop vocabulary.

STOP_SYNONYMS: dict[str, str] = {
    # Howrah
    "howrah stn": "Howrah Railway Station",
    "howrah station": "Howrah Railway Station",
    "howrah bus terminus": "Howrah Railway Station",
    # Sealdah
    "sealdah stn": "Sealdah",
    # Central
    "bbd bag": "B.B.D. Bagh",
    "b.b.d. bagh": "B.B.D. Bagh",
    "bagbazar": "Baghbazar",
    "baghbazar": "Baghbazar",
    # South
    "garia stn": "Garia Station",
    "jadavpur 8b stand": "Jadavpur 8B",
    "parnashree": "Parnasree",
    "hazra more": "Hazra",
    "maulali": "Moulali",
    "ruby hospital": "Ruby",
    # East / New Town
    "ultadanga / hudco": "Ultadanga",
    "new town bus stand": "New Town",
}


def canonical_stop(name: str) -> str:
    cleaned = clean_text(name)
    if not cleaned:
        raise ValueError("empty stop name")
    return STOP_SYNONYMS.get(cleaned.lower(), cleaned)


# --------------------------------------------------------------------------- stands
#
# Only clear links. The stand is informational; it never affects a time.

STAND_ALIASES: dict[str, str] = {
    "howrah railway station": "Howrah Station Central Stand",
    "howrah bus terminus": "Howrah Station Central Stand",
    "howrah stn": "Howrah Station Central Stand",
    "esplanade": "Esplanade Bus Terminus",
    "esplanade curzon park": "Esplanade Bus Terminus",
    "babughat": "Babughat Bus Terminus",
    "bbd bag": "B.B.D. Bag (Dalhousie) Square",
    "b.b.d. bagh": "B.B.D. Bag (Dalhousie) Square",
    "sealdah": "Sealdah Railway Station Stand",
    "sealdah railway station": "Sealdah Railway Station Stand",
    "gariahat": "Gariahat Crossing & Tram Stand",
    "gariahat crossing": "Gariahat Crossing & Tram Stand",
    "hazra": "Hazra More Crossing",
    "dunlop": "Dunlop Bridge Crossing",
    "shyambazar": "Shyambazar 5-Point Crossing",
    "ultadanga": "Ultadanga / HUDCO Crossing",
    "ultadanga / hudco": "Ultadanga / HUDCO Crossing",
    "science city": "Science City Crossing",
    "chingrighata": "Chingrighata Crossing",
    "ruby": "Ruby Hospital / GST Bhawan",
    "ruby hospital": "Ruby Hospital / GST Bhawan",
    "park circus 7-point": "Park Circus 7-Point Stand",
    "kamalgazi": "Kamalgazi More",
    "airport gate 1": "Airport Gate No. 1 / 3 Stand",
    "birati": "Birati Bus Stand",
    "dakshineswar": "Dakshineswar Bus Terminus",
    "golf green": "Golf Green Bus Terminus",
    "sarsuna": "Sarsuna Bus Terminus",
    "jadavpur 8b": "Jadavpur 8B Bus Terminus",
    "karunamoyee": "Karunamoyee Bus Terminus",
    "kudghat": "Kudghat Bus Terminus",
    "parnasree": "Parnasree Lake Stand",
    "kadamtala": "Kadamtala Bus Stand",
    "kamarhati": "Kamarhati Bus Stand",
    "kankurgachi": "Kankurgachi Bus Stand",
    "madhyamgram": "Madhyamgram Bus Stand",
    "nagerbazar": "Nagerbazar Bus Stand",
    "diamond harbour": "Diamond Harbour Bus Terminus",
    "dhakuria": "Dhakuria Bus Stand",
}


@dataclass
class Stand:
    name: str
    local_name: str | None
    category: str | None
    division: str | None
    address: str | None
    role: str | None


def read_stands(path: Path) -> list[Stand]:
    sheet = openpyxl.load_workbook(path, data_only=True).worksheets[0]
    stands: list[Stand] = []
    for row in sheet.iter_rows(values_only=True):
        if not isinstance(row[0], int):
            continue
        name = clean_text(row[1])
        if not name:
            continue
        stands.append(
            Stand(
                name=name,
                local_name=clean_text(row[2]),
                category=clean_text(row[3]),
                division=clean_text(row[4]),
                address=clean_text(row[5]),
                role=clean_text(row[6]),
            )
        )
    return stands


# --------------------------------------------------------------------------- workbook


@dataclass
class DirectionSection:
    direction: str
    stops: list[str]
    raw_stops: list[str]
    runs: list[dict[str, Any]]


@dataclass
class DirectoryRoute:
    number: str
    operator: str
    category: str
    alignment: str
    origin_label: str
    destination_label: str
    sections: dict[str, DirectionSection]
    warnings: list[str] = field(default_factory=list)


def _find_label(rows: list[tuple[Any, ...]], prefix: str) -> str | None:
    for row in rows[2:5]:
        for cell in row:
            text = clean_text(cell)
            if text and text.startswith(prefix):
                return clean_text(text.split(":", 1)[1])
    return None


def read_route_sheet(sheet) -> DirectoryRoute:
    rows = list(sheet.iter_rows(values_only=True))
    if not rows:
        raise ValueError(f"{sheet.title}: empty sheet")

    title = clean_text(rows[0][0]) or sheet.title
    route_number = sheet.title.split("_", 1)[1] if sheet.title.startswith("Route_") else title
    meta = clean_text(rows[1][0]) or ""
    match = re.match(
        r"Operator:\s*(.*?)\s*\|\s*Category:\s*(.*?)\s*\|\s*Distance Alignment:\s*(.*)$",
        meta,
    )
    if not match:
        raise ValueError(f"{sheet.title}: unexpected operator/category line: {meta!r}")
    operator, category, alignment = (part.strip() for part in match.groups())

    origin_label = _find_label(rows, "Origin (Stand X):")
    destination_label = _find_label(rows, "Destination (Stand Y):")
    if not origin_label or not destination_label:
        raise ValueError(f"{sheet.title}: origin/destination stand labels are missing")

    sections: dict[str, DirectionSection] = {}
    for index, row in enumerate(rows):
        text = clean_text(row[0]) or ""
        if text.startswith("OUTBOUND TIMETABLE"):
            direction = "outbound"
        elif text.startswith("RETURN TIMETABLE"):
            direction = "return"
        else:
            continue
        if direction in sections:
            raise ValueError(f"{sheet.title}: two {direction} sections")

        header = list(rows[index + 1])
        notes_index = next(
            (i for i, cell in enumerate(header) if (clean_text(cell) or "").startswith(NOTES_HEADER)),
            None,
        )
        stop_cells = list(header[2 : notes_index if notes_index is not None else len(header)])
        while stop_cells and stop_cells[-1] is None:
            stop_cells.pop()
        if any(cell is None for cell in stop_cells):
            raise ValueError(f"{sheet.title} [{direction}]: a gap appears between stop columns")
        raw_stops = [clean_text(cell) or "" for cell in stop_cells]
        stops = [canonical_stop(raw) for raw in raw_stops]
        if len(stops) < 2:
            raise ValueError(f"{sheet.title} [{direction}]: fewer than two stops")

        runs: list[dict[str, Any]] = []
        for run_row in rows[index + 2 :]:
            run_code = clean_text(run_row[0]) or ""
            if not run_code:
                break
            if not run_code.startswith(RUN_PREFIX):
                break  # the next section or a note row
            times = [parse_clock(cell) for cell in run_row[2 : 2 + len(stops)]]
            if len(times) != len(stops):
                raise ValueError(
                    f"{sheet.title} [{direction}] {run_code}: {len(times)} times for {len(stops)} stops"
                )
            notes_cell = run_row[notes_index] if notes_index is not None and notes_index < len(run_row) else None
            runs.append(
                {
                    "run": run_code,
                    "bus": clean_text(run_row[1]),
                    "times": times,
                    "notes": clean_text(notes_cell),
                }
            )
        if not runs:
            raise ValueError(f"{sheet.title} [{direction}]: no runs")
        sections[direction] = DirectionSection(
            direction=direction, stops=stops, raw_stops=raw_stops, runs=runs
        )

    if set(sections) != {"outbound", "return"}:
        raise ValueError(f"{sheet.title}: expected an outbound and a return timetable")

    outbound = sections["outbound"].stops
    returning = sections["return"].stops
    if outbound != list(reversed(returning)):
        raise ValueError(
            f"{sheet.title}: return stops are not the outbound stops reversed\n"
            f"  outbound: {outbound}\n  return:   {returning}"
        )
    if len(set(outbound)) != len(outbound):
        raise ValueError(f"{sheet.title}: duplicate stop in the outbound sequence: {outbound}")

    warnings: list[str] = []
    if alignment and [canonical_stop(part.strip()) for part in alignment.split("->") if part.strip()] != outbound:
        warnings.append(
            "alignment sentence differs from the timetable columns "
            f"({len(alignment.split('->'))} vs {len(outbound)} stops); timetable columns used"
        )

    return DirectoryRoute(
        number=route_number,
        operator=operator,
        category=category,
        alignment=alignment,
        origin_label=origin_label,
        destination_label=destination_label,
        sections=sections,
        warnings=warnings,
    )


# --------------------------------------------------------------------------- build


@dataclass
class BuildReport:
    merged_stops: dict[str, list[str]] = field(default_factory=dict)
    skipped_samples: list[str] = field(default_factory=list)
    alignment_warnings: list[str] = field(default_factory=list)
    blank_time_cells: int = 0
    midnight_runs: int = 0


def _midnight_count(times: Iterable[int | None]) -> int:
    values = [value for value in times if value is not None]
    return sum(1 for previous, current in zip(values, values[1:]) if current < previous)


def read_extension(path: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Reads the companion workbook of routes missing from the v2 directory.

    `Route Catalogue` rows carry no times at all.  `Timed_*` sheets are a stop table with an
    upward and a downward time column; a row without a time stays blank.
    """
    workbook = openpyxl.load_workbook(path, data_only=True)
    catalogue: list[dict[str, Any]] = []
    if "Route Catalogue" in workbook.sheetnames:
        sheet = workbook["Route Catalogue"]
        header = [clean_text(cell) for cell in next(sheet.iter_rows(min_row=1, max_row=1, values_only=True))]
        index = {name: position for position, name in enumerate(header)}

        def value(row: tuple[Any, ...], name: str) -> str:
            position = index.get(name)
            return clean_text(row[position]) if position is not None and position < len(row) else ""

        for row in sheet.iter_rows(min_row=2, values_only=True):
            number = value(row, "Route No")
            raw_stops = value(row, "Stops (travel order)")
            if not number or not raw_stops:
                continue
            stops = [clean_text(stop) for stop in raw_stops.split(">") if clean_text(stop)]
            if len(stops) < 2:
                raise ValueError(f"{number}: catalogue row has fewer than two stops")
            catalogue.append(
                {
                    "number": number,
                    "operator": value(row, "Operator") or "Unknown",
                    "mode": value(row, "Class") or "bus",
                    "origin": stops[0],
                    "destination": stops[-1],
                    "stops": stops,
                    "source": value(row, "Source"),
                    "confidence": value(row, "Confidence") or "community",
                    "notes": value(row, "Notes"),
                }
            )

    timed: list[dict[str, Any]] = []
    for sheet in workbook.worksheets:
        if not sheet.title.startswith("Timed_"):
            continue
        rows = list(sheet.iter_rows(values_only=True))
        meta: dict[str, str] = {}
        header_at = None
        for position, row in enumerate(rows):
            first = clean_text(row[0]) if row else ""
            if first in {"Service", "Operator", "Registration", "Bus type", "Origin", "Destination", "Fare", "Source", "Detail"}:
                meta[first] = clean_text(row[1])
            if first == "#" and len(row) > 1 and clean_text(row[1]) == "Stoppage":
                header_at = position
                break
        if header_at is None or not meta.get("Service"):
            raise ValueError(f"{sheet.title}: no stop table found")
        stops: list[str] = []
        up: list[str | None] = []
        down: list[str | None] = []
        for row in rows[header_at + 1 :]:
            name = clean_text(row[1]) if len(row) > 1 else ""
            if not name:
                continue
            stops.append(name)
            up.append(clean_text(row[2]) or None if len(row) > 2 else None)
            down.append(clean_text(row[3]) or None if len(row) > 3 else None)
        if len(stops) < 2:
            raise ValueError(f"{sheet.title}: fewer than two stops")
        runs: list[dict[str, Any]] = []
        if any(up):
            if not all(up):
                raise ValueError(f"{sheet.title}: sideways times are incomplete")
            runs.append({"direction": "outbound", "times": up})
        if any(down):
            if not all(down):
                raise ValueError(f"{sheet.title}: downward times are incomplete")
            # The down column is written in outbound stop order; the return run travels the
            # other way, so its times are the column reversed.
            runs.append({"direction": "return", "times": list(reversed(down))})
        if not runs:
            raise ValueError(f"{sheet.title}: no times at all")
        timed.append(
            {
                "number": meta["Service"],
                "operator": meta.get("Operator") or "Private operator",
                "mode": "bus",
                "origin": stops[0],
                "destination": stops[-1],
                "stops": stops,
                "reg_no": meta.get("Registration") or "",
                "fare": meta.get("Fare") or "",
                "source": meta.get("Source") or "",
                "detail_url": meta.get("Detail") or "",
                "notes": meta.get("Bus type") or "",
                "runs": runs,
            }
        )
    return catalogue, timed


def build_dataset(
    routes_path: Path = DEFAULT_ROUTES,
    stands_path: Path = DEFAULT_STANDS,
    preview_path: Path = DEFAULT_PREVIEW,
    extension_path: Path | None = DEFAULT_EXTENSION,
) -> tuple[dict[str, Any], BuildReport]:
    report = BuildReport()
    stand_rows = read_stands(stands_path)
    preview_routes: list[dict[str, Any]] = json.loads(preview_path.read_text(encoding="utf-8"))

    workbook = openpyxl.load_workbook(routes_path, data_only=True)
    directory: dict[str, DirectoryRoute] = {}
    for sheet in workbook.worksheets[1:]:
        if not sheet.title.startswith("Route_"):
            continue
        route = read_route_sheet(sheet)
        if route.number.lower() in {number.lower() for number in directory}:
            raise ValueError(f"duplicate route number in the v2 workbook: {route.number}")
        directory[route.number] = route
        if route.warnings:
            report.alignment_warnings.extend(f"{route.number}: {warning}" for warning in route.warnings)

    if not directory:
        raise ValueError("no Route_ sheets found in the v2 workbook")

    # ------------------------------------------------------------------ master index
    master = workbook.worksheets[0]
    master_codes: list[str] = []
    for row in master.iter_rows(values_only=True):
        if not isinstance(row[0], int):
            continue
        code = clean_text(row[1])
        if code:
            master_codes.append(code)
    missing = sorted(set(master_codes) - set(directory))
    extra = sorted(set(directory) - set(master_codes))
    if missing or extra:
        raise ValueError(f"master index and route sheets disagree: missing={missing}, extra={extra}")

    # ------------------------------------------------------------------ stops and spellings
    raw_spellings: dict[str, set[str]] = defaultdict(set)
    for route in directory.values():
        for section in route.sections.values():
            for raw, stop in zip(section.raw_stops, section.stops):
                raw_spellings[stop].add(raw)

    # Sample stops are written with the same canonical names.
    for sample in preview_routes:
        for raw in sample["stops"]:
            raw_spellings[canonical_stop(raw)].add(raw)

    merged_stops: dict[str, list[str]] = {}
    for canonical, spellings in raw_spellings.items():
        variants = sorted({spelling for spelling in spellings if spelling != canonical})
        if variants:
            merged_stops[canonical] = variants
    report.merged_stops = dict(sorted(merged_stops.items()))

    # ------------------------------------------------------------------ buses
    buses: list[str] = []
    bus_index: dict[str, int] = {}

    def bus_id(registration: str | None) -> int | None:
        if not registration:
            return None
        key = re.sub(r"[^A-Za-z0-9]", "", registration).upper()
        if key not in bus_index:
            bus_index[key] = len(buses)
            buses.append(registration)
        return bus_index[key]

    # ------------------------------------------------------------------ directory routes
    operators: list[str] = []
    categories: list[str] = []
    routes: list[dict[str, Any]] = []
    run_codes: set[str] = set()
    stop_names: dict[str, None] = {}

    def add_unique(values: list[str], value: str) -> None:
        if value and value not in values:
            values.append(value)

    for number, route in directory.items():
        outbound = route.sections["outbound"]
        stops = outbound.stops
        for stop in stops:
            stop_names.setdefault(stop, None)
        add_unique(operators, route.operator)
        add_unique(categories, route.category)

        runs: list[dict[str, Any]] = []
        for direction in ("outbound", "return"):
            section = route.sections[direction]
            for run in section.runs:
                if run["run"] in run_codes:
                    raise ValueError(f"duplicate run code: {run['run']}")
                run_codes.add(run["run"])
                if len(run["times"]) != len(stops):
                    raise ValueError(f"{run['run']}: time count does not match the stop count")
                report.blank_time_cells += sum(1 for value in run["times"] if value is None)
                if _midnight_count(run["times"]):
                    report.midnight_runs += 1
                runs.append(
                    {
                        "run": run["run"],
                        "direction": direction,
                        "bus": bus_id(run["bus"]),
                        "times": [None if value is None else clock_string(value) for value in run["times"]],
                        "notes": run["notes"],
                    }
                )

        routes.append(
            {
                "number": number,
                "source": "directory",
                "operator": route.operator,
                "category": route.category,
                "type": service_type(route.category),
                "origin": stops[0],
                "destination": stops[-1],
                "stops": stops,
                "fleet": None,
                "runs": runs,
            }
        )

    # ------------------------------------------------------------------ sample routes
    directory_codes = {number.lower() for number in directory}
    kept_samples: list[dict[str, Any]] = []
    for sample in preview_routes:
        if sample["number"].lower() in directory_codes:
            report.skipped_samples.append(sample["number"])
            continue
        kept_samples.append(sample)

    for sample in kept_samples:
        stops = [canonical_stop(raw) for raw in sample["stops"]]
        if len(set(stops)) != len(stops):
            raise ValueError(f"sample {sample['number']} repeats a stop: {stops}")
        for stop in stops:
            stop_names.setdefault(stop, None)
        add_unique(operators, sample["operator"])
        routes.append(
            {
                "number": sample["number"],
                "source": "preview",
                "operator": sample["operator"],
                "category": None,
                "type": sample["type"],
                "origin": stops[0],
                "destination": stops[-1],
                "stops": stops,
                "fleet": None,
                "runs": [],
                "frequency": {
                    "first": sample["first"],
                    "last": sample["last"],
                    "every": sample["every"],
                    "reverseOffset": sample.get("reverseOffset", 0),
                    "legs": sample["legs"],
                },
            }
        )

    # ------------------------------------------------------------------ extension workbook
    catalogue: list[dict[str, Any]] = []
    timed: list[dict[str, Any]] = []
    if extension_path is not None and extension_path.exists():
        catalogue, timed = read_extension(extension_path)

    existing_codes = {route["number"].lower() for route in routes}
    for entry in catalogue:
        if entry["number"].lower() in existing_codes:
            raise ValueError(f"extension repeats a route number: {entry['number']}")
        existing_codes.add(entry["number"].lower())
        for stop in entry["stops"]:
            stop_names.setdefault(stop, None)
        add_unique(operators, entry["operator"])
        add_unique(categories, "Catalogue route (no timetable)")
        routes.append(
            {
                "number": entry["number"],
                "source": "catalogue",
                "operator": entry["operator"],
                "category": "Catalogue route (no timetable)",
                "type": "AC" if re.match(r"\s*ac[\s-]", entry["number"], re.I) else "Non-AC",
                "origin": entry["stops"][0],
                "destination": entry["stops"][-1],
                "stops": entry["stops"],
                "fleet": None,
                "runs": [],
                "provenance": entry["source"] or "route list",
                "confidence": entry["confidence"] or "community",
                "notes": entry["notes"] or None,
            }
        )

    for entry in timed:
        if entry["number"].lower() in existing_codes:
            raise ValueError(f"extension repeats a route number: {entry['number']}")
        existing_codes.add(entry["number"].lower())
        for stop in entry["stops"]:
            stop_names.setdefault(stop, None)
        add_unique(operators, entry["operator"])
        add_unique(categories, "Long-distance service")
        runs: list[dict[str, Any]] = []
        for position, run in enumerate(entry["runs"], start=1):
            times = [None if not value else parse_clock(value) for value in run["times"]]
            if len(times) != len(entry["stops"]):
                raise ValueError(f"{entry['number']}: time count does not match the stop count")
            if not all(value is not None for value in times):
                raise ValueError(f"{entry['number']}: blank time in a published run")
            report.blank_time_cells += 0
            if _midnight_count(times):
                report.midnight_runs += 1
            label = "OUT" if run["direction"] == "outbound" else "RET"
            runs.append(
                {
                    "run": f"RUN-EXT-{position}-{label}-01",
                    "direction": run["direction"],
                    "bus": bus_id(entry.get("reg_no")),
                    "times": [clock_string(value) for value in times],
                    "notes": " | ".join(part for part in [
                        entry["notes"] or "",
                        f"Source: {entry['source']}" if entry["source"] else "",
                        entry["detail_url"] or "",
                    ] if part),
                }
            )
        routes.append(
            {
                "number": entry["number"],
                "source": "external",
                "operator": entry["operator"],
                "category": "Long-distance service",
                "type": service_type(entry["notes"] or ""),
                "origin": entry["stops"][0],
                "destination": entry["stops"][-1],
                "stops": entry["stops"],
                "fleet": {"text": entry.get("reg_no") or None, "count": 1 if entry.get("reg_no") else None},
                "runs": runs,
                "provenance": entry["source"] or None,
                "notes": entry["detail_url"] or None,
            }
        )

    routes.sort(key=lambda route: route["number"].lower())

    # ------------------------------------------------------------------ stands and stops
    stands_by_name = {stand.name.lower(): stand for stand in stand_rows}
    stands_by_local = {stand.local_name.lower(): stand for stand in stand_rows if stand.local_name}

    def linked_stand(name: str) -> str | None:
        key = name.lower()
        stand = stands_by_name.get(key) or stands_by_local.get(key)
        if stand is None and key in STAND_ALIASES:
            stand = stands_by_name.get(STAND_ALIASES[key].lower())
        return stand.name if stand else None

    stop_list = [
        {"name": name, "stand": linked_stand(name)}
        for name in sorted(stop_names, key=lambda value: (value.lower(), value))
    ]

    run_count = sum(len(route["runs"]) for route in routes)
    dataset: dict[str, Any] = {
        "meta": {
            "description": "Kolkata bus directory (v2), with published passage times at every stop.",
            "sources": [
                routes_path.name,
                stands_path.name,
                preview_path.name,
                *([extension_path.name] if extension_path is not None and extension_path.exists() else []),
            ],
            "counts": {
                "stands": len(stand_rows),
                "stops": len(stop_list),
                "stopsLinkedToStands": sum(1 for stop in stop_list if stop["stand"]),
                "operators": len(operators),
                "serviceCategories": len(categories),
                "buses": len(buses),
                "routes": len(routes),
                "directoryRoutes": sum(1 for route in routes if route["source"] == "directory"),
                "sampleRoutes": sum(1 for route in routes if route["source"] == "preview"),
                "catalogueRoutes": sum(1 for route in routes if route["source"] == "catalogue"),
                "externalTimedRoutes": sum(1 for route in routes if route["source"] == "external"),
                "routeStops": sum(len(route["stops"]) for route in routes),
                "runs": run_count,
            },
            "dedupe": {
                "mergedStops": report.merged_stops,
                "skippedSampleRoutes": report.skipped_samples,
                "samplesKeptOverBlankDirectoryRoutes": [],
            },
            "notes": [
                "The v2 directory publishes a passage time at every stop column. Blank cells stay blank; no time is interpolated.",
                "Each run is stored for the direction it is published in. Outbound and return runs are not paired.",
                "The alignment sentence at the top of a sheet is not a timetable. Only timetable columns are used as stops.",
                "Sample routes use illustrative frequencies (first, last, every) and are not official timetables.",
                "Catalogue routes come from published route lists and have no times at all: Kolkata city buses run to frequency and no source publishes stop times. They are never given an invented departure.",
                "External timed services are long-distance services whose operator or depot publishes a time at every stop. Intermediate times are copied from that timetable, not interpolated.",
            ],
        },
        "stands": [
            {
                "name": stand.name,
                "localName": stand.local_name,
                "category": stand.category,
                "division": stand.division,
                "address": stand.address,
                "role": stand.role,
            }
            for stand in stand_rows
        ],
        "stops": stop_list,
        "operators": operators,
        "serviceCategories": categories,
        "buses": buses,
        "routes": routes,
    }
    return dataset, report


def write_dataset(output: Path, dataset: dict[str, Any]) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(dataset, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--routes", type=Path, default=DEFAULT_ROUTES)
    parser.add_argument("--stands", type=Path, default=DEFAULT_STANDS)
    parser.add_argument("--preview", type=Path, default=DEFAULT_PREVIEW)
    parser.add_argument("--extension", type=Path, default=DEFAULT_EXTENSION)
    parser.add_argument("--no-extension", action="store_true", help="build from the v2 directory only")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    try:
        dataset, report = build_dataset(
            args.routes,
            args.stands,
            args.preview,
            None if args.no_extension else args.extension,
        )
    except ValueError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1

    write_dataset(args.output, dataset)
    counts = dataset["meta"]["counts"]
    print(
        f"Built {counts['routes']} routes "
        f"({counts['directoryRoutes']} directory + {counts['sampleRoutes']} sample + "
        f"{counts.get('catalogueRoutes', 0)} catalogue + {counts.get('externalTimedRoutes', 0)} timed external), "
        f"{counts['runs']} directional runs, {counts['stops']} stops."
    )
    print(f"Blank time cells kept blank: {report.blank_time_cells}")
    print(f"Midnight-crossing runs (kept as published): {report.midnight_runs}")
    print(
        "Sample routes superseded by the v2 directory: "
        + (", ".join(report.skipped_samples) if report.skipped_samples else "none")
    )
    print(f"Merged stop spellings: {len(report.merged_stops)}")
    if report.alignment_warnings:
        print(f"Alignment sentences that differ from timetable columns: {len(report.alignment_warnings)}")
    print(f"Wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
