import { test } from "node:test";
import assert from "node:assert/strict";
import { calcLot } from "../src/lib/lot.ts";

// Hand calculations (balance 10 000, risk 1% = 100 of account currency at risk)
test("XAUUSD: 65 pips (6.50) SL, tick 0.01 worth 1.00 per lot → 0.15 lots", () => {
  // loss per lot = 6.50 / 0.01 * 1.00 = 650 → 100 / 650 = 0.1538 → rounded down to 0.15
  assert.equal(calcLot({ balance: 10000, riskPct: 1, entry: 2341.5, sl: 2335, tickSize: 0.01, tickValue: 1, volMin: 0.01, volStep: 0.01, volMax: 100 }), 0.15);
});
test("USDJPY: 30 pips (0.300) SL, tick 0.001 worth 0.65 per lot → 0.51 lots", () => {
  // loss per lot = 0.300 / 0.001 * 0.65 = 195 → 100 / 195 = 0.5128 → 0.51
  assert.equal(calcLot({ balance: 10000, riskPct: 1, entry: 150.0, sl: 149.7, tickSize: 0.001, tickValue: 0.65, volMin: 0.01, volStep: 0.01, volMax: 100 }), 0.51);
});
test("rounds DOWN to the step and clamps to vol_min / vol_max", () => {
  assert.equal(calcLot({ balance: 10000, riskPct: 1, entry: 1.1, sl: 1.0999, tickSize: 0.00001, tickValue: 1, volMin: 0.01, volStep: 0.01, volMax: 5 }), 5);
  assert.equal(calcLot({ balance: 100, riskPct: 1, entry: 2341.5, sl: 2300, tickSize: 0.01, tickValue: 1, volMin: 0.01, volStep: 0.01, volMax: 100 }), 0.01);
  assert.equal(calcLot({ balance: 10000, riskPct: 1, entry: 2341.5, sl: 2335, tickSize: 0.01, tickValue: 1, volMin: 0.1, volStep: 0.1, volMax: 100 }), 0.1);
});
test("no balance, no SL or zero distance → null", () => {
  assert.equal(calcLot({ balance: null, riskPct: 1, entry: 1, sl: 0.9, tickSize: 0.0001, tickValue: 1, volMin: 0.01, volStep: 0.01, volMax: 100 }), null);
  assert.equal(calcLot({ balance: 1000, riskPct: 1, entry: 1, sl: null, tickSize: 0.0001, tickValue: 1, volMin: 0.01, volStep: 0.01, volMax: 100 }), null);
  assert.equal(calcLot({ balance: 1000, riskPct: 1, entry: 1, sl: 1, tickSize: 0.0001, tickValue: 1, volMin: 0.01, volStep: 0.01, volMax: 100 }), null);
});
