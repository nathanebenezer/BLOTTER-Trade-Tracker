import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store.jsx";
import { selectedClosed, openPositions, TAG_GROUPS } from "../lib/filter.js";
import { sortRows } from "../lib/sort.js";
import { useSort } from "../lib/useSort.js";
import SortTh from "../components/SortTh.jsx";
import BulkBar from "../components/BulkBar.jsx";
import { fMoney, fNum, fInt, fPct, fR, cls, today, daysBetween } from "../lib/format.js";

// page numbers with ellipsis windowing (1 … 4 5 6 … 12)
function pageList(cur, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out = [1];
  const lo = Math.max(2, cur - 1), hi = Math.min(total - 1, cur + 1);
  if (lo > 2) out.push("…");
  for (let i = lo; i <= hi; i++) out.push(i);
  if (hi < total - 1) out.push("…");
  out.push(total);
  return out;
}

function fillsBadge(t) {
  const fills = t.fills || [];
  const maxSh = Math.max(1, ...fills.map((f) => f.shares || 0));
  const bars = fills.map((f, i) => (
    <i key={i} className={f.kind === "entry" ? "e" : "x"} style={{ height: Math.max(4, Math.round((f.shares / maxSh) * 16)) }} />
  ));
  const e = fills.filter((f) => f.kind === "entry").length;
  const x = fills.filter((f) => f.kind === "exit").length;
  return <span className="ladder" title={`${e} in · ${x} out`}>{bars}</span>;
}

const openAcc = (o, k) => ({
  ticker: o.t.ticker, avgEntry: o.c.avgIn, shares: o.c.remaining, realised: o.c.realized,
  status: o.c.status, openDate: o.c.openDate,
  held: o.c.openDate ? daysBetween(o.c.openDate, today()) : null,
}[k]);
const closedAcc = (o, k) => ({
  closeDate: o.c.closeDate, openDate: o.c.openDate, ticker: o.t.ticker,
  avgIn: o.c.avgIn, avgOut: o.c.avgOut, shares: o.c.exitedShares, realised: o.c.realized,
  pct: o.c.realizedPct, r: o.c.rMultiple, held: o.c.held,
}[k]);

export default function Trades({ filter, onOpen }) {
  const { trades, tagGroups } = useStore();

  const nameOf = useMemo(() => {
    const m = new Map();
    for (const g of TAG_GROUPS) for (const tg of tagGroups?.[g] || []) m.set(tg.id, tg.name);
    return m;
  }, [tagGroups]);

  const tagPills = (t) => {
    const ids = TAG_GROUPS.flatMap((g) => t.tags?.[g] || []);
    if (!ids.length) return <span style={{ color: "var(--txt-3)" }}>—</span>;
    return (
      <>
        {ids.slice(0, 3).map((id) => <span key={id} className="pill">{nameOf.get(id) || "?"}</span>)}
        {ids.length > 3 && <span className="pill">+{ids.length - 3}</span>}
      </>
    );
  };

  const openSort = useSort("openDate", "desc");
  const closedSort = useSort("closeDate", "desc");

  const open = sortRows(openPositions(trades, filter), openAcc, openSort.sort);
  const closed = sortRows(selectedClosed(trades, filter), closedAcc, closedSort.sort);

  // ---- pagination: closed table only ----
  const [pageSize, setPageSize] = useState(30);
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [filter, pageSize]);

  const n = closed.length;
  const pageCount = Math.max(1, Math.ceil(n / pageSize));
  const cur = Math.min(page, pageCount);
  const pageRows = closed.slice((cur - 1) * pageSize, cur * pageSize);

  // ---- bulk selection (shared across both tables) ----
  const [selected, setSelected] = useState(() => new Set());
  useEffect(() => { setSelected(new Set()); }, [filter]); // reset on filter change
  const toggle = (id) => setSelected((s) => { const m = new Set(s); m.has(id) ? m.delete(id) : m.add(id); return m; });
  const setMany = (ids, on) => setSelected((s) => { const m = new Set(s); ids.forEach((id) => (on ? m.add(id) : m.delete(id))); return m; });
  const clearSel = () => setSelected(new Set());

  const allMatchingIds = useMemo(() => [...open.map((o) => o.t.id), ...closed.map((o) => o.t.id)], [open, closed]);
  const openIds = open.map((o) => o.t.id);
  const pageIds = pageRows.map((o) => o.t.id);
  const allOpenSel = openIds.length > 0 && openIds.every((id) => selected.has(id));
  const allPageSel = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  // footer totals span the WHOLE filtered set
  const totalRealized = closed.reduce((a, o) => a + o.c.realized, 0);
  const totalShares = closed.reduce((a, o) => a + o.c.exitedShares, 0);
  const avgRealized = n ? totalRealized / n : 0;
  const avgShares = n ? totalShares / n : 0;
  const avg = (vals) => (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null);
  const avgR = avg(closed.map((o) => o.c.rMultiple).filter((v) => v != null));
  const avgPct = avg(closed.map((o) => o.c.realizedPct).filter((v) => v != null));
  const avgHeldRaw = avg(closed.map((o) => o.c.held).filter((v) => v != null));
  const avgHeld = avgHeldRaw == null ? null : Math.round(avgHeldRaw);

  const openShares = open.reduce((a, o) => a + o.c.remaining, 0);
  const openRealized = open.reduce((a, o) => a + o.c.realized, 0);

  const Chk = ({ checked, onChange, header }) => (
    <td className="chk" onClick={(e) => e.stopPropagation()}>
      <input type="checkbox" checked={checked} onChange={onChange} />
    </td>
  );

  return (
    <>
      {selected.size > 0 && (
        <BulkBar
          selectedIds={[...selected]}
          totalMatching={allMatchingIds.length}
          onSelectAll={() => setSelected(new Set(allMatchingIds))}
          onClear={clearSel}
        />
      )}

      {open.length > 0 && (
        <div className="panel">
          <div className="head">
            <h2>Open positions</h2>
            <span className="meta">{open.length} active</span>
          </div>
          <div className="body" style={{ overflowX: "auto" }}>
            <table className="blot">
              <thead>
                <tr>
                  <th className="chk"><input type="checkbox" checked={allOpenSel} onChange={() => setMany(openIds, !allOpenSel)} /></th>
                  <SortTh className="l" label="Ticker" k="ticker" {...openSort} />
                  <th className="l">Tags</th>
                  <SortTh label="Avg entry" k="avgEntry" {...openSort} />
                  <SortTh label="Shares" k="shares" {...openSort} />
                  <SortTh label="Realised" k="realised" {...openSort} />
                  <SortTh label="Status" k="status" {...openSort} />
                  <SortTh label="Opened" k="openDate" {...openSort} />
                  <SortTh label="Held" k="held" {...openSort} />
                </tr>
              </thead>
              <tbody>
                {open.map(({ t, c }) => (
                  <tr key={t.id} onClick={() => onOpen(t)} className={selected.has(t.id) ? "sel-row" : ""}>
                    <Chk checked={selected.has(t.id)} onChange={() => toggle(t.id)} />
                    <td className="l">
                      <span className="tick">{t.ticker || "—"}</span>{" "}
                      <span className={"dir " + (c.dirLong ? "long" : "short")}>{c.dirLong ? "L" : "S"}</span>
                    </td>
                    <td className="l">{tagPills(t)}</td>
                    <td className="num">{fNum(c.avgIn)}</td>
                    <td className="num">{fInt(c.remaining)}</td>
                    <td className={"num " + cls(c.realized)}>{c.exitedShares > 0 ? fMoney(c.realized, true) : "—"}</td>
                    <td><span className={"status " + c.status}>{c.status}</span></td>
                    <td className="num" style={{ color: "var(--txt-2)" }}>{c.openDate || "—"}</td>
                    <td className="num" style={{ color: "var(--txt-2)" }}>{c.openDate ? daysBetween(c.openDate, today()) + "d" : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="tfoot-total">
                  <td></td>
                  <td className="l" colSpan={2}>TOTAL <span className="tfoot-sub">{open.length} open</span></td>
                  <td></td>
                  <td className="num">{fInt(openShares)}</td>
                  <td className={"num " + cls(openRealized)}>{openRealized !== 0 ? fMoney(openRealized, true) : "—"}</td>
                  <td></td><td></td><td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="head">
          <h2>Closed trades</h2>
          <span className="meta">{n ? `${n} closed` : ""}</span>
        </div>
        <div className="body" style={{ overflowX: "auto" }}>
          <table className="blot">
            <thead>
              <tr>
                <th className="chk"><input type="checkbox" checked={allPageSel} onChange={() => setMany(pageIds, !allPageSel)} /></th>
                <SortTh className="l" label="Closed" k="closeDate" {...closedSort} />
                <SortTh className="l" label="Opened" k="openDate" {...closedSort} />
                <SortTh className="l" label="Ticker" k="ticker" {...closedSort} />
                <th className="l">Tags</th>
                <SortTh label="Avg in" k="avgIn" {...closedSort} />
                <SortTh label="Avg out" k="avgOut" {...closedSort} />
                <SortTh label="Shares" k="shares" {...closedSort} />
                <th>Fills</th>
                <SortTh label="Realised" k="realised" {...closedSort} />
                <SortTh label="%" k="pct" {...closedSort} />
                <SortTh label="R" k="r" {...closedSort} />
                <SortTh label="Held" k="held" {...closedSort} />
              </tr>
            </thead>
            <tbody>
              {n === 0 ? (
                <tr>
                  <td colSpan={13}>
                    <div className="empty">
                      <b>No closed trades here yet</b>
                      Adjust the filter, or log a trade and close it out.
                    </div>
                  </td>
                </tr>
              ) : (
                pageRows.map(({ t, c }) => (
                  <tr key={t.id} onClick={() => onOpen(t)} className={selected.has(t.id) ? "sel-row" : ""}>
                    <Chk checked={selected.has(t.id)} onChange={() => toggle(t.id)} />
                    <td className="l num" style={{ color: "var(--txt-2)" }}>{c.closeDate}</td>
                    <td className="l num" style={{ color: "var(--txt-2)" }}>{c.openDate || "—"}</td>
                    <td className="l">
                      <span className="tick">{t.ticker || "—"}</span>{" "}
                      <span className={"dir " + (c.dirLong ? "long" : "short")}>{c.dirLong ? "L" : "S"}</span>
                    </td>
                    <td className="l">{tagPills(t)}</td>
                    <td className="num">{fNum(c.avgIn)}</td>
                    <td className="num">{fNum(c.avgOut)}</td>
                    <td className="num">{fInt(c.exitedShares)}</td>
                    <td>{fillsBadge(t)}</td>
                    <td className={"num " + cls(c.realized)}>{fMoney(c.realized, true)}</td>
                    <td className={"num " + cls(c.realizedPct)}>{fPct(c.realizedPct)}</td>
                    <td className={"num " + cls(c.rMultiple)}>{fR(c.rMultiple)}</td>
                    <td className="num" style={{ color: "var(--txt-2)" }}>{c.held == null ? "—" : c.held + "d"}</td>
                  </tr>
                ))
              )}
            </tbody>
            {n > 0 && (
              <tfoot>
                <tr className="tfoot-total">
                  <td></td>
                  <td className="l" colSpan={4}>TOTAL <span className="tfoot-sub">{n} trade{n !== 1 ? "s" : ""}</span></td>
                  <td></td><td></td>
                  <td className="num">{fInt(totalShares)}</td>
                  <td></td>
                  <td className={"num " + cls(totalRealized)}>{fMoney(totalRealized, true)}</td>
                  <td></td><td></td><td></td>
                </tr>
                <tr className="tfoot-avg">
                  <td></td>
                  <td className="l" colSpan={4}>AVERAGE</td>
                  <td></td><td></td>
                  <td className="num">{fInt(avgShares)}</td>
                  <td></td>
                  <td className={"num " + cls(avgRealized)}>{fMoney(avgRealized, true)}</td>
                  <td className={"num " + cls(avgPct)}>{fPct(avgPct)}</td>
                  <td className={"num " + cls(avgR)}>{fR(avgR)}</td>
                  <td className="num" style={{ color: "var(--txt-2)" }}>{avgHeld == null ? "—" : avgHeld + "d"}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {n > 0 && (
          <div className="tablebar">
            <div className="pager">
              {pageCount > 1 && (
                <>
                  <button className="pbtn" disabled={cur === 1} onClick={() => setPage(cur - 1)}>‹</button>
                  {pageList(cur, pageCount).map((p, i) =>
                    p === "…"
                      ? <span key={"e" + i} className="pell">…</span>
                      : <button key={p} className={"pbtn" + (p === cur ? " on" : "")} onClick={() => setPage(p)}>{p}</button>
                  )}
                  <button className="pbtn" disabled={cur === pageCount} onClick={() => setPage(cur + 1)}>›</button>
                </>
              )}
            </div>
            <label className="showrec">
              Show records
              <select className="fsel" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                <option value={30}>30</option>
                <option value={60}>60</option>
                <option value={100}>100</option>
              </select>
            </label>
          </div>
        )}
      </div>
    </>
  );
}
