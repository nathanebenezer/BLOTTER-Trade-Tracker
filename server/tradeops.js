/* ============================================================ *
 *  Pure helpers for bulk merge/split (no DB). Tested in
 *  test/tradeops.test.js.
 * ============================================================ */

// merge all trades' fills into one chronological list (date, then seq),
// with seq reindexed 0..n-1
export function combineFills(trades) {
  const all = [];
  for (const t of trades) for (const f of t.fills || []) all.push(f);
  all.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.seq ?? 0) - (b.seq ?? 0)));
  return all.map((f, i) => ({
    kind: f.kind, date: f.date, price: f.price, shares: f.shares,
    seq: i, source: f.source, nAmt: f.nAmt,
  }));
}

// a trade's fills → executions for reconstruct() (for Split). Sorted by
// date then seq so the reconstructed fills line up 1:1 with the originals.
export function fillsToExecutions(trade) {
  const long = (trade.direction || "long") !== "short";
  const fills = [...(trade.fills || [])].sort(
    (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.seq ?? 0) - (b.seq ?? 0))
  );
  return fills.map((f, i) => {
    const buy = (f.kind === "entry") === long; // long entry / short cover = buy
    const shares = f.shares;
    return {
      seq: i, date: f.date, symbol: (trade.ticker || "").toUpperCase(),
      side: buy ? "buy" : "sell", shares,
      signedQty: buy ? shares : -shares, price: f.price, nAmt: f.nAmt ?? null,
    };
  });
}

