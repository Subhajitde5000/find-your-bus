"""The static website dataset must never contain duplicate data.

These tests rebuild the dataset from the real Excel workbooks (the same code path as
``python manage.py export-static-data``) and assert the production invariants the
frontend relies on: unique route numbers, unique stops/stands/buses, and full
referential integrity between routes, stops, stands and buses.
"""

import re

import pytest

from app.static_export import build_dataset


def _key(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


@pytest.fixture(scope="module")
def dataset():
    data, _report = build_dataset()
    return data


def test_no_duplicate_route_numbers(dataset):
    numbers = [r["number"] for r in dataset["routes"]]
    assert len(numbers) == len({n.lower() for n in numbers})


def test_no_duplicate_stops_or_stands(dataset):
    stop_keys = [_key(s["name"]) for s in dataset["stops"]]
    assert len(stop_keys) == len(set(stop_keys))
    stand_names = [s["name"].lower() for s in dataset["stands"]]
    assert len(stand_names) == len(set(stand_names))


def test_no_duplicate_buses_or_run_codes(dataset):
    buses = [re.sub(r"[^A-Z0-9]", "", b.upper()) for b in dataset["buses"]]
    assert len(buses) == len(set(buses))
    runs = [t["run"] for r in dataset["routes"] for t in r["trips"]]
    assert len(runs) == len(set(runs))


def test_referential_integrity(dataset):
    stop_names = {s["name"] for s in dataset["stops"]}
    stand_names = {s["name"] for s in dataset["stands"]}
    for route in dataset["routes"]:
        assert len(route["stops"]) >= 2
        assert route["origin"] == route["stops"][0]
        assert route["destination"] == route["stops"][-1]
        assert route["origin"] != route["destination"]
        assert len(route["stops"]) == len(set(route["stops"]))
        assert set(route["stops"]) <= stop_names
        for trip in route["trips"]:
            assert trip["bus"] is None or 0 <= trip["bus"] < len(dataset["buses"])
    for stop in dataset["stops"]:
        assert stop["stand"] is None or stop["stand"] in stand_names


def test_counts_are_consistent(dataset):
    counts = dataset["meta"]["counts"]
    assert counts["stands"] == len(dataset["stands"])
    assert counts["stops"] == len(dataset["stops"])
    assert counts["buses"] == len(dataset["buses"])
    assert counts["routes"] == len(dataset["routes"])
    assert counts["routes"] == counts["directoryRoutes"] + counts["sampleRoutes"]
    assert counts["trips"] == sum(len(r["trips"]) for r in dataset["routes"])
    assert counts["routeStops"] == sum(len(r["stops"]) for r in dataset["routes"])


def test_stand_alias_keys_are_lowercase(dataset):
    """linked_stand() lower-cases stop names before lookup, so a mis-cased alias
    key would silently never match (regression: "Kona" vs "Kona")."""
    from app.stand_aliases import STAND_ALIASES

    stand_names = {s["name"] for s in dataset["stands"]}
    for key, target in STAND_ALIASES.items():
        assert key == key.lower(), f"stand alias key {key!r} is not lower-case"
        assert target in stand_names, f"stand alias {key!r} points to unknown stand {target!r}"


def test_sample_kept_only_when_directory_has_no_runs(dataset):
    """A preview sample may represent a route number only if the directory sheet for
    that number has no runs; otherwise the directory entry is the single record."""
    kept = dataset["meta"]["dedupe"]["samplesKeptOverBlankDirectoryRoutes"]
    by_number = {r["number"].lower(): r for r in dataset["routes"]}
    for number in kept:
        route = by_number[number.lower()]
        assert route["source"] == "preview"
        assert route["trips"] == []
        assert route["frequency"] is not None
    skipped = dataset["meta"]["dedupe"]["skippedSampleRoutes"]
    for number in skipped:
        route = by_number[number.lower()]
        assert route["source"] == "directory"
        assert route["trips"], f"directory route {number} kept over a sample has no runs"
