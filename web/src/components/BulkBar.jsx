import { useState } from "react";
import { useStore } from "../store.jsx";
import { TAG_GROUPS } from "../lib/filter.js";

// Bulk-action bar shown when one or more trades are selected (Phase 5a: tag actions).
export default function BulkBar({ selectedIds, totalMatching, onSelectAll, onClear }) {
  const store = useStore();
  const [op, setOp] = useState("add");      // add | remove
  const [tagIds, setTagIds] = useState([]);
  const [busy, setBusy] = useState(false);

  const toggleTag = (id) => setTagIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const anyTags = TAG_GROUPS.some((g) => (store.tagGroups?.[g] || []).length > 0);

  const submit = async () => {
    if (!tagIds.length) return;
    setBusy(true);
    try {
      await store.bulkTag(selectedIds, tagIds, op);
      store.toast(`${op === "add" ? "Added" : "Removed"} ${tagIds.length} tag${tagIds.length !== 1 ? "s" : ""} on ${selectedIds.length} trade${selectedIds.length !== 1 ? "s" : ""}`);
      setTagIds([]);
      onClear();
    } catch (e) {
      store.toast(e.message || "Action failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bulkbar">
      <span><b className="num">{selectedIds.length}</b> selected</span>
      {selectedIds.length < totalMatching && (
        <button className="btn sm ghost" onClick={onSelectAll}>Select all {totalMatching}</button>
      )}
      <button className="btn sm ghost" onClick={onClear}>Clear</button>

      <div className="spacer" style={{ flex: 1 }} />

      <select className="fsel" value={op} onChange={(e) => setOp(e.target.value)}>
        <option value="add">Add Tag</option>
        <option value="remove">Delete Tag</option>
      </select>

      <div className="bulktags">
        {anyTags ? (
          TAG_GROUPS.flatMap((g) => (store.tagGroups?.[g] || []).map((tg) => (
            <span key={tg.id} className={"tag" + (tagIds.includes(tg.id) ? " sel" : "")} onClick={() => toggleTag(tg.id)}>{tg.name}</span>
          )))
        ) : (
          <span style={{ color: "var(--txt-3)", fontSize: 12 }}>No tags yet — add some in Settings</span>
        )}
      </div>

      <button className="btn primary sm" disabled={!tagIds.length || busy} onClick={submit}>
        {busy ? "…" : "Submit"}
      </button>
    </div>
  );
}
