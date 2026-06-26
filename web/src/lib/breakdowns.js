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

/* Per-trade gain/loss sequence — ONE bar per closed trade, ordered by close
   date (trade #1 = earliest closed), height = that whole trade's total realised
   $ or R. Lets you eyeball the distribution of wins/losses over time.
   `closed` is the selectedClosed array ({ t, c } with c = computeTrade()).
   In R mode, trades with no risk (rMultiple == null) are skipped + counted. */
export function tradeSequence(closed, mode = "dollar") {
  const isR = mode === "r";
  const ordered = [...(closed || [])].sort((a, b) => {
    const da = a.c.closeDate || "", db = b.c.closeDate || "";
    return da < db ? -1 : da > db ? 1 : 0;
  });
  const bars = [];
  let skipped = 0;
  for (const o of ordered) {
    const v = isR ? o.c.rMultiple : o.c.realized;
    if (isR && (v == null || isNaN(v))) { skipped++; continue; }
    bars.push({ n: bars.length + 1, value: v ?? 0, ticker: o.t.ticker, date: o.c.closeDate });
  }
  return { bars, skipped, total: bars.length };
}
