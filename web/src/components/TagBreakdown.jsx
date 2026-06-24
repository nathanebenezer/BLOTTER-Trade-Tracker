import { useMemo, useState } from "react";
import { tagBreakdown } from "../lib/tagstats.js";
import { sortRows } from "../lib/sort.js";
import { useSort } from "../lib/useSort.js";
import SortTh from "./SortTh.jsx";
import { fMoney, fInt, cls } from "../lib/format.js";

const GROUP_LABEL = { setups: "Setup", tactics: "Tactic", mistakes: "Mistake", edges: "Edge", "": "—" };
const pf = (v) => (v == null ? "—" : v === Infinity ? "∞" : v.toFixed(2));
const winPct = (v) => (v == null ? "—" : (v * 100).toFixed(0) + "%");

const acc = (r, k) => r[k];

export default function TagBreakdown({ closed, tagGroups }) {
  const [mode, setMode] = useState("tag"); // tag | combo
  const { sort, onSort } = useSort("net", "desc");

  const { byTag, byCombo } = useMemo(() => tagBreakdown(closed, tagGroups), [closed, tagGroups]);
  const rows = sortRows(mode === "tag" ? byTag : byCombo, acc, sort);

  return (
    <div className="panel">
      <div className="head">
        <h2>Tag breakdown</h2>
        <span className="meta">{closed.length} closed trade{closed.length !== 1 ? "s" : ""}</span>
        <div className="spacer" style={{ flex: 1 }} />
        <div className="seg">
          <button className={mode === "tag" ? "on" : ""} onClick={() => setMode("tag")}>By tag</button>
          <button className={mode === "combo" ? "on" : ""} onClick={() => setMode("combo")}>By combination</button>
        </div>
      </div>
      <div className="body" style={{ overflowX: "auto" }}>
        <table className="blot">
          <thead>
            <tr>
              <SortTh className="l" label={mode === "tag" ? "Tag" : "Combination"} k="label" sort={sort} onSort={onSort} />
              {mode === "tag" && <SortTh className="l" label="Group" k="group" sort={sort} onSort={onSort} />}
              <SortTh label="Trades" k="count" sort={sort} onSort={onSort} />
              <SortTh label="Win %" k="winRate" sort={sort} onSort={onSort} />
              <SortTh label="Profit factor" k="profitFactor" sort={sort} onSort={onSort} />
              <SortTh label="Net P&L" k="net" sort={sort} onSort={onSort} />
              <SortTh label="Volume" k="volume" sort={sort} onSort={onSort} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={mode === "tag" ? 7 : 6}>
                <div className="empty"><b>No closed trades to break down</b>Adjust the filter, or close out a tagged trade.</div>
              </td></tr>
            ) : rows.map((r) => (
              <tr key={r.key}>
                <td className="l"><span className="tick">{r.label}</span></td>
                {mode === "tag" && <td className="l"><span style={{ color: "var(--txt-3)" }}>{GROUP_LABEL[r.group]}</span></td>}
                <td className="num">{fInt(r.count)}</td>
                <td className="num">{winPct(r.winRate)}</td>
                <td className={"num " + (r.profitFactor != null && r.profitFactor !== Infinity ? (r.profitFactor >= 1 ? "pos" : "neg") : "")}>{pf(r.profitFactor)}</td>
                <td className={"num " + cls(r.net)}>{fMoney(r.net, true)}</td>
                <td className="num">{fInt(r.volume)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
