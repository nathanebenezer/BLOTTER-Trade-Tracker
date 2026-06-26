import { useMemo, useState } from "react";
import { useStore } from "../store.jsx";
import { dayActivity } from "../lib/filter.js";
import { fInt, cls } from "../lib/format.js";

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const pad = (n) => String(n).padStart(2, "0");
const dayKey = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
// "2026-01-13" -> "Tue, Jan 13, 2026" (parsed as UTC so the date never shifts)
const dayLabel = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${WD[dt.getUTCDay()]}, ${MONTHS_SHORT[m - 1]} ${d}, ${y}`;
};
const daysInMonth = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
const firstWeekday = (y, m) => new Date(Date.UTC(y, m, 1)).getUTCDay();

// background tint by P&L magnitude relative to the largest |P&L| in view
function tint(pnl, maxAbs) {
  if (!pnl || !maxAbs) return "transparent";
  const a = (0.12 + 0.6 * Math.min(1, Math.abs(pnl) / maxAbs)).toFixed(3);
  return pnl > 0 ? `rgba(63,179,137,${a})` : `rgba(224,101,78,${a})`;
}
const money0 = (n) => (n > 0 ? "+" : n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");
const r1 = (n) => (n > 0 ? "+" : n < 0 ? "-" : "") + Math.abs(n).toFixed(1) + "R";

// whole-trade hold formatted as "Nd" (en-dash when no exit has happened yet)
const dur = (d) => (d == null ? "—" : `${d}d`);
// trade's relationship to the selected day → TraderVue's "Time" column
const dayStatus = (row) => (row.closed ? "closed" : row.opened ? "opened" : "adjusted");

export default function Calendar({ filter, onOpen }) {
  const { trades, tagGroups } = useStore();
  const setupName = useMemo(() => {
    const m = new Map();
    for (const tg of tagGroups?.setups || []) m.set(tg.id, tg.name);
    return m;
  }, [tagGroups]);
  const now = new Date();
  const [view, setView] = useState({ mode: "year", year: now.getFullYear(), month: now.getMonth() });
  const [selDay, setSelDay] = useState(null); // "YYYY-MM-DD" of the day whose executions are shown
  const [calMode, setCalMode] = useState("dollar"); // $ | R

  const byDay = useMemo(() => dayActivity(trades, filter), [trades, filter]);
  const selData = selDay ? byDay.get(selDay) : null;
  const openTrade = (id) => { const t = trades.find((x) => x.id === id); if (t) onOpen?.(t); };

  const metric = calMode === "r" ? "r" : "pnl"; // which dayActivity field to plot
  const fmtVal = calMode === "r" ? r1 : money0;
  const ModeToggle = (
    <div className="seg">
      <button className={calMode === "dollar" ? "on" : ""} onClick={() => setCalMode("dollar")}>$</button>
      <button className={calMode === "r" ? "on" : ""} onClick={() => setCalMode("r")}>R</button>
    </div>
  );

  /* ---------- year overview ---------- */
  const year = useMemo(() => {
    const months = [];
    let maxAbs = 0;
    for (let m = 0; m < 12; m++) {
      const dim = daysInMonth(view.year, m);
      const days = [];
      let total = 0, count = 0;
      for (let d = 1; d <= dim; d++) {
        const v = byDay.get(dayKey(view.year, m, d));
        const val = v?.[metric] || 0;
        total += val; count += v?.count || 0;
        if (Math.abs(val) > maxAbs) maxAbs = Math.abs(val);
        days.push({ d, val });
      }
      months.push({ m, total, count, days, lead: firstWeekday(view.year, m) });
    }
    return { months, maxAbs };
  }, [byDay, view.year, metric]);

  /* ---------- month drill-in ---------- */
  const month = useMemo(() => {
    const { year: y, month: m } = view;
    const dim = daysInMonth(y, m);
    const cells = [];
    for (let i = 0; i < firstWeekday(y, m); i++) cells.push(null);
    let maxAbs = 0;
    for (let d = 1; d <= dim; d++) {
      const v = byDay.get(dayKey(y, m, d));
      const val = v?.[metric] || 0;
      if (Math.abs(val) > maxAbs) maxAbs = Math.abs(val);
      cells.push({ d, val, count: v?.count || 0 });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) {
      const c = cells.slice(i, i + 7);
      weeks.push({ cells: c, val: c.reduce((a, x) => a + (x?.val || 0), 0), count: c.reduce((a, x) => a + (x?.count || 0), 0) });
    }
    const total = cells.reduce((a, x) => a + (x?.val || 0), 0);
    const count = cells.reduce((a, x) => a + (x?.count || 0), 0);
    return { weeks, total, count, maxAbs };
  }, [byDay, view.year, view.month, metric]);

  const stepMonth = (delta) => { setSelDay(null); setView((v) => {
    let m = v.month + delta, y = v.year;
    if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; }
    return { mode: "month", year: y, month: m };
  }); };

  if (view.mode === "year") {
    return (
      <div className="panel">
        <div className="head cal-head">
          <button className="btn sm" onClick={() => setView((v) => ({ ...v, year: v.year - 1 }))}>‹</button>
          <h2>{view.year}</h2>
          <button className="btn sm" onClick={() => setView((v) => ({ ...v, year: v.year + 1 }))}>›</button>
          <div className="spacer" style={{ flex: 1 }} />
          <span className="meta" style={{ marginRight: 8 }}>click a month to drill in</span>
          {ModeToggle}
        </div>
        <div className="body">
          <div className="cal-year">
            {year.months.map((mo) => (
              <button key={mo.m} className="cal-tile" onClick={() => setView({ mode: "month", year: view.year, month: mo.m })}>
                <div className="cal-tile-head">
                  <span className="cal-tile-name">{MONTHS_SHORT[mo.m]}</span>
                  <span className={"num " + cls(mo.total)}>{mo.count ? fmtVal(mo.total) : "—"}</span>
                </div>
                <div className="cal-mini">
                  {Array.from({ length: mo.lead }).map((_, i) => <span key={"b" + i} className="cal-mini-cell" style={{ background: "transparent" }} />)}
                  {mo.days.map((d) => (
                    <span key={d.d} className="cal-mini-cell" style={{ background: d.val ? tint(d.val, year.maxAbs) : "rgba(255,255,255,0.04)" }} />
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="panel">
      <div className="head cal-head">
        <button className="btn sm ghost" onClick={() => { setSelDay(null); setView((v) => ({ ...v, mode: "year" })); }}>← Year</button>
        <button className="btn sm" onClick={() => stepMonth(-1)}>‹</button>
        <h2>{MONTHS[view.month]} {view.year}</h2>
        <button className="btn sm" onClick={() => stepMonth(1)}>›</button>
        <div className="spacer" style={{ flex: 1 }} />
        <span className="meta" style={{ marginRight: 8 }}>
          Month <b className={"num " + cls(month.total)}>{fmtVal(month.total)}</b> · {fInt(month.count)} trade{month.count !== 1 ? "s" : ""}
        </span>
        {ModeToggle}
      </div>
      <div className="body">
        <div className="cal-month">
          <div className="cal-row cal-head-row">
            {WD.map((w) => <div key={w} className="cal-wd">{w}</div>)}
            <div className="cal-wd cal-wd-week">Week</div>
          </div>
          {month.weeks.map((wk, wi) => (
            <div key={wi} className="cal-row cal-week-row">
              {wk.cells.map((c, ci) => {
                const key = c ? dayKey(view.year, view.month, c.d) : null;
                const active = c && c.count > 0;
                return (
                <div
                  key={ci}
                  className={"cal-day" + (c ? "" : " empty") + (active ? " clickable" : "") + (key && key === selDay ? " selday" : "")}
                  style={{ background: c ? tint(c.val, month.maxAbs) : undefined }}
                  onClick={active ? () => setSelDay((s) => (s === key ? null : key)) : undefined}
                >
                  {c && (
                    <>
                      <span className="dnum">{c.d}</span>
                      {c.count > 0 && <>
                        <span className={"dpnl num " + cls(c.val)}>{fmtVal(c.val)}</span>
                        <span className="dcount">{c.count} trade{c.count !== 1 ? "s" : ""}</span>
                      </>}
                    </>
                  )}
                </div>
                );
              })}
              <div className="cal-week-total">
                {wk.count > 0 ? <>
                  <span className={"num " + cls(wk.val)}>{fmtVal(wk.val)}</span>
                  <span className="dcount">{wk.count} trade{wk.count !== 1 ? "s" : ""}</span>
                </> : <span className="dcount">—</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>

    {selData && (
      <div className="panel cal-day-panel">
        <div className="head">
          <h2>{dayLabel(selDay)}</h2>
          <span className="meta" style={{ marginRight: 8 }}>
            <b className={"num " + cls(selData[metric])}>{fmtVal(selData[metric])}</b> · {fInt(selData.count)} trade{selData.count !== 1 ? "s" : ""}
          </span>
          {ModeToggle}
          <div className="spacer" style={{ flex: 1 }} />
          <button className="btn sm ghost" onClick={() => setSelDay(null)}>Close</button>
        </div>
        <div className="body">
          <table className="blot cal-exec">
            <thead>
              <tr>
                <th className="l">Time</th><th className="l">Symbol</th><th>P&amp;L</th>
                <th className="l">Tags (Setups)</th><th className="l">Side</th>
                <th>Volume</th><th>Duration</th><th>Execs</th>
              </tr>
            </thead>
            <tbody>
              {selData.rows.map((row) => {
                const setups = row.setups.map((id) => setupName.get(id)).filter(Boolean);
                const st = dayStatus(row);
                return (
                <tr key={row.tradeId} onClick={() => openTrade(row.tradeId)}>
                  <td className="l"><span className={"daytime " + st}>{st}</span></td>
                  <td className="l"><b className="tick">{row.ticker}</b></td>
                  <td className={"num " + cls(row[metric])}>{fmtVal(row[metric])}</td>
                  <td className="l">{setups.length ? setups.map((n) => <span key={n} className="pill">{n}</span>) : <span className="muted">—</span>}</td>
                  <td className="l"><span className={"dir " + (row.direction === "short" ? "short" : "long")}>{row.direction === "short" ? "Short" : "Long"}</span></td>
                  <td className="num">{fInt(row.shares)}</td>
                  <td className="num">{dur(row.held)}</td>
                  <td className="num">{fInt(row.execs)}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    )}
    </>
  );
}
