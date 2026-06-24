/* Tag breakdown — per-tag and per-combination stats over closed trades. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTrade } from "../shared/engine.js";
import { tagBreakdown } from "../web/src/lib/tagstats.js";

const near = (a, b, eps = 1e-3) =>
  assert.ok(Math.abs(a - b) <= eps, `expected ${a} ≈ ${b} (±${eps})`);

const tagGroups = {
  setups: [{ id: 1, name: "HV1" }, { id: 2, name: "Breakout" }],
  tactics: [{ id: 3, name: "Day1" }], mistakes: [], edges: [],
};
const mk = (t) => ({ t, c: computeTrade(t) });
const tr = (tags, fills) => mk({ direction: "long", stop: 9, tags: { setups: [], tactics: [], mistakes: [], edges: [], ...tags }, fills });
const rt = (date, exit, price) => [{ kind: "entry", date, price: 10, shares: 100 }, { kind: "exit", date: exit, price, shares: 100 }];

// A +200 win [HV1,Day1] ; B −100 loss [HV1] ; C +50 win [Breakout] ; D −50 loss [untagged]
const A = tr({ setups: [1], tactics: [3] }, rt("2026-01-01", "2026-01-02", 12));
const B = tr({ setups: [1] }, rt("2026-01-01", "2026-01-03", 9));
const C = tr({ setups: [2] }, rt("2026-01-01", "2026-01-04", 10.5));
const D = tr({}, rt("2026-01-01", "2026-01-05", 9.5));

const { byTag, byCombo } = tagBreakdown([A, B, C, D], tagGroups);
const get = (arr, label) => arr.find((r) => r.label === label);

test("byTag — a trade counts under each of its tags", () => {
  assert.equal(byTag.length, 4); // HV1, Day1, Breakout, (untagged)
  const hv1 = get(byTag, "HV1");
  assert.equal(hv1.count, 2); near(hv1.net, 100); near(hv1.winRate, 0.5);
  near(hv1.profitFactor, 2); assert.equal(hv1.volume, 200); assert.equal(hv1.group, "setups");

  const day1 = get(byTag, "Day1");
  assert.equal(day1.count, 1); near(day1.net, 200); near(day1.winRate, 1);
  assert.equal(day1.profitFactor, Infinity); assert.equal(day1.group, "tactics");

  const un = get(byTag, "(untagged)");
  assert.equal(un.count, 1); near(un.net, -50); near(un.winRate, 0); assert.equal(un.volume, 100);
});

test("byCombo — groups by the exact tag-set", () => {
  assert.equal(byCombo.length, 4);
  assert.ok(get(byCombo, "Day1 · HV1"));      // A's combo, names sorted
  assert.equal(get(byCombo, "Day1 · HV1").count, 1);
  near(get(byCombo, "Day1 · HV1").net, 200);
  assert.equal(get(byCombo, "HV1").count, 1);
  assert.ok(get(byCombo, "(untagged)"));
});
