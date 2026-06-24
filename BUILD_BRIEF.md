# Blotter — Build Brief v3 (handoff to Claude Code)

A **local web app**: a real backend + database that runs on the user's own machine, fully offline.
The user opens it at `localhost`, everything is saved durably to a database file on disk, and there is
**no import/export ritual and no risk from clearing the browser cache** — the browser stores nothing
important. `blotter.html` is the **reference** for the verified accounting engine and the visual
identity; port both, restructure everything else per this brief.

## What changed from earlier single-file plans
We dropped the "single HTML file / zero-dependency" constraint (it stopped paying for itself at this
scope). We KEPT the values that matter: **local-only, offline, user owns the data.** Storage is now a
real database, which makes durability, filtering, and stats simpler — not harder.

## Architecture
- **Backend:** Node.js + Express. Serves the API and the built frontend on **one port** (e.g. 5173).
- **Database:** **SQLite** via `better-sqlite3` (single-user, local, transactional, zero-config). One
  `.db` file is the source of truth.
- **Frontend:** React + Vite (recommended for a 3-page app with a global filter). Built to static
  files and served by Express in production, so at runtime there is just **one Node process, one port**.
  (If the user prefers no build step, plain ES-module vanilla JS served by Express is acceptable — the
  reference is already vanilla — but React is the default recommendation.)
- **Engine:** the verified `computeTrade` is extracted into an **isomorphic `engine.js`** module used
  by BOTH the server and the frontend (it's pure JS, no DOM). Same math everywhere, one source of truth.
- **Prerequisite:** Node.js installed on the machine. (Later optional: package into a single `.exe`
  with `pkg`/`nexe` so Node isn't required, and/or wrap in Tauri for a double-click app — NOT v1.)

## Data directory & durability (the whole point)
All user data lives in one folder, e.g. `./data/`:
```
data/
  blotter.db          # SQLite — trades, fills, tags, meta, import batches
  images/             # chart-markup files, one per image (keeps the DB small)
```
- Nothing is stored in the browser. Clearing Chrome cache does nothing to the data.
- **Backup / move machine / cross-device = copy the `data/` folder** (or put it in a Google Drive
  folder so it's synced + backed up automatically). Keep a JSON export button as a secondary convenience.
- The data folder path is configurable (env var or a small config file) so it can point at a Drive folder.

## One-click launcher
- Windows `start-blotter.bat`: starts the Node server and opens the default browser at the localhost URL.
  (Equivalent `.command`/`.sh` for Mac/Linux optional.) Document a "run on login" option.
- `npm start` runs the server; `npm run build` builds the frontend; a single `npm run launch` can do both
  if not pre-built. Keep the daily path to literally double-clicking the `.bat`.

---

## SQLite schema (sketch — refine as needed, keep it normalized & simple)
```
meta(key TEXT PRIMARY KEY, value TEXT)                 -- title, equity_baseline, data_version
tags(id INTEGER PK, grp TEXT, name TEXT,               -- grp ∈ setups|tactics|mistakes|edges
     UNIQUE(grp, name))                                -- groups start EMPTY (no seeded rows)
trades(id TEXT PK, ticker, direction, stop, risk_override,
       notes, import_batch, created_at, updated_at)
fills(id TEXT PK, trade_id TEXT, kind, date, price REAL, shares REAL,
      seq INTEGER, source, n_amt REAL)                 -- kind ∈ entry|exit; source ∈ manual|import
trade_tags(trade_id TEXT, tag_id INTEGER)              -- many-to-many
images(id TEXT PK, trade_id TEXT, filename, created_at) -- file lives in data/images/<filename>
import_batches(id TEXT PK, created_at, source_name, counts_json)
```

## API surface (REST/JSON — thin server; CRUD + import + static)
- `GET  /api/state` → `{ meta, tagGroups, trades:[{...trade, fills, tags, images}] }` (load all on boot;
  dataset is small for one user). Filtering/stats/equity/calendar are computed on the **client** via the
  shared `engine.js`. SQLite is the durable store; we don't need SQL analytics.
- `POST /api/trades`, `PUT /api/trades/:id`, `DELETE /api/trades/:id`
- `GET/PUT /api/meta`; tag CRUD: `POST /api/tags`, `DELETE /api/tags/:id` (per group)
- `POST /api/import/preview` (raw file text in body) → parsed executions + reconstruction preview (no write)
- `POST /api/import/commit` → writes the batch; `DELETE /api/import/:batchId` → undo a batch
- `POST /api/images` (multipart) → saves to `data/images/`, returns `{id, filename}`; `GET /api/images/:id`
- All writes are transactional. Respond with the updated record so the client stays in sync.

---

## DO NOT change — accounting engine (port verbatim into engine.js; keep tests green)
Running **average cost**, fills processed chronologically (sort by date, then `seq`):
- entry → `openSh += shares; basis += shares*price`
- exit  → `sh = min(shares, openSh)`; long `pnl=(price - basis/openSh)*sh`,
  short `pnl=(basis/openSh - price)*sh`; then `basis -= (basis/openSh)*sh; openSh -= sh`.
  Flag `overSold` if an exit exceeds shares held.
- `avgIn`/`avgOut` share-weighted; status open/partial/closed; `realizedPct = realized/(avgIn*exited)*100`.
- **R anchored to the FIRST entry — pyramids never widen it:**
  `1R = (firstEntry.price − stop) × firstEntry.shares` (long; mirror short), or `riskOverride` if set;
  `R = totalRealized ÷ 1R`.
- Node acceptance tests (must stay green): (1) 100@10→100@12, stop9 ⇒ +200,+20%,+2R,closed.
  (2) buy100@10,buy50@11, sell60@12/40@13/50@14 ⇒ +390, avgIn 10.333, exited150, ~+25.2%.
  (3) buy100@10, sell50@12 ⇒ +100, remaining50, partial. (4) short100@50,cover100@45,stop52 ⇒ +500,+10%,+2.5R.
  (5) buy100@10, sell120@12 ⇒ +200 (clamped), overSold true. (6) override 50 ⇒ 1R=50.

## Tags — four groups, all EMPTY by default
`setups`, `tactics` (entry tactics), `mistakes`, `edges` (e.g. HV1/HVE, RS, n-factor, neglect — examples
only, do NOT seed them). Each group is independently managed and independently filterable. A trade carries
selected tags per group.

---

## Pages + one global filter (drives everything)
Top tabs / left nav: **Trades**, **Reports**, **Calendar**. A persistent global filter bar applies to all:
```
filter { dateFrom, dateTo, preset, symbol, direction(all|long|short),
         result(all|win|loss), tags:{setups:[],tactics:[],mistakes:[],edges:[]} }
```
- Tag filter = trade must contain **every** selected tag (AND). Date range → closed trade's close date for
  log/stats; equity curve & calendar attribute realised P&L to each **exit's own date** in range.
- Open positions always show on Trades regardless of date filter. Changing the filter re-renders the log,
  the Reports stats + equity curve, and the Calendar together.

### Trades
Open-positions strip (always) + filtered closed blotter; row → editor. Editor: ticker, direction, stop,
risk override, fills editor (live avg/remaining/realised/R via shared engine), **four** tag pickers
(add-inline + manage in Settings), notes, chart-image drop/paste. **Import executions** button here.

### Reports (Tradervue-style stat sheet + realised equity curve)
Over filtered **closed** trades, compute natively: total realised P&L, largest gain/loss, avg trade,
avg winner, avg loser, total/# winners(%)/# losers(%)/# scratch, win rate, profit factor, payoff
(avg win ÷ |avg loss|), expectancy ($ and R), avg R, avg hold (win/loss/scratch), max consecutive
wins/losses, P&L std dev, SQN = (avgTradePnL/stdDev)×√N (N≥2, stdDev>0), Kelly % = winRate −
(1−winRate)/payoff (payoff>0). Then the realised equity curve ($ and R toggle) for the filtered set.

### Calendar (realised P&L — like the Tradervue screenshots)
- Year overview: 12 month tiles for a selectable year (2023–2026…), days tinted by daily realised P&L,
  tile header = month P&L.
- Month drill-in: full grid, each day shows realised P&L + trade count, right-hand weekly totals
  (Week 1..5 P&L + count), header = monthly P&L.
- Day P&L = sum of realised P&L from exits dated that day; day "trades" = distinct trades realising that day.
- Respects the global filter; year/month nav is the calendar's own control, bounded further by the date range.

---

## Broker import (high-value, fiddly — the user's broker "xls" export)
**The export is tab-delimited text, not binary Excel.** Fixture: `sample_broker_export.xls`. Header + rows:
```
trade_dt  currency  acct_type  trd_type      symbol  dispdescr                     qty  price     n_amt
6/22/2026 USD       MARGIN     Buy (Stock)   QQQ     INVESCO QQQ TR UNIT SER 1      1    737.8599  737.86
6/22/2026 USD       MARGIN     Sell (Stock)  QQQ     INVESCO QQQ TR UNIT SER 1      -1   738.0907  -738.06
6/22/2026 USD       MARGIN     Buy (Stock)   QQQ     INVESCO QQQ TR UNIT SER 1      3    736.5999  "2,209.80"
6/22/2026 USD       MARGIN     Sell (Stock)  QQQ     INVESCO QQQ TR UNIT SER 1      -3   736.7201  "-2,210.10"
6/22/2026 USD       MARGIN     Buy (Stock)   BFLY    BUTTERFLY NETWORK INC COM CL A 683  7.11      "4,856.95"
```
### Parser (native — no SheetJS)
- TAB-delimited, CRLF; accept comma fallback (sniff header). Strip quotes + thousands separators
  (`"2,209.80"`→2209.80). Trim fields (`acct_type`="MARGIN "). `trade_dt` `M/D/YYYY` → `YYYY-MM-DD`.
  **No time exists** → same-day order = file row order (store as `seq`).
- Side from `trd_type` (Buy/Sell), confirmed by `qty` sign; shares = `abs(qty)`; price = `price`;
  keep `n_amt` for reference only. v1 handles `(Stock)` only; skip & report `(Option)`/unknown.
- Auto-detect this header set; if headers differ, show a column-mapping UI (don't hard-code one broker).
### Executions → trades (per symbol, chronological, continuing from existing OPEN positions)
- Track signed position. Leaving 0 opens a trade (buy⇒long, sell⇒short). |position|↑ = entry, ↓ = exit.
  Returning to 0 closes it; next exec opens fresh. Flip through 0 in one exec = split (close at 0, open
  opposite remainder) and flag for review. Imported fills: `source:"import"`, `seq`=row order. Stop/tags/
  notes stay manual (enrich after import).
### Safety
- **Preview before commit** ("3 new trades, 1 position extended, 2 skipped (options), N duplicates").
- **De-dup** (no exec IDs): key=`date|symbol|signedQty|price|n_amt` + occurrence counter for identical
  fills; skip already-present on re-import; show skipped count.
- Stamp each commit with `import_batch`; **Undo last import** removes only that batch (and now-empty trades).

---

## Build phases (ship a usable core first; stop for review after each)
- **Phase 0 — Scaffold + engine + persistence.** Express + SQLite + schema + `data/` folder + one-click
  launcher. Extract `engine.js` (isomorphic) with the Node test harness (6 cases) green. App shell with
  3 routes + global filter bar. Manual trade CRUD persisted to SQLite, 4 empty tag groups, image upload.
  End-to-end: add a trade, restart the server, it's still there.
- **Phase 1 — Broker import.** Parser + reconstruction + preview/commit + de-dup + undo, tested against
  `sample_broker_export.xls`. (Most of the risk lives here — get reconstruction right.)
- **Phase 2 — Reports page.** Full stat grid + filtered realised equity curve.
- **Phase 3 — Calendar page.** Year overview + month drill, daily/weekly/monthly realised P&L, filtered.
- **Phase 4 — Polish.** Backup/export button, data-folder config for Drive, launcher refinement;
  (optional, later) `.exe` packaging and/or Tauri shell.

At each phase: keep engine tests green, transactional writes, manual smoke test at localhost.
Confirm the plan for the phase before coding; stop at the end of each phase for review.
