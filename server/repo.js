/* ============================================================ *
 *  Data access — all writes are transactional.
 *
 *  Shapes returned to the client use camelCase and group a trade's
 *  fills / tags / images inline, so GET /api/state can hand the
 *  whole dataset to the shared engine on the client.
 * ============================================================ */
import fs from "node:fs";
import path from "node:path";
import { db, IMAGES_DIR, TAG_GROUPS } from "./db.js";
import { computeTrade } from "../shared/engine.js";
import { parseExecutions, partitionDuplicates, reconstruct, dedupKey, distinctSymbols, applyIgnore } from "./import.js";

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const nowISO = () => new Date().toISOString();

// "" / null / undefined → null; otherwise a finite number (or null if NaN).
function numOrNull(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/* ---------- meta ---------- */
export function getMeta() {
  const rows = db.prepare("SELECT key, value FROM meta").all();
  const m = {};
  for (const r of rows) m[r.key] = r.value;
  let ignoreSymbols = [];
  try { ignoreSymbols = JSON.parse(m.ignore_symbols ?? "[]"); } catch { ignoreSymbols = []; }
  return {
    title: m.title ?? "Swing Journal",
    equity_baseline: Number(m.equity_baseline ?? 0) || 0,
    data_version: m.data_version ?? "1",
    ignoreSymbols: Array.isArray(ignoreSymbols) ? ignoreSymbols : [],
  };
}

const upsertMeta = db.prepare(
  "INSERT INTO meta (key, value) VALUES (@key, @value) " +
  "ON CONFLICT(key) DO UPDATE SET value = excluded.value"
);
export const setMeta = db.transaction((patch) => {
  for (const [key, value] of Object.entries(patch || {})) {
    // strings stored as-is; arrays/objects/numbers as JSON so they round-trip
    upsertMeta.run({ key, value: typeof value === "string" ? value : JSON.stringify(value) });
  }
  return getMeta();
});

/* ---------- tags ---------- */
export function listTagsGrouped() {
  const groups = Object.fromEntries(TAG_GROUPS.map((g) => [g, []]));
  const rows = db
    .prepare("SELECT id, grp, name FROM tags ORDER BY grp, name COLLATE NOCASE")
    .all();
  for (const r of rows) {
    (groups[r.grp] ??= []).push({ id: r.id, name: r.name });
  }
  return groups;
}

const insertTag = db.prepare("INSERT INTO tags (grp, name) VALUES (?, ?)");
export function createTag(grp, name) {
  if (!TAG_GROUPS.includes(grp)) throw new Error(`unknown tag group: ${grp}`);
  const clean = String(name || "").trim();
  if (!clean) throw new Error("tag name required");
  // idempotent on (grp, name)
  const existing = db
    .prepare("SELECT id, name FROM tags WHERE grp = ? AND name = ?")
    .get(grp, clean);
  if (existing) return { id: existing.id, grp, name: existing.name };
  const info = insertTag.run(grp, clean);
  return { id: Number(info.lastInsertRowid), grp, name: clean };
}

export function deleteTag(id) {
  db.prepare("DELETE FROM tags WHERE id = ?").run(id); // trade_tags cascade
}

/* ---------- trades (assembly) ---------- */
function rowToTrade(t) {
  return {
    id: t.id,
    ticker: t.ticker,
    direction: t.direction,
    stop: t.stop,
    riskOverride: t.risk_override,
    notes: t.notes,
    importBatch: t.import_batch,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    fills: [],
    tags: Object.fromEntries(TAG_GROUPS.map((g) => [g, []])),
    images: [],
  };
}

export function getState() {
  const meta = getMeta();
  const tagGroups = listTagsGrouped();

  // tag id -> group, so we can bucket each trade's tags
  const grpOf = new Map();
  for (const g of TAG_GROUPS) for (const tg of tagGroups[g]) grpOf.set(tg.id, g);

  const trades = db
    .prepare("SELECT * FROM trades ORDER BY created_at")
    .all()
    .map(rowToTrade);
  const byId = new Map(trades.map((t) => [t.id, t]));

  for (const f of db.prepare("SELECT * FROM fills ORDER BY seq, date").all()) {
    const t = byId.get(f.trade_id);
    if (!t) continue;
    t.fills.push({
      id: f.id, kind: f.kind, date: f.date, price: f.price,
      shares: f.shares, seq: f.seq, source: f.source, nAmt: f.n_amt,
    });
  }
  for (const tt of db.prepare("SELECT trade_id, tag_id FROM trade_tags").all()) {
    const t = byId.get(tt.trade_id);
    const g = grpOf.get(tt.tag_id);
    if (t && g) t.tags[g].push(tt.tag_id);
  }
  for (const im of db
    .prepare("SELECT id, trade_id, filename FROM images WHERE trade_id IS NOT NULL")
    .all()) {
    const t = byId.get(im.trade_id);
    if (t) t.images.push({ id: im.id, filename: im.filename });
  }

  return { meta, tagGroups, trades };
}

export function getTrade(id) {
  return getState().trades.find((t) => t.id === id) || null;
}

/* ---------- trades (writes) ---------- */
function flattenTagIds(input) {
  if (Array.isArray(input.tagIds)) return input.tagIds;
  const out = [];
  for (const g of TAG_GROUPS) {
    for (const id of input.tags?.[g] || []) out.push(id);
  }
  return out;
}

const insTrade = db.prepare(`
  INSERT INTO trades (id, ticker, direction, stop, risk_override, notes, import_batch, created_at, updated_at)
  VALUES (@id, @ticker, @direction, @stop, @risk_override, @notes, @import_batch, @created_at, @updated_at)
`);
const insFill = db.prepare(`
  INSERT INTO fills (id, trade_id, kind, date, price, shares, seq, source, n_amt, import_batch)
  VALUES (@id, @trade_id, @kind, @date, @price, @shares, @seq, @source, @n_amt, @import_batch)
`);
const insTradeTag = db.prepare(
  "INSERT OR IGNORE INTO trade_tags (trade_id, tag_id) VALUES (?, ?)"
);

function writeFills(tradeId, fills, importBatch = null) {
  (fills || []).forEach((f, i) => {
    insFill.run({
      id: f.id || uid(),
      trade_id: tradeId,
      kind: f.kind === "exit" ? "exit" : "entry",
      date: f.date,
      price: Number(f.price),
      shares: Number(f.shares),
      seq: f.seq != null ? Number(f.seq) : i,
      source: f.source === "import" ? "import" : "manual",
      n_amt: numOrNull(f.nAmt ?? f.n_amt),
      import_batch: f.importBatch ?? importBatch,
    });
  });
}

function writeTags(tradeId, input) {
  for (const tagId of flattenTagIds(input)) insTradeTag.run(tradeId, tagId);
}

// link uploaded images to this trade, and remove any that were dropped
function syncImages(tradeId, imageIds) {
  if (imageIds == null) return; // undefined => leave images untouched
  const keep = new Set(imageIds);
  const current = db
    .prepare("SELECT id, filename FROM images WHERE trade_id = ?")
    .all(tradeId);
  for (const im of current) {
    if (!keep.has(im.id)) {
      removeImageFile(im.filename);
      db.prepare("DELETE FROM images WHERE id = ?").run(im.id);
    }
  }
  const link = db.prepare("UPDATE images SET trade_id = ? WHERE id = ?");
  for (const id of imageIds) link.run(tradeId, id);
}

function removeImageFile(filename) {
  if (!filename) return;
  try {
    fs.rmSync(path.join(IMAGES_DIR, filename), { force: true });
  } catch { /* best effort */ }
}

export const createTrade = db.transaction((input) => {
  const id = input.id || uid();
  const ts = nowISO();
  insTrade.run({
    id,
    ticker: (input.ticker || "").trim().toUpperCase() || null,
    direction: input.direction === "short" ? "short" : "long",
    stop: numOrNull(input.stop),
    risk_override: numOrNull(input.riskOverride),
    notes: input.notes ?? null,
    import_batch: input.importBatch ?? null,
    created_at: input.createdAt || ts,   // preserved on restore; now() for new trades
    updated_at: ts,
  });
  writeFills(id, input.fills);
  writeTags(id, input);
  syncImages(id, input.images?.map((im) => im.id ?? im));
  return getTrade(id);
});

export const updateTrade = db.transaction((id, input) => {
  const existing = db.prepare("SELECT id, created_at FROM trades WHERE id = ?").get(id);
  if (!existing) return null;
  db.prepare(`
    UPDATE trades SET ticker=@ticker, direction=@direction, stop=@stop,
      risk_override=@risk_override, notes=@notes, updated_at=@updated_at
    WHERE id=@id
  `).run({
    id,
    ticker: (input.ticker || "").trim().toUpperCase() || null,
    direction: input.direction === "short" ? "short" : "long",
    stop: numOrNull(input.stop),
    risk_override: numOrNull(input.riskOverride),
    notes: input.notes ?? null,
    updated_at: nowISO(),
  });
  // fills + tags are fully rewritten from the submitted editor state
  db.prepare("DELETE FROM fills WHERE trade_id = ?").run(id);
  db.prepare("DELETE FROM trade_tags WHERE trade_id = ?").run(id);
  writeFills(id, input.fills);
  writeTags(id, input);
  syncImages(id, input.images?.map((im) => im.id ?? im));
  return getTrade(id);
});

export const deleteTrade = db.transaction((id) => {
  const imgs = db.prepare("SELECT filename FROM images WHERE trade_id = ?").all(id);
  for (const im of imgs) removeImageFile(im.filename);
  const info = db.prepare("DELETE FROM trades WHERE id = ?").run(id); // cascades
  return info.changes > 0;
});

/* ---------- images ---------- */
const insImage = db.prepare(
  "INSERT INTO images (id, trade_id, filename, created_at) VALUES (?, ?, ?, ?)"
);
export function recordImage(filename, tradeId = null) {
  const id = uid();
  insImage.run(id, tradeId, filename, nowISO());
  return { id, filename };
}

export function getImageFilename(id) {
  const row = db.prepare("SELECT filename FROM images WHERE id = ?").get(id);
  return row?.filename || null;
}

/* ============================================================ *
 *  Broker import — preview / commit / undo
 * ============================================================ */

// symbol -> { tradeId, direction, signedRemaining } for currently-open trades,
// so an import continues an existing position rather than opening a duplicate.
export function openPositionContext() {
  const { trades } = getState();
  const ctx = {};
  for (const t of trades) {
    const c = computeTrade(t);
    if (c.status === "closed") continue;
    const sym = (t.ticker || "").toUpperCase();
    if (!sym) continue;
    const signedRemaining = c.dirLong ? c.remaining : -c.remaining;
    const prev = ctx[sym];
    if (!prev || t.createdAt > prev._createdAt) {
      ctx[sym] = {
        tradeId: t.id,
        direction: t.direction || (c.dirLong ? "long" : "short"),
        signedRemaining,
        _createdAt: t.createdAt,
      };
    }
  }
  for (const k of Object.keys(ctx)) delete ctx[k]._createdAt;
  return ctx;
}

// multiset of dedup keys for import fills already stored, for re-import skipping
function existingImportFillCounts() {
  const rows = db.prepare(`
    SELECT f.date, f.price, f.shares, f.kind, f.n_amt, t.ticker, t.direction
    FROM fills f JOIN trades t ON t.id = f.trade_id
    WHERE f.source = 'import'
  `).all();
  const counts = new Map();
  for (const r of rows) {
    const long = (r.direction || "long") !== "short";
    const signedQty = r.kind === "entry" ? (long ? 1 : -1) * r.shares : (long ? -1 : 1) * r.shares;
    const key = dedupKey({ date: r.date, symbol: (r.ticker || "").toUpperCase(), signedQty, price: r.price, nAmt: r.n_amt });
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

// parse → drop ignored symbols → de-dup → reconstruct against open positions (no write)
function planImport(text, ignoreSymbols = []) {
  const { executions, skipped } = parseExecutions(text);
  const symbols = distinctSymbols(executions);
  const { kept, ignored } = applyIgnore(executions, ignoreSymbols);
  const { fresh, duplicates } = partitionDuplicates(kept, existingImportFillCounts());
  const { newTrades, extendedTrades } = reconstruct(fresh, openPositionContext());
  return { executions, skipped, symbols, ignored, fresh, duplicates, newTrades, extendedTrades };
}

export function previewImport(text, ignoreSymbols = []) {
  const p = planImport(text, ignoreSymbols);
  const newTrades = p.newTrades.map((t) => {
    const c = computeTrade({ direction: t.direction, fills: t.fills });
    return {
      symbol: t.symbol, direction: t.direction, flagged: !!t.flagged,
      fills: t.fills.map((f) => ({ kind: f.kind, date: f.date, price: f.price, shares: f.shares })),
      status: c.status, realized: c.realized, remaining: c.remaining,
    };
  });
  const extended = p.extendedTrades.map((et) => {
    const t = getTrade(et.tradeId);
    const merged = t ? [...t.fills, ...et.addedFills] : et.addedFills;
    const c = computeTrade({ direction: t?.direction || "long", stop: t?.stop, riskOverride: t?.riskOverride, fills: merged });
    return {
      symbol: et.symbol, tradeId: et.tradeId, ticker: t?.ticker || et.symbol,
      added: et.addedFills.length,
      addedFills: et.addedFills.map((f) => ({ kind: f.kind, date: f.date, price: f.price, shares: f.shares })),
      resultingStatus: c.status,
    };
  });
  const counts = {
    newTrades: p.newTrades.length, extended: p.extendedTrades.length,
    skipped: p.skipped.length, ignored: p.ignored.length, duplicates: p.duplicates.length,
    rows: p.executions.length + p.skipped.length,
  };
  return {
    counts, newTrades, extended, symbols: p.symbols,
    skipped: p.skipped.map((s) => ({ symbol: s.symbol, reason: s.reason })),
    duplicates: p.duplicates.map((d) => ({ symbol: d.symbol, date: d.date, side: d.side, shares: d.shares, price: d.price })),
  };
}

export const commitImport = db.transaction((text, sourceName, ignoreSymbols = []) => {
  const p = planImport(text, ignoreSymbols);
  const batchId = uid();
  const counts = {
    newTrades: p.newTrades.length, extended: p.extendedTrades.length,
    skipped: p.skipped.length, ignored: p.ignored.length, duplicates: p.duplicates.length,
    rows: p.executions.length + p.skipped.length,
  };
  // insert the batch row first so the trades.import_batch FK is satisfied
  db.prepare(
    "INSERT INTO import_batches (id, created_at, source_name, counts_json) VALUES (?, ?, ?, ?)"
  ).run(batchId, nowISO(), sourceName || null, JSON.stringify(counts));

  for (const nt of p.newTrades) {
    const id = uid();
    const ts = nowISO();
    insTrade.run({
      id, ticker: nt.symbol, direction: nt.direction === "short" ? "short" : "long",
      stop: null, risk_override: null, notes: null, import_batch: batchId,
      created_at: ts, updated_at: ts,
    });
    writeFills(id, nt.fills, batchId);
  }

  for (const et of p.extendedTrades) {
    const row = db.prepare("SELECT COALESCE(MAX(seq), -1) AS m FROM fills WHERE trade_id = ?").get(et.tradeId);
    let s = row.m + 1;
    writeFills(et.tradeId, et.addedFills.map((f) => ({ ...f, seq: s++ })), batchId);
    db.prepare("UPDATE trades SET updated_at = ? WHERE id = ?").run(nowISO(), et.tradeId);
  }

  return { batchId, counts };
});

export const undoImport = db.transaction((batchId) => {
  const batch = db.prepare("SELECT id FROM import_batches WHERE id = ?").get(batchId);
  if (!batch) return { ok: false };
  db.prepare("DELETE FROM fills WHERE import_batch = ?").run(batchId);
  // remove trades this batch created that now have no fills (extended manual trades keep theirs)
  db.prepare(
    "DELETE FROM trades WHERE import_batch = ? AND id NOT IN (SELECT DISTINCT trade_id FROM fills)"
  ).run(batchId);
  db.prepare("DELETE FROM import_batches WHERE id = ?").run(batchId);
  return { ok: true };
});

/* ============================================================ *
 *  JSON backup — export / restore (portable, id-independent)
 * ============================================================ */
export function exportAll() {
  const { meta, tagGroups, trades } = getState();
  const idName = new Map();
  for (const g of TAG_GROUPS) for (const tg of tagGroups[g] || []) idName.set(tg.id, tg.name);
  const tags = Object.fromEntries(TAG_GROUPS.map((g) => [g, (tagGroups[g] || []).map((t) => t.name)]));
  const outTrades = trades.map((t) => ({
    ticker: t.ticker, direction: t.direction, stop: t.stop, riskOverride: t.riskOverride,
    notes: t.notes, createdAt: t.createdAt,
    fills: t.fills.map((f) => ({ kind: f.kind, date: f.date, price: f.price, shares: f.shares, seq: f.seq, source: f.source, nAmt: f.nAmt })),
    tags: Object.fromEntries(TAG_GROUPS.map((g) => [g, (t.tags[g] || []).map((id) => idName.get(id)).filter(Boolean)])),
    images: t.images.map((im) => ({ filename: im.filename })),
  }));
  return { app: "blotter", version: 1, exportedAt: nowISO(), meta, tags, trades: outTrades };
}

export const restoreAll = db.transaction((json) => {
  if (!json || json.app !== "blotter" || !Array.isArray(json.trades)) {
    throw new Error("Not a Blotter backup file.");
  }
  // wipe (fills / trade_tags / images rows cascade from trades)
  db.prepare("DELETE FROM trades").run();
  db.prepare("DELETE FROM tags").run();
  db.prepare("DELETE FROM import_batches").run();

  if (json.meta) {
    const m = {};
    if (json.meta.title != null) m.title = json.meta.title;
    if (json.meta.equity_baseline != null) m.equity_baseline = json.meta.equity_baseline;
    if (json.meta.ignoreSymbols != null) m.ignore_symbols = json.meta.ignoreSymbols;
    setMeta(m);
  }

  const nameToId = {};
  for (const g of TAG_GROUPS) {
    nameToId[g] = {};
    for (const name of json.tags?.[g] || []) nameToId[g][name] = createTag(g, name).id;
  }

  for (const t of json.trades) {
    const tags = Object.fromEntries(
      TAG_GROUPS.map((g) => [g, (t.tags?.[g] || []).map((n) => nameToId[g]?.[n]).filter(Boolean)])
    );
    const created = createTrade({
      ticker: t.ticker, direction: t.direction, stop: t.stop, riskOverride: t.riskOverride,
      notes: t.notes, createdAt: t.createdAt, fills: t.fills, tags,
    });
    for (const im of t.images || []) if (im.filename) recordImage(im.filename, created.id);
  }
  return getState();
});

/* ============================================================ *
 *  Bulk trade actions (selection-driven, from the Trades page)
 * ============================================================ */
export const bulkTag = db.transaction((tradeIds, tagIds, op) => {
  const ids = [...new Set((tradeIds || []).filter(Boolean))];
  const tags = [...new Set((tagIds || []).map(Number).filter(Boolean))];
  if (!ids.length || !tags.length) return getState();
  if (op === "remove") {
    const stmt = db.prepare("DELETE FROM trade_tags WHERE trade_id = ? AND tag_id = ?");
    for (const tid of ids) for (const tag of tags) stmt.run(tid, tag);
  } else {
    for (const tid of ids) for (const tag of tags) insTradeTag.run(tid, tag); // INSERT OR IGNORE
  }
  const upd = db.prepare("UPDATE trades SET updated_at = ? WHERE id = ?");
  const now = nowISO();
  for (const tid of ids) upd.run(now, tid);
  return getState();
});
