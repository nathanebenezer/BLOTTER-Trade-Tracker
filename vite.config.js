import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

// Vite serves the React app from web/. The verified engine lives in
// shared/engine.js (one source of truth shared with the server), imported
// here via the @engine alias; fs.allow lets the dev server read it.
export default defineConfig({
  root: "web",
  plugins: [react()],
  resolve: {
    alias: { "@engine": path.resolve(root, "shared/engine.js") },
  },
  server: {
    port: 5173,
    fs: { allow: [root] },
    proxy: { "/api": "http://localhost:8787" },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
