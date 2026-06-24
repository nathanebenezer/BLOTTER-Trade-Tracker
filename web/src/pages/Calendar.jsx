import { useMemo, useState } from "react";
import { useStore } from "../store.jsx";
import { realisedEvents, aggregateByDay } from "../lib/filter.js";
import { fMoney, fInt, cls } from "../lib/format.js";

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const pad = (n) => String(n).padStart(2, "0");
const dayKey = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const daysInMonth = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
const firstWeekday = (y, m) => new Date(Date.UTC(y, m, 1)).getUTCDay();

// background tint by P&L magnitude relative to the largest |P&L| in view
function tint(pnl, maxAbs) {
  if (!pnl || !maxAbs) return "transparent";
  const a = (0.12 + 0.6 * Math.min(1, Math.abs(pnl) / maxAbs)).toFixed(3);
  return pnl > 0 ? `rgba(63,179,137,${a})` : `rgba(224,101,78,${a})`;
}
const money0 = (n) => (n > 0 ? "+" : n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");

export default function Calendar({ filter }) {
  const { trades } = useStore();
  const now = new Date();
  const [view, setView] = useState({ mode: "year", year: now.getFullYear(), month: now.getMonth() });

  const byDay = useMemo(() => aggregateByDay(realisedEvents(trades, filter)), [trades, filter]);

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
        const pnl = v?.pnl || 0;
        total += pnl; count += v?.count || 0;
        if (Math.abs(pnl) > maxAbs) maxAbs = Math.abs(pnl);
        days.push({ d, pnl });
      }
      months.push({ m, total, count, days, lead: firstWeekday(view.year, m) });
    }
    return { months, maxAbs };
  }, [byDay, view.year]);

  /* ---------- month drill-in ---------- */
  const month = useMemo(() => {
    const { year: y, month: m } = view;
    const dim = daysInMonth(y, m);
    const cells = [];
    for (let i = 0; i < firstWeekday(y, m); i++) cells.push(null);
    let maxAbs = 0;
    for (let d = 1; d <= dim; d++) {
      const v = byDay.get(dayKey(y, m, d));
      const pnl = v?.pnl || 0;
      if (Math.abs(pnl) > maxAbs) maxAbs = Math.abs(pnl);
      cells.push({ d, pnl, count: v?.count || 0 });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) {
      const c = cells.slice(i, i + 7);
      weeks.push({ cells: c, pnl: c.reduce((a, x) => a + (x?.pnl || 0), 0), count: c.reduce((a, x) => a + (x?.count || 0), 0) });
    }
    const total = cells.reduce((a, x) => a + (x?.pnl || 0), 0);
    const count = cells.reduce((a, x) => a + (x?.count || 0), 0);
    return { weeks, total, count, maxAbs };
  }, [byDay, view.year, view.month]);

  const stepMonth = (delta) => setView((v) => {
    let m = v.month + delta, y = v.year;
    if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; }
    return { mode: "month", year: y, month: m };
  });

  if (view.mode === "year") {
    return (
      <div className="panel">
        <div className="head cal-head">
          <button className="btn sm" onClick={() => setView((v) => ({ ...v, year: v.year - 1 }))}>‹</button>
          <h2>{view.year}</h2>
          <button className="btn sm" onClick={() => setView((v) => ({ ...v, year: v.year + 1 }))}>›</button>
          <div className="spacer" style={{ flex: 1 }} />
          <span className="meta">click a month to drill in</span>
        </div>
        <div className="body">
          <div className="cal-year">
            {year.months.map((mo) => (
              <button key={mo.m} className="cal-tile" onClick={() => setView({ mode: "month", year: view.year, month: mo.m })}>
                <div className="cal-tile-head">
                  <span className="cal-tile-name">{MONTHS_SHORT[mo.m]}</span>
                  <span className={"num " + cls(mo.total)}>{mo.count ? money0(mo.total) : "—"}</span>
                </div>
                <div className="cal-mini">
                  {Array.from({ length: mo.lead }).map((_, i) => <span key={"b" + i} className="cal-mini-cell" style={{ background: "transparent" }} />)}
                  {mo.days.map((d) => (
                    <span key={d.d} className="cal-mini-cell" style={{ background: d.pnl ? tint(d.pnl, year.maxAbs) : "rgba(255,255,255,0.04)" }} />
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
    <div className="panel">
      <div className="head cal-head">
        <button className="btn sm ghost" onClick={() => setView((v) => ({ ...v, mode: "year" }))}>← Year</button>
        <button className="btn sm" onClick={() => stepMonth(-1)}>‹</button>
        <h2>{MONTHS[view.month]} {view.year}</h2>
        <button className="btn sm" onClick={() => stepMonth(1)}>›</button>
        <div className="spacer" style={{ flex: 1 }} />
        <span className="meta">
          Month <b className={"num " + cls(month.total)}>{fMoney(month.total, true)}</b> · {fInt(month.count)} trade{month.count !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="body">
        <div className="cal-month">
          <div className="cal-row cal-head-row">
            {WD.map((w) => <div key={w} className="cal-wd">{w}</div>)}
            <div className="cal-wd cal-wd-week">Week</div>
          </div>
          {month.weeks.map((wk, wi) => (
            <div key={wi} className="cal-row cal-week-row">
              {wk.cells.map((c, ci) => (
                <div key={ci} className={"cal-day" + (c ? "" : " empty")} style={{ background: c ? tint(c.pnl, month.maxAbs) : undefined }}>
                  {c && (
                    <>
                      <span className="dnum">{c.d}</span>
                      {c.count > 0 && <>
                        <span className={"dpnl num " + cls(c.pnl)}>{money0(c.pnl)}</span>
                        <span className="dcount">{c.count} trade{c.count !== 1 ? "s" : ""}</span>
                      </>}
                    </>
                  )}
                </div>
              ))}
              <div className="cal-week-total">
                {wk.count > 0 ? <>
                  <span className={"num " + cls(wk.pnl)}>{money0(wk.pnl)}</span>
                  <span className="dcount">{wk.count} trade{wk.count !== 1 ? "s" : ""}</span>
                </> : <span className="dcount">—</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
