/* sortRows — pure stable sort with nulls-last. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { sortRows } from "../web/src/lib/sort.js";

const rows = [
  { id: "a", v: 3, s: "NVDA" },
  { id: "b", v: 1, s: "aapl" },
  { id: "c", v: null, s: "MSFT" },
  { id: "d", v: 1, s: "TSLA" },
];
const acc = (r, k) => r[k];

test("numeric asc/desc with nulls last", () => {
  const asc = sortRows(rows, acc, { key: "v", dir: "asc" }).map((r) => r.id);
  assert.deepEqual(asc, ["b", "d", "a", "c"]); // 1,1,3, null-last; b before d (stable)
  const desc = sortRows(rows, acc, { key: "v", dir: "desc" }).map((r) => r.id);
  assert.deepEqual(desc, ["a", "b", "d", "c"]); // 3,1,1, null-last; stable among ties
});

test("string sort", () => {
  const asc = sortRows(rows, acc, { key: "s", dir: "asc" }).map((r) => r.s);
  assert.deepEqual(asc, ["MSFT", "NVDA", "TSLA", "aapl"]); // ASCII: uppercase < lowercase
});

test("does not mutate input", () => {
  const before = rows.map((r) => r.id);
  sortRows(rows, acc, { key: "v", dir: "asc" });
  assert.deepEqual(rows.map((r) => r.id), before);
});
