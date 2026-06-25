import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./lib/api.js";

const StoreCtx = createContext(null);

export function StoreProvider({ children }) {
  const [data, setData] = useState({ meta: null, tagGroups: null, trades: [] });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [toastMsg, setToastMsg] = useState("");
  const toastTimer = useRef(null);

  const toast = useCallback((msg) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(""), 1800);
  }, []);

  const reload = useCallback(async () => {
    const s = await api.state();
    setData(s);
    setReady(true);
    return s;
  }, []);

  useEffect(() => {
    reload().catch((e) => {
      console.error(e);
      setError(e.message || "Could not reach the server");
    });
  }, [reload]);

  const actions = useMemo(() => ({
    reload,
    toast,
    createTrade: async (t) => { const r = await api.createTrade(t); await reload(); return r; },
    updateTrade: async (id, t) => { const r = await api.updateTrade(id, t); await reload(); return r; },
    deleteTrade: async (id) => { await api.deleteTrade(id); await reload(); },
    setMeta: async (patch) => { await api.setMeta(patch); await reload(); },
    createTag: async (grp, name) => { const r = await api.createTag(grp, name); await reload(); return r; },
    deleteTag: async (id) => { await api.deleteTag(id); await reload(); },
    uploadImage: api.uploadImage,
    importPreview: api.importPreview,
    importCommit: async (text, sourceName, ignoreSymbols) => { const r = await api.importCommit(text, sourceName, ignoreSymbols); await reload(); return r; },
    importUndo: async (batchId) => { const r = await api.importUndo(batchId); await reload(); return r; },
    exportJSON: api.exportJSON,
    restoreJSON: async (data) => { const r = await api.restoreJSON(data); await reload(); return r; },
    bulkTag: async (tradeIds, tagIds, op) => { const r = await api.bulkTag(tradeIds, tagIds, op); await reload(); return r; },
  }), [reload, toast]);

  const value = { ...data, ready, error, toastMsg, ...actions };
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export const useStore = () => useContext(StoreCtx);
