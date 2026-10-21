/*
 * Tests for the stop index: nearest stop, buses at a stop, and stop search.
 * Run with: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { busesAt, compareRouteNumbers, createStopIndex, nearestStops, normaliseName, searchStops, STOP_INDEX } from "@/lib/stopIndex";
import dataset from "@/data/kolkata-bus-data.json";

const stops = [
  { name: "Alpha", lat: 22.5, lng: 88.3 },
  { name: "Beta", lat: 22.501, lng: 88.3 },
  { name: "Gamma Bridge", lat: 22.52, lng: 88.3 },
  { name: "Nowhere" },
];
const routes = [
  { number: "10", type: "Non-AC", operator: "A", origin: "Alpha", destination: "Gamma Bridge", stops: ["Alpha", "Beta", "Gamma Bridge"], runs: [{}] },
  { number: "2", type: "AC", operator: "B", origin: "Alpha", destination: "Nowhere", stops: ["Alpha", "Nowhere", "Alpha"], runs: [] },
  { number: "10A", type: "Non-AC", operator: "A", origin: "Beta", destination: "Gamma Bridge", stops: ["Beta", "Gamma Bridge"], runs: [{}] },
];

describe("stop index", () => {
  const index = createStopIndex(stops, routes);

  it("lists the buses at a stop, timetabled first, then by route number", () => {
    assert.deepEqual(busesAt(index, "Alpha").map((bus) => bus.number), ["10", "2"]);
    assert.deepEqual(busesAt(index, "Gamma Bridge").map((bus) => bus.number), ["10", "10A"]);
  });

  it("counts a bus once at a stop even when the route calls there twice", () => {
    assert.equal(busesAt(index, "Alpha").filter((bus) => bus.number === "2").length, 1);
  });

  it("knows a stop only a route names, and gives it no position", () => {
    const orphan = createStopIndex([], [{ number: "9", origin: "X", destination: "Y", stops: ["X", "Y"] }]);
    assert.equal(orphan.byName.get("X")?.position, null);
    assert.equal(orphan.located.length, 0);
  });

  it("returns nothing for a stop nobody calls at", () => {
    assert.deepEqual(busesAt(index, "Not a stop"), []);
  });

  it("sorts route numbers the way people read them", () => {
    assert.ok(compareRouteNumbers("2", "10") < 0);
    assert.ok(compareRouteNumbers("10", "10A") < 0);
  });
});

describe("nearest stops", () => {
  const index = createStopIndex(stops, routes);
  const here = { lat: 22.5003, lng: 88.3 };

  it("orders by distance and reports metres", () => {
    const near = nearestStops(index, here, { limit: 3 });
    assert.deepEqual(near.map((item) => item.stop.name), ["Alpha", "Beta", "Gamma Bridge"]);
    assert.ok(near[0].metres < 40 && near[0].metres < near[1].metres);
  });

  it("never offers a stop with no position", () => {
    assert.ok(nearestStops(index, here, { limit: 10 }).every((item) => item.stop.name !== "Nowhere"));
  });

  it("returns nothing when no stop is within the limit", () => {
    assert.deepEqual(nearestStops(index, { lat: 23.5, lng: 87.0 }, { maxMetres: 3000 }), []);
  });

  it("respects the limit", () => {
    assert.equal(nearestStops(index, here, { limit: 1 }).length, 1);
  });
});

describe("stop search", () => {
  const index = createStopIndex(stops, routes);

  it("ranks an exact name, then a prefix, then a word, then a substring", () => {
    const named = createStopIndex(
      [{ name: "Park" }, { name: "Park Street" }, { name: "Little Park" }, { name: "Sparkle" }],
      [],
    );
    assert.deepEqual(searchStops(named, "park").map((hit) => hit.stop.name), ["Park", "Park Street", "Little Park", "Sparkle"]);
  });

  it("ignores case, punctuation and accents", () => {
    assert.equal(normaliseName("  Gárden-Reach (No. 2) "), "garden reach no 2");
    assert.equal(searchStops(index, "GAMMA").length, 1);
  });

  it("returns nothing for an empty query", () => {
    assert.deepEqual(searchStops(index, "   "), []);
  });

  it("prefers a stop that is on the map and has more buses", () => {
    const tie = createStopIndex(
      [{ name: "Bazar One" }, { name: "Bazar Two", lat: 22.5, lng: 88.3 }],
      [],
    );
    assert.equal(searchStops(tie, "bazar")[0].stop.name, "Bazar Two");
  });
});

describe("the bundled dataset", () => {
  it("indexes every stop and every route call", () => {
    const rawStops = (dataset as { stops: unknown[] }).stops.length;
    assert.ok(STOP_INDEX.stops.length >= rawStops);
    const calls = (dataset as { routes: { stops: string[] }[] }).routes.reduce((n, r) => n + new Set(r.stops).size, 0);
    assert.equal(STOP_INDEX.stops.reduce((n, s) => n + s.buses.length, 0), calls);
  });

  it("only places stops the dataset located", () => {
    const located = (dataset as { stops: { lat?: number }[] }).stops.filter((s) => typeof s.lat === "number").length;
    assert.equal(STOP_INDEX.located.length, located);
  });
});
