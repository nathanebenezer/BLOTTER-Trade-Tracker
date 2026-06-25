/* ============================================================ *
 *  Broker-import tests — parser + reconstruction against the real
 *  fixture (sample_broker_export.xls) plus synthetic edge cases.
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
const fixture5 = readFileSync(new URL("../ExcelReport__5_.xls", import.meta.url), "utf8");
const fixture6 = readFileSync(new URL("../ExcelReport (6).xls", import.meta.url), "utf8");

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

test("ExcelReport(6) — real file with trailing tab columns imports cleanly", () => {
  const { executions, skipped } = parseExecutions(fixture6);
  assert.ok(executions.length > 0);
  assert.ok(executions.every((e) => e.symbol && (e.side === "buy" || e.side === "sell")));
  assert.ok(skipped.every((s) => typeof s.reason === "string"));
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

/* ---------- ExcelReport (5): non-executions + shorts + ignore ---------- */

test("ExcelReport(5) — only executions parse; fees/interest/journal skipped", () => {
  const { executions, skipped } = parseExecutions(fixture5);
  assert.equal(executions.length, 26);
  assert.equal(skipped.length, 8);
  // every execution is a real stock trade
  assert.ok(executions.every((e) => e.symbol && (e.side === "buy" || e.side === "sell")));
  // the non-trade rows were recognised and skipped (none of these is a trade)
  const reasons = skipped.map((s) => s.reason).join(" | ");
  assert.match(reasons, /Journal Entry/i);
  assert.match(reasons, /Credit\/Margin Interest/i);
  assert.match(reasons, /OMS\/Prop Fee/i);
});

test("ExcelReport(5) — sell-only input reconstructs as genuine shorts (unflagged)", () => {
  const { executions } = parseExecutions(fixture5);
  const { newTrades, extendedTrades } = reconstruct(executions, {});
  assert.equal(newTrades.length, 9);              // SGOV,ONDS,INOD,FLNC,OSS,APPS,QQQ×2,BFLY
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

test("ExcelReport(5) — ignoring a symbol drops only its executions/trades", () => {
  const { executions } = parseExecutions(fixture5);
  const syms = distinctSymbols(executions);
  const sgov = syms.find((s) => s.symbol === "SGOV");
  assert.ok(sgov && sgov.count === 9);

  const { kept, ignored } = applyIgnore(executions, ["sgov"]); // case-insensitive
  assert.equal(ignored.length, 9);
  assert.ok(ignored.every((e) => e.symbol === "SGOV"));
  assert.ok(kept.every((e) => e.symbol !== "SGOV"));

  const { newTrades } = reconstruct(kept, {});
  assert.equal(newTrades.length, 8);              // 9 minus SGOV
  assert.ok(!newTrades.some((t) => t.symbol === "SGOV"));
});
