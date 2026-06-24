import { useEffect, useMemo, useRef, useState } from "react";
import { computeTrade } from "@engine";
import { useStore } from "../store.jsx";
import { TAG_GROUPS } from "../lib/filter.js";
import { fMoney, fNum, fInt, fR, cls, today } from "../lib/format.js";

const GROUP_LABELS = { setups: "Setups", tactics: "Tactics (entry)", mistakes: "Mistakes / rules broken", edges: "Edges" };

const blankTrade = () => ({
  ticker: "", direction: "long", stop: "", riskOverride: "", notes: "",
  fills: [{ kind: "entry", date: today(), price: "", shares: "" }],
  tags: { setups: [], tactics: [], mistakes: [], edges: [] },
  images: [],
});

// existing trade (numbers/null) -> editor form (strings/"")
function toForm(t) {
  return {
    id: t.id,
    ticker: t.ticker || "",
    direction: t.direction || "long",
    stop: t.stop ?? "",
    riskOverride: t.riskOverride ?? "",
    notes: t.notes || "",
    fills: (t.fills || []).map((f) => ({
      kind: f.kind, date: f.date,
      price: f.price ?? "", shares: f.shares ?? "",
    })),
    tags: { setups: [...(t.tags?.setups || [])], tactics: [...(t.tags?.tactics || [])], mistakes: [...(t.tags?.mistakes || [])], edges: [...(t.tags?.edges || [])] },
    images: (t.images || []).map((im) => ({ ...im })),
  };
}

export default function TradeEditor({ initial, onClose }) {
  const store = useStore();
  const isEdit = !!initial;
  const [w, setW] = useState(() => (initial ? toForm(initial) : blankTrade()));
  const [saving, setSaving] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const tickerRef = useRef(null);

  useEffect(() => { setTimeout(() => tickerRef.current?.focus(), 30); }, []);

  // live engine readout — coerce blanks to null so half-typed fills don't count
  const computed = useMemo(() => computeTrade({
    direction: w.direction,
    stop: w.stop,
    riskOverride: w.riskOverride,
    fills: w.fills.map((f) => ({
      kind: f.kind, date: f.date,
      price: f.price === "" ? null : Number(f.price),
      shares: f.shares === "" ? null : Number(f.shares),
    })),
  }), [w]);

  const long = w.direction !== "short";
  const set = (patch) => setW((s) => ({ ...s, ...patch }));
  const setFill = (i, patch) =>
    setW((s) => ({ ...s, fills: s.fills.map((f, j) => (j === i ? { ...f, ...patch } : f)) }));
  const addFill = (kind) =>
    setW((s) => ({ ...s, fills: [...s.fills, { kind, date: today(), price: "", shares: "" }] }));
  const delFill = (i) =>
    setW((s) => {
      const fills = s.fills.filter((_, j) => j !== i);
      return { ...s, fills: fills.length ? fills : [{ kind: "entry", date: today(), price: "", shares: "" }] };
    });

  const toggleTag = (grp, id) =>
    setW((s) => {
      const cur = s.tags[grp] || [];
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      return { ...s, tags: { ...s.tags, [grp]: next } };
    });

  const addTag = async (grp) => {
    const name = window.prompt(`New ${grp} label:`);
    if (!name) return;
    try {
      const tag = await store.createTag(grp, name);
      setW((s) => ({ ...s, tags: { ...s.tags, [grp]: [...new Set([...(s.tags[grp] || []), tag.id])] } }));
    } catch (e) { store.toast(e.message || "Could not add tag"); }
  };

  const addImages = async (files) => {
    for (const file of files) {
      if (!file.type?.startsWith("image/")) continue;
      try {
        const img = await store.uploadImage(file);
        setW((s) => ({ ...s, images: [...s.images, img] }));
      } catch (e) { store.toast(e.message || "Image upload failed"); }
    }
  };

  // paste-to-attach while the editor is open
  useEffect(() => {
    const onPaste = (e) => {
      const items = e.clipboardData?.items || [];
      const imgs = [...items].filter((it) => it.type.startsWith("image/")).map((it) => it.getAsFile());
      if (imgs.length) addImages(imgs);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const save = async () => {
    const ticker = w.ticker.trim().toUpperCase();
    if (!ticker) { store.toast("Add a ticker first"); tickerRef.current?.focus(); return; }
    const fills = w.fills
      .filter((f) => f.date && f.price !== "" && f.shares !== "")
      .map((f, i) => ({
        kind: f.kind, date: f.date,
        price: Number(f.price), shares: Number(f.shares), seq: i,
      }));
    if (!fills.length) { store.toast("Add at least one fill (date, price, shares)"); return; }

    const payload = {
      ticker, direction: w.direction,
      stop: w.stop, riskOverride: w.riskOverride, notes: w.notes,
      fills, tags: w.tags, images: w.images.map((im) => ({ id: im.id })),
    };
    setSaving(true);
    try {
      if (isEdit) await store.updateTrade(w.id, payload);
      else await store.createTrade(payload);
      store.toast("Saved");
      onClose();
    } catch (e) {
      store.toast(e.message || "Save failed");
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!isEdit) return;
    if (!window.confirm("Delete this trade permanently? Attached images will also be removed.")) return;
    try { await store.deleteTrade(w.id); store.toast("Deleted"); onClose(); }
    catch (e) { store.toast(e.message || "Delete failed"); }
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") onClose();
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
  };

  const c = computed;
  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} onKeyDown={onKeyDown}>
      <div className="modal">
        <div className="mhead">
          <h3>{isEdit ? "Edit trade" : "New trade"}</h3>
          <button className="x" onClick={onClose}>×</button>
        </div>

        <div className="mbody">
          <div className="row">
            <div className="field" style={{ flex: "0 0 150px" }}>
              <label>Ticker</label>
              <input ref={tickerRef} value={w.ticker} placeholder="e.g. NVDA" autoComplete="off"
                onChange={(e) => set({ ticker: e.target.value })} />
            </div>
            <div className="field" style={{ flex: "0 0 150px" }}>
              <label>Direction</label>
              <select value={w.direction} onChange={(e) => set({ direction: e.target.value })}>
                <option value="long">Long</option>
                <option value="short">Short</option>
              </select>
            </div>
            <div className="field" style={{ flex: "0 0 150px" }}>
              <label>Stop <span className="inline-help" title="Initial stop. Used with your first entry to compute planned risk (R).">?</span></label>
              <input type="number" step="any" className="num" placeholder="optional" value={w.stop}
                onChange={(e) => set({ stop: e.target.value })} />
            </div>
            <div className="field" style={{ flex: "0 0 150px" }}>
              <label>Risk $ override <span className="inline-help" title="Leave blank to auto-compute from stop × first entry. Set this to pin your planned 1R in dollars.">?</span></label>
              <input type="number" step="any" className="num" placeholder="auto" value={w.riskOverride}
                onChange={(e) => set({ riskOverride: e.target.value })} />
            </div>
          </div>

          <div className="section-title">
            Fills <span style={{ textTransform: "none", letterSpacing: 0, color: "var(--txt-3)" }}>
              {long ? "— buys are entries (initial + pyramid), sells are exits (trims & runner)"
                : "— short sells are entries, covers are exits"}
            </span>
          </div>
          <div className="fills">
            <div className="fh"><span>Date</span><span>{long ? "Buy / price" : "Short / price"}</span><span>Shares</span><span>Value</span><span /></div>
            {w.fills.map((f, i) => {
              const kindLabel = f.kind === "entry" ? (long ? "Buy" : "Short") : (long ? "Sell" : "Cover");
              const col = f.kind === "entry" ? "var(--steel)" : "var(--brass)";
              const val = f.price !== "" && f.shares !== "" ? Number(f.price) * Number(f.shares) : null;
              return (
                <div className="fill" key={i}>
                  <input type="date" value={f.date || ""} onChange={(e) => setFill(i, { date: e.target.value })} />
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span className="kind" style={{ color: col, minWidth: 42 }}>{kindLabel}</span>
                    <input type="number" step="any" placeholder="price" value={f.price}
                      onChange={(e) => setFill(i, { price: e.target.value })} />
                  </div>
                  <input type="number" step="any" placeholder="shares" value={f.shares}
                    onChange={(e) => setFill(i, { shares: e.target.value })} />
                  <div className="num" style={{ color: "var(--txt-3)", textAlign: "right", paddingRight: 4 }}>
                    {val != null ? fMoney(val) : ""}
                  </div>
                  <button className="del" title="Remove" onClick={() => delFill(i)}>×</button>
                </div>
              );
            })}
            <div className="addfill">
              <button className="btn sm" onClick={() => addFill("entry")}>+ Entry</button>
              <button className="btn sm" onClick={() => addFill("exit")}>+ Exit</button>
            </div>
          </div>

          <div className="runline">
            <span>Avg in <b>{fNum(c.avgIn)}</b></span>
            {c.avgOut != null && <span>Avg out <b>{fNum(c.avgOut)}</b></span>}
            <span>Remaining <b>{fInt(c.remaining)}</b></span>
            <span>Status <b style={{ color: c.status === "closed" ? "var(--txt)" : c.status === "partial" ? "var(--brass)" : "var(--steel)" }}>{c.status}</b></span>
            {c.exitedShares > 0 && <span>Realised <b className={cls(c.realized)}>{fMoney(c.realized, true)}</b></span>}
            {c.risk && <span>1R = <b>{fMoney(c.risk)}</b></span>}
            {c.rMultiple != null && <span><b className={cls(c.rMultiple)}>{fR(c.rMultiple)}</b></span>}
            {c.overSold && <span><b className="neg" title="Exits exceed shares held">⚠ over-sold</b></span>}
          </div>

          {TAG_GROUPS.map((g) => {
            const tags = store.tagGroups?.[g] || [];
            const sel = w.tags[g] || [];
            return (
              <div key={g}>
                <div className="section-title">{GROUP_LABELS[g]}</div>
                <div className="tagrow">
                  {tags.map((tg) => (
                    <span key={tg.id} className={"tag" + (sel.includes(tg.id) ? " sel" : "")}
                      onClick={() => toggleTag(g, tg.id)}>{tg.name}</span>
                  ))}
                  <button className="tagadd" onClick={() => addTag(g)}>+ add</button>
                </div>
              </div>
            );
          })}

          <div className="section-title">Notes — thesis, management, lessons</div>
          <div className="field">
            <textarea value={w.notes} rows={5} placeholder="What was the setup and thesis? How did you manage it? What would you repeat or fix?"
              onChange={(e) => set({ notes: e.target.value })} />
          </div>

          <div className="section-title">Chart markups</div>
          <ImageDrop onFiles={addImages} />
          <div className="thumbs">
            {w.images.map((im) => (
              <div className="thumb" key={im.id}>
                <img src={`/api/images/${im.id}`} alt="" onClick={() => setLightbox(`/api/images/${im.id}`)} />
                <button className="rm" onClick={() => setW((s) => ({ ...s, images: s.images.filter((x) => x.id !== im.id) }))}>×</button>
              </div>
            ))}
          </div>
        </div>

        <div className="mfoot">
          <button className="btn primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save trade"}</button>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <div className="spacer" />
          {isEdit && <button className="btn danger ghost" onClick={remove}>Delete trade</button>}
        </div>
      </div>

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" />
        </div>
      )}
    </div>
  );
}

function ImageDrop({ onFiles }) {
  const [over, setOver] = useState(false);
  const inputRef = useRef(null);
  return (
    <>
      <div
        className={"drop" + (over ? " over" : "")}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); onFiles([...e.dataTransfer.files]); }}
      >
        Drop images here, click to browse, or paste from clipboard (⌘/Ctrl-V)
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple hidden
        onChange={(e) => { onFiles([...e.target.files]); e.target.value = ""; }} />
    </>
  );
}
