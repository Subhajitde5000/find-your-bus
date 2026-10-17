#!/usr/bin/env python3
"""
Import the missing Kolkata bus routes from two openly published datasets.

Sources
-------
1. arkodeepg/calcutta-transport, data/bus/{routes,route_stops,stops}.csv
   Route numbers, termini and stop chains from WBTC's own city route list and
   Bus-O-Pedia's private/government catalogue, plus OpenStreetMap.  The dataset
   publishes NO run times: every `travel_min_from_start` cell is blank.  Nothing
   here invents one.
2. murmusuvash2-wq/busjatri-open-data, data/{buses,stoppages}.csv
   Long-distance services whose individual stop times are printed by the
   operator, the corporation depot or the stand board.  Only services with a
   complete stop-by-stop column in at least one direction are used.

Output
------
`data/external-routes.json` (staging; the workbook writer and the site builder
both read it) and a printed report.

This script never reads or writes the v2 workbook.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import openpyxl

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_static_data import read_route_sheet  # noqa: E402  (same-directory helper)

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache/external"
DEFAULT_CALCUTTA = CACHE / "calcutta-transport"
DEFAULT_BUSJATRI = CACHE / "busjatri-open-data"
CALCUTTA_URL = "https://codeload.github.com/arkodeepg/calcutta-transport/tar.gz/refs/heads/main"
BUSJATRI_URL = "https://codeload.github.com/murmusuvash2-wq/busjatri-open-data/tar.gz/refs/heads/main"
DEFAULT_V2 = ROOT / "data/Kolkata_Comprehensive_Bus_Routes_and_Fleet_Directory-v2.xlsx"
DEFAULT_OUT = ROOT / "data/external-routes.json"

# Terminals that make a long-distance service relevant to a Kolkata guide.  A service from
# Bankura to Bankura is not a Kolkata bus, even though the site already lists a Bankura stop
# for the Durgapur express; a service that starts or ends at one of these is.
KOLKATA_TERMINALS = {
    "kolkata", "howrah", "howrah station", "howrah stn", "esplanade", "babughat",
    "babu ghat", "karunamoyee", "karunamoyee bus terminus", "salt lake",
    "salt lake sector v", "saltlake karunamoyee", "new town", "newtown", "ecospace",
    "eco park", "unitech", "sapoorji", "shapoorji", "sealdah", "sealdha",
    "b.b.d. bagh", "bbd bag", "park circus", "airport", "airport gate 1",
    "airport gate no. 1", "dum dum", "garia", "jadavpur", "tollygunge", "behala",
}


def norm(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def clean(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def is_ac(name: str) -> bool:
    return bool(re.match(r"\s*ac[\s-]", name, re.I))


# ---------------------------------------------------------------- stop vocabulary
#
# Only merges that are certain.  Everything else keeps the name the source prints,
# because a wrong merge creates a journey that does not exist.
STOP_MAP = {
    # Howrah
    "howrah station": "Howrah Railway Station",
    "howrah stn": "Howrah Railway Station",
    "howrah": "Howrah Railway Station",
    "howrah stn.": "Howrah Railway Station",
    "howrah bus stand": "Howrah Railway Station",
    # Sealdah
    "sealdha": "Sealdah",
    "sealdah stn": "Sealdah",
    "sealdah station": "Sealdah",
    "sealdah(rjabajar)": "Sealdah",
    "sealdah (rajabazar t.d.)": "Sealdah",
    # Central
    "bbd bag": "B.B.D. Bagh",
    "b.b.d. bag": "B.B.D. Bagh",
    "b.b.d.bag": "B.B.D. Bagh",
    "b.b.d. bagh": "B.B.D. Bagh",
    "bagbazar": "Baghbazar",
    "baghbazar": "Baghbazar",
    # South
    "garia stn": "Garia Station",
    "garia station": "Garia Station",
    "parnashree": "Parnasree",
    "parnasree": "Parnasree",
    "hazra more": "Hazra",
    "maulali": "Moulali",
    "moulali": "Moulali",
    "ruby hospital": "Ruby",
    "ruby": "Ruby",
    # East / New Town
    "ultadanga / hudco": "Ultadanga",
    "ultadanga/hudco": "Ultadanga",
    "ultadanga": "Ultadanga",
    "new town bus stand": "New Town",
    "new town": "New Town",
    "newtown": "New Town",
    "salt lake sector v": "Salt Lake Sector V",
    "salt lake sector 5": "Salt Lake Sector V",
    "sector v": "Salt Lake Sector V",
    "karunamoyee": "Karunamoyee",
    "karunamayee": "Karunamoyee",
    "ecospace": "Eco Park",
    "eco space": "Eco Park",
    "eco park": "Eco Park",
    # Spelling and punctuation only
    "park circus 7 point": "Park Circus 7-Point",
    "park circus 7 point crossing": "Park Circus 7-Point",
    "sakher bazar": "Sakherbazar",
    "chiria more": "Chiriamore",
    "r.g.kar hospital": "R.G. Kar Hospital",
    "em bypass": "E.M. Bypass",
    "m.g. road": "MG Road",
    "bandha ghat": "Bandhaghat",
    "airport 1no": "Airport 1 No.",
    "airport 1 no. gate": "Airport 1 No.",
    "airport gate 1": "Airport Gate 1",
    "airport gate no. 1": "Airport Gate 1",
    "airport gate no. 1 / 3 stand": "Airport Gate 1",
    "airport 3no": "Airport Gate 3",
    "airport 3 gate": "Airport Gate 3",
    "airport gate 3": "Airport Gate 3",
    "airport 3 no. gate": "Airport Gate 3",
    "laketown": "Lake Town",
    "exide rabindra sadan": "Exide / Rabindra Sadan",
    "exide crossing": "Exide",
    # Well-known terminal names (the stand itself)
    "saltlake karunamoyee": "Karunamoyee",
    "karunamoyee. unnayan bhavan": "Karunamoyee",
    "newtown bus stand": "New Town",
    "newtown bus terminus": "New Town",
    "new town bus depot": "New Town",
    "sector v (saltlake)": "Salt Lake Sector V",
    "howrah station (30 min stop)": "Howrah Railway Station",
    "howrah bus stand (executive)": "Howrah Railway Station",
    "ultadanga hudco": "Ultadanga",
    "ultadanga station": "Ultadanga",
    "shyambazar 5 point": "Shyambazar",
    "hazra xing": "Hazra",
    "moulali more": "Moulali",
    "esplanade ctc bus stand": "Esplanade",
    "esplanade l20": "Esplanade",
    "esplanade l20 bus terminus": "Esplanade",
    # "Stand" names that map onto an existing stop
    "garia bus stand": "Garia 6 No.",
    "garia more": "Garia",
    "park circus station": "Park Circus",
    "bagnan station": "Bagnan",
    "barasat depot": "Barasat",
    "barrackpore station": "Barrackpore",
    "baruipur station": "Baruipur",
    "belghoria station": "Belghoria",
    "birati more": "Birati",
    "birati station": "Birati",
    "domjur bus stand": "Domjur",
    "dunlop more": "Dunlop",
    "durgapur station": "Durgapur",
    "habra station": "Habra",
    "kolkata station": "Kolkata",
    "kona expressway more": "Kona Expressway",
    "nabanna bus terminus": "Nabanna",
    "nilgunge depot": "Nilgunge",
    "patuli more": "Patuli",
    "ramnagar more": "Ramnagar",
    "rashbehari xing": "Rashbehari",
    "rathtala more": "Rathtala",
    "ruby crossing": "Ruby",
    "sarisha more": "Sarisha",
    "sarsuna bus terminus": "Sarsuna",
    "sonarpur station": "Sonarpur",
    "taratala depot": "Taratala",
    "taratala more": "Taratala",
    "taratala xing": "Taratala",
    "topsia more": "Topsia",
    "uluberia station": "Uluberia",
}


def canonical_stop(name: str) -> str:
    cleaned = clean(name)
    if not cleaned:
        raise ValueError("empty stop name")
    mapped = STOP_MAP.get(cleaned.lower())
    return mapped or cleaned


def fetch(url: str, destination: Path, marker: str) -> Path:
    """Download and extract a GitHub tarball once, so the import is reproducible offline."""
    if (destination / marker).exists():
        return destination
    import io
    import tarfile
    import urllib.request

    destination.parent.mkdir(parents=True, exist_ok=True)
    print(f"downloading {url}")
    with urllib.request.urlopen(url, timeout=120) as response:  # noqa: S310 - fixed GitHub URLs
        payload = response.read()
    with tarfile.open(fileobj=io.BytesIO(payload), mode="r:gz") as archive:
        root = archive.getmembers()[0].name.split("/")[0]
        archive.extractall(destination.parent)  # noqa: S202 - archive from a fixed GitHub URL
    extracted = destination.parent / root
    if destination.exists():
        import shutil

        shutil.rmtree(destination)
    extracted.rename(destination)
    if not (destination / marker).exists():
        raise RuntimeError(f"{destination} does not look like the expected checkout")
    return destination


def read_calcutta(path: Path) -> list[dict[str, Any]]:
    routes = list(csv.DictReader((path / "data/bus/routes.csv").open()))
    stops = {s["stop_id"]: s for s in csv.DictReader((path / "data/bus/stops.csv").open())}
    chain: dict[str, list[str]] = defaultdict(list)
    for row in csv.DictReader((path / "data/bus/route_stops.csv").open()):
        if row["direction"] != "0":
            continue
        chain[row["route_id"]].append(row)
    for rows in chain.values():
        rows.sort(key=lambda item: int(item["seq"]))

    out: list[dict[str, Any]] = []
    for route in routes:
        rows = chain.get(route["route_id"], [])
        names: list[str] = []
        for row in rows:
            stop = stops.get(row["stop_id"])
            if stop is None:
                continue
            name = canonical_stop(stop["stop_name"])
            if names and names[-1] == name:
                continue
            names.append(name)
        if len(names) < 2:
            continue
        # A route that visits the same stop twice (a loop, or an out-and-back through Eco Park)
        # cannot be represented by one linear stop list without inventing a shape, so it is left
        # out instead of being flattened into something the route does not do.
        if len(set(names)) != len(names):
            continue
        # OSM-only relations occasionally publish termini that are not the ends of the
        # stop chain; the chain is what the site searches, so keep them consistent.
        origin = canonical_stop(route["origin"])
        destination = canonical_stop(route["destination"])
        if norm(names[0]) != norm(origin) or norm(names[-1]) != norm(destination):
            continue
        out.append(
            {
                "number": clean(route["route_name"]),
                "operator": (clean(route["operator"]) or "Unknown").replace("private", "Private"),
                "mode": route["mode"],
                "origin": origin,
                "destination": destination,
                "stops": names,
                "source": route["source_id"],
                "confidence": route["confidence"],
                "notes": clean(route["notes"]),
                "kind": "route-only",
                "external_id": route["route_id"],
            }
        )
    return out


def read_busjatri(path: Path) -> list[dict[str, Any]]:
    buses = {b["bus_id"]: b for b in csv.DictReader((path / "data/buses.csv").open())}
    rows = list(csv.DictReader((path / "data/stoppages.csv").open()))
    grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        grouped[row["bus_id"]].append(row)
    for group in grouped.values():
        group.sort(key=lambda item: int(item["stop_no"] or 0))

    out: list[dict[str, Any]] = []
    for bus_id, group in grouped.items():
        bus = buses.get(bus_id)
        if bus is None or len(group) < 3:
            continue
        up = [clean(row["up_time"]) for row in group]
        down = [clean(row["down_time"]) for row in group]
        has_up = all(up)
        has_down = all(down)
        if not (has_up or has_down):
            continue
        origin = canonical_stop(bus["origin"])
        destination = canonical_stop(bus["destination"])
        if not (
            clean(bus["origin"]).lower() in KOLKATA_TERMINALS
            or clean(bus["destination"]).lower() in KOLKATA_TERMINALS
        ):
            continue
        if clean(bus["source"]).startswith("facebook"):
            # A single commuter post is not a timetable we can stand behind.
            continue
        stops = [canonical_stop(row["stop_name"]) for row in group]
        if len(set(stops)) != len(stops):
            continue
        runs = []
        if has_up:
            runs.append({"direction": "outbound", "times": up})
        if has_down:
            runs.append({"direction": "return", "times": list(reversed(down))})
        out.append(
            {
                "number": clean(bus["bus_name"]) or f"{origin} - {destination}",
                "operator": clean(bus["operator"]) or "Private operator",
                "mode": "bus",
                "origin": origin,
                "destination": destination,
                "stops": stops,
                "reg_no": clean(bus["reg_no"]),
                "fare": clean(bus["fare"]),
                "source": clean(bus["source"]),
                "detail_url": clean(bus["detail_url"]),
                "kind": "timed",
                "external_id": bus_id,
                "runs": runs,
                "notes": clean(bus["bus_type"]),
            }
        )
    return out


def dedupe(routes: list[dict[str, Any]], existing: dict[str, dict[str, Any]]) -> tuple[list[dict[str, Any]], list[str]]:
    report: list[str] = []
    kept: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str]] = set()
    by_number: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for route in routes:
        by_number[norm(route["number"])].append(route)

    existing_numbers = {norm(number): data for number, data in existing.items()}
    used_numbers: set[str] = set()
    for number, group in by_number.items():
        for route in group:
            key = (norm(route["number"]), norm(route["origin"]), norm(route["destination"]))
            if key in seen:
                report.append(f"duplicate in source: {route['number']} {route['origin']} -> {route['destination']}")
                continue
            seen.add(key)
            site = existing_numbers.get(number)
            if site is not None:
                same_origin = norm(site["origin"]) == norm(route["origin"])
                same_destination = norm(site["destination"]) == norm(route["destination"])
                reversed_pair = norm(site["origin"]) == norm(route["destination"]) and norm(site["destination"]) == norm(route["origin"])
                if (same_origin and same_destination) or reversed_pair:
                    report.append(f"already in v2, skipped: {route['number']} {route['origin']} -> {route['destination']}")
                    continue
                route["number"] = f"{route['number']} ({route['origin']} - {route['destination']})"
                route["variant_of"] = site["number"]
                report.append(f"variant added: {route['number']}")
            elif norm(route["number"]) in used_numbers:
                route["number"] = f"{route['number']} ({route['origin']} - {route['destination']})"
                report.append(f"same number, different route: {route['number']}")
            used_numbers.add(norm(route["number"]))
            kept.append(route)
    return kept, report


def read_v2_routes(path: Path, preview: Path) -> dict[str, dict[str, Any]]:
    """The v2 workbook's own route numbers and termini, independent of the built JSON.

    Reading the built JSON would make a second run treat the routes this script added on the
    first run as pre-existing and silently drop them all.
    """
    workbook = openpyxl.load_workbook(path, data_only=True)
    existing: dict[str, dict[str, Any]] = {}
    for sheet in workbook.worksheets[1:]:
        if not sheet.title.startswith("Route_"):
            continue
        route = read_route_sheet(sheet)
        stops = route.sections["outbound"].stops
        existing[route.number] = {"number": route.number, "origin": stops[0], "destination": stops[-1]}
    # The eight illustrative routes are part of the site too, so a catalogue row must not
    # reuse one of their numbers unlabelled.
    for sample in json.loads(preview.read_text(encoding="utf-8")):
        existing.setdefault(
            sample["number"],
            {
                "number": sample["number"],
                "origin": canonical_stop(sample["stops"][0]),
                "destination": canonical_stop(sample["stops"][-1]),
            },
        )
    return existing


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--calcutta", type=Path, default=DEFAULT_CALCUTTA)
    parser.add_argument("--busjatri", type=Path, default=DEFAULT_BUSJATRI)
    parser.add_argument("--v2", type=Path, default=DEFAULT_V2)
    parser.add_argument("--preview", type=Path, default=ROOT / "data/timetable_preview_routes.json")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    existing = read_v2_routes(args.v2, args.preview)
    calcutta_path = fetch(CALCUTTA_URL, args.calcutta, "data/bus/routes.csv")
    busjatri_path = fetch(BUSJATRI_URL, args.busjatri, "data/buses.csv")
    catalogue = read_calcutta(calcutta_path)
    timed = read_busjatri(busjatri_path)
    print(f"catalogue rows: {len(catalogue)}")
    print(f"timed services with a complete stop-by-stop column: {len(timed)}")

    kept, report = dedupe(catalogue + timed, existing)
    print(f"kept: {len(kept)}")
    for line in report:
        print("  ", line)

    payload = {
        "meta": {
            "sources": [
                "arkodeepg/calcutta-transport data/bus (WBTC list, Bus-O-Pedia, OSM)",
                "murmusuvash2-wq/busjatri-open-data data/stoppages.csv",
            ],
            "counts": {
                "total": len(kept),
                "routeOnly": sum(1 for route in kept if route["kind"] == "route-only"),
                "timed": sum(1 for route in kept if route["kind"] == "timed"),
            },
        },
        "routes": kept,
        "report": report,
    }
    args.output.write_text(json.dumps(payload, indent=1, ensure_ascii=False) + "\n")
    print(f"wrote {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
