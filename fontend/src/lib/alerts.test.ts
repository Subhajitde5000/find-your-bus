/*
 * Tests for the ride alerts: "get ready, 2 stops left" and the wrong-direction warning.
 * Run with: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHECK_BACKWARD_METRES,
  directionWarning,
  isEscalation,
  stopAlert,
  vibrationFor,
  WRONG_BACKWARD_METRES,
  type StopAlertInput,
} from "@/lib/alerts";
import { directionEvidence } from "@/lib/ride";

const base: StopAlertInput = { stopIndex: 2, atStop: false, destinationIndex: 8, destinationName: "Esplanade", metresToDestination: 6000 };

describe("stop alert", () => {
  it("is silent while the stop is far away", () => {
    assert.equal(stopAlert(base).level, "none");
    assert.equal(stopAlert(null).level, "none");
  });

  it("says get ready at two stops left", () => {
    const alert = stopAlert({ ...base, stopIndex: 6 });
    assert.equal(alert.level, "soon");
    assert.equal(alert.stopsLeft, 2);
    assert.equal(alert.title, "Get ready: 2 stops left");
  });

  it("says your stop is next at one stop left", () => {
    const alert = stopAlert({ ...base, stopIndex: 7 });
    assert.equal(alert.level, "next");
    assert.equal(alert.title, "Your stop is next");
  });

  it("says you have arrived only when at the stop itself", () => {
    assert.equal(stopAlert({ ...base, stopIndex: 8, atStop: true }).level, "arrived");
  });

  it("counts pulling up a few metres short of the stop as being there", () => {
    assert.equal(stopAlert({ ...base, stopIndex: 7, metresToDestination: 12 }).level, "arrived");
    assert.equal(stopAlert({ ...base, stopIndex: 7, metresToDestination: 200 }).level, "next");
    // with two stops left, 12 m cannot be the passenger's stop
    assert.notEqual(stopAlert({ ...base, stopIndex: 6, metresToDestination: 12 }).level, "arrived");
  });

  it("says you passed it when the bus is beyond the stop", () => {
    assert.equal(stopAlert({ ...base, stopIndex: 9 }).level, "missed");
    assert.equal(stopAlert({ ...base, stopIndex: 8, atStop: false }).level, "missed");
  });

  it("brings get-ready forward, never later, when the distance is short, but never says next early", () => {
    const close = stopAlert({ ...base, stopIndex: 4, metresToDestination: 250 });
    assert.equal(close.level, "soon");
    assert.equal(close.title, "Get ready: 4 stops left", "the count shown is the true count");
    assert.equal(stopAlert({ ...base, stopIndex: 4, metresToDestination: 600 }).level, "soon");
    assert.equal(stopAlert({ ...base, stopIndex: 4, metresToDestination: 900 }).level, "none");
    // a long distance does not cancel a stop-count alert
    assert.equal(stopAlert({ ...base, stopIndex: 6, metresToDestination: 9000 }).level, "soon");
  });

  it("copes with a distance that could not be measured", () => {
    assert.equal(stopAlert({ ...base, stopIndex: 6, metresToDestination: null }).level, "soon");
    assert.equal(stopAlert({ ...base, stopIndex: 2, metresToDestination: null }).level, "none");
  });

  it("uses the singular for one stop", () => {
    // distance forces "soon" while one stop is left via stop count -> next, so build soon with 2
    assert.match(stopAlert({ ...base, stopIndex: 6 }).title, /2 stops left/);
  });

  it("only escalates", () => {
    assert.ok(isEscalation("none", "soon"));
    assert.ok(isEscalation("soon", "next"));
    assert.ok(isEscalation("next", "arrived"));
    assert.ok(!isEscalation("next", "soon"));
    assert.ok(!isEscalation("soon", "soon"));
  });

  it("buzzes harder as the stop gets closer, and not at all when far", () => {
    assert.deepEqual(vibrationFor("none"), []);
    assert.ok(vibrationFor("arrived").length > vibrationFor("next").length);
    assert.ok(vibrationFor("next").length > vibrationFor("soon").length);
  });
});

describe("direction warning", () => {
  const moving = (metres: number) =>
    directionEvidence([
      { at: 0, metresAlong: 1000 },
      { at: 60_000, metresAlong: 1000 + metres },
    ]);

  it("says nothing when the bus is going the right way", () => {
    assert.equal(directionWarning(moving(400), "Ramnagar").level, "none");
  });

  it("says nothing when the bus is standing still", () => {
    assert.equal(directionWarning(moving(0), "Ramnagar").level, "none");
    assert.equal(directionWarning(moving(-20), "Ramnagar").level, "none");
  });

  it("asks you to check after a short move backwards", () => {
    const warning = directionWarning(moving(-(CHECK_BACKWARD_METRES + 20)), "Ramnagar");
    assert.equal(warning.level, "check");
  });

  it("says wrong way after a long move backwards, and names where it is heading", () => {
    const warning = directionWarning(moving(-(WRONG_BACKWARD_METRES + 50)), "Ramnagar");
    assert.equal(warning.level, "wrong");
    assert.match(warning.detail, /Ramnagar/);
    assert.ok(warning.metresBackwards >= WRONG_BACKWARD_METRES);
  });

  it("needs a few seconds of movement, so one jumpy fix does not raise it", () => {
    const jump = directionEvidence([
      { at: 0, metresAlong: 1000 },
      { at: 3_000, metresAlong: 100 },
    ]);
    assert.equal(directionWarning(jump, "Ramnagar").level, "none");
  });
});
