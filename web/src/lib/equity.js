/* ============================================================ *
 *  Realised equity series — pure. Every exit from the filtered
 *  closed set is attributed to its OWN date, then cumulated.
 *  (A trade scaled out over a week contributes on each day.)
 *  $ mode starts at the equity baseline; R mode is cumulative R.
 *  Ported from blotter.html equitySeries().
 * ============================================================ */
const dayBefore = (iso) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

export function equitySeries(closed, { mode = "dollar", baseline = 0 } = {}) {
  const events = [];
  for (const o of closed) {
    for (const e of o.c.exits) {
      const rUnit = o.c.risk && o.c.risk > 0 ? e.pnl / o.c.risk : 0;
      events.push({ date: e.date, pnl: e.pnl, r: rUnit });
    }
  }

  // aggregate per day
  const byDay = new Map();
  for (const e of events) {
    const v = byDay.get(e.date) || { pnl: 0, r: 0 };
    v.pnl += e.pnl; v.r += e.r; byDay.set(e.date, v);
  }

  const dates = [...byDay.keys()].sort();
  const dollar = mode === "dollar";
  const base = dollar ? Number(baseline || 0) : 0;
  let cum = 0, cumR = 0;
  const pts = [];
  // anchor at the starting equity (baseline, or 0R) the day before the first
  // exit, so the curve visibly begins at the baseline and moves from there
  // rather than starting at the first day's cumulative P&L.
  if (dates.length) pts.push({ date: dayBefore(dates[0]), val: base, anchor: true });
  for (const d of dates) {
    const v = byDay.get(d);
    cum += v.pnl; cumR += v.r;
    pts.push({ date: d, val: dollar ? base + cum : cumR });
  }
  return { pts, base, net: dollar ? cum : cumR, days: dates.length };
}
