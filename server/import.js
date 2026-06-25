/* ============================================================ *
 *  Broker-export import — PURE functions (no DB, no engine).
 *  Parses the fixed tab-delimited broker file and reconstructs
 *  executions into trades per BUILD_BRIEF §"Broker import".
 *  Unit-tested in test/import.test.js against the real fixture.
 * ============================================================ */

export const KNOWN_HEADER = [
  "trade_dt", "currency", "acct_type", "trd_type",
  "symbol", "dispdescr", "qty", "price", "n_amt",
];

// strip wrapping quotes + thousands separators → finite Number | null
export function cleanNumber(s) {
  if (s == null) return null;
  const str = String(s).trim().replace(/^"+|"+$/g, "").replace(/,/g, "").trim();
  if (str === "") return null;
  const n = Number(str);
  return Number.isFinite(n) ? n : null;
}

// "M/D/YYYY" → "YYYY-MM-DD" (leaves already-ISO / unknown strings untouched)
export function toISO(d) {
  const str = String(d ?? "").trim();
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return str;
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

// Quote-aware field split — handles a delimiter inside a quoted field
// (e.g. comma-delimited "2,209.80"). Trims + unwraps each field.
function splitFields(line, delim) {
  const out = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delim) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((f) => f.trim());
}

/* ---------- parse executions ---------- */
export function parseExecutions(text) {
  const lines = String(text ?? "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (!lines.length) throw new Error("The file is empty.");

  const delim = lines[0].includes("\t") ? "\t" : lines[0].includes(",") ? "," : "\t";
  // Some broker exports end every row with a trailing delimiter, yielding an
  // empty trailing column — drop those so the header matches our known schema.
  const rawHeader = splitFields(lines[0], delim).map((h) => h.toLowerCase());
  while (rawHeader.length > KNOWN_HEADER.length && rawHeader[rawHeader.length - 1] === "") rawHeader.pop();
  const header = rawHeader;
  const headerOk =
    header.length === KNOWN_HEADER.length && KNOWN_HEADER.every((h, i) => header[i] === h);
  if (!headerOk) {
    throw new Error(
      `Unrecognized broker file. Expected columns: ${KNOWN_HEADER.join(", ")}. ` +
      `Found: ${header.join(", ") || "(none)"}.`
    );
  }
  const idx = Object.fromEntries(KNOWN_HEADER.map((h, i) => [h, i]));

  const executions = [];
  const skipped = [];
  for (let r = 1; r < lines.length; r++) {
    const f = splitFields(lines[r], delim);
    const seq = r - 1; // 0-based file row order (no timestamps → row order is the tie-break)
    const trdType = (f[idx.trd_type] || "").trim();
    const symbol = (f[idx.symbol] || "").trim().toUpperCase();
    const raw = lines[r];

    // an execution must be a Buy/Sell of a (Stock); everything else
    // (options, fees, interest, journal entries) is a non-trade row
    const isStock = /\(stock\)/i.test(trdType);
    const isBuy = /buy/i.test(trdType);
    const isSell = /sell/i.test(trdType);
    if (!isStock || (!isBuy && !isSell)) {
      const reason = /\(option\)/i.test(trdType)
        ? "option (v1 handles stocks only)"
        : `non-execution row: ${trdType || "(blank)"}`;
      skipped.push({ seq, symbol, reason, raw });
      continue;
    }

    const signedRaw = cleanNumber(f[idx.qty]);
    const price = cleanNumber(f[idx.price]);
    const nAmt = cleanNumber(f[idx.n_amt]);
    const date = toISO(f[idx.trade_dt]);

    if (!symbol || signedRaw == null || signedRaw === 0 || price == null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      skipped.push({ seq, symbol, reason: "incomplete or zero-share row", raw });
      continue;
    }

    // side from Buy/Sell, confirmed by qty sign (trust the sign on conflict)
    const side = signedRaw >= 0 ? "buy" : "sell";
    const shares = Math.abs(signedRaw);
    const signedQty = side === "buy" ? shares : -shares;
    executions.push({ seq, date, symbol, side, shares, signedQty, price, nAmt, raw });
  }
  return { executions, skipped, columns: header };
}

/* ---------- de-dup ---------- */
// key identifies an identical fill across imports (no broker IDs exist)
export function dedupKey(ex) {
  return [ex.date, ex.symbol, ex.signedQty, ex.price, ex.nAmt].join("|");
}

// existingCounts: Map<key, count> of import fills already in the DB.
// Returns the incoming list split into fresh vs duplicate, honouring an
// occurrence counter so genuine repeats of an identical fill still import.
export function partitionDuplicates(executions, existingCounts = new Map()) {
  const remaining = new Map(existingCounts);
  const fresh = [], duplicates = [];
  for (const ex of executions) {
    const key = dedupKey(ex);
    const left = remaining.get(key) || 0;
    if (left > 0) { duplicates.push(ex); remaining.set(key, left - 1); }
    else fresh.push(ex);
  }
  return { fresh, duplicates };
}

/* ---------- ignore-symbols ---------- */
// distinct execution symbols with counts (sorted) for the import preview checklist
export function distinctSymbols(executions) {
  const m = new Map();
  for (const e of executions) m.set(e.symbol, (m.get(e.symbol) || 0) + 1);
  return [...m.entries()]
    .map(([symbol, count]) => ({ symbol, count }))
    .sort((a, b) => (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0));
}

// split executions into kept vs ignored by symbol (case-insensitive)
export function applyIgnore(executions, ignore) {
  const set = new Set((ignore || []).map((s) => String(s).trim().toUpperCase()).filter(Boolean));
  const kept = [], ignored = [];
  for (const e of executions) (set.has(e.symbol) ? ignored : kept).push(e);
  return { kept, ignored };
}

/* ---------- reconstruct executions → trades ---------- */
// openContext: { SYMBOL: { tradeId, direction, signedRemaining } }
//   signedRemaining > 0 long shares held, < 0 short shares held.
export function reconstruct(executions, openContext = {}) {
  const sorted = [...executions].sort(
    (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.seq - b.seq)
  );

  const state = {};                 // symbol -> { position, cur }
  const newTrades = [];             // [{ symbol, direction, fills, flagged }]
  const extendedById = new Map();   // tradeId -> { tradeId, symbol, addedFills }

  for (const ex of sorted) {
    const sym = ex.symbol;
    if (!state[sym]) {
      const oc = openContext[sym];
      state[sym] = oc
        ? { position: oc.signedRemaining, cur: { kind: "existing", tradeId: oc.tradeId, direction: oc.direction } }
        : { position: 0, cur: null };
    }
    const st = state[sym];
    const signed = ex.signedQty;
    const mkFill = (kind, shares) => ({
      kind, date: ex.date, price: ex.price, shares, seq: ex.seq, nAmt: ex.nAmt, source: "import",
    });
    const pushFill = (fill) => {
      if (st.cur.kind === "existing") {
        let rec = extendedById.get(st.cur.tradeId);
        if (!rec) { rec = { tradeId: st.cur.tradeId, symbol: sym, addedFills: [] }; extendedById.set(st.cur.tradeId, rec); }
        rec.addedFills.push(fill);
      } else {
        st.cur.ref.fills.push(fill);
      }
    };
    const openTrade = (direction, fill, flagged = false) => {
      const t = { symbol: sym, direction, fills: [fill], flagged };
      newTrades.push(t);
      st.cur = { kind: "new", ref: t, direction };
    };

    if (st.position === 0 || st.cur == null) {
      openTrade(signed > 0 ? "long" : "short", mkFill("entry", Math.abs(signed)));
      st.position = signed;
      continue;
    }

    const sameSign = (st.position > 0) === (signed > 0);
    if (sameSign) {
      pushFill(mkFill("entry", Math.abs(signed)));     // pyramid
      st.position += signed;
    } else {
      const absPos = Math.abs(st.position);
      const absQty = Math.abs(signed);
      if (absQty <= absPos) {
        pushFill(mkFill("exit", absQty));
        st.position += signed;
        if (Math.abs(st.position) < 1e-9) { st.position = 0; st.cur = null; }   // closed
      } else {
        // flip through zero → close remainder, open opposite with leftover (flagged)
        pushFill(mkFill("exit", absPos));
        const leftover = absQty - absPos;
        st.position = 0; st.cur = null;
        openTrade(signed > 0 ? "long" : "short", mkFill("entry", leftover), true);
        st.position = signed > 0 ? leftover : -leftover;
      }
    }
  }

  return { newTrades, extendedTrades: [...extendedById.values()] };
}
