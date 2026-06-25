import { useState } from "react";
import { useStore } from "../store.jsx";
import { TAG_GROUPS } from "../lib/filter.js";

// Bulk-action bar shown when one or more trades are selected.
export default function BulkBar({ selectedIds, totalMatching, onSelectAll, onClear }) {
  const store = useStore();
  const [action, setAction] = useState("add");  // add | remove | merge | delete
  const [tagIds, setTagIds] = useState([]);
  const [busy, setBusy] = useState(false);

  const isTag = action === "add" || action === "remove";
  const toggleTag = (id) => setTagIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const anyTags = TAG_GROUPS.some((g) => (store.tagGroups?.[g] || []).length > 0);
  const n = selectedIds.length;

  const submit = async () => {
    setBusy(true);
    try {
      if (isTag) {
        if (!tagIds.length) return;
        await store.bulkTag(selectedIds, tagIds, action);
        store.toast(`${action === "add" ? "Added" : "Removed"} ${tagIds.length} tag${tagIds.length !== 1 ? "s" : ""} on ${n} trade${n !== 1 ? "s" : ""}`);
        setTagIds([]);
      } else if (action === "delete") {
        if (!window.confirm(`Delete ${n} trade${n !== 1 ? "s" : ""}? This can't be undone.`)) return;
        await store.bulkDelete(selectedIds);
        store.toast(`Deleted ${n} trade${n !== 1 ? "s" : ""}`);
      } else if (action === "merge") {
        await store.mergeTrades(selectedIds);
        store.toast(`Merged ${n} trades into one`);
      } else if (action === "split") {
        await store.splitTrades(selectedIds);
        store.toast(`Split ${n} trade${n !== 1 ? "s" : ""}`);
      }
      onClear();
    } catch (e) {
      store.toast(e.message || "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const submitDisabled = busy || (isTag && !tagIds.length) || (action === "merge" && n < 2);

  return (
    <div className="bulkbar">
      <span><b className="num">{n}</b> selected</span>
      {n < totalMatching && <button className="btn sm ghost" onClick={onSelectAll}>Select all {totalMatching}</button>}
      <button className="btn sm ghost" onClick={onClear}>Clear</button>

      <div className="spacer" style={{ flex: 1 }} />

      <select className="fsel" value={action} onChange={(e) => setAction(e.target.value)}>
        <option value="add">Add Tag</option>
        <option value="remove">Delete Tag</option>
        <option value="merge">Merge Trades</option>
        <option value="split">Split Trades</option>
        <option value="delete">Delete Trades</option>
      </select>

      {isTag && (
        <div className="bulktags">
          {anyTags ? (
            TAG_GROUPS.flatMap((g) => (store.tagGroups?.[g] || []).map((tg) => (
              <span key={tg.id} className={"tag" + (tagIds.includes(tg.id) ? " sel" : "")} onClick={() => toggleTag(tg.id)}>{tg.name}</span>
            )))
          ) : (
            <span style={{ color: "var(--txt-3)", fontSize: 12 }}>No tags yet — add some in Settings</span>
          )}
        </div>
      )}
      {action === "merge" && <span style={{ color: "var(--txt-3)", fontSize: 12 }}>same ticker &amp; direction</span>}
      {action === "split" && <span style={{ color: "var(--txt-3)", fontSize: 12 }}>separates flat-to-flat round-trips</span>}

      <button className={"btn sm " + (action === "delete" ? "danger" : "primary")} disabled={submitDisabled} onClick={submit}>
        {busy ? "…" : "Submit"}
      </button>
    </div>
  );
}
