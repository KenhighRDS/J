import { test } from "node:test";
import assert from "node:assert/strict";
import { isTrailOnly, level } from "../supabase/functions/_shared/levels.ts";
import { copiedAll, copyNeeded, lockedHint } from "../src/lib/unlock.ts";

test("MetaTrader's 0 means no SL / TP", () => {
  assert.equal(level(0), null); assert.equal(level("0"), null); assert.equal(level(null), null); assert.equal(level(undefined), null); assert.equal(level(""), null);
  assert.equal(level(2341.5), 2341.5); assert.equal(level("149.812"), 149.812);
});

test("a stop that only locks in more profit is a quiet trail; anything else rings", () => {
  assert.equal(isTrailOnly("buy", 2335, 2338.2, null, null), true);
  assert.equal(isTrailOnly("buy", 2335, 2333, null, null), false);           // widened
  assert.equal(isTrailOnly("sell", 150.2, 150.05, null, undefined), true);
  assert.equal(isTrailOnly("sell", 150.2, 150.4, null, undefined), false);
  assert.equal(isTrailOnly("buy", 2335, 2338, 2355, 2360), false);          // TP changed too
  assert.equal(isTrailOnly("buy", null, 2338, null, null), false);          // first stop ever
});

test("no-TP signals unlock without copying a TP", () => {
  const noTp = { sl: 2335, tp: null };
  assert.deepEqual(copyNeeded(noTp), ["entry", "sl", "lot"]);
  assert.equal(copiedAll(noTp, { copied: { entry: "x", sl: "x", lot: "x" } }), true);
  assert.equal(copiedAll(noTp, { copied: { entry: "x", lot: "x" } }), false);
  assert.equal(lockedHint(noTp), "Copy entry, SL and lot to unlock");
  const full = { sl: 2335, tp: 2355 };
  assert.equal(copiedAll(full, { copied: { entry: "x", sl: "x", lot: "x" } }), false);
  assert.equal(lockedHint(full), "Copy entry, SL, TP and lot to unlock");
  assert.equal(lockedHint({ sl: null, tp: null }), "Copy entry and lot to unlock");
});
