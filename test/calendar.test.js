/* Calendar selection tests — realised P&L attributed to each exit's own date. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { realisedEvents, aggregateByDay, dayActivity, defaultFilter } from "../web/src/lib/filter.js";

const near = (a, b, eps = 1e-3) =>
  assert.ok(Math.abs(a - b) <= eps, `expected ${a} ≈ ${b} (±${eps})`);

let _id = 0;
const trade = (over) => ({ id: "t" + (++_id), ticker: "X", direction: "long", stop: "", riskOverride: "",
  tags: { setups: [], tactics: [], mistakes: [], edges: [] }, ...over });

// scaled-out CLOSED trade: +100 on 01-02, +200 on 01-03
const scaled = trade({ ticker: "AAA", fills: [
  { kind: "entry", date: "2026-01-01", price: 10, shares: 100 },
  { kind: "exit", date: "2026-01-02", price: 11, shares: 50 },
  { kind: "exit", date: "2026-01-03", price: 14, shares: 50 }] });
// still-OPEN trade with a partial trim: +50 on 01-02 (remains open)
const openPartial = trade({ ticker: "BBB", fills: [
  { kind: "entry", date: "2026-01-01", price: 20, shares: 100 },
  { kind: "exit", date: "2026-01-02", price: 21, shares: 50 }] });
// another trade closing on 01-02 (so 01-02 has 3 distinct trades)
const other = trade({ ticker: "CCC", fills: [
  { kind: "entry", date: "2026-01-01", price: 5, shares: 100 },
  { kind: "exit", date: "2026-01-02", price: 4, shares: 100 }] });

test("exit-date attribution incl. partials; distinct-trade counts per day", () => {
  const ev = realisedEvents([scaled, openPartial, other], defaultFilter());
  const byDay = aggregateByDay(ev);

  // 01-02: scaled (+50, 50@11 vs 10), openPartial (+50, 50@21 vs 20), other (-100) → 3 trades
  const d2 = byDay.get("2026-01-02");
  assert.equal(d2.count, 3);
  near(d2.pnl, 50 + 50 - 100); // = 0

  // 01-03: only the scaled trade's runner (+200) → 1 trade
  const d3 = byDay.get("2026-01-03");
  assert.equal(d3.count, 1);
  near(d3.pnl, 200);
});

test("one trade with two same-day exits counts once that day", () => {
  const twoSameDay = trade({ fills: [
    { kind: "entry", date: "2026-02-01", price: 10, shares: 100 },
    { kind: "exit", date: "2026-02-02", price: 11, shares: 50 },
    { kind: "exit", date: "2026-02-02", price: 12, shares: 50 }] });
  const byDay = aggregateByDay(realisedEvents([twoSameDay], defaultFilter()));
  const d = byDay.get("2026-02-02");
  assert.equal(d.count, 1);            // distinct trades, not exits
  near(d.pnl, 50 + 100);              // (11-10)*50 + (12-10)*50 = 150
});

test("global date range bounds which exits appear", () => {
  const f = { ...defaultFilter(), preset: "custom", dateFrom: "2026-01-03", dateTo: "2026-01-31" };
  const byDay = aggregateByDay(realisedEvents([scaled, openPartial, other], f));
  assert.equal(byDay.has("2026-01-02"), false); // before range → excluded
  assert.equal(byDay.get("2026-01-03").count, 1);
});

test("filters drop non-matching trades' exits", () => {
  const f = { ...defaultFilter(), symbol: "AAA" };
  const byDay = aggregateByDay(realisedEvents([scaled, openPartial, other], f));
  assert.equal(byDay.get("2026-01-02").count, 1); // only AAA (the scaled trade)
  near(byDay.get("2026-01-02").pnl, 50);
});

/* ---------- dayActivity: entries count too (buy days) ---------- */

test("dayActivity — a buy-only entry day counts with $0 P&L", () => {
  const byDay = dayActivity([scaled, openPartial, other], defaultFilter());
  // 01-01 is the entry day for all three trades — no realisation, but activity
  const d1 = byDay.get("2026-01-01");
  assert.equal(d1.count, 3);   // realisedEvents/aggregateByDay would have no 01-01 entry at all
  near(d1.pnl, 0);             // bought only → nothing realised
  assert.equal(d1.rows.length, 3);
});

test("dayActivity — realised days keep their P&L and counts", () => {
  const byDay = dayActivity([scaled, openPartial, other], defaultFilter());
  const d2 = byDay.get("2026-01-02");
  assert.equal(d2.count, 3);
  near(d2.pnl, 0);             // +50 +50 -100
  const d3 = byDay.get("2026-01-03");
  assert.equal(d3.count, 1);
  near(d3.pnl, 200);
});

test("dayActivity — per-trade rows carry side, volume, exec count", () => {
  const byDay = dayActivity([scaled], defaultFilter());
  // 01-01: one entry of 100 sh; 01-03: one exit of 50 sh @ +200
  const entryRow = byDay.get("2026-01-01").rows[0];
  assert.equal(entryRow.ticker, "AAA");
  assert.equal(entryRow.direction, "long");
  assert.equal(entryRow.shares, 100);
  assert.equal(entryRow.execs, 1);
  near(entryRow.pnl, 0);
  const exitRow = byDay.get("2026-01-03").rows[0];
  assert.equal(exitRow.shares, 50);
  near(exitRow.pnl, 200);
});

test("dayActivity — rows carry opened/closed flags, hold days, and setup tags", () => {
  const tagged = trade({ ticker: "DDD", tags: { setups: ["s1", "s2"], tactics: [], mistakes: [], edges: [] }, fills: [
    { kind: "entry", date: "2026-03-01", price: 10, shares: 100 },
    { kind: "exit", date: "2026-03-02", price: 11, shares: 40 },   // partial trim → adjusted day
    { kind: "exit", date: "2026-03-05", price: 12, shares: 60 }] });// closes the trade
  const byDay = dayActivity([tagged], defaultFilter());

  const open = byDay.get("2026-03-01").rows[0];
  assert.equal(open.opened, true);
  assert.equal(open.closed, false);
  assert.deepEqual(open.setups, ["s1", "s2"]);

  const mid = byDay.get("2026-03-02").rows[0]; // neither opened nor closed this day
  assert.equal(mid.opened, false);
  assert.equal(mid.closed, false);

  const close = byDay.get("2026-03-05").rows[0];
  assert.equal(close.closed, true);
  assert.equal(close.held, 4);                 // 03-01 → 03-05 = 4 days
});

test("dayActivity — a still-open buy-only trade has null hold days", () => {
  const buyOnly = trade({ ticker: "EEE", fills: [
    { kind: "entry", date: "2026-04-01", price: 10, shares: 100 }] });
  const row = dayActivity([buyOnly], defaultFilter()).get("2026-04-01").rows[0];
  assert.equal(row.opened, true);
  assert.equal(row.closed, false);
  assert.equal(row.held, null);
});

test("dayActivity — aggregates realised R per day when a stop gives the trade risk", () => {
  // entry 10, stop 9 ⇒ risk = (10-9)*100 = 100/share·shares = 100; exit +1/sh on 50 sh = +$50 = +0.5R
  const withStop = trade({ ticker: "RRR", stop: 9, fills: [
    { kind: "entry", date: "2026-05-01", price: 10, shares: 100 },
    { kind: "exit", date: "2026-05-04", price: 11, shares: 50 }] });
  const byDay = dayActivity([withStop], defaultFilter());
  const exit = byDay.get("2026-05-04");
  near(exit.pnl, 50);
  near(exit.r, 0.5);            // 50 / 100 risk
  near(exit.rows[0].r, 0.5);
  // the entry day realised nothing → 0 R
  near(byDay.get("2026-05-01").r, 0);
});

test("dayActivity — R is 0 when the trade has no stop / risk", () => {
  const noStop = trade({ ticker: "NNN", fills: [
    { kind: "entry", date: "2026-05-01", price: 10, shares: 100 },
    { kind: "exit", date: "2026-05-04", price: 12, shares: 100 }] });
  const exit = dayActivity([noStop], defaultFilter()).get("2026-05-04");
  near(exit.pnl, 200);
  near(exit.r, 0);
});

test("dayActivity — date range bounds which fills appear", () => {
  const f = { ...defaultFilter(), preset: "custom", dateFrom: "2026-01-02", dateTo: "2026-01-31" };
  const byDay = dayActivity([scaled, openPartial, other], f);
  assert.equal(byDay.has("2026-01-01"), false); // entry day before range → excluded
  assert.equal(byDay.get("2026-01-02").count, 3);
});