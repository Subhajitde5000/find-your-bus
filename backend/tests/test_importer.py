from datetime import time

from app.importer import (
    clean_stop_name,
    normalise_registration,
    parse_clock,
    parse_fleet_count,
    split_via,
)
from app.stand_aliases import STAND_ALIASES


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
