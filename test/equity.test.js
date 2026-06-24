/* Equity-series tests — events-based; all-realised vs closed-only scope. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { realisedEvents, defaultFilter } from "../web/src/lib/filter.js";
import { equitySeries } from "../web/src/lib/equity.js";

const near = (a, b, eps = 1e-6) =>
  assert.ok(Math.abs(a - b) <= eps, `expected ${a} ≈ ${b} (±${eps})`);

let _id = 0;
const T = (o) => ({ id: "t" + (++_id), direction: "long", stop: "", fills: [], ...o });

// X: scaled-out CLOSED (+100 on 01-02, +200 on 01-03), 1R=100
const X = T({ stop: 9, fills: [
  { kind: "entry", date: "2026-01-01", price: 10, shares: 100 },
  { kind: "exit", date: "2026-01-02", price: 12, shares: 50 },
  { kind: "exit", date: "2026-01-03", price: 14, shares: 50 }] });
// Y: CLOSED −200 on 01-02, 1R=100
const Y = T({ stop: 19, fills: [
  { kind: "entry", date: "2026-01-02", price: 20, shares: 100 },
  { kind: "exit", date: "2026-01-02", price: 18, shares: 100 }] });
// Z: still OPEN, but a +30 trim realised on 01-04, 1R=100
const Z = T({ stop: 9, fills: [
  { kind: "entry", date: "2026-01-02", price: 10, shares: 100 },
  { kind: "exit", date: "2026-01-04", price: 11, shares: 30 }] });

const all = realisedEvents([X, Y, Z], defaultFilter());

test("$ all-realised — anchored at baseline; open trade's trim included", () => {
  const { pts, base, net, days } = equitySeries(all, { mode: "dollar", baseline: 1000 });
  assert.equal(base, 1000);
  assert.equal(days, 3);
  assert.equal(pts.length, 4);            // anchor + 3 event days
  assert.equal(pts[0].date, "2026-01-01"); near(pts[0].val, 1000);
  near(pts[1].val, 900);                  // 01-02: +100 − 200
  near(pts[2].val, 1100);                 // 01-03: +200
  near(pts[3].val, 1130);                 // 01-04: +30 (open trim)
  near(net, 130);
});

test("R all-realised", () => {
  const { pts, net } = equitySeries(all, { mode: "r" });
  near(pts[0].val, 0);
  near(pts[1].val, -1);                   // +1R − 2R
  near(pts[2].val, 1);                    // +2R
  near(pts[3].val, 1.3);                  // +0.3R
  near(net, 1.3);
});

test("closed-only scope excludes the open trim", () => {
  const closedOnly = all.filter((e) => e.closed);
  const { pts, net, days } = equitySeries(closedOnly, { mode: "dollar", baseline: 1000 });
  assert.equal(days, 2);
  assert.equal(pts.some((p) => p.date === "2026-01-04"), false);
  near(net, 100);
});

test("empty set → no points", () => {
  const { pts, net, days } = equitySeries([], { mode: "dollar", baseline: 500 });
  assert.equal(pts.length, 0);
  assert.equal(days, 0);
  near(net, 0);
});
