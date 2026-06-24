/* ============================================================ *
 *  Tag breakdown — per-tag and per-combination stats over the
 *  filtered CLOSED set (open excluded → win%/PF well-defined).
 *  Reuses computeStats; volume = total exited shares. Pure.
 * ============================================================ */
import { computeStats } from "./stats.js";

const TAG_GROUPS = ["setups", "tactics", "mistakes", "edges"];
const volumeOf = (subset) => subset.reduce((a, o) => a + (o.c.exitedShares || 0), 0);

function row(subset) {
  const s = computeStats(subset);
  return { count: s.n, winRate: s.winRate, profitFactor: s.profitFactor, net: s.net, volume: volumeOf(subset) };
}

export function tagBreakdown(closed, tagGroups) {
  const meta = new Map(); // tagId -> { name, group }
  for (const g of TAG_GROUPS) for (const tg of tagGroups?.[g] || []) meta.set(tg.id, { name: tg.name, group: g });

  // ---- by individual tag (a trade with N tags appears in N rows) ----
  const byTagSubsets = new Map(); // tagId -> [{t,c}]
  const untagged = [];
  for (const o of closed) {
    const ids = [...new Set(TAG_GROUPS.flatMap((g) => o.t.tags?.[g] || []))];
    if (!ids.length) { untagged.push(o); continue; }
    for (const id of ids) {
      if (!byTagSubsets.has(id)) byTagSubsets.set(id, []);
      byTagSubsets.get(id).push(o);
    }
  }
  const byTag = [];
  for (const [id, subset] of byTagSubsets) {
    const m = meta.get(id);
    if (!m) continue;
    byTag.push({ key: "t" + id, label: m.name, group: m.group, ...row(subset) });
  }
  if (untagged.length) byTag.push({ key: "untagged", label: "(untagged)", group: "", ...row(untagged) });

  // ---- by exact tag combination ----
  const byComboSubsets = new Map(); // label -> [{t,c}]
  for (const o of closed) {
    const names = [...new Set(TAG_GROUPS.flatMap((g) => (o.t.tags?.[g] || []).map((id) => meta.get(id)?.name).filter(Boolean)))];
    const label = names.length ? names.sort().join(" · ") : "(untagged)";
    if (!byComboSubsets.has(label)) byComboSubsets.set(label, []);
    byComboSubsets.get(label).push(o);
  }
  const byCombo = [];
  for (const [label, subset] of byComboSubsets) byCombo.push({ key: label, label, ...row(subset) });

  return { byTag, byCombo };
}
