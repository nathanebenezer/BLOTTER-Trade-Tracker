/* Calendar selection tests — realised P&L attributed to each exit's own date. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { realisedEvents, aggregateByDay, defaultFilter } from "../web/src/lib/filter.js";

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