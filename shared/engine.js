/* ============================================================ *
 *  Blotter accounting engine — ISOMORPHIC (Node + browser).
 *
 *  computeTrade is ported VERBATIM from the verified reference
 *  (blotter.html). DO NOT change the math here — it is covered by
 *  the acceptance tests in test/engine.test.js and is the single
 *  source of truth used by BOTH the server and the React client.
 *
 *  Pure JS, no DOM, no I/O. ESM so Node, node:test, and Vite can
 *  all import it unchanged.
 *
 *  Input shape:
 *    {
 *      direction: "long" | "short",
 *      stop:         number | "" | null,
 *      riskOverride: number | "" | null,
 *      fills: [ { kind:"entry"|"exit", date:"YYYY-MM-DD",
 *                 price:number, shares:number, seq?:number } ]
 *    }
 *  Fills should be supplied in seq order; the sort below is stable
 *  on the array index, so seq order == chronological tie-break.
 * ============================================================ */

export function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

export function computeTrade(t) {
  const dirLong = t.direction !== "short";
  // chronological, stable by seq
  const fills = [...(t.fills || [])].map((f, i) => ({ ...f, _i: i }))
    .filter(f => f.date && f.price != null && f.shares != null && f.shares > 0)
    .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a._i - b._i);

  let openSh = 0, basis = 0, realized = 0;
  let entSh = 0, entVal = 0, exSh = 0, exVal = 0;
  let firstEntry = null, lastExitDate = null;
  const exits = []; // {date, pnl, shares, price}
  let overSold = false;

  for (const f of fills) {
    if (f.kind === "entry") {
      if (!firstEntry) firstEntry = f;
      openSh += f.shares; basis += f.shares * f.price;
      entSh += f.shares; entVal += f.shares * f.price;
    } else { // exit
      const sh = Math.min(f.shares, openSh);
      if (f.shares > openSh + 1e-9) overSold = true;
      if (sh > 0) {
        const avgCost = openSh > 0 ? basis / openSh : 0;
        const pnl = dirLong ? (f.price - avgCost) * sh : (avgCost - f.price) * sh;
        realized += pnl;
        basis -= avgCost * sh; openSh -= sh;
        exits.push({ date: f.date, pnl, shares: sh, price: f.price });
        lastExitDate = f.date;
      }
      exSh += f.shares;            // requested exit shares (for avg-out display)
      exVal += f.price * f.shares;
    }
  }
  const avgIn = entSh > 0 ? entVal / entSh : null;
  const avgOut = exSh > 0 ? exVal / exSh : null;
  const remaining = openSh;
  const status = exits.length === 0 ? "open" : (remaining > 1e-9 ? "partial" : "closed");

  // realised % on the exited capital
  const exitedShares = exits.reduce((a, e) => a + e.shares, 0);
  const costExited = avgIn != null ? avgIn * exitedShares : null;
  const realizedPct = costExited ? (realized / costExited) * 100 : null;

  // planned risk → R
  let risk = null;
  if (t.riskOverride != null && t.riskOverride !== "" && !isNaN(t.riskOverride) && Number(t.riskOverride) > 0) {
    risk = Number(t.riskOverride);
  } else if (t.stop != null && t.stop !== "" && firstEntry) {
    const perShare = dirLong ? (firstEntry.price - Number(t.stop)) : (Number(t.stop) - firstEntry.price);
    if (perShare > 0) risk = perShare * firstEntry.shares;
  }
  const rMultiple = (risk && risk > 0) ? realized / risk : null;

  const openDate = firstEntry ? firstEntry.date : null;
  const closeDate = status === "closed" ? lastExitDate : null;
  const held = (openDate && lastExitDate) ? Math.max(0, daysBetween(openDate, lastExitDate)) : null;

  return {
    dirLong, avgIn, avgOut, remaining, entSh, exitedShares, status, realized, realizedPct,
    risk, rMultiple, exits, openDate, lastExitDate, closeDate, held, firstEntry, overSold
  };
}
