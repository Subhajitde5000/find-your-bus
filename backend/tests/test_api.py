def test_health(client):
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "database": "ok"}


def test_lookup_lists(client):
    ops = client.get("/api/v1/operators").json()
    cats = client.get("/api/v1/service-categories").json()
    assert len(ops) == 8
    assert len(cats) == 10


def test_stands_list_and_filter(client):
    body = client.get("/api/v1/stands", params={"limit": 200}).json()
    assert body["total"] == 80
    assert len(body["items"]) == 80
    terminals = client.get(
        "/api/v1/stands", params={"category": "Major Passenger Terminal", "limit": 200}
    ).json()
    assert terminals["total"] == 27
    depots = client.get("/api/v1/stands", params={"category": "Operational Maintenance Depot"}).json()
    nodes = client.get("/api/v1/stands", params={"category": "Route Stand & Transit Node"}).json()
    assert depots["total"] == 28
    assert nodes["total"] == 25
    search = client.get("/api/v1/stands", params={"q": "Howrah"}).json()
    assert search["total"] >= 3


def test_stand_detail_includes_linked_stops(client):
    stands = client.get("/api/v1/stands", params={"q": "Howrah Station Central"}).json()["items"]
    stand_id = stands[0]["id"]
    detail = client.get(f"/api/v1/stands/{stand_id}").json()
    assert detail["name"] == "Howrah Station Central Stand"
    assert detail["local_name"] == "Howrah Bus Stand"
    names = {s["name"] for s in detail["stops"]}
    assert {"Howrah Railway Station", "Howrah Bus Terminus"} <= names


def test_stand_not_found(client):
    assert client.get("/api/v1/stands/999999").status_code == 404


def test_stand_limit_validation(client):
    assert client.get("/api/v1/stands", params={"limit": 500}).status_code == 422


def test_routes_list(client):
    body = client.get("/api/v1/routes", params={"limit": 200}).json()
    assert body["total"] == 87
    numbers = {r["route_number"] for r in body["items"]}
    assert {"S12", "AC1", "235", "LD_Digha", "MB_Howrah_Garia"} <= numbers


def test_route_detail_stops_in_order(client):
    r = client.get("/api/v1/routes/S12")
    assert r.status_code == 200
    body = r.json()
    assert body["operator"]["name"] == "WBTC Govt (CSTC)"
    assert body["service_category"]["name"] == "Non-AC Trunk"
    assert body["origin"]["name"] == "Howrah Bus Terminus"
    assert body["destination"]["name"] == "New Town Action Area III"
    assert body["documented_fleet_count"] == 14
    assert body["trip_count"] == 16
    assert [s["sequence"] for s in body["stops"]] == [1, 2, 3, 4, 5, 6]
    assert [s["stop"]["name"] for s in body["stops"]][:3] == [
        "Howrah Bus Terminus", "Sealdah", "Ultadanga",
    ]


def test_route_lookup_is_case_insensitive(client):
    assert client.get("/api/v1/routes/s12").status_code == 200


def test_minibus_route_from_sheet_title(client):
    # Sheet is named Route_MB_HG but the route is MB_Howrah_Garia.
    r = client.get("/api/v1/routes/MB_Howrah_Garia")
    assert r.status_code == 200
    assert r.json()["service_category"]["name"] == "Private Minibus Syndicate"
    assert r.json()["trip_count"] == 12


def test_route_trips_with_buses(client):
    trips = client.get("/api/v1/routes/S12/trips").json()
    assert len(trips) == 16
    first = trips[0]
    assert first["run_code"] == "RUN-S12-01"
    assert first["bus"]["registration_no"] == "WB 05 6214"
    directions = {s["direction"]: s for s in first["schedules"]}
    assert directions["outbound"]["departure_time"] == "05:00:00"
    assert directions["return"]["arrival_time"] == "07:45:00"


def test_floating_bus_trip_has_no_bus(client):
    trips = client.get("/api/v1/routes/AC1/trips").json()
    floating = [t for t in trips if t["run_code"] == "RUN-AC1-06"][0]
    assert floating["bus"] is None


def test_route_not_found(client):
    assert client.get("/api/v1/routes/NOPE").status_code == 404


def test_bus_lookup_accepts_spaced_or_compact_registration(client):
    spaced = client.get("/api/v1/buses/WB 05 6214")
    compact = client.get("/api/v1/buses/WB056214")
    assert spaced.status_code == compact.status_code == 200
    body = compact.json()
    assert body["registration_no"] == "WB 05 6214"
    assert body["trip_count"] == 2
    assert {t["route_number"] for t in body["trips"]} == {"S12"}


def test_bus_search(client):
    body = client.get("/api/v1/buses", params={"q": "6214"}).json()
    assert body["total"] == 1
    assert body["items"][0]["registration_no"] == "WB 05 6214"


def test_bus_not_found(client):
    assert client.get("/api/v1/buses/XX000000").status_code == 404


def _stop_id(client, name):
    items = client.get("/api/v1/stops", params={"q": name, "limit": 200}).json()["items"]
    return next(i["id"] for i in items if i["name"] == name)


def test_journey_outbound_terminal_to_terminal(client):
    frm = _stop_id(client, "Howrah Bus Terminus")
    to = _stop_id(client, "New Town Action Area III")
    body = client.get("/api/v1/journeys/search", params={"from_stop_id": frm, "to_stop_id": to}).json()
    s12 = [o for o in body["options"] if o["route_number"] == "S12"][0]
    assert s12["direction"] == "outbound"
    assert s12["schedule_available"] is True
    assert s12["stops_between"] == 4
    assert len(s12["departures"]) == 16
    times = [d["departure_time"] for d in s12["departures"]]
    assert times == sorted(times)
    assert s12["departures"][0]["bus"]["registration_no"] == "WB 05 6214"


def test_journey_return_direction(client):
    frm = _stop_id(client, "New Town Action Area III")
    to = _stop_id(client, "Howrah Bus Terminus")
    body = client.get("/api/v1/journeys/search", params={"from_stop_id": frm, "to_stop_id": to}).json()
    s12 = [o for o in body["options"] if o["route_number"] == "S12"][0]
    assert s12["direction"] == "return"
    assert s12["schedule_available"] is True
    assert s12["departures"][0]["departure_time"] == "06:30:00"


def test_journey_with_after_filter(client):
    frm = _stop_id(client, "Howrah Bus Terminus")
    to = _stop_id(client, "New Town Action Area III")
    body = client.get(
        "/api/v1/journeys/search",
        params={"from_stop_id": frm, "to_stop_id": to, "after": "12:00"},
    ).json()
    s12 = [o for o in body["options"] if o["route_number"] == "S12"][0]
    assert all(d["departure_time"] >= "12:00:00" for d in s12["departures"])
    assert len(s12["departures"]) > 0


def test_journey_intermediate_stop_has_no_timetable(client):
    frm = _stop_id(client, "Howrah Bus Terminus")
    to = _stop_id(client, "Sealdah")
    body = client.get("/api/v1/journeys/search", params={"from_stop_id": frm, "to_stop_id": to}).json()
    s12 = [o for o in body["options"] if o["route_number"] == "S12"][0]
    assert s12["schedule_available"] is False
    assert s12["departures"] == []


def test_journey_validation(client):
    same = client.get("/api/v1/journeys/search", params={"from_stop_id": 1, "to_stop_id": 1})
    assert same.status_code == 422
    missing = client.get("/api/v1/journeys/search", params={"from_stop_id": 999999, "to_stop_id": 1})
    assert missing.status_code == 404


def test_stops_linked_filter(client):
    linked = client.get("/api/v1/stops", params={"linked": True, "limit": 200}).json()
    unlinked = client.get("/api/v1/stops", params={"linked": False, "limit": 200}).json()
    assert linked["total"] + unlinked["total"] == client.get("/api/v1/stops", params={"limit": 1}).json()["total"]
    assert all(i["bus_stand_id"] is not None for i in linked["items"])
