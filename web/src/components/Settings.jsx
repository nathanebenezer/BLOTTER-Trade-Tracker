import { useRef, useState } from "react";
import { useStore } from "../store.jsx";
import { TAG_GROUPS } from "../lib/filter.js";

const GROUP_LABELS = { setups: "Setups", tactics: "Tactics (entry)", mistakes: "Mistakes", edges: "Edges" };

export default function Settings({ onClose }) {
  const store = useStore();
  const [equity, setEquity] = useState(String(store.meta?.equity_baseline ?? 0));

  const saveMeta = async () => {
    await store.setMeta({ equity_baseline: Number(equity) || 0 });
    store.toast("Settings saved");
    onClose();
  };

  const addTag = async (grp) => {
    const name = window.prompt(`New ${grp} label:`);
    if (!name) return;
    try { await store.createTag(grp, name); }
    catch (e) { store.toast(e.message || "Could not add tag"); }
  };

  const delTag = async (id) => { await store.deleteTag(id); };

  const ignoreSymbols = store.meta?.ignoreSymbols || [];
  const addIgnore = async () => {
    const v = window.prompt("Symbol to ignore on import (e.g. SGOV):");
    if (!v) return;
    const sym = v.trim().toUpperCase();
    if (!sym || ignoreSymbols.includes(sym)) return;
    await store.setMeta({ ignore_symbols: [...ignoreSymbols, sym] });
  };
  const removeIgnore = async (sym) => {
    await store.setMeta({ ignore_symbols: ignoreSymbols.filter((s) => s !== sym) });
  };

  const restoreRef = useRef(null);
  const doExport = async () => {
    try {
      const data = await store.exportJSON();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `blotter-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      store.toast(`Exported ${data.trades.length} trade${data.trades.length !== 1 ? "s" : ""}`);
    } catch (e) { store.toast(e.message || "Export failed"); }
  };
  const doRestore = async (file) => {
    if (!file) return;
    let data;
    try { data = JSON.parse(await file.text()); }
    catch { return store.toast("That file isn't valid JSON"); }
    if (data.app !== "blotter") return store.toast("Not a Blotter backup file");
    if (!window.confirm(`Restore ${data.trades?.length ?? 0} trades? This REPLACES your current journal.`)) return;
    try { await store.restoreJSON(data); store.toast("Journal restored"); onClose(); }
    catch (e) { store.toast(e.message || "Restore failed"); }
  };

  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ width: "min(640px, 100%)" }}>
        <div className="mhead">
          <h3>Settings</h3>
          <button className="x" onClick={onClose}>×</button>
        </div>
        <div className="mbody">
          <div className="row">
            <div className="field">
              <label>Starting equity $ <span className="inline-help" title="Equity-curve baseline. Set to 0 to plot pure cumulative realised P&L.">?</span></label>
              <input type="number" step="any" className="num" value={equity} onChange={(e) => setEquity(e.target.value)} />
            </div>
          </div>

          {TAG_GROUPS.map((g) => {
            const tags = store.tagGroups?.[g] || [];
            return (
              <div key={g}>
                <div className="section-title">{GROUP_LABELS[g]} labels</div>
                <div className="tagrow">
                  {tags.map((tg) => (
                    <span key={tg.id} className="tag">
                      {tg.name}
                      <button onClick={() => delTag(tg.id)} title="Remove label">×</button>
                    </span>
                  ))}
                  <button className="tagadd" onClick={() => addTag(g)}>+ add</button>
                </div>
              </div>
            );
          })}

          <div className="section-title">Ignore on import</div>
          <div className="tagrow">
            {ignoreSymbols.map((sym) => (
              <span key={sym} className="tag">
                {sym}
                <button onClick={() => removeIgnore(sym)} title="Stop ignoring">×</button>
              </span>
            ))}
            <button className="tagadd" onClick={addIgnore}>+ add</button>
          </div>
          <div className="help" style={{ marginTop: 6 }}>
            These tickers are pre-ticked to skip when you import (you can still include them per-import). Empty by default.
          </div>

          <div className="section-title">Backup</div>
          <div className="tagrow">
            <button className="btn sm" onClick={doExport}>Export JSON</button>
            <button className="btn sm" onClick={() => restoreRef.current?.click()}>Restore from file…</button>
            <input ref={restoreRef} type="file" accept="application/json,.json" hidden
              onChange={(e) => { doRestore(e.target.files[0]); e.target.value = ""; }} />
          </div>
          <div className="help" style={{ marginTop: 6 }}>
            Export downloads your whole journal (trades, fills, tags, settings) as one JSON file — a portable
            snapshot/backup. Restore replaces the current journal with a backup file. (Chart images live in the
            <code> data/</code> folder; copy that folder to back those up too.)
          </div>

          <div className="divider" />
          <div className="help">
            Tag groups start empty — add your own <b>setups</b>, entry <b>tactics</b>, <b>mistakes</b>, and <b>edges</b>.
            Each group is filtered independently on the bar above. Accounting uses running average cost; R is anchored to your first entry (or the risk override).
          </div>
        </div>
        <div className="mfoot">
          <button className="btn primary" onClick={saveMeta}>Done</button>
        </div>
      </div>
    </div>
  );
}
