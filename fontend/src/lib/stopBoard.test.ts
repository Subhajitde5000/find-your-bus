/*
 * Tests for the stop board behind the shelter sticker.
 * Run with: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SERVICE_DAY_START_MINUTES,
  boardPosition,
  buildStopBoard,
  duePhrase,
  firstPerRoute,
  groupPassages,
  restOfDay,
  timedRouteCount,
  upcomingPassages,
  wholeDay,
} from "@/lib/stopBoard";
import { stopPosition } from "@/lib/coords";
import { getStopPassages } from "@/lib/timetables";

describe("service day", () => {
  it("starts before the first bus, not at midnight", () => {
    assert.equal(boardPosition(SERVICE_DAY_START_MINUTES), 0);
    assert.equal(boardPosition(0), 1230, "midnight sits late in the service day");
    assert.equal(boardPosition(24 * 60 + 60), boardPosition(60));
  });

  it("orders an after-midnight run after the late-evening ones", () => {
    assert.ok(boardPosition(24 * 60 + 20) > boardPosition(23 * 50));
  });
});

describe("stop board", () => {
  // A stop the directory places and serves, chosen from the data rather than hard-coded.
  const stop = "Esplanade";
  const board = buildStopBoard(stop, 9 * 60);

  it("knows its stop, its position and its routes", () => {
    assert.equal(board.known, true);
    assert.ok(board.routes.length > 0);
    assert.ok(board.timed.length > 0);
    assert.ok(board.position !== null);
    assert.equal(board.stop, stop);
  });

  it("lists every passage in service-day order", () => {
    const positions = board.timed.map((row) => boardPosition(row.passage.minutes));
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  });

  it("shows what is due in the next two hours, soonest first", () => {
    const next = upcomingPassages(board, 120);
    assert.ok(next.length > 0);
    assert.ok(next.every((row) => row.aheadMinutes <= 120));
    const ahead = next.map((row) => row.aheadMinutes);
    assert.deepEqual(ahead, [...ahead].sort((a, b) => a - b));
  });

  it("counts the afternoon differently from the morning", () => {
    const evening = buildStopBoard(stop, 20 * 60);
    assert.notEqual(
      upcomingPassages(evening, 120).map((row) => row.passage.minutes).join(","),
      upcomingPassages(board, 120).map((row) => row.passage.minutes).join(","),
    );
  });

  it("includes the rest of the service day, and never a run that has gone", () => {
    const late = buildStopBoard(stop, 23 * 60 + 30);
    const rest = restOfDay(late);
    assert.equal(rest.filter((row) => row.passed).length, 0);
    assert.ok(rest.every((row) => row.aheadMinutes <= 1440));
    assert.deepEqual(rest, upcomingPassages(late, 1440));
  });

  it("still lists the last run of the night ten minutes before it comes", () => {
    // The last passage at the stop, whatever its clock time, must be reachable from a
    // board ten minutes earlier -- including after midnight, where the clock wraps.
    const last = board.timed[board.timed.length - 1];
    const probe = ((Math.round(last.passage.minutes) % 1440) - 10 + 1440) % 1440;
    const before = buildStopBoard(stop, probe);
    const rest = restOfDay(before);
    assert.ok(rest.some((row) => row.passage.minutes === last.passage.minutes));
    assert.ok(rest.every((row) => !row.passed));
  });

  it("keeps already-passed runs only in the whole day", () => {
    const rest = restOfDay(board);
    assert.equal(rest.filter((row) => row.passed).length, 0);
    assert.equal(wholeDay(board).length, board.timed.length);
    assert.ok(wholeDay(board).some((row) => row.passed), "morning board sees earlier runs as passed");
  });

  it("summarises the day and the routes with times", () => {
    assert.ok(timedRouteCount(board) > 0);
    assert.ok(firstPerRoute(board, 120).length > 0);
    const keys = firstPerRoute(board, 120).map((row) => `${row.passage.route}|${row.passage.direction}`);
    assert.equal(new Set(keys).size, keys.length, "one row per route and direction");
  });

  it("says nothing for a stop nobody has heard of", () => {
    const unknown = buildStopBoard("Nowhere At All", 9 * 60);
    assert.equal(unknown.known, false);
    assert.equal(unknown.timed.length, 0);
    assert.deepEqual(upcomingPassages(unknown, 120), []);
    assert.deepEqual(wholeDay(unknown), []);
  });

  it("matches the passages the timetable publishes for the stop", () => {
    const raw = getStopPassages(stop);
    assert.equal(board.timed.length, raw.length);
  });

  it("places the stop where the map does", () => {
    assert.deepEqual(board.position, stopPosition(stop));
  });
});

describe("the whole day, grouped", () => {
  const board = buildStopBoard("Esplanade", 9 * 60);
  const groups = groupPassages(wholeDay(board));

  it("keeps every passage, once", () => {
    const total = groups.reduce((sum, group) => sum + group.rows.length, 0);
    assert.equal(total, board.timed.length);
    assert.equal(new Set(groups.map((group) => group.key)).size, groups.length);
  });

  it("splits the two directions of one route", () => {
    assert.ok(groups.every((group) => group.rows.every((row) => row.passage.route === group.route && row.passage.direction === group.direction)));
    assert.ok(groups.some((group) => group.towards !== group.rows[0].passage.origin), "each group names where it is going");
  });

  it("says how many of its own runs have already gone", () => {
    for (const group of groups.slice(0, 20)) {
      assert.equal(group.passed, group.rows.filter((row) => row.passed).length);
    }
    assert.ok(groups.some((group) => group.passed > 0), "a morning board has earlier runs behind it");
  });

  it("is far fewer groups than passages at a busy stop", () => {
    assert.ok(groups.length < board.timed.length / 2, `${groups.length} groups for ${board.timed.length} passages`);
  });
});

describe("due phrase", () => {
  it("reads like a board", () => {
    assert.equal(duePhrase(0), "Due now");
    assert.equal(duePhrase(1), "Due now");
    assert.equal(duePhrase(7), "in 7 min");
    assert.equal(duePhrase(120), "in 2 hr");
  });
});
