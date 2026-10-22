/*
 * Tests for the landmark layer: reading is strict, and the bundled file is sound.
 * Run with: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  boundsOf,
  isMajorWater,
  isWater,
  KIND_LABEL,
  LANDMARK_POINTS,
  LANDMARK_SHAPES,
  oneLabelPerName,
  pointsIn,
  readLandmarks,
  shapeAnchor,
  shapeAreaSqMetres,
  shapeLength,
  shapesIn,
} from "@/lib/landmarks";
import { inCityWindow } from "@/lib/networkMap";
import { stopPosition } from "@/lib/coords";

describe("reading landmarks", () => {
  it("keeps good features and drops bad ones", () => {
    const { points, shapes } = readLandmarks({
      points: [
        { id: "a", name: "Howrah Bridge", kind: "bridge", lat: 22.585, lng: 88.347, source: "stop" },
        { id: "b", name: "No kind", kind: "spaceport", lat: 22.5, lng: 88.3 },
        { id: "c", name: "Bad coordinate", kind: "bridge", lat: 99, lng: 88.3 },
        { id: "d", name: "Outside the service area", kind: "bridge", lat: 10, lng: 10 },
        { id: "a", name: "Duplicate id", kind: "bridge", lat: 22.5, lng: 88.3 },
        { id: "e", name: "", kind: "bridge", lat: 22.5, lng: 88.3 },
        { name: "No id", kind: "bridge", lat: 22.5, lng: 88.3 },
      ],
      shapes: [
        { id: "r", name: "River", kind: "river", closed: false, points: [[22.5, 88.3], [22.6, 88.31]], source: "osm" },
        { id: "s", name: "One point", kind: "river", points: [[22.5, 88.3]] },
        { id: "t", name: "Bad vertex", kind: "river", points: [[22.5, 88.3], [200, 88.3]] },
        { id: "u", name: "Not a pair", kind: "river", points: [[22.5, 88.3], "x"] },
        { id: "v", name: "Short outline", kind: "landmark", closed: true, points: [[22.5, 88.3], [22.6, 88.3], [22.6, 88.4]] },
      ],
    });
    assert.deepEqual(points.map((p) => p.id), ["a"]);
    assert.deepEqual(shapes.map((s) => s.id), ["r", "v"]);
    // three points cannot be a closed outline, so it is drawn as a line
    assert.equal(shapes.find((s) => s.id === "v")?.closed, false);
  });

  it("copes with missing or malformed input", () => {
    assert.deepEqual(readLandmarks(null), { points: [], shapes: [] });
    assert.deepEqual(readLandmarks({ points: "x", shapes: 3 }), { points: [], shapes: [] });
  });

  it("finds features in a box, including a long river that only crosses it", () => {
    const { points, shapes } = readLandmarks({
      points: [
        { id: "in", name: "In", kind: "bridge", lat: 22.5, lng: 88.3 },
        { id: "out", name: "Out", kind: "bridge", lat: 22.9, lng: 88.3 },
      ],
      shapes: [{ id: "river", name: "River", kind: "river", points: [[22.3, 88.3], [22.8, 88.3]] }],
    });
    const box = { minLat: 22.45, maxLat: 22.55, minLng: 88.25, maxLng: 88.35 };
    assert.deepEqual(pointsIn(points, box).map((p) => p.id), ["in"]);
    assert.deepEqual(shapesIn(shapes, box).map((s) => s.id), ["river"]);
  });

  it("computes bounds", () => {
    assert.equal(boundsOf([]), null);
    assert.deepEqual(boundsOf([{ lat: 1, lng: 2 }, { lat: 3, lng: 0 }]), { minLat: 1, maxLat: 3, minLng: 0, maxLng: 2 });
  });
});

describe("naming a shape on the map", () => {
  const river = {
    id: "r",
    name: "Hooghly",
    kind: "river" as const,
    closed: false,
    source: "osm" as const,
    points: [
      { lat: 22.5, lng: 88.3 },
      { lat: 22.6, lng: 88.3 },
    ],
  };

  it("puts a river's name halfway along it", () => {
    assert.deepEqual(shapeAnchor(river), { lat: 22.55, lng: 88.3 });
    const longer = { ...river, points: [{ lat: 22.5, lng: 88.3 }, { lat: 22.6, lng: 88.3 }, { lat: 22.7, lng: 88.3 }] };
    assert.ok(Math.abs(shapeAnchor(longer).lat - 22.6) < 1e-9, "the middle of three equal legs is the middle vertex");
  });

  it("puts a lake's name at its centre", () => {
    const lake = { ...river, kind: "water" as const, closed: true, points: [{ lat: 22.5, lng: 88.3 }, { lat: 22.6, lng: 88.3 }, { lat: 22.6, lng: 88.4 }, { lat: 22.5, lng: 88.4 }] };
    const anchor = shapeAnchor(lake);
    assert.ok(Math.abs(anchor.lat - 22.55) < 1e-9 && Math.abs(anchor.lng - 88.35) < 1e-9);
  });

  it("names a river traced in segments only once, at its longest stretch", () => {
    const segments = [
      { ...river, id: "a", points: [{ lat: 22.5, lng: 88.3 }, { lat: 22.52, lng: 88.3 }] },
      { ...river, id: "b", points: [{ lat: 22.6, lng: 88.3 }, { lat: 22.8, lng: 88.3 }] },
      { ...river, id: "c", name: "Adi Ganga", points: [{ lat: 22.4, lng: 88.3 }, { lat: 22.45, lng: 88.3 }] },
    ];
    const named = oneLabelPerName(segments.map((segment) => ({ ...segment, weight: shapeLength(segment) }))).map((s) => s.id).sort();
    assert.deepEqual(named, ["b", "c"]);
    assert.ok(shapeLength(segments[1]) > shapeLength(segments[0]));
    // what is on screen decides: with only the short stretch in view, it gets the name
    assert.deepEqual(oneLabelPerName([{ ...segments[0], weight: shapeLength(segments[0]) }]).map((s) => s.id), ["a"]);
  });

  it("measures a lake, and names only the lakes that are landmarks", () => {
    // roughly 1 km x 1 km: 100 ha
    const big = {
      ...river,
      kind: "water" as const,
      closed: true,
      points: [
        { lat: 22.5, lng: 88.3 },
        { lat: 22.509, lng: 88.3 },
        { lat: 22.509, lng: 88.3105 },
        { lat: 22.5, lng: 88.3105 },
      ],
    };
    const pond = { ...big, points: big.points.map((p) => ({ lat: 22.5 + (p.lat - 22.5) / 100, lng: 88.3 + (p.lng - 88.3) / 100 })) };
    assert.ok(shapeAreaSqMetres(big) > 900_000 && shapeAreaSqMetres(big) < 1_100_000, "a 1 km square is about a square kilometre");
    assert.equal(isMajorWater(big), true);
    assert.equal(isMajorWater(pond), false, "a small tank is drawn but not named at the city view");
    assert.equal(isMajorWater({ ...river, kind: "canal" as const }), true, "a canal always carries its name");
    assert.equal(isMajorWater({ ...river, kind: "station" as const }), false);
  });

  it("knows which kinds are water", () => {
    assert.equal(isWater("river"), true);
    assert.equal(isWater("canal"), true);
    assert.equal(isWater("water"), true);
    assert.equal(isWater("station"), false);
    assert.equal(isWater("metro"), false);
  });
});

describe("the bundled landmarks", () => {
  it("has a label for every kind it uses", () => {
    for (const item of [...LANDMARK_POINTS, ...LANDMARK_SHAPES]) assert.ok(KIND_LABEL[item.kind], item.id);
  });

  it("places every stop-derived landmark exactly where its stop is, and never invents one", () => {
    const fromStops = LANDMARK_POINTS.filter((p) => p.source === "stop");
    assert.ok(fromStops.length > 0);
    for (const p of fromStops) {
      const stop = stopPosition(p.name);
      assert.ok(stop, `${p.name} must be a located stop`);
      assert.ok(Math.abs(stop.lat - p.lat) < 1e-4 && Math.abs(stop.lng - p.lng) < 1e-4, `${p.name} moved`);
    }
  });

  it("marks any OpenStreetMap shape as such", () => {
    for (const shape of LANDMARK_SHAPES) assert.equal(shape.source, "osm");
  });

  it("draws the city's water: the Hooghly, the canals and the named lakes", () => {
    const rivers = LANDMARK_SHAPES.filter((s) => s.kind === "river");
    const canals = LANDMARK_SHAPES.filter((s) => s.kind === "canal");
    const lakes = LANDMARK_SHAPES.filter((s) => s.kind === "water");
    assert.ok(rivers.some((s) => s.name === "Hooghly"), "the Hooghly is on the map");
    assert.ok(canals.some((s) => /circular canal/i.test(s.name)), "the Circular Canal is on the map");
    assert.ok(lakes.some((s) => /rabindra sarobar/i.test(s.name)), "Rabindra Sarobar is on the map");
    assert.ok(lakes.length >= 40, `lakes are drawn, not one token pond (${lakes.length})`);
    for (const lake of lakes) assert.equal(lake.closed, true, `${lake.name} is an outline`);
    for (const river of rivers) assert.equal(river.closed, false, `${river.name} is a line`);
  });

  it("keeps every shape inside the window the map draws, and long enough to see", () => {
    for (const shape of LANDMARK_SHAPES) {
      assert.ok(shape.points.length >= (shape.closed ? 4 : 2), `${shape.name} has too few points`);
      const anchor = shapeAnchor(shape);
      assert.ok(inCityWindow(anchor), `${shape.name} is centred outside the map window`);
      for (const point of shape.points) assert.ok(inCityWindow(point), `${shape.name} runs outside the map window`);
    }
  });

  it("labels a river once, however many segments it was traced in", () => {
    const named = oneLabelPerName(LANDMARK_SHAPES.map((shape) => ({ ...shape, weight: shapeLength(shape) })));
    const names = named.map((s) => s.name.toLowerCase());
    assert.equal(new Set(names).size, names.length);
    assert.equal(names.filter((n) => n === "hooghly").length, 1);
    assert.ok(LANDMARK_SHAPES.filter((s) => s.name === "Hooghly").length > 1, "the Hooghly really is several segments");
  });

  it("draws station buildings and metro stations from OpenStreetMap", () => {
    const buildings = LANDMARK_SHAPES.filter((s) => s.kind === "station" || s.kind === "metro");
    assert.ok(buildings.length >= 10, `station buildings are drawn (${buildings.length})`);
    for (const building of buildings) assert.equal(building.closed, true);
    assert.ok(LANDMARK_POINTS.some((p) => p.kind === "metro" && p.source === "osm"), "metro stations are places on the map");
  });
});
