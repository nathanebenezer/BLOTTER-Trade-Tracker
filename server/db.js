/* ============================================================ *
 *  SQLite bootstrap — the single source of truth.
 *
 *  One .db file + an images/ folder, both under the data dir.
 *  Data dir resolves from BLOTTER_DATA_DIR (so it can point at a
 *  Google Drive folder), else ./data next to the project root.
 *
 *  Tables follow BUILD_BRIEF §"SQLite schema". Tag groups start
 *  EMPTY — nothing is seeded.
 * ============================================================ */
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

export const DATA_DIR = process.env.BLOTTER_DATA_DIR
  ? path.resolve(process.env.BLOTTER_DATA_DIR)
  : path.join(PROJECT_ROOT, "data");
export const IMAGES_DIR = path.join(DATA_DIR, "images");
export const DB_PATH = path.join(DATA_DIR, "blotter.db");

// Ensure the data folder + images subfolder exist before opening the db.
fs.mkdirSync(IMAGES_DIR, { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");   // durable + concurrent reads for a single-user app
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS tags (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    grp  TEXT NOT NULL,                       -- setups | tactics | mistakes | edges
    name TEXT NOT NULL,
    UNIQUE(grp, name)
  );

  CREATE TABLE IF NOT EXISTS trades (
    id            TEXT PRIMARY KEY,
    ticker        TEXT,
    direction     TEXT NOT NULL DEFAULT 'long',  -- long | short
    stop          REAL,
    risk_override REAL,
    notes         TEXT,
    import_batch  TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    FOREIGN KEY (import_batch) REFERENCES import_batches(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS fills (
    id       TEXT PRIMARY KEY,
    trade_id TEXT NOT NULL,
    kind     TEXT NOT NULL,                   -- entry | exit
    date     TEXT NOT NULL,                   -- YYYY-MM-DD
    price    REAL NOT NULL,
    shares   REAL NOT NULL,
    seq      INTEGER NOT NULL DEFAULT 0,      -- tie-break for same-day ordering
    source   TEXT NOT NULL DEFAULT 'manual',  -- manual | import
    n_amt    REAL,                            -- broker net amount, reference only
    import_batch TEXT,                        -- batch that added this fill (for precise undo)
    FOREIGN KEY (trade_id) REFERENCES trades(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS trade_tags (
    trade_id TEXT NOT NULL,
    tag_id   INTEGER NOT NULL,
    PRIMARY KEY (trade_id, tag_id),
    FOREIGN KEY (trade_id) REFERENCES trades(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id)   REFERENCES tags(id)   ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS images (
    id         TEXT PRIMARY KEY,
    trade_id   TEXT,
    filename   TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (trade_id) REFERENCES trades(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS import_batches (
    id          TEXT PRIMARY KEY,
    created_at  TEXT NOT NULL,
    source_name TEXT,
    counts_json TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_fills_trade ON fills(trade_id);
  CREATE INDEX IF NOT EXISTS idx_trade_tags_trade ON trade_tags(trade_id);
  CREATE INDEX IF NOT EXISTS idx_images_trade ON images(trade_id);
`);

// Migration: add fills.import_batch to DBs created before Phase 1 (idempotent).
const fillCols = db.prepare("PRAGMA table_info(fills)").all().map((c) => c.name);
if (!fillCols.includes("import_batch")) {
  db.exec("ALTER TABLE fills ADD COLUMN import_batch TEXT");
}
db.exec("CREATE INDEX IF NOT EXISTS idx_fills_batch ON fills(import_batch)");

// Seed meta defaults once (NOT tags — tag groups start empty by design).
const metaDefaults = {
  title: "Swing Journal",
  equity_baseline: "0",
  data_version: "1",
};
const hasMeta = db.prepare("SELECT 1 FROM meta WHERE key = ?");
const putMeta = db.prepare("INSERT INTO meta (key, value) VALUES (?, ?)");
for (const [k, v] of Object.entries(metaDefaults)) {
  if (!hasMeta.get(k)) putMeta.run(k, v);
}

export const TAG_GROUPS = ["setups", "tactics", "mistakes", "edges"];
