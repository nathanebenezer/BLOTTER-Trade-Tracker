/* Breakdowns aggregations — operate on the realised-event stream. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { byDayOfWeek, byMonth, tradeSequence } from "../web/src/lib/breakdowns.js";

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

test("byMonth — Jan..Dec for the chosen year only", () => {
  const evs = [
    { date: "2026-01-15", pnl: 100, r: 1 },
    { date: "2026-01-20", pnl: 50, r: 0.5 },
    { date: "2026-03-10", pnl: -30, r: -0.3 },
    { date: "2025-03-10", pnl: 999, r: 9 },   // different year → excluded
  ];
  const rows = byMonth(evs, 2026);
  assert.equal(rows.length, 12);
  assert.equal(rows[0].label, "Jan");
  near(rows[0].pnl, 150); assert.equal(rows[0].count, 2);
  near(rows[2].pnl, -30); assert.equal(rows[2].count, 1);
  near(rows[1].pnl, 0); assert.equal(rows[1].count, 0); // Feb empty
  // the 2025 event must not leak in
  assert.equal(rows.reduce((a, r) => a + r.count, 0), 3);
});

test("tradeSequence — one bar per closed trade, ordered by close date, numbered 1..N", () => {
  const closed = [
    { t: { ticker: "CCC" }, c: { realized: 250, rMultiple: 2.5, closeDate: "2026-03-10" } },
    { t: { ticker: "AAA" }, c: { realized: -150, rMultiple: -1.5, closeDate: "2026-01-05" } },
    { t: { ticker: "BBB" }, c: { realized: 50, rMultiple: 0.5, closeDate: "2026-02-01" } },
  ];
  const seq = tradeSequence(closed, "dollar");
  assert.equal(seq.total, 3);
  assert.deepEqual(seq.bars.map((b) => b.ticker), ["AAA", "BBB", "CCC"]); // by close date asc
  assert.deepEqual(seq.bars.map((b) => b.n), [1, 2, 3]);
  assert.deepEqual(seq.bars.map((b) => b.value), [-150, 50, 250]);
});

test("tradeSequence — R mode uses rMultiple and skips trades with no R", () => {
  const closed = [
    { t: { ticker: "AAA" }, c: { realized: 100, rMultiple: 1, closeDate: "2026-01-01" } },
    { t: { ticker: "BBB" }, c: { realized: 40, rMultiple: null, closeDate: "2026-01-02" } }, // no stop
    { t: { ticker: "CCC" }, c: { realized: -100, rMultiple: -1, closeDate: "2026-01-03" } },
  ];
  const seq = tradeSequence(closed, "r");
  assert.equal(seq.total, 2);
  assert.equal(seq.skipped, 1);
  assert.deepEqual(seq.bars.map((b) => b.value), [1, -1]);
  assert.deepEqual(seq.bars.map((b) => b.n), [1, 2]); // renumbered over included trades
});
