/* ============================================================ *
 *  Report stats — pure computation over the filtered CLOSED set.
 *  Input: closed = [{ t, c }] where c is computeTrade() output.
 *  All metrics from BUILD_BRIEF §Reports. No DOM. Unit-tested.
 * ============================================================ */
const EPS = 1e-9;
const sum = (a) => a.reduce((x, y) => x + y, 0);
const mean = (a) => (a.length ? sum(a) / a.length : null);

export function computeStats(closed) {
  const n = closed.length;
  const realized = closed.map((o) => o.c.realized);
  const wins = closed.filter((o) => o.c.realized > EPS);
  const losses = closed.filter((o) => o.c.realized < -EPS);
  const scratches = closed.filter((o) => Math.abs(o.c.realized) <= EPS);

  const net = sum(realized);
  const grossWin = sum(wins.map((o) => o.c.realized));
  const grossLoss = sum(losses.map((o) => o.c.realized)); // ≤ 0

  const avgTrade = n ? net / n : null;
  const avgWin = wins.length ? grossWin / wins.length : null;
  const avgLoss = losses.length ? grossLoss / losses.length : null; // ≤ 0
  const decided = wins.length + losses.length;
  const winRate = decided ? wins.length / decided : null; // fraction 0..1
  const profitFactor = grossLoss !== 0 ? grossWin / Math.abs(grossLoss) : (grossWin > 0 ? Infinity : null);
  const payoff = (avgWin != null && avgLoss) ? avgWin / Math.abs(avgLoss) : null;

  const largestGain = wins.length ? Math.max(...wins.map((o) => o.c.realized)) : null;
  const largestLoss = losses.length ? Math.min(...losses.map((o) => o.c.realized)) : null;

  // R / expectancy
  const rVals = closed.map((o) => o.c.rMultiple).filter((v) => v != null);
  const avgR = mean(rVals);
  const expectancy = avgTrade;   // $ per trade
  const expectancyR = avgR;      // R per trade

  // holds (days)
  const heldOf = (arr) => arr.map((o) => o.c.held).filter((v) => v != null);
  const avgHold = mean(heldOf(closed));
  const avgHoldWin = mean(heldOf(wins));
  const avgHoldLoss = mean(heldOf(losses));
  const avgHoldScratch = mean(heldOf(scratches));

  // streaks (chronological by close date; scratch breaks both)
  const ordered = [...closed].sort((a, b) =>
    a.c.closeDate < b.c.closeDate ? -1 : a.c.closeDate > b.c.closeDate ? 1 : 0);
  let maxWinStreak = 0, maxLossStreak = 0, curWin = 0, curLoss = 0;
  for (const o of ordered) {
    const r = o.c.realized;
    if (r > EPS) { curWin++; curLoss = 0; }
    else if (r < -EPS) { curLoss++; curWin = 0; }
    else { curWin = 0; curLoss = 0; }
    if (curWin > maxWinStreak) maxWinStreak = curWin;
    if (curLoss > maxLossStreak) maxLossStreak = curLoss;
  }

  // dispersion — sample (N−1) std dev; SQN/Kelly guarded
  let stdDev = null;
  if (n >= 2) {
    const m = net / n;
    stdDev = Math.sqrt(sum(realized.map((x) => (x - m) ** 2)) / (n - 1));
  }
  const sqn = (n >= 2 && stdDev > EPS) ? (avgTrade / stdDev) * Math.sqrt(n) : null;
  const kelly = (winRate != null && payoff != null && payoff > 0)
    ? winRate - (1 - winRate) / payoff : null;

  return {
    n, net, avgTrade,
    nWins: wins.length, nLosses: losses.length, nScratch: scratches.length,
    winRate, grossWin, grossLoss,
    avgWin, avgLoss, payoff, profitFactor,
    largestGain, largestLoss,
    expectancy, expectancyR, avgR,
    avgHold, avgHoldWin, avgHoldLoss, avgHoldScratch,
    maxWinStreak, maxLossStreak,
    stdDev, sqn, kelly,
  };
}
