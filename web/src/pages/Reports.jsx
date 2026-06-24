import { useState } from "react";
import { useStore } from "../store.jsx";
import { selectedClosed, realisedEvents } from "../lib/filter.js";
import { computeStats } from "../lib/stats.js";
import { equitySeries } from "../lib/equity.js";
import EquityChart from "../components/EquityChart.jsx";
import TagBreakdown from "../components/TagBreakdown.jsx";
import { fMoney, fInt, fR, cls } from "../lib/format.js";

const days = (x) => (x == null ? "—" : Math.round(x) + "d");

function Card({ k, v, vc, sub }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className={"v num " + (vc || "")}>{v}</div>
      {sub != null && <div className="sub">{sub}</div>}
    </div>
  );
}

export default function Reports({ filter }) {
  const { trades, meta, tagGroups } = useStore();
  const [tab, setTab] = useState("detailed");   // detailed | tags
  const [eqMode, setEqMode] = useState("dollar");
  const [eqScope, setEqScope] = useState("all"); // all | closed

  const closed = selectedClosed(trades, filter);
  const s = computeStats(closed);
  const allEvents = realisedEvents(trades, filter);
  const events = eqScope === "all" ? allEvents : allEvents.filter((e) => e.closed);
  const series = equitySeries(events, { mode: eqMode, baseline: meta?.equity_baseline || 0 });

  if (s.n === 0 && allEvents.length === 0) {
    return (
      <div className="pagestub">
        <b>No realised trades in this period</b>
        Adjust the filter above, or log and exit a trade on the Trades page.
      </div>
    );
  }

  const pf = s.profitFactor;
  const grid = (
    <div className="stats">
      <Card k="Net realised" v={fMoney(s.net, true)} vc={cls(s.net)} sub={`${s.n} closed`} />
      <Card k="Win rate" v={s.winRate == null ? "—" : (s.winRate * 100).toFixed(0) + "%"} sub={`${s.nWins}W · ${s.nLosses}L · ${s.nScratch} scr`} />
      <Card k="Profit factor" v={pf == null ? "—" : pf === Infinity ? "∞" : pf.toFixed(2)} vc={pf != null && pf >= 1 ? "pos" : pf != null ? "neg" : ""} />
      <Card k="Expectancy" v={fMoney(s.expectancy, true)} vc={cls(s.expectancy)} sub={s.expectancyR != null ? `${fR(s.expectancyR)} / trade` : "per trade"} />
      <Card k="Avg R" v={fR(s.avgR)} vc={cls(s.avgR)} sub={s.avgR == null ? "set a stop" : ""} />
      <Card k="Payoff" v={s.payoff == null ? "—" : s.payoff.toFixed(2) + "×"} sub="avg win ÷ loss" />
      <Card k="Avg trade" v={fMoney(s.avgTrade, true)} vc={cls(s.avgTrade)} />
      <Card k="Avg winner" v={fMoney(s.avgWin)} vc="pos" />
      <Card k="Avg loser" v={fMoney(s.avgLoss)} vc="neg" />
      <Card k="Largest gain" v={fMoney(s.largestGain)} vc="pos" />
      <Card k="Largest loss" v={fMoney(s.largestLoss)} vc="neg" />
      <Card k="Avg hold" v={days(s.avgHold)} sub={`W ${days(s.avgHoldWin)} · L ${days(s.avgHoldLoss)} · S ${days(s.avgHoldScratch)}`} />
      <Card k="Max consec W" v={fInt(s.maxWinStreak)} vc="pos" />
      <Card k="Max consec L" v={fInt(s.maxLossStreak)} vc="neg" />
      <Card k="P&L std dev" v={s.stdDev == null ? "—" : fMoney(s.stdDev)} />
      <Card k="SQN" v={s.sqn == null ? "—" : s.sqn.toFixed(2)} vc={s.sqn == null ? "" : s.sqn > 0 ? "pos" : "neg"} sub="system quality" />
      <Card k="Kelly %" v={s.kelly == null ? "—" : (s.kelly * 100).toFixed(0) + "%"} vc={cls(s.kelly)} sub="suggested size" />
    </div>
  );

  return (
    <>
      <div className="seg" style={{ display: "inline-flex", marginBottom: 16 }}>
        <button className={tab === "detailed" ? "on" : ""} onClick={() => setTab("detailed")}>Detailed</button>
        <button className={tab === "tags" ? "on" : ""} onClick={() => setTab("tags")}>Tags</button>
      </div>

      {tab === "detailed" ? (
        <>
          {s.n > 0 ? grid : (
            <div className="pagestub" style={{ marginBottom: 18, padding: "26px 20px" }}>
              <b>No closed trades in range</b>
              The stat grid needs at least one closed trade — realised P&L from open positions still plots on the curve below.
            </div>
          )}

          <div className="panel">
            <div className="head">
              <h2>Realised equity curve</h2>
              <span className="meta">
                {series.days} day{series.days !== 1 ? "s" : ""} · net{" "}
                <span className={"num " + cls(series.net)}>{eqMode === "dollar" ? fMoney(series.net, true) : fR(series.net)}</span>
              </span>
              <div className="spacer" style={{ flex: 1 }} />
              <div className="seg" style={{ marginRight: 8 }}>
                <button className={eqScope === "all" ? "on" : ""} onClick={() => setEqScope("all")}>All realised</button>
                <button className={eqScope === "closed" ? "on" : ""} onClick={() => setEqScope("closed")}>Closed only</button>
              </div>
              <div className="seg">
                <button className={eqMode === "dollar" ? "on" : ""} onClick={() => setEqMode("dollar")}>$</button>
                <button className={eqMode === "r" ? "on" : ""} onClick={() => setEqMode("r")}>R</button>
              </div>
            </div>
            <div className="body">
              <EquityChart series={series} mode={eqMode} />
            </div>
          </div>
        </>
      ) : (
        <TagBreakdown closed={closed} tagGroups={tagGroups} />
      )}
    </>
  );
}
