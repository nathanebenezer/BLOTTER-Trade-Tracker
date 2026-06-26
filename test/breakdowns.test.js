/* Breakdowns aggregations — operate on the realised-event stream. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { byDayOfWeek } from "../web/src/lib/breakdowns.js";

const near = (a, b, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) <= eps, `expected ${a} ≈ ${b}`);

// 2026-01-01 is a Thursday; 01-02 Fri; 01-05 Mon; 01-06 Tue.
const events = [
  { date: "2026-01-01", pnl: 100, r: 1 },   // Thu
  { date: "2026-01-02", pnl: -40, r: -0.5 },// Fri
  { date: "2026-01-05", pnl: 30, r: 0.3 },  // Mon
  { date: "2026-01-05", pnl: 20, r: 0.2 },  // Mon (second exit same weekday)
  { date: "2026-01-06", pnl: -10, r: -0.1 },// Tue
];

test("byDayOfWeek — returns Mon..Sun and sums P&L/R/count per weekday", () => {
  const rows = byDayOfWeek(events);
  assert.deepEqual(rows.map((r) => r.label), ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);

  const by = Object.fromEntries(rows.map((r) => [r.label, r]));
  near(by.Mon.pnl, 50); assert.equal(by.Mon.count, 2); near(by.Mon.r, 0.5);
  near(by.Tue.pnl, -10); assert.equal(by.Tue.count, 1);
  near(by.Thu.pnl, 100); assert.equal(by.Thu.count, 1);
  near(by.Fri.pnl, -40); assert.equal(by.Fri.count, 1);
  near(by.Wed.pnl, 0); assert.equal(by.Wed.count, 0);   // no events
  near(by.Sat.pnl, 0); near(by.Sun.pnl, 0);
});

test("byDayOfWeek — handles an empty event list", () => {
  const rows = byDayOfWeek([]);
  assert.equal(rows.length, 7);
  assert.ok(rows.every((r) => r.pnl === 0 && r.count === 0));
});
