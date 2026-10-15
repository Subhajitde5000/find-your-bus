from datetime import time

from pathlib import Path

import openpyxl

from app.importer import (
    clean_stop_name,
    is_verified,
    normalise_registration,
    parse_clock,
    parse_fleet_count,
    read_master_index,
    read_route_sheet,
    read_stands,
    split_via,
)
from app.stand_aliases import STAND_ALIASES

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"


def test_clean_stop_name_removes_via_note():
    assert clean_stop_name("Howrah Railway Station (via E.M. Bypass)") == "Howrah Railway Station"
    assert clean_stop_name("Karunamoyee (Salt Lake)") == "Karunamoyee (Salt Lake)"


def test_normalise_registration():
    assert normalise_registration("WB 05 6214") == "WB056214"
    assert normalise_registration("wb-05-6214") == "WB056214"


def test_parse_clock_12_hour():
    assert parse_clock("05:00 AM") == time(5, 0)
    assert parse_clock("12:45 PM") == time(12, 45)
    assert parse_clock("12:00 AM") == time(0, 0)


def test_parse_fleet_count():
    assert parse_fleet_count("14 Active WBTC Buses") == 14
    assert parse_fleet_count("4 Night Buses") == 4
    assert parse_fleet_count("Private Stage Carriage") is None
    assert parse_fleet_count(None) is None


def test_split_via():
    assert split_via("Sealdah, Ultadanga, Karunamoyee") == ["Sealdah", "Ultadanga", "Karunamoyee"]
    assert split_via(None) == []


def test_alias_keys_are_lowercase():
    assert all(k == k.lower() for k in STAND_ALIASES)


def test_is_verified_reads_the_yes_no_column():
    assert is_verified("yes") is True
    assert is_verified(" Yes ") is True
    assert is_verified("no") is False
    assert is_verified("") is False
    assert is_verified(None) is False


def test_master_index_publishes_only_what_the_workbook_marks_verified():
    """The Verified column decides what the site may show. A route that is marked no must never
    end up with a timetable, and a route marked yes must always have one."""
    wb = openpyxl.load_workbook(
        DATA_DIR / "Kolkata_Comprehensive_Bus_Routes_and_Fleet_Directory.xlsx", data_only=True
    )
    index = read_master_index(wb)
    runs = {read_route_sheet(ws)["route_number"]: bool(read_route_sheet(ws)["trips"])
            for ws in wb.worksheets[1:]}

    verified = {number for number, entry in index.items() if entry["verified"]}
    assert verified, "no route is marked verified; the site would publish nothing"
    assert len(verified) < len(index), "every route is marked verified; that cannot be right yet"
    for number, entry in index.items():
        if entry["verified"]:
            assert runs[number], f"route {number} is verified but has no runs to publish"
            assert entry["timetable_source"], f"route {number} is verified with no source recorded"
        else:
            assert "no" in entry["timetable_source"].lower(), (
                f"route {number} is not verified; its source cell should say so"
            )


def test_stands_carry_a_verification_flag():
    rows = read_stands(DATA_DIR / "Kolkata_Bus_Stands_v2.xlsx")
    assert len(rows) > 150
    for row in rows:
        if row["verified"]:
            assert row["address"], f"stand {row['name']} is verified without an address"
        else:
            assert row["verification_note"], f"stand {row['name']} is unverified with no reason"
