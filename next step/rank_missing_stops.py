#!/usr/bin/env python3
"""Rank the stops that still need a coordinate, most useful first.

The ride map is only as good as its stop coordinates, and 1,000+ stops are still unlocated.
You cannot fix them all at once, so this answers "which ones first?":

* ``routes_using``      how many routes call at the stop.
* ``routes_unlocked``   routes that become fully mapped if only this stop is added. These are
                        the cheapest wins: one lookup completes a whole route.
* ``timed_routes``      routes with a published timetable among those using the stop.
* ``context``           the nearest located stops before and after it on its busiest route.
                        Look the stop up on a map between those two and the right crossing is
                        usually obvious, even when the name is ambiguous.
* ``status``            ``missing`` (no coordinate) or ``review`` (a candidate exists but a
                        human has not checked it).

Reads fontend/src/data/kolkata-bus-data.json, writes data/MISSING_COORDINATES.csv, and prints
the top of the list. Standard library only, no network.

  python scripts/rank_missing_stops.py            # write the CSV, print the top 30
  python scripts/rank_missing_stops.py --top 100

This script only ranks. It never writes coordinates: look each stop up on a map using the
``context`` column, then add the position through the existing pipeline (scripts/geocode_stops.py).
"""
from __future__ import annotations

import argparse
import csv
import json
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATASET = ROOT / "fontend" / "src" / "data" / "kolkata-bus-data.json"
OUTPUT = ROOT / "data" / "MISSING_COORDINATES.csv"

FIELDS = [
    "rank", "stop", "status", "routes_using", "routes_unlocked", "timed_routes",
    "context", "example_routes", "lat", "lng",
]


def load() -> dict:
    return json.loads(DATASET.read_text(encoding="utf-8"))


def rank(data: dict) -> list[dict]:
    stops = {s["name"]: s for s in data["stops"]}
    located = {n for n, s in stops.items() if "lat" in s}
    review = {n for n, s in stops.items() if s.get("coordConfidence") == "review"}

    routes_using: dict[str, list[dict]] = defaultdict(list)
    unlocked: Counter = Counter()
    for route in data["routes"]:
        names = route["stops"]
        gaps = [n for n in dict.fromkeys(names) if n not in located or n in review]
        for name in set(names):
            routes_using[name].append(route)
        # a route that is exactly one stop short of being fully mapped
        if len(gaps) == 1:
            unlocked[gaps[0]] += 1

    rows = []
    for name, used in routes_using.items():
        if name in located and name not in review:
            continue
        busiest = max(used, key=lambda r: len(r["stops"]))
        seq = busiest["stops"]
        at = seq.index(name)
        before = next((s for s in reversed(seq[:at]) if s in located), None)
        after = next((s for s in seq[at + 1:] if s in located), None)
        context = " -> ".join(part for part in (before, f"[{name}]", after) if part)
        timed = sum(1 for r in used if r.get("runs"))
        rows.append({
            "stop": name,
            "status": "review" if name in review else "missing",
            "routes_using": len(used),
            "routes_unlocked": unlocked[name],
            "timed_routes": timed,
            "context": context,
            "example_routes": "; ".join(r["number"] for r in used[:4]),
            "lat": "",
            "lng": "",
        })
    # Cheap wins first, then busy stops, then timed routes (the ones people will actually ride).
    rows.sort(key=lambda r: (-(r["routes_unlocked"] * 5 + r["routes_using"] + r["timed_routes"] * 2), r["stop"]))
    for i, row in enumerate(rows, 1):
        row["rank"] = i
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--top", type=int, default=30, help="how many to print (default 30)")
    args = parser.parse_args()

    data = load()
    rows = rank(data)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)

    missing = sum(1 for r in rows if r["status"] == "missing")
    print(f"{len(rows)} stops need attention ({missing} missing, {len(rows) - missing} to review)")
    print(f"wrote {OUTPUT.relative_to(ROOT)}\n")
    print(f"{'#':>3}  {'routes':>6} {'unlock':>6}  stop")
    for row in rows[: args.top]:
        print(f"{row['rank']:>3}  {row['routes_using']:>6} {row['routes_unlocked']:>6}  {row['stop']}   ({row['status']})")
        print(f"{'':>20}{row['context']}")


if __name__ == "__main__":
    main()
