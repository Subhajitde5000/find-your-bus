"""Build the static JSON dataset used by the frontend.

Inputs
------
1. ``Kolkata_Bus_Stands_v2.xlsx``                       -> stands (depots, terminals, route stands)
2. ``Kolkata_Comprehensive_Bus_Routes_and_Fleet_Directory.xlsx``
                                                       -> routes, stops, trips, buses (the directory)
3. ``data/timetable_preview_routes.json``               -> sample routes that used to be hard-coded in
                                                          ``fontend/src/lib/timetables.ts``

Every record is stored once. Duplicates are removed as follows:

* Stops are unique by name ignoring case, spaces and punctuation, so ``EM Bypass`` and
  ``E.M. Bypass`` become one stop. The spelling used most often in the directory is kept.
* Routes are unique by route number. When a sample route uses a number that the directory
  already has, the directory entry is kept (it has real run times and fleet data) and the
  sample route is skipped. The skipped numbers are listed under ``meta.dedupe``.
* Buses are unique by normalised registration (``WB 05 6214`` == ``WB056214``).
* Operators and service categories are unique by name.
* Trips are unique by run code.

Run through ``python manage.py export-static-data``. The output is written to
``fontend/src/data/kolkata-bus-data.json`` by default.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from dataclasses import dataclass, field
from datetime import time
from pathlib import Path
from typing import Any

import openpyxl

from app.importer import (
    clean_stop_name,
    clean_text,
    normalise_registration,
    parse_fleet_count,
    read_master_index,
    read_route_sheet,
    read_stands,
    split_via,
)
from app.stand_aliases import STAND_ALIASES

"""
Stop names the preview routes use for a place the directory calls something else.
Only pairs that are certainly the same place belong here.
"""
EXTRA_MERGES: dict[str, str] = {
    # The preview routes spell the Howrah terminus "Howrah Station".
    "Howrah Station": "Howrah Railway Station",
    # Same place, and the directory uses both spellings on different routes.
    "Sector V": "Salt Lake Sector V",
}

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
DEFAULT_STANDS = DATA_DIR / "Kolkata_Bus_Stands_v2.xlsx"
DEFAULT_ROUTES = DATA_DIR / "Kolkata_Comprehensive_Bus_Routes_and_Fleet_Directory.xlsx"
DEFAULT_PREVIEW = DATA_DIR / "timetable_preview_routes.json"
DEFAULT_OUTPUT = DATA_DIR.parent / "fontend" / "src" / "data" / "kolkata-bus-data.json"


def stop_key(name: str) -> str:
    """Identity of a stop name: letters and digits only, lower-cased."""
    return re.sub(r"[^a-z0-9]", "", name.lower())


def fmt_time(value: time) -> str:
    return value.strftime("%H:%M")


def service_type(category: str) -> str:
    """'AC' or 'Non-AC' from a service category such as 'AC Volvo Premium' or 'Non-AC Trunk'."""
    text_value = category.lower()
    if re.search(r"non-?\s?ac", text_value):
        return "Non-AC"
    if re.search(r"\bac\b", text_value):
        return "AC"
    return "Non-AC"


def operator_group(operator: str) -> str:
    """The frontend groups operators into WBTC (state buses) and Private."""
    return "WBTC" if "WBTC" in operator.upper() else "Private"


@dataclass
class BuildReport:
    merged_stop_spellings: dict[str, list[str]] = field(default_factory=dict)
    skipped_preview_routes: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


class _Stops:
    """Collects unique stops and remembers the canonical spelling for each key."""

    def __init__(self) -> None:
        self.spellings: dict[str, Counter[str]] = {}
        self.first_seen: dict[str, str] = {}
        self.canonical: dict[str, str] = {}

    def observe(self, name: str) -> None:
        key = stop_key(name)
        self.spellings.setdefault(key, Counter())[name] += 1
        self.first_seen.setdefault(key, name)

    def freeze(self) -> None:
        for key, counts in self.spellings.items():
            # Most used spelling wins; ties go to the first one seen in the workbook.
            best = max(counts.items(), key=lambda item: (item[1], -list(counts).index(item[0])))
            self.canonical[key] = best[0]

    def name(self, raw: str) -> str:
        return self.canonical[stop_key(raw)]


def build_dataset(
    stands_path: Path = DEFAULT_STANDS,
    routes_path: Path = DEFAULT_ROUTES,
    preview_path: Path = DEFAULT_PREVIEW,
) -> tuple[dict[str, Any], BuildReport]:
    report = BuildReport()

    # ------------------------------------------------------------------ read sources
    stand_rows = read_stands(stands_path)
    wb = openpyxl.load_workbook(routes_path, data_only=True)
    index = read_master_index(wb)
    sheets = [read_route_sheet(ws) for ws in wb.worksheets[1:]]
    preview_routes: list[dict[str, Any]] = json.loads(preview_path.read_text(encoding="utf-8"))

    directory_numbers = {sheet["route_number"].lower() for sheet in sheets}
    if len(directory_numbers) != len(sheets):
        raise ValueError("duplicate route number in the directory workbook")
    kept_samples = [r for r in preview_routes if r["number"].lower() not in directory_numbers]
    report.skipped_preview_routes = [r["number"] for r in preview_routes if r["number"].lower() in directory_numbers]

    # ------------------------------------------------------------------ stops: collect spellings
    stops = _Stops()
    for sheet in sheets:
        for raw in [sheet["origin"], *split_via(sheet["via"]), sheet["destination"]]:
            stops.observe(clean_stop_name(raw))
    for sample in kept_samples:
        for raw in sample["stops"]:
            stops.observe(raw)
    stops.freeze()
    for key, counts in stops.spellings.items():
        if len(counts) > 1:
            report.merged_stop_spellings[stops.canonical[key]] = sorted(counts)

    # ------------------------------------------------------------------ stands
    stands = []
    seen_stand_names: set[str] = set()
    for row in stand_rows:
        if row["name"].lower() in seen_stand_names:
            continue  # defensive: the workbook has no duplicates today
        seen_stand_names.add(row["name"].lower())
        stands.append(
            {
                "name": row["name"],
                "localName": row["local_name"],
                "category": row["node_category"],
                "division": row["operator_division"],
                "address": row["address"],
                "role": row["functional_role"],
            }
        )
    stands_by_name = {s["name"].lower(): s for s in stands}
    stands_by_local = {s["localName"].lower(): s for s in stands if s["localName"]}

    def linked_stand(stop_name: str) -> str | None:
        key = stop_name.lower()
        stand = stands_by_name.get(key) or stands_by_local.get(key)
        if stand is None and key in STAND_ALIASES:
            stand = stands_by_name.get(STAND_ALIASES[key].lower())
            if stand is None:
                raise ValueError(f"stand alias {key!r} points to unknown stand {STAND_ALIASES[key]!r}")
        return stand["name"] if stand else None

    # ------------------------------------------------------------------ merge stops that are the same place
    # Two different stop names that link to the same bus stand are the same physical place
    # (for example "Esplanade" and "Esplanade Curzon Park"). They become one stop, spelled the
    # way the directory spells it most often, so the site never lists the same place twice.
    usage: Counter[str] = Counter()
    for sheet in sheets:
        for raw in [sheet["origin"], *split_via(sheet["via"]), sheet["destination"]]:
            usage[stops.name(clean_stop_name(raw))] += 1
    for sample in kept_samples:
        for raw in sample["stops"]:
            usage[stops.name(raw)] += 1

    by_stand: dict[str, list[str]] = {}
    for name in usage:
        stand = linked_stand(name)
        if stand:
            by_stand.setdefault(stand, []).append(name)

    merge_map: dict[str, str] = {}
    for names in by_stand.values():
        if len(names) < 2:
            continue
        # Most used spelling wins; shorter then alphabetically for a stable choice on ties.
        canonical = max(names, key=lambda n: (usage[n], -len(n), n))
        for name in names:
            if name != canonical:
                merge_map[name] = canonical
    for source, target in EXTRA_MERGES.items():
        if source in usage and target in usage and source != target:
            merge_map[source] = target

    def resolve_merge(name: str) -> str:
        seen = {name}
        while name in merge_map:
            name = merge_map[name]
            if name in seen:
                break
            seen.add(name)
        return name

    merged_target: dict[str, str] = {name: resolve_merge(name) for name in usage}
    merged_groups: dict[str, list[str]] = {}
    for source, target in merged_target.items():
        if source != target:
            merged_groups.setdefault(target, []).append(source)
    for variants in merged_groups.values():
        variants.sort()

    collapsed: dict[str, list[str]] = {}

    def final_name(raw: str) -> str:
        base = stops.name(raw)
        return merged_target.get(base, base)

    def final_sequence(raws: list[str], route_number: str) -> list[str]:
        """Canonical names in order, dropping a stop the route would otherwise list twice."""
        out: list[str] = []
        for raw in raws:
            name = final_name(raw)
            if name in out:
                collapsed.setdefault(route_number, []).append(name)
                continue
            out.append(name)
        return out

    # ------------------------------------------------------------------ directory routes
    operators: list[str] = []
    categories: list[str] = []
    buses: list[str] = []
    bus_index: dict[str, int] = {}
    stop_names: dict[str, None] = {}  # ordered unique set of canonical stop names
    routes: list[dict[str, Any]] = []
    run_codes: set[str] = set()

    def add_unique(values: list[str], value: str) -> None:
        if value not in values:
            values.append(value)

    for sheet in sheets:
        number = sheet["route_number"]

        entry = index.get(number)
        if entry is None:
            report.warnings.append(f"route {number} is not in the master index")
            fleet_text = None
        else:
            fleet_text = entry["fleet_text"]
            if (entry["origin"], entry["destination"]) != (sheet["origin"], sheet["destination"]):
                report.warnings.append(f"route {number}: origin/destination differ from master index")

        origin_raw = clean_stop_name(sheet["origin"])
        destination_raw = clean_stop_name(sheet["destination"])
        origin_final = final_name(origin_raw)
        destination_final = final_name(destination_raw)
        stop_sequence = final_sequence(
            [origin_raw, *(clean_stop_name(v) for v in split_via(sheet["via"])), destination_raw],
            number,
        )
        if not stop_sequence:
            raise ValueError(f"route {number} has no stops")
        for name in stop_sequence:
            stop_names.setdefault(name, None)

        add_unique(operators, sheet["operator"])
        add_unique(categories, sheet["category"])

        trips = []
        for trip in sheet["trips"]:
            if trip["run_code"] in run_codes:
                raise ValueError(f"duplicate run code {trip['run_code']!r}")
            run_codes.add(trip["run_code"])
            bus = None
            if trip["bus"]:
                key = normalise_registration(trip["bus"])
                if key not in bus_index:
                    bus_index[key] = len(buses)
                    buses.append(trip["bus"])
                bus = bus_index[key]
            trips.append(
                {
                    "run": trip["run_code"],
                    "bus": bus,
                    "out": [fmt_time(trip["out_dep"]), fmt_time(trip["out_arr"])],
                    "ret": [fmt_time(trip["ret_dep"]), fmt_time(trip["ret_arr"])],
                    "notes": trip["notes"],
                }
            )

        route: dict[str, Any] = {
            "number": number,
            "source": "directory",
            "operator": sheet["operator"],
            "category": sheet["category"],
            "type": service_type(sheet["category"]),
            "origin": stop_sequence[0],
            "destination": stop_sequence[-1],
            "stops": stop_sequence,
            "fleet": {"text": fleet_text, "count": parse_fleet_count(fleet_text)} if fleet_text else None,
            "trips": trips,
        }
        if origin_raw != origin_final:
            route["originLabel"] = origin_raw
        if destination_raw != destination_final:
            route["destinationLabel"] = destination_raw
        routes.append(route)

    # ------------------------------------------------------------------ sample routes (no duplicates)
    for sample in kept_samples:
        number = sample["number"]
        names = final_sequence(list(sample["stops"]), number)
        for name in names:
            stop_names.setdefault(name, None)
        add_unique(operators, sample["operator"])
        routes.append(
            {
                "number": number,
                "source": "preview",
                "operator": sample["operator"],
                "category": None,
                "type": sample["type"],
                "origin": names[0],
                "destination": names[-1],
                "stops": names,
                "fleet": None,
                "trips": [],
                "frequency": {
                    "first": sample["first"],
                    "last": sample["last"],
                    "every": sample["every"],
                    "reverseOffset": sample.get("reverseOffset", 0),
                    "legs": sample["legs"],
                },
            }
        )

    # ------------------------------------------------------------------ stops with stand links
    stop_list = [
        {"name": name, "stand": linked_stand(name)}
        for name in sorted(stop_names, key=lambda n: (n.lower(), n))
    ]

    trip_count = sum(len(r["trips"]) for r in routes)
    dataset: dict[str, Any] = {
        "meta": {
            "description": "Kolkata bus directory, merged and de-duplicated for the static frontend.",
            "sources": [stands_path.name, routes_path.name, preview_path.name],
            "counts": {
                "stands": len(stands),
                "stops": len(stop_list),
                "stopsLinkedToStands": sum(1 for s in stop_list if s["stand"]),
                "operators": len(operators),
                "serviceCategories": len(categories),
                "buses": len(buses),
                "routes": len(routes),
                "directoryRoutes": sum(1 for r in routes if r["source"] == "directory"),
                "sampleRoutes": sum(1 for r in routes if r["source"] == "preview"),
                "routeStops": sum(len(r["stops"]) for r in routes),
                "trips": trip_count,
            },
            "dedupe": {
                "mergedStopSpellings": report.merged_stop_spellings,
                "mergedStops": merged_groups,
                "collapsedRouteStops": collapsed,
                "skippedSampleRoutes": report.skipped_preview_routes,
            },
            "notes": [
                "Directory routes carry real run times at the two terminals only; intermediate stops have no times.",
                "Sample routes use illustrative frequencies (first, last, every) and are not official timetables.",
            ],
        },
        "stands": stands,
        "stops": stop_list,
        "operators": operators,
        "serviceCategories": categories,
        "buses": buses,
        "routes": routes,
    }
    return dataset, report


def write_dataset(output: Path, dataset: dict[str, Any]) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    text_out = json.dumps(dataset, ensure_ascii=False, indent=2) + "\n"
    output.write_text(text_out, encoding="utf-8")
