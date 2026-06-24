/* Equity-series tests — exits attributed to their own dates, cumulative. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTrade } from "../shared/engine.js";
import { equitySeries } from "../web/src/lib/equity.js";

const near = (a, b, eps = 1e-6) =>
  assert.ok(Math.abs(a - b) <= eps, `expected ${a} ≈ ${b} (±${eps})`);
const mk = (t) => ({ t, c: computeTrade(t) });

// X: scaled out over two days (+100 on 01-02, +200 on 01-03), 1R = 100
const X = mk({ direction: "long", stop: 9, fills: [
  { kind: "entry", date: "2026-01-01", price: 10, shares: 100 },
  { kind: "exit", date: "2026-01-02", price: 12, shares: 50 },
  { kind: "exit", date: "2026-01-03", price: 14, shares: 50 }] });
// Y: −200 on 01-02, 1R = 100
const Y = mk({ direction: "long", stop: 19, fills: [
  { kind: "entry", date: "2026-01-02", price: 20, shares: 100 },
  { kind: "exit", date: "2026-01-02", price: 18, shares: 100 }] });

const closed = [X, Y];

test("$ mode — anchored at baseline, then cumulative; scaled-out trade spans two days", () => {
  const { pts, base, net, days } = equitySeries(closed, { mode: "dollar", baseline: 1000 });
  assert.equal(base, 1000);
  assert.equal(days, 2);
  assert.equal(pts.length, 3);            // anchor + 2 event days
  assert.equal(pts[0].anchor, true);      // starts at the baseline...
  assert.equal(pts[0].date, "2026-01-01"); // ...the day before the first exit
  near(pts[0].val, 1000);
  assert.equal(pts[1].date, "2026-01-02");
  near(pts[1].val, 900);    // 1000 + (100 − 200)
  assert.equal(pts[2].date, "2026-01-03");
  near(pts[2].val, 1100);   // + 200
  near(net, 100);
});

test("R mode — anchored at 0R, then cumulative R", () => {
  const { pts, net, days } = equitySeries(closed, { mode: "r" });
  assert.equal(days, 2);
  near(pts[0].val, 0);      // anchor at 0R
  near(pts[1].val, -1);     // +1R − 2R
  near(pts[2].val, 1);      // + 2R
  near(net, 1);
});

test("empty set → no points, no anchor", () => {
  const { pts, net, days } = equitySeries([], { mode: "dollar", baseline: 500 });
  assert.equal(pts.length, 0);
  assert.equal(days, 0);
  near(net, 0);
});
