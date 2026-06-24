/* Thin fetch wrappers around the server API. */
async function j(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}
const jsonReq = (method, body) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  state: () => fetch("/api/state").then(j),

  createTrade: (t) => fetch("/api/trades", jsonReq("POST", t)).then(j),
  updateTrade: (id, t) => fetch(`/api/trades/${id}`, jsonReq("PUT", t)).then(j),
  deleteTrade: (id) => fetch(`/api/trades/${id}`, { method: "DELETE" }).then(j),

  setMeta: (patch) => fetch("/api/meta", jsonReq("PUT", patch)).then(j),

  createTag: (grp, name) => fetch("/api/tags", jsonReq("POST", { grp, name })).then(j),
  deleteTag: (id) => fetch(`/api/tags/${id}`, { method: "DELETE" }).then(j),

  uploadImage: (file, tradeId) => {
    const fd = new FormData();
    fd.append("file", file);
    if (tradeId) fd.append("tradeId", tradeId);
    return fetch("/api/images", { method: "POST", body: fd }).then(j);
  },

  importPreview: (text, ignoreSymbols = []) => fetch("/api/import/preview", jsonReq("POST", { text, ignoreSymbols })).then(j),
  importCommit: (text, sourceName, ignoreSymbols = []) => fetch("/api/import/commit", jsonReq("POST", { text, sourceName, ignoreSymbols })).then(j),
  importUndo: (batchId) => fetch(`/api/import/${batchId}`, { method: "DELETE" }).then(j),

  exportJSON: () => fetch("/api/export").then(j),
  restoreJSON: (data) => fetch("/api/restore", jsonReq("POST", data)).then(j),
};
