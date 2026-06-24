/* ============================================================ *
 *  Global-filter selection — the one filter drives every page.
 *  Uses the shared engine so the client computes the same numbers
 *  the server stores. Ported/adapted from the reference, extended
 *  to the brief's filter shape (direction + 4 tag groups, AND).
 * ============================================================ */
// relative path (not the @engine alias) so this module is importable by both
// Vite and the Node test runner; fs.allow already permits reading shared/.
import { computeTrade } from "../../../shared/engine.js";

export const TAG_GROUPS = ["setups", "tactics", "mistakes", "edges"];

export function defaultFilter() {
  return {
    preset: "all",
    dateFrom: "",
    dateTo: "",
    symbol: "",
    direction: "all", // all | long | short
    result: "all",    // all | win | loss
    tags: { setups: [], tactics: [], mistakes: [], edges: [] },
  };
}

const iso = (d) => d.toISOString().slice(0, 10);
const todayISO = () => new Date().toISOString().slice(0, 10);

export function rangeBounds(filter) {
  const now = new Date(), y = now.getFullYear(), m = now.getMonth();
  switch (filter.preset) {
    case "ytd": return [iso(new Date(y, 0, 1)), todayISO()];
    case "month": return [iso(new Date(y, m, 1)), todayISO()];
    case "lastmonth": return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
    case "30": return [iso(new Date(Date.now() - 29 * 86400000)), todayISO()];
    case "custom": return [filter.dateFrom || "0000-01-01", filter.dateTo || "9999-12-31"];
    default: return ["0000-01-01", "9999-12-31"];
  }
}
const inRange = (d, lo, hi) => d != null && d >= lo && d <= hi;

const tradeTagIds = (t) => TAG_GROUPS.flatMap((g) => t.tags?.[g] || []);
const selectedTagIds = (filter) => TAG_GROUPS.flatMap((g) => filter.tags?.[g] || []);

function matchTags(t, filter) {
  const sel = selectedTagIds(filter);
  if (!sel.length) return true;
  const have = new Set(tradeTagIds(t));
  return sel.every((id) => have.has(id)); // AND: must contain every selected tag
}
const matchSymbol = (t, q) => !q || (t.ticker || "").toUpperCase().includes(q.toUpperCase());
const matchDir = (t, d) => d === "all" || (t.direction || "long") === d;

export const computeAll = (trades) => trades.map((t) => ({ t, c: computeTrade(t) }));

export function selectedClosed(trades, filter) {
  const [lo, hi] = rangeBounds(filter);
  return computeAll(trades)
    .filter((o) => o.c.status === "closed")
    .filter((o) => inRange(o.c.closeDate, lo, hi))
    .filter((o) => matchDir(o.t, filter.direction))
    .filter((o) => filter.result === "all" || (filter.result === "win" ? o.c.realized > 0 : o.c.realized < 0))
    .filter((o) => matchSymbol(o.t, filter.symbol))
    .filter((o) => matchTags(o.t, filter))
    .sort((a, b) => (a.c.closeDate < b.c.closeDate ? 1 : -1));
}

// Open positions always show, regardless of the date range (per brief).
export function openPositions(trades, filter) {
  return computeAll(trades)
    .filter((o) => o.c.status !== "closed")
    .filter((o) => matchDir(o.t, filter.direction))
    .filter((o) => matchSymbol(o.t, filter.symbol))
    .filter((o) => matchTags(o.t, filter))
    .sort((a, b) => ((a.c.openDate || "") < (b.c.openDate || "") ? 1 : -1));
}

/* ============================================================ *
 *  Calendar — realised P&L attributed to each exit's OWN date.
 *  Exit-level (includes partial trims from still-open trades),
 *  bounded by the global date range; honours the other filters.
 * ============================================================ */
export function realisedEvents(trades, filter) {
  const [lo, hi] = rangeBounds(filter);
  const events = [];
  for (const t of trades) {
    if (!matchDir(t, filter.direction)) continue;
    if (!matchSymbol(t, filter.symbol)) continue;
    if (!matchTags(t, filter)) continue;
    const c = computeTrade(t);
    if (filter.result !== "all" && !(filter.result === "win" ? c.realized > 0 : c.realized < 0)) continue;
    for (const e of c.exits) {
      if (inRange(e.date, lo, hi)) events.push({ date: e.date, pnl: e.pnl, tradeId: t.id });
    }
  }
  return events;
}

// date -> { pnl, count } where count = distinct trades realising that day
export function aggregateByDay(events) {
  const acc = new Map();
  for (const e of events) {
    let v = acc.get(e.date);
    if (!v) { v = { pnl: 0, ids: new Set() }; acc.set(e.date, v); }
    v.pnl += e.pnl;
    v.ids.add(e.tradeId);
  }
  const out = new Map();
  for (const [date, v] of acc) out.set(date, { pnl: v.pnl, count: v.ids.size });
  return out;
}
