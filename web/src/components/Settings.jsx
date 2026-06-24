import { useState } from "react";
import { useStore } from "../store.jsx";
import { TAG_GROUPS } from "../lib/filter.js";

const GROUP_LABELS = { setups: "Setups", tactics: "Tactics (entry)", mistakes: "Mistakes", edges: "Edges" };

export default function Settings({ onClose }) {
  const store = useStore();
  const [title, setTitle] = useState(store.meta?.title || "Swing Journal");
  const [equity, setEquity] = useState(String(store.meta?.equity_baseline ?? 0));

  const saveMeta = async () => {
    await store.setMeta({ title: title.trim() || "Swing Journal", equity_baseline: Number(equity) || 0 });
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
              <label>Journal title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="field">
              <label>Starting equity $ <span className="inline-help" title="Equity-curve baseline (Phase 2). Set to 0 to plot pure cumulative realised P&L.">?</span></label>
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
