/* ============================================================ *
 *  Broker-import tests — parser + reconstruction against the small
 *  committed fixture (sample_broker_export.xls) plus an inline
 *  synthetic broker export for shorts / non-executions / ignore.
 *  Engine tests stay green independently.
 * ============================================================ */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseExecutions, reconstruct, partitionDuplicates, dedupKey, cleanNumber, toISO,
  distinctSymbols, applyIgnore,
} from "../server/import.js";
import { computeTrade } from "../shared/engine.js";

const fixture = readFileSync(new URL("../sample_broker_export.xls", import.meta.url), "utf8");

// Inline synthetic broker export — replaces the personal ExcelReport*.xls files
// (removed from the repo). Tab-delimited KNOWN_HEADER columns; mixes stock
// buys/sells, sell-from-flat shorts, and non-execution rows that must be skipped.
const H = "trade_dt\tcurrency\tacct_type\ttrd_type\tsymbol\tdispdescr\tqty\tprice\tn_amt";
const R = (dt, trd, sym, qty, price) => [dt, "USD", "MARGIN", trd, sym, "desc", qty, price, ""].join("\t");
const fixtureMixed = [
  H,
  R("5/1/2026", "Buy (Stock)", "SGOV", 100, 50),
  R("5/2/2026", "Buy (Stock)", "SGOV", 50, 51),
  R("5/3/2026", "Sell (Stock)", "SGOV", -150, 52),   // SGOV: long round-trip (×3 execs)
  R("5/1/2026", "Sell (Stock)", "APPS", -21, 10),
  R("5/2/2026", "Sell (Stock)", "APPS", -19, 10),
  R("5/3/2026", "Sell (Stock)", "APPS", -17, 10),
  R("5/4/2026", "Sell (Stock)", "APPS", -79, 10),    // APPS: sells from flat → short (136 sh)
  R("5/1/2026", "Sell (Stock)", "INOD", -30, 5),
  R("5/2/2026", "Sell (Stock)", "INOD", -20, 5),     // INOD: short
  R("5/1/2026", "Sell (Stock)", "OSS", -40, 8),      // OSS: short
  R("5/1/2026", "Buy (Stock)", "QQQ", 10, 100),
  R("5/2/2026", "Sell (Stock)", "QQQ", -10, 101),    // QQQ: long round-trip
  R("5/1/2026", "Journal Entry", "", 0, 0),
  R("5/1/2026", "Credit/Margin Interest", "", 0, 0),
  R("5/1/2026", "OMS/Prop Fee", "", 0, 0),
  R("5/1/2026", "Buy (Option)", "AAPL", 1, 2),       // option → skipped (stocks only)
].join("\n");

test("helpers — number cleaning + date conversion", () => {
  assert.equal(cleanNumber('"2,209.80"'), 2209.80);
  assert.equal(cleanNumber('"-2,210.10"'), -2210.10);
  assert.equal(cleanNumber("737.86"), 737.86);
  assert.equal(cleanNumber(""), null);
  assert.equal(toISO("6/22/2026"), "2026-06-22");
  assert.equal(toISO("12/3/2026"), "2026-12-03");
});

test("parse — fixture yields 5 stock executions, cleaned", () => {
  const { executions, skipped } = parseExecutions(fixture);
  assert.equal(executions.length, 5);
  assert.equal(skipped.length, 0);

  assert.equal(executions[0].date, "2026-06-22");   // M/D/YYYY → ISO
  assert.equal(executions[0].symbol, "QQQ");
  assert.equal(executions[0].side, "buy");
  assert.equal(executions[0].shares, 1);
  assert.equal(executions[1].side, "sell");          // qty -1
  assert.equal(executions[1].nAmt, -738.06);
  assert.equal(executions[2].nAmt, 2209.80);         // "2,209.80" → number
  assert.equal(executions[4].symbol, "BFLY");
  assert.equal(executions[4].shares, 683);
});

test("parse — rejects an unrecognized header", () => {
  assert.throws(() => parseExecutions("a\tb\tc\n1\t2\t3"), /Unrecognized broker file/);
});

test("parse — tolerates a trailing empty column from a trailing delimiter", () => {
  // some broker exports end every row with a tab, yielding an empty 10th column
  const header = "trade_dt\tcurrency\tacct_type\ttrd_type\tsymbol\tdispdescr\tqty\tprice\tn_amt\t";
  const row = "4/1/2026\tUSD\tMARGIN\tBuy (Stock)\tSGOV\tISHARES\t526\t100.39\t52,805.77\t";
  const { executions } = parseExecutions(`${header}\n${row}`);
  assert.equal(executions.length, 1);
  assert.equal(executions[0].symbol, "SGOV");
  assert.equal(executions[0].shares, 526);
});

test("reconstruct — fixture → QQQ#1 closed, QQQ#2 closed, BFLY open", () => {
  const { executions } = parseExecutions(fixture);
  const { newTrades, extendedTrades } = reconstruct(executions, {});
  assert.equal(newTrades.length, 3);
  assert.equal(extendedTrades.length, 0);

  const [q1, q2, bfly] = newTrades;

  assert.equal(q1.symbol, "QQQ");
  assert.equal(q1.direction, "long");
  assert.deepEqual(q1.fills.map((f) => [f.kind, f.shares, f.price]),
    [["entry", 1, 737.8599], ["exit", 1, 738.0907]]);
  assert.equal(computeTrade({ direction: q1.direction, fills: q1.fills }).status, "closed");

  assert.deepEqual(q2.fills.map((f) => [f.kind, f.shares, f.price]),
    [["entry", 3, 736.5999], ["exit", 3, 736.7201]]);
  assert.equal(computeTrade({ direction: q2.direction, fills: q2.fills }).status, "closed");

  assert.equal(bfly.symbol, "BFLY");
  assert.deepEqual(bfly.fills.map((f) => [f.kind, f.shares, f.price]), [["entry", 683, 7.11]]);
  assert.equal(computeTrade({ direction: bfly.direction, fills: bfly.fills }).status, "open");
});

test("de-dup — re-importing the same file is a no-op", () => {
  const { executions } = parseExecutions(fixture);
  const existing = new Map();
  for (const ex of executions) existing.set(dedupKey(ex), (existing.get(dedupKey(ex)) || 0) + 1);
  const { fresh, duplicates } = partitionDuplicates(executions, existing);
  assert.equal(duplicates.length, 5);
  assert.equal(fresh.length, 0);
});

test("reconstruct — continues from an existing open position (extend + close)", () => {
  const ctx = { BFLY: { tradeId: "t1", direction: "long", signedRemaining: 683 } };
  const execs = [{ seq: 0, date: "2026-06-23", symbol: "BFLY", side: "sell", shares: 683, signedQty: -683, price: 8, nAmt: null }];
  const { newTrades, extendedTrades } = reconstruct(execs, ctx);
  assert.equal(newTrades.length, 0);
  assert.equal(extendedTrades.length, 1);
  assert.equal(extendedTrades[0].tradeId, "t1");
  assert.equal(extendedTrades[0].addedFills[0].kind, "exit");
  assert.equal(extendedTrades[0].addedFills[0].shares, 683);
});

test("reconstruct — flip through zero splits and flags for review", () => {
  const ctx = { XYZ: { tradeId: "x1", direction: "long", signedRemaining: 100 } };
  const execs = [{ seq: 0, date: "2026-06-23", symbol: "XYZ", side: "sell", shares: 150, signedQty: -150, price: 10, nAmt: null }];
  const { newTrades, extendedTrades } = reconstruct(execs, ctx);
  // existing long closes with a 100-share exit
  assert.equal(extendedTrades.length, 1);
  assert.equal(extendedTrades[0].addedFills[0].kind, "exit");
  assert.equal(extendedTrades[0].addedFills[0].shares, 100);
  // remainder opens a new flagged short
  assert.equal(newTrades.length, 1);
  assert.equal(newTrades[0].direction, "short");
  assert.equal(newTrades[0].flagged, true);
  assert.equal(newTrades[0].fills[0].kind, "entry");
  assert.equal(newTrades[0].fills[0].shares, 50);
});

/* ---------- mixed fixture: non-executions + shorts + ignore ---------- */

test("mixed — only stock executions parse; fees/interest/journal/option skipped", () => {
  const { executions, skipped } = parseExecutions(fixtureMixed);
  assert.equal(executions.length, 12);            // SGOV×3, APPS×4, INOD×2, OSS×1, QQQ×2
  assert.equal(skipped.length, 4);                // journal, interest, fee, option
  assert.ok(executions.every((e) => e.symbol && (e.side === "buy" || e.side === "sell")));
  const reasons = skipped.map((s) => s.reason).join(" | ");
  assert.match(reasons, /Journal Entry/i);
  assert.match(reasons, /Credit\/Margin Interest/i);
  assert.match(reasons, /OMS\/Prop Fee/i);
  assert.match(reasons, /option/i);
});

test("mixed — sell-from-flat input reconstructs as genuine shorts (unflagged)", () => {
  const { executions } = parseExecutions(fixtureMixed);
  const { newTrades, extendedTrades } = reconstruct(executions, {});
  assert.equal(newTrades.length, 5);              // SGOV, APPS, INOD, OSS, QQQ
  assert.equal(extendedTrades.length, 0);
  assert.equal(newTrades.filter((t) => t.flagged).length, 0);  // no flip-through-zero here

  const apps = newTrades.find((t) => t.symbol === "APPS");
  assert.equal(apps.direction, "short");          // sells from flat ⇒ short (NOT suspicious)
  assert.equal(apps.flagged, false);
  assert.ok(apps.fills.every((f) => f.kind === "entry"));
  assert.equal(apps.fills.reduce((a, f) => a + f.shares, 0), 136); // 21+19+17+79
  assert.equal(computeTrade({ direction: apps.direction, fills: apps.fills }).status, "open");

  assert.equal(newTrades.find((t) => t.symbol === "INOD").direction, "short");
  assert.equal(newTrades.find((t) => t.symbol === "OSS").direction, "short");
});

test("mixed — ignoring a symbol drops only its executions/trades", () => {
  const { executions } = parseExecutions(fixtureMixed);
  const syms = distinctSymbols(executions);
  const sgov = syms.find((s) => s.symbol === "SGOV");
  assert.ok(sgov && sgov.count === 3);

  const { kept, ignored } = applyIgnore(executions, ["sgov"]); // case-insensitive
  assert.equal(ignored.length, 3);
  assert.ok(ignored.every((e) => e.symbol === "SGOV"));
  assert.ok(kept.every((e) => e.symbol !== "SGOV"));

  const { newTrades } = reconstruct(kept, {});
  assert.equal(newTrades.length, 4);              // 5 minus SGOV
  assert.ok(!newTrades.some((t) => t.symbol === "SGOV"));
});
