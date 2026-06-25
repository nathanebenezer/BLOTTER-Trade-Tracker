/* ============================================================ *
 *  Blotter server — Express API + static frontend, one port.
 *
 *  SQLite is the source of truth (server/db.js). At runtime this
 *  is the only process: it serves the JSON API under /api and, in
 *  production, the built React app from web/dist.
 * ============================================================ */
import express from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DATA_DIR, IMAGES_DIR } from "./db.js";
import {
  getState, getMeta, setMeta,
  createTrade, updateTrade, deleteTrade,
  listTagsGrouped, createTag, deleteTag,
  recordImage, getImageFilename, uid,
  previewImport, commitImport, undoImport,
  exportAll, restoreAll,
  bulkTag,
} from "./repo.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DIST = path.join(PROJECT_ROOT, "web", "dist");
const PORT = Number(process.env.PORT) || 5173;

const app = express();
app.use(express.json({ limit: "5mb" }));

/* ---------- image upload (multipart → data/images) ---------- */
const MIME_EXT = {
  "image/png": ".png", "image/jpeg": ".jpg", "image/jpg": ".jpg",
  "image/gif": ".gif", "image/webp": ".webp", "image/avif": ".avif",
};
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, IMAGES_DIR),
  filename: (_req, file, cb) => {
    const ext = MIME_EXT[file.mimetype] || path.extname(file.originalname) || ".png";
    cb(null, uid() + ext);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    cb(null, /^image\//.test(file.mimetype)),
});

/* ---------- helpers ---------- */
const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/* ---------- API ---------- */
app.get("/api/state", wrap((_req, res) => res.json(getState())));

/* ---------- JSON backup ---------- */
app.get("/api/export", wrap((_req, res) => res.json(exportAll())));
app.post("/api/restore", wrap((req, res) => {
  if (!req.body || typeof req.body !== "object") {
    return res.status(400).json({ error: "No backup data provided." });
  }
  res.json(restoreAll(req.body));
}));

app.get("/api/meta", wrap((_req, res) => res.json(getMeta())));
app.put("/api/meta", wrap((req, res) => res.json(setMeta(req.body || {}))));

app.post("/api/trades", wrap((req, res) => {
  const t = createTrade(req.body || {});
  res.status(201).json(t);
}));
app.put("/api/trades/:id", wrap((req, res) => {
  const t = updateTrade(req.params.id, req.body || {});
  if (!t) return res.status(404).json({ error: "trade not found" });
  res.json(t);
}));
app.delete("/api/trades/:id", wrap((req, res) => {
  const ok = deleteTrade(req.params.id);
  if (!ok) return res.status(404).json({ error: "trade not found" });
  res.json({ ok: true });
}));

/* ---------- bulk actions ---------- */
app.post("/api/trades/bulk-tags", wrap((req, res) => {
  const { tradeIds, tagIds, op } = req.body || {};
  res.json(bulkTag(tradeIds, tagIds, op === "remove" ? "remove" : "add"));
}));

app.get("/api/tags", wrap((_req, res) => res.json(listTagsGrouped())));
app.post("/api/tags", wrap((req, res) => {
  const { grp, name } = req.body || {};
  res.status(201).json(createTag(grp, name));
}));
app.delete("/api/tags/:id", wrap((req, res) => {
  deleteTag(Number(req.params.id));
  res.json({ ok: true });
}));

app.post("/api/images", upload.single("file"), wrap((req, res) => {
  if (!req.file) return res.status(400).json({ error: "no image uploaded" });
  const tradeId = req.body?.tradeId || null;
  res.status(201).json(recordImage(req.file.filename, tradeId));
}));
app.get("/api/images/:id", wrap((req, res) => {
  const filename = getImageFilename(req.params.id);
  if (!filename) return res.status(404).json({ error: "image not found" });
  res.sendFile(path.join(IMAGES_DIR, filename));
}));

/* ---------- broker import ---------- */
app.post("/api/import/preview", wrap((req, res) => {
  const text = req.body?.text;
  if (typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "No file contents provided." });
  }
  const ignore = Array.isArray(req.body?.ignoreSymbols) ? req.body.ignoreSymbols : [];
  res.json(previewImport(text, ignore));
}));
app.post("/api/import/commit", wrap((req, res) => {
  const text = req.body?.text;
  if (typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "No file contents provided." });
  }
  const ignore = Array.isArray(req.body?.ignoreSymbols) ? req.body.ignoreSymbols : [];
  res.status(201).json(commitImport(text, req.body?.sourceName, ignore));
}));
app.delete("/api/import/:batchId", wrap((req, res) => {
  const r = undoImport(req.params.batchId);
  if (!r.ok) return res.status(404).json({ error: "import batch not found" });
  res.json(r);
}));

/* ---------- static frontend (production) ---------- */
const distExists = fs.existsSync(path.join(DIST, "index.html"));
if (distExists) {
  app.use(express.static(DIST));
  // SPA fallback: any non-API GET serves index.html (client-side routing)
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api")) {
      return res.sendFile(path.join(DIST, "index.html"));
    }
    next();
  });
}

/* ---------- error handler ---------- */
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 400).json({ error: err.message || "request failed" });
});

app.listen(PORT, () => {
  console.log(`\n  Blotter running → http://localhost:${PORT}`);
  console.log(`  Data folder     → ${DATA_DIR}`);
  if (!distExists) {
    console.log("  (frontend not built — run `npm run build`, or use `npm run dev`)\n");
  } else {
    console.log("");
  }
});
