/* ============================================================ *
 *  Pure aggregations for Reports → Breakdowns.
 *  Operate on the realised-event stream (realisedEvents): each exit
 *  is attributed to its OWN date, so partial trims count on the day
 *  they happened and totals tie out to the Calendar / equity curve.
 * ============================================================ */

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// trading-week order Mon..Fri first, weekend last
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];

// weekday of an ISO date, parsed as UTC so it never shifts by timezone
function weekday(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun .. 6=Sat
}

// net realised P&L / R / count by day-of-week, returned Mon..Sun
export function byDayOfWeek(events) {
  const acc = new Map(DOW_ORDER.map((i) => [i, { idx: i, label: WD[i], pnl: 0, r: 0, count: 0 }]));
  for (const e of events || []) {
    const v = acc.get(weekday(e.date));
    if (!v) continue;
    v.pnl += e.pnl;
    v.r += e.r || 0;
    v.count += 1;
  }
  return DOW_ORDER.map((i) => acc.get(i));
}
