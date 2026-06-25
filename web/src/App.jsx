import { useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { useStore } from "./store.jsx";
import { defaultFilter } from "./lib/filter.js";
import FilterBar from "./components/FilterBar.jsx";
import TradeEditor from "./components/TradeEditor.jsx";
import Settings from "./components/Settings.jsx";
import ImportDialog from "./components/ImportDialog.jsx";
import Trades from "./pages/Trades.jsx";
import Reports from "./pages/Reports.jsx";
import Calendar from "./pages/Calendar.jsx";

export default function App() {
  const store = useStore();
  const [filter, setFilter] = useState(defaultFilter);
  const [editing, setEditing] = useState(null);    // null | "new" | trade object
  const [showSettings, setShowSettings] = useState(false);
  const [showImport, setShowImport] = useState(false);

  if (store.error) {
    return (
      <div className="loading">
        <b style={{ color: "var(--neg)", display: "block", marginBottom: 8 }}>Can't reach the server</b>
        {store.error}
      </div>
    );
  }
  if (!store.ready) return <div className="loading">Loading…</div>;

  const openEditor = (trade) => setEditing(trade || "new");

  return (
    <>
      <header className="top">
        <div className="brand">
          <span className="mark">Blotter</span>
        </div>
        <nav className="nav">
          <NavLink to="/" end>Trades</NavLink>
          <NavLink to="/reports">Reports</NavLink>
          <NavLink to="/calendar">Calendar</NavLink>
        </nav>
        <div className="spacer" />
        <div className="tbar">
          <button className="btn primary" onClick={() => openEditor(null)}>+ New trade</button>
          <button className="btn ghost" onClick={() => setShowImport(true)}>Import</button>
          <button className="btn ghost" onClick={() => setShowSettings(true)}>Settings</button>
        </div>
      </header>

      <div className="wrap">
        <FilterBar filter={filter} setFilter={setFilter} tagGroups={store.tagGroups} />
        <Routes>
          <Route path="/" element={<Trades filter={filter} onOpen={openEditor} />} />
          <Route path="/reports" element={<Reports filter={filter} />} />
          <Route path="/calendar" element={<Calendar filter={filter} onOpen={openEditor} />} />
        </Routes>
      </div>

      {editing && (
        <TradeEditor
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
      {showImport && <ImportDialog onClose={() => setShowImport(false)} />}

      <div className={"toast" + (store.toastMsg ? " on" : "")}>{store.toastMsg}</div>
    </>
  );
}
