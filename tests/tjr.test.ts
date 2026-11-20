import { test } from "node:test";
import assert from "node:assert/strict";
import { BUILDER, DEFAULT_CONFIG, MODELS, MODEL_TEXT, changes, clear, getPath, levelName, levelPhrase, nyTime, rText, setPath, usd, verdict } from "../src/lib/tjr.ts";

test("tjr: a result only gets a verdict it has earned", () => {
  assert.equal(verdict({ trades: 0 }), "No trades in this period.");
  assert.equal(verdict({ trades: 5, expectancy_r: -0.57, expectancy_r_stderr: 0.27 }), "Only 5 trades: too few to say anything.");
  assert.equal(verdict({ trades: 63, expectancy_r: 0.163, expectancy_r_stderr: 0.184 }), "+0.16 R a trade, give or take 0.37: not distinguishable from zero.");
  assert.match(verdict({ trades: 120, expectancy_r: -0.4, expectancy_r_stderr: 0.1 }), /a loss beyond its margin of error/);
  assert.match(verdict({ trades: 120, expectancy_r: 0.5, expectancy_r_stderr: 0.1 }), /more than its margin of error/);
  assert.equal(clear({ trades: 63, expectancy_r: 0.163, expectancy_r_stderr: 0.184 }), false);      // no green for noise
  assert.equal(clear({ trades: 14, expectancy_r: -0.38, expectancy_r_stderr: 0.154 }), false);       // nor red for 14 trades
  assert.equal(clear({ trades: 120, expectancy_r: 0.5, expectancy_r_stderr: 0.1 }), true);
});

test("tjr: wording and figures", () => {
  assert.equal(levelName("swing:240 high"), "4-hour swing high");
  assert.equal(levelName("session:ny_am low"), "New York morning low");
  assert.equal(levelPhrase("pd high"), "previous day high");
  assert.equal(levelPhrase("session:asia low"), "Asia low");
  assert.equal(rText(-0.38), "−0.38 R");
  assert.equal(usd(-1908.18, true), "−$1,908.18");
  assert.equal(usd(5252.66, true), "+$5,252.66");
  assert.equal(nyTime("2025-02-07T14:56:00Z"), "09:56");                                             // winter: New York is UTC-5
  assert.equal(nyTime("2026-07-16T14:25:00Z"), "10:25");                                             // summer: UTC-4
});

test("tjr: the builder starts from the engine's own defaults and only reports what changed", () => {
  assert.deepEqual(MODELS, ["A", "B", "C", "D", "E"]);
  assert.match(MODEL_TEXT.E, /Experimental/);
  for (const g of BUILDER) for (const f of g.fields) assert.notEqual(getPath(DEFAULT_CONFIG, f.path), undefined, `${f.path} exists in the engine's defaults`);
  assert.deepEqual(changes(DEFAULT_CONFIG), []);
  const edited = setPath(setPath(DEFAULT_CONFIG, "exits.min_rr", 1.5), "bos_window_bars", 9);
  assert.deepEqual(changes(edited), ["Break of structure within: 9", "Liquidity must be at least: 1.5"]);
  assert.equal(getPath(DEFAULT_CONFIG, "exits.min_rr"), 2);                                          // the original is untouched
  assert.equal(getPath(edited, "exits.stop"), "sweep");                                              // and the rest of the group is kept
});
