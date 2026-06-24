/* Report stat-grid tests — fixed closed set with known answers. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTrade } from "../shared/engine.js";
import { computeStats } from "../web/src/lib/stats.js";

const near = (a, b, eps = 1e-3) =>
  assert.ok(Math.abs(a - b) <= eps, `expected ${a} ≈ ${b} (±${eps})`);

// build {t,c} from a trade spec
const mk = (t) => ({ t, c: computeTrade(t) });

// +200 / R2 / 3d, close 01-01 ; +50 / R0.5 / 1d, close 01-02 ;
// −100 / R−1 / 5d, close 01-03 ; 0 scratch / no-R / 2d, close 01-04
const A = mk({ direction: "long", stop: 9, fills: [
  { kind: "entry", date: "2025-12-29", price: 10, shares: 100 },
  { kind: "exit", date: "2026-01-01", price: 12, shares: 100 }] });
const C = mk({ direction: "long", stop: 9, fills: [
  { kind: "entry", date: "2026-01-01", price: 10, shares: 100 },
  { kind: "exit", date: "2026-01-02", price: 10.5, shares: 100 }] });
const B = mk({ direction: "long", stop: 9, fills: [
  { kind: "entry", date: "2025-12-29", price: 10, shares: 100 },
  { kind: "exit", date: "2026-01-03", price: 9, shares: 100 }] });
const D = mk({ direction: "long", stop: "", fills: [
  { kind: "entry", date: "2026-01-02", price: 10, shares: 100 },
  { kind: "exit", date: "2026-01-04", price: 10, shares: 100 }] });

const s = computeStats([A, B, C, D]);

test("counts + P&L", () => {
  assert.equal(s.n, 4);
  near(s.net, 150);
  near(s.avgTrade, 37.5);
  assert.equal(s.nWins, 2);
  assert.equal(s.nLosses, 1);
  assert.equal(s.nScratch, 1);
  near(s.largestGain, 200);
  near(s.largestLoss, -100);
});

test("ratios", () => {
  near(s.winRate, 2 / 3);
  near(s.profitFactor, 2.5);
  near(s.payoff, 1.25);
  near(s.avgWin, 125);
  near(s.avgLoss, -100);
  near(s.avgR, 0.5);
  near(s.expectancyR, 0.5);
});

test("holds + streaks", () => {
  near(s.avgHold, 2.75);
  near(s.avgHoldWin, 2);
  near(s.avgHoldLoss, 5);
  near(s.avgHoldScratch, 2);
  assert.equal(s.maxWinStreak, 2);   // A(01-01) then C(01-02)
  assert.equal(s.maxLossStreak, 1);
});

test("dispersion — std dev, SQN, Kelly", () => {
  near(s.stdDev, 125);               // sample (N−1)
  near(s.sqn, 0.6);                  // (37.5/125)·√4
  near(s.kelly, 0.4);               // 0.667 − 0.333/1.25
});

test("guards return null when undefined", () => {
  const one = computeStats([A]);     // N=1 → no std dev/SQN
  assert.equal(one.stdDev, null);
  assert.equal(one.sqn, null);
  const allWins = computeStats([A, C]); // no losers → no payoff/Kelly, PF ∞
  assert.equal(allWins.payoff, null);
  assert.equal(allWins.kelly, null);
  assert.equal(allWins.profitFactor, Infinity);
});
