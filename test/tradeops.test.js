/* Pure helpers for bulk merge/split. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { combineFills } from "../server/tradeops.js";

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
