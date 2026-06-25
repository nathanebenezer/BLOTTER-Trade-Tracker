/* Pure helpers for bulk merge/split. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { combineFills, fillsToExecutions } from "../server/tradeops.js";
import { reconstruct } from "../server/import.js";

test("combineFills merges + sorts by date then seq, reindexes seq", () => {
  const t1 = { fills: [
    { kind: "entry", date: "2026-01-03", price: 10, shares: 100, seq: 0, source: "manual", nAmt: null },
    { kind: "exit", date: "2026-01-05", price: 12, shares: 100, seq: 1, source: "manual", nAmt: null }] };
  const t2 = { fills: [
    { kind: "entry", date: "2026-01-01", price: 9, shares: 50, seq: 0, source: "manual", nAmt: null },
    { kind: "exit", date: "2026-01-02", price: 11, shares: 50, seq: 1, source: "manual", nAmt: null }] };
  const m = combineFills([t1, t2]);
  assert.equal(m.length, 4);
  assert.deepEqual(m.map((f) => f.date), ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-05"]);
  assert.deepEqual(m.map((f) => f.seq), [0, 1, 2, 3]);   // reindexed
  assert.equal(m[0].price, 9);
  assert.equal(m[3].price, 12);
});

test("combineFills preserves source / nAmt", () => {
  const t = { fills: [{ kind: "entry", date: "2026-02-01", price: 5, shares: 10, seq: 0, source: "import", nAmt: 50 }] };
  const m = combineFills([t]);
  assert.equal(m[0].source, "import");
  assert.equal(m[0].nAmt, 50);
});

test("fillsToExecutions maps kind+direction to side/signedQty", () => {
  const long = { ticker: "AAA", direction: "long", fills: [
    { kind: "entry", date: "2026-01-01", price: 10, shares: 100, seq: 0 },
    { kind: "exit", date: "2026-01-02", price: 12, shares: 100, seq: 1 }] };
  const ex = fillsToExecutions(long);
  assert.equal(ex[0].side, "buy"); assert.equal(ex[0].signedQty, 100);
  assert.equal(ex[1].side, "sell"); assert.equal(ex[1].signedQty, -100);
  // short: entry = sell, cover = buy
  const short = { ticker: "BBB", direction: "short", fills: [{ kind: "entry", date: "2026-01-01", price: 50, shares: 10, seq: 0 }] };
  assert.equal(fillsToExecutions(short)[0].side, "sell");
  assert.equal(fillsToExecutions(short)[0].signedQty, -10);
});

test("split: two round-trips reconstruct into 2; single into 1", () => {
  const two = { ticker: "AAA", direction: "long", fills: [
    { kind: "entry", date: "2026-01-01", price: 10, shares: 100, seq: 0 },
    { kind: "exit", date: "2026-01-02", price: 12, shares: 100, seq: 1 },
    { kind: "entry", date: "2026-01-05", price: 20, shares: 50, seq: 2 },
    { kind: "exit", date: "2026-01-06", price: 22, shares: 50, seq: 3 }] };
  assert.equal(reconstruct(fillsToExecutions(two), {}).newTrades.length, 2);

  const one = { ticker: "AAA", direction: "long", fills: [
    { kind: "entry", date: "2026-01-01", price: 10, shares: 100, seq: 0 },
    { kind: "exit", date: "2026-01-02", price: 12, shares: 100, seq: 1 }] };
  assert.equal(reconstruct(fillsToExecutions(one), {}).newTrades.length, 1);
});

test("split: short two round-trips → 2 short pieces", () => {
  const t = { ticker: "BBB", direction: "short", fills: [
    { kind: "entry", date: "2026-01-01", price: 50, shares: 100, seq: 0 },
    { kind: "exit", date: "2026-01-02", price: 45, shares: 100, seq: 1 },
    { kind: "entry", date: "2026-01-05", price: 40, shares: 80, seq: 2 },
    { kind: "exit", date: "2026-01-06", price: 38, shares: 80, seq: 3 }] };
  const r = reconstruct(fillsToExecutions(t), {});
  assert.equal(r.newTrades.length, 2);
  assert.ok(r.newTrades.every((p) => p.direction === "short"));
});
