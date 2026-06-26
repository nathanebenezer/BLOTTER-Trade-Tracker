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

const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// net realised P&L / R / count by month (Jan..Dec) of a given calendar year
export function byMonth(events, year) {
  const rows = MO.map((label, m) => ({ month: m, label, pnl: 0, r: 0, count: 0 }));
  for (const e of events || []) {
    const y = Number(e.date.slice(0, 4));
    if (y !== year) continue;
    const m = Number(e.date.slice(5, 7)) - 1;
    if (m < 0 || m > 11) continue;
    rows[m].pnl += e.pnl;
    rows[m].r += e.r || 0;
    rows[m].count += 1;
  }
  return rows;
}

// distinct years present in the event stream, ascending
export function eventYears(events) {
  const s = new Set();
  for (const e of events || []) s.add(Number(e.date.slice(0, 4)));
  return [...s].sort((a, b) => a - b);
}

// a "nice" round bucket width (1/2/5 × 10^n) for ~target buckets across a range
function niceStep(range, target = 10) {
  const raw = (range || 1) / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
}

/* Outcome distribution — ONE data point per closed trade (its total realised
   $ or R), bucketed into nice fixed-width bins. Bins align to a multiple of the
   width so zero is always a bin EDGE → every bin is cleanly a win or loss bin.
   `closed` is the selectedClosed array ({ t, c } with c = computeTrade()).
   In R mode, trades with no risk (rMultiple == null) are skipped + counted. */
export function tradeHistogram(closed, mode = "dollar") {
  const isR = mode === "r";
  const vals = [];
  let skipped = 0;
  for (const o of closed || []) {
    const v = isR ? o.c.rMultiple : o.c.realized;
    if (v == null || isNaN(v)) { skipped++; continue; }
    vals.push(v);
  }
  if (!vals.length) return { bins: [], skipped, total: 0, width: 0 };

  const min = Math.min(...vals), max = Math.max(...vals);
  const width = niceStep((max - min) || Math.abs(max) || 1);
  const start = Math.floor(min / width) * width;
  let nb = Math.max(1, Math.ceil((max - start) / width));
  if (start + nb * width <= max + 1e-9) nb++;

  const bins = Array.from({ length: nb }, (_, i) => {
    const lo = start + i * width;
    return { lo, hi: lo + width, mid: lo + width / 2, count: 0 };
  });
  for (const v of vals) {
    let i = Math.floor((v - start) / width);
    if (i < 0) i = 0; else if (i >= nb) i = nb - 1;
    bins[i].count++;
  }
  return { bins, skipped, total: vals.length, width };
}
