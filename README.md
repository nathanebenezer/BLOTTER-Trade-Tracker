# Blotter — local swing-trading journal

A local-only, fully-offline trading journal. Node + Express + SQLite on the backend,
React (Vite) on the frontend, served on **one port**. SQLite is the source of truth;
the browser stores nothing important.

## Quick start

**Easiest (Windows):** double-click **`start-blotter.bat`**. On first run it installs
dependencies and builds the app, then opens <http://localhost:5173>.

**Manual:**
```bash
npm install        # once
npm run build      # build the frontend
npm start          # serve API + app at http://localhost:5173
```

**Development** (hot-reload frontend, auto-restart API):
```bash
npm run dev        # Vite on :5173 proxying /api to the API on :8787
```

**Tests** (the verified accounting engine — must stay green):
```bash
npm test
```

## Your data lives in `./data/`
```
data/
  blotter.db     # SQLite — trades, fills, tags, meta, images index
  images/        # chart-markup files, one per image
```
- **Backup / move machine = copy the `data/` folder.** Clearing your browser cache does nothing.
- Point it elsewhere (e.g. a Google Drive folder so it's synced + backed up) with the
  `BLOTTER_DATA_DIR` environment variable:
  ```bash
  BLOTTER_DATA_DIR="C:\Users\you\Google Drive\Blotter" npm start
  ```
- Change the port with `PORT` (default `5173`).

### Run on login (optional)
Put a shortcut to `start-blotter.bat` in your Startup folder
(`Win+R` → `shell:startup`) to launch Blotter when you sign in.