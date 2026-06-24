import { useRef, useState } from "react";
import { useStore } from "../store.jsx";
import { fMoney, fNum, cls } from "../lib/format.js";

function FillSummary({ fills }) {
  return (
    <span>
      {fills.map((f, i) => (
        <span key={i} className="pill" style={{ color: f.kind === "entry" ? "var(--steel)" : "var(--brass)" }}>
          {f.kind === "entry" ? "+" : "−"}{fNum(f.shares, 0)} @ {fNum(f.price)}
        </span>
      ))}
    </span>
  );
}

export default function ImportDialog({ onClose }) {
  const store = useStore();
  const [step, setStep] = useState("pick");   // pick | preview | committed
  const [filename, setFilename] = useState("");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [ignoreSel, setIgnoreSel] = useState(() => new Set());
  const inputRef = useRef(null);

  const runPreview = async (content, ignoreArr) => {
    setBusy(true);
    setError(null);
    try {
      const p = await store.importPreview(content, ignoreArr);
      setPreview(p);
      setStep("preview");
    } catch (e) {
      setError(e.message || "Could not read that file");
    } finally {
      setBusy(false);
    }
  };

  const pickFile = async (file) => {
    if (!file) return;
    setError(null);
    setFilename(file.name);
    const content = await file.text();
    setText(content);
    // pre-select the persistent default ignore list
    const defaults = new Set((store.meta?.ignoreSymbols || []).map((s) => String(s).toUpperCase()));
    setIgnoreSel(defaults);
    await runPreview(content, [...defaults]);
  };

  const toggleSymbol = async (sym) => {
    const next = new Set(ignoreSel);
    if (next.has(sym)) next.delete(sym); else next.add(sym);
    setIgnoreSel(next);
    await runPreview(text, [...next]);   // re-run so reconstruction stays exact
  };

  const commit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await store.importCommit(text, filename, [...ignoreSel]);
      setResult(r);
      setStep("committed");
      store.toast(`Imported ${r.counts.newTrades} new · ${r.counts.extended} extended`);
    } catch (e) {
      setError(e.message || "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (!result) return;
    setBusy(true);
    try {
      await store.importUndo(result.batchId);
      store.toast("Import undone");
      onClose();
    } catch (e) {
      setError(e.message || "Undo failed");
      setBusy(false);
    }
  };

  const c = preview?.counts;
  const nothingToDo = c && c.newTrades === 0 && c.extended === 0;

  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="mhead">
          <h3>Import executions</h3>
          <button className="x" onClick={onClose}>×</button>
        </div>

        <div className="mbody">
          {error && (
            <div className="runline" style={{ borderColor: "var(--neg)", color: "var(--neg)", marginTop: 0 }}>
              {error}
            </div>
          )}

          {step === "pick" && (
            <>
              <div className="drop" onClick={() => inputRef.current?.click()}>
                {busy ? "Reading…" : "Click to choose your broker export (tab-delimited .xls / .txt / .csv)"}
              </div>
              <input
                ref={inputRef} type="file" hidden
                accept=".xls,.txt,.csv,.tsv,text/plain,text/tab-separated-values"
                onChange={(e) => { pickFile(e.target.files[0]); e.target.value = ""; }}
              />
              <div className="help" style={{ marginTop: 10 }}>
                Nothing is saved yet — you'll see a preview of what will be created before committing.
              </div>
            </>
          )}

          {step === "preview" && c && (
            <>
              <div className="runline" style={{ marginTop: 0 }}>
                <span>{filename}</span>
                <span><b>{c.newTrades}</b> new</span>
                <span><b>{c.extended}</b> extended</span>
                <span><b>{c.skipped}</b> skipped</span>
                <span><b>{c.ignored}</b> ignored</span>
                <span><b>{c.duplicates}</b> duplicate{c.duplicates !== 1 ? "s" : ""}</span>
              </div>

              {preview.symbols?.length > 0 && (
                <>
                  <div className="section-title">Symbols found — tick to skip this import</div>
                  <div className="tagrow">
                    {preview.symbols.map((s) => {
                      const skip = ignoreSel.has(s.symbol);
                      return (
                        <label key={s.symbol} className={"tag" + (skip ? " sel" : "")} style={{ cursor: "pointer" }}>
                          <input type="checkbox" checked={skip} disabled={busy} onChange={() => toggleSymbol(s.symbol)} style={{ margin: 0, accentColor: "var(--brass)" }} />
                          {s.symbol} <span style={{ color: "var(--txt-3)" }}>{s.count}</span>
                        </label>
                      );
                    })}
                  </div>
                </>
              )}

              {preview.newTrades.length > 0 && (
                <>
                  <div className="section-title">New trades</div>
                  <table className="blot">
                    <thead><tr>
                      <th className="l">Ticker</th><th className="l">Fills</th><th>Status</th><th>Realised</th>
                    </tr></thead>
                    <tbody>
                      {preview.newTrades.map((t, i) => (
                        <tr key={i}>
                          <td className="l">
                            <span className="tick">{t.symbol}</span>{" "}
                            <span className={"dir " + (t.direction === "short" ? "short" : "long")}>{t.direction === "short" ? "S" : "L"}</span>
                            {t.flagged && <span className="flag" title="Position flipped through zero — review">review</span>}
                          </td>
                          <td className="l"><FillSummary fills={t.fills} /></td>
                          <td><span className={"status " + t.status}>{t.status}</span></td>
                          <td className={"num " + cls(t.realized)}>{t.status === "open" ? "—" : fMoney(t.realized, true)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              {preview.extended.length > 0 && (
                <>
                  <div className="section-title">Extended positions</div>
                  <table className="blot">
                    <thead><tr>
                      <th className="l">Ticker</th><th className="l">Added fills</th><th>Now</th>
                    </tr></thead>
                    <tbody>
                      {preview.extended.map((t, i) => (
                        <tr key={i}>
                          <td className="l"><span className="tick">{t.ticker}</span></td>
                          <td className="l"><FillSummary fills={t.addedFills} /></td>
                          <td><span className={"status " + t.resultingStatus}>{t.resultingStatus}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              {preview.skipped.length > 0 && (
                <>
                  <div className="section-title">Skipped</div>
                  <div className="tagrow">
                    {preview.skipped.map((s, i) => (
                      <span key={i} className="pill">{s.symbol || "?"} — {s.reason}</span>
                    ))}
                  </div>
                </>
              )}

              {nothingToDo && (
                <div className="help" style={{ marginTop: 12 }}>
                  Nothing new to import — every execution is already in your journal.
                </div>
              )}
            </>
          )}

          {step === "committed" && result && (
            <div className="empty">
              <b>Import complete</b>
              {result.counts.newTrades} new trade{result.counts.newTrades !== 1 ? "s" : ""} ·
              {" "}{result.counts.extended} extended ·
              {" "}{result.counts.duplicates} duplicate{result.counts.duplicates !== 1 ? "s" : ""} skipped
              <div className="help" style={{ marginTop: 10 }}>
                Stop, tags and notes stay manual — open any imported trade to enrich it.
              </div>
            </div>
          )}
        </div>

        <div className="mfoot">
          {step === "preview" && (
            <>
              <button className="btn primary" onClick={commit} disabled={busy || nothingToDo}>
                {busy ? "Importing…" : "Commit import"}
              </button>
              <button className="btn ghost" onClick={() => { setStep("pick"); setPreview(null); }}>Choose another file</button>
              <div className="spacer" />
              <button className="btn ghost" onClick={onClose}>Cancel</button>
            </>
          )}
          {step === "committed" && (
            <>
              <button className="btn primary" onClick={onClose}>Done</button>
              <div className="spacer" />
              <button className="btn danger ghost" onClick={undo} disabled={busy}>Undo this import</button>
            </>
          )}
          {step === "pick" && (
            <button className="btn ghost" onClick={onClose}>Cancel</button>
          )}
        </div>
      </div>
    </div>
  );
}
