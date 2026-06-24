/* ============================================================ *
 *  Acceptance tests for the verified accounting engine.
 *  These MUST stay green across every phase (BUILD_BRIEF §"DO NOT
 *  change — accounting engine"). Run with: npm test
 * ============================================================ */
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTrade } from "../shared/engine.js";

// float-tolerant compare
const near = (a, b, eps = 1e-3) =>
  assert.ok(Math.abs(a - b) <= eps, `expected ${a} ≈ ${b} (±${eps})`);

const D = "2026-01-01"; // dates only matter for ordering here; one day is fine

test("case 1 — 100@10 → 100@12, stop 9 ⇒ +200, +20%, +2R, closed", () => {
  const c = computeTrade({
    direction: "long", stop: 9, riskOverride: "",
    fills: [
      { kind: "entry", date: D, price: 10, shares: 100 },
      { kind: "exit", date: D, price: 12, shares: 100 },
    ],
  });
  near(c.realized, 200);
  near(c.realizedPct, 20);
  near(c.risk, 100);
  near(c.rMultiple, 2);
  assert.equal(c.status, "closed");
  assert.equal(c.overSold, false);
});

test("case 2 — pyramids + scale-out ⇒ +390, avgIn 10.333, exited 150, ~+25.2%", () => {
  const c = computeTrade({
    direction: "long", stop: "", riskOverride: "",
    fills: [
      { kind: "entry", date: D, price: 10, shares: 100 },
      { kind: "entry", date: D, price: 11, shares: 50 },
      { kind: "exit", date: D, price: 12, shares: 60 },
      { kind: "exit", date: D, price: 13, shares: 40 },
      { kind: "exit", date: D, price: 14, shares: 50 },
    ],
  });
  near(c.realized, 390, 1e-2);
  near(c.avgIn, 10.3333, 1e-3);
  assert.equal(c.exitedShares, 150);
  near(c.realizedPct, 25.16, 0.1);
  assert.equal(c.status, "closed");
});

test("case 3 — buy100@10, sell50@12 ⇒ +100, remaining 50, partial", () => {
  const c = computeTrade({
    direction: "long", stop: "", riskOverride: "",
    fills: [
      { kind: "entry", date: D, price: 10, shares: 100 },
      { kind: "exit", date: D, price: 12, shares: 50 },
    ],
  });
  near(c.realized, 100);
  near(c.remaining, 50);
  assert.equal(c.status, "partial");
});

test("case 4 — short100@50, cover100@45, stop52 ⇒ +500, +10%, +2.5R", () => {
  const c = computeTrade({
    direction: "short", stop: 52, riskOverride: "",
    fills: [
      { kind: "entry", date: D, price: 50, shares: 100 },
      { kind: "exit", date: D, price: 45, shares: 100 },
    ],
  });
  near(c.realized, 500);
  near(c.realizedPct, 10);
  near(c.risk, 200);
  near(c.rMultiple, 2.5);
  assert.equal(c.status, "closed");
});

test("case 5 — buy100@10, sell120@12 ⇒ +200 (clamped), overSold true", () => {
  const c = computeTrade({
    direction: "long", stop: "", riskOverride: "",
    fills: [
      { kind: "entry", date: D, price: 10, shares: 100 },
      { kind: "exit", date: D, price: 12, shares: 120 },
    ],
  });
  near(c.realized, 200);
  assert.equal(c.overSold, true);
  assert.equal(c.exitedShares, 100); // realised only against shares actually held
});

test("case 6 — risk override 50 ⇒ 1R = 50 (takes precedence over stop)", () => {
  const c = computeTrade({
    direction: "long", stop: 9, riskOverride: 50,
    fills: [
      { kind: "entry", date: D, price: 10, shares: 100 },
      { kind: "exit", date: D, price: 11, shares: 100 },
    ],
  });
  near(c.risk, 50);
  near(c.realized, 100);
  near(c.rMultiple, 2); // 100 / 50
});
