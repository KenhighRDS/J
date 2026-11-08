import { test } from "node:test";
import assert from "node:assert/strict";
import { combineBacktests, decodeReportFile, guessPipSize, parseBacktest, withPipSize } from "../src/lib/backtest.ts";

const td = (c: string) => `<td>${c}</td>`;
const tr = (...c: string[]) => `<tr>${c.map(td).join("")}</tr>`;
const mt5 = `<html><body><table>
${tr("<b>Settings</b>")}
${tr("Expert:", "Gold Scalper v3")}
${tr("Symbol:", "XAUUSD")}
${tr("Period:", "H1 (2024.01.01 - 2024.12.31)")}
${tr("Currency:", "USD")}
${tr("Initial Deposit:", "10&nbsp;000.00")}
${tr("<b>Results</b>")}
${tr("Total Net Profit:", "1&nbsp;234.56", "Balance Drawdown Absolute:", "12.00")}
${tr("Profit Factor:", "1.85", "Expected Payoff:", "10.29")}
${tr("Balance Drawdown Maximal:", "321.00 (3.12%)", "Equity Drawdown Maximal:", "400.00 (3.90%)")}
${tr("Total Trades:", "3", "Short Trades (won %):", "1 (100.00%)", "Long Trades (won %):", "2 (50.00%)")}
${tr("Total Deals:", "7", "Profit Trades (% of total):", "2 (66.67%)", "Loss Trades (% of total):", "1 (33.33%)")}
${tr("<b>Deals</b>")}
${tr("Time", "Deal", "Symbol", "Type", "Direction", "Volume", "Price", "Order", "Commission", "Swap", "Profit", "Balance", "Comment")}
${tr("2024.01.02 00:00:00", "1", "", "balance", "", "", "", "", "0.00", "0.00", "10&nbsp;000.00", "10&nbsp;000.00", "")}
${tr("2024.01.02 09:00:00", "2", "XAUUSD", "buy", "in", "0.10", "2065.12", "2", "-0.70", "0.00", "0.00", "9&nbsp;999.30", "")}
${tr("2024.01.02 15:30:00", "3", "XAUUSD", "sell", "out", "0.10", "2070.33", "3", "-0.70", "0.00", "52.10", "10&nbsp;050.70", "[tp 2070.33]")}
${tr("2024.01.03 10:00:00", "4", "XAUUSD", "sell", "in", "0.20", "2080.00", "4", "-1.40", "0.00", "0.00", "10&nbsp;049.30", "")}
${tr("2024.01.03 12:00:00", "5", "XAUUSD", "buy", "out", "0.20", "2075.50", "5", "-1.40", "0.00", "90.00", "10&nbsp;137.90", "[tp 2075.50]")}
${tr("2024.01.05 08:00:00", "6", "XAUUSD", "buy", "in", "0.10", "2090.00", "6", "-0.70", "0.00", "0.00", "10&nbsp;137.20", "")}
${tr("2024.01.05 20:45:00", "7", "XAUUSD", "sell", "out", "0.10", "2085.00", "7", "-0.70", "0.00", "-50.00", "10&nbsp;086.50", "[sl 2085.00]")}
</table></body></html>`;

test("MT5 report: settings, results, deals paired into trades, pips at 0.1 for gold", () => {
  const s = parseBacktest(mt5);
  assert.equal(s.platform, "mt5"); assert.equal(s.expert, "Gold Scalper v3"); assert.equal(s.symbol, "XAUUSD"); assert.equal(s.timeframe, "H1");
  assert.equal(s.periodStart, "2024-01-01 00:00"); assert.equal(s.periodEnd, "2024-12-31 00:00");
  assert.equal(s.initialDeposit, 10000); assert.equal(s.netProfit, 1234.56); assert.equal(s.profitFactor, 1.85); assert.equal(s.maxDrawdownPct, 3.12);
  assert.equal(s.trades, 3); assert.equal(s.buys, 2); assert.equal(s.sells, 1); assert.equal(s.wins, 2); assert.equal(s.losses, 1); assert.equal(s.winRate, 66.7);
  assert.equal(s.firstTrade, "2024-01-02 09:00"); assert.equal(s.lastTrade, "2024-01-05 20:45");
  assert.equal(s.digits, 2); assert.equal(s.pipSize, 0.1);
  assert.deepEqual(s.tradesList.map((t) => t.pips), [52.1, 45, -50]);   // (2070.33-2065.12)/0.1, (2080-2075.5)/0.1, (2085-2090)/0.1
  assert.equal(s.baseLot, 0.1); assert.equal(s.totalPips, 92.1);                // lot-weighted: 52.1×1 + 45×2 − 50×1
});

test("pip size override recomputes pips", () => {
  const s = withPipSize(parseBacktest(mt5), 1);
  assert.deepEqual(s.tradesList.map((t) => t.pips), [5.2, 4.5, -5]); assert.equal(s.totalPips, 9.2); assert.equal(s.pipSizeGuessed, false);
});

const mt4 = `<html><body><table>
<tr><td colspan=4><b>Strategy Tester: EURUSD Trend</b></td></tr>
${tr("Symbol", "EURUSD (Euro vs US Dollar)")}
${tr("Period", "1 Hour (H1) 2024.01.02 00:00 - 2024.06.28 23:00 (2024.01.01 - 2024.07.01)")}
${tr("Initial deposit", "5000.00")}
${tr("Total net profit", "812.40", "Gross profit", "1200.00", "Gross loss", "-387.60")}
${tr("Profit factor", "3.10", "Expected payoff", "203.10")}
${tr("Maximal drawdown", "150.00 (2.90%)")}
${tr("Total trades", "2", "Short positions (won %)", "1 (0.00%)", "Long positions (won %)", "1 (100.00%)")}
${tr("Profit trades (% of total)", "1 (50.00%)", "Loss trades (% of total)", "1 (50.00%)")}
${tr("#", "Time", "Type", "Order", "Size", "Price", "S / L", "T / P", "Profit", "Balance")}
${tr("1", "2024.01.02 09:00", "buy", "1", "0.10", "1.10234", "1.10000", "1.10500", "", "")}
${tr("2", "2024.01.02 14:00", "t/p", "1", "0.10", "1.10500", "1.10000", "1.10500", "26.60", "5026.60")}
${tr("3", "2024.01.04 09:00", "sell", "2", "0.10", "1.09800", "1.10100", "1.09300", "", "")}
${tr("4", "2024.01.04 11:00", "s/l", "2", "0.10", "1.10100", "1.10100", "1.09300", "-30.00", "4996.60")}
</table></body></html>`;

test("MT4 report: header, summary and order pairing with 5-digit pips", () => {
  const s = parseBacktest(mt4);
  assert.equal(s.platform, "mt4"); assert.equal(s.expert, "EURUSD Trend"); assert.equal(s.symbol, "EURUSD"); assert.equal(s.timeframe, "H1");
  assert.equal(s.periodStart, "2024-01-01 00:00"); assert.equal(s.periodEnd, "2024-07-01 00:00");
  assert.equal(s.netProfit, 812.4); assert.equal(s.profitFactor, 3.1); assert.equal(s.maxDrawdownPct, 2.9);
  assert.equal(s.trades, 2); assert.equal(s.buys, 1); assert.equal(s.sells, 1); assert.equal(s.wins, 1); assert.equal(s.losses, 1); assert.equal(s.winRate, 50);
  assert.equal(s.firstTrade, "2024-01-02 09:00"); assert.equal(s.lastTrade, "2024-01-04 11:00");
  assert.equal(s.digits, 5); assert.equal(s.pipSize, 0.0001);
  assert.deepEqual(s.tradesList.map((t) => t.pips), [26.6, -30]); assert.equal(s.totalPips, -3.4);
});

const martingale = `<html><body><table>
${tr("Symbol:", "USDJPY")}${tr("Currency:", "USD")}${tr("Total Net Profit:", "5.32")}
${tr("Time", "Deal", "Symbol", "Type", "Direction", "Volume", "Price", "Order", "Commission", "Swap", "Profit", "Balance", "Comment")}
${tr("2024.03.01 09:00:00", "2", "USDJPY", "buy", "in", "0.01", "150.000", "2", "0.00", "0.00", "0.00", "1000.00", "")}
${tr("2024.03.01 10:00:00", "3", "USDJPY", "sell", "out", "0.01", "149.800", "3", "0.00", "0.00", "-1.34", "998.66", "")}
${tr("2024.03.01 10:00:00", "4", "USDJPY", "buy", "in", "0.02", "149.800", "4", "0.00", "0.00", "0.00", "998.66", "")}
${tr("2024.03.01 11:00:00", "5", "USDJPY", "sell", "out", "0.02", "149.600", "5", "0.00", "0.00", "-2.67", "995.99", "")}
${tr("2024.03.01 11:00:00", "6", "USDJPY", "buy", "in", "0.04", "149.600", "6", "0.00", "0.00", "0.00", "995.99", "")}
${tr("2024.03.01 13:00:00", "7", "USDJPY", "sell", "out", "0.04", "149.950", "7", "0.00", "0.00", "9.33", "1005.32", "")}
</table></body></html>`;

test("martingale: pips are lot-weighted so they agree with the money result", () => {
  const s = parseBacktest(martingale);
  assert.equal(s.pipSize, 0.01); assert.equal(s.baseLot, 0.01);
  assert.deepEqual(s.tradesList.map((t) => t.pips), [-20, -20, 35]);          // the plain sum would be −5 while the account made +5.32
  assert.equal(s.totalPips, 80);                                                // −20×1 − 20×2 + 35×4
  assert.equal(s.netProfit, 5.32);
});

test("several reports combine into one result", () => {
  const a = parseBacktest(mt5), b = parseBacktest(mt4);
  assert.equal(combineBacktests([a]), a);
  const c = combineBacktests([a, b]);
  assert.equal(c.trades, 5); assert.equal(c.buys, 3); assert.equal(c.sells, 2); assert.equal(c.wins, 3); assert.equal(c.losses, 2); assert.equal(c.winRate, 60);
  assert.equal(c.totalPips, 88.7);                                              // 92.1 − 3.4, each report at its own pip size
  assert.equal(c.symbol, "XAUUSD + EURUSD"); assert.equal(c.timeframe, "H1"); assert.equal(c.currency, "USD");
  assert.equal(c.netProfit, 2046.96); assert.equal(c.profitFactor, 2.11);      // (52.1 + 90 + 26.6) / (50 + 30)
  assert.equal(c.maxDrawdownPct, 3.12); assert.equal(c.baseLot, 0.1);
  assert.equal(c.periodStart, "2024-01-01 00:00"); assert.equal(c.periodEnd, "2024-12-31 00:00");
  assert.equal(c.firstTrade, "2024-01-02 09:00"); assert.equal(c.lastTrade, "2024-01-05 20:45");
  assert.equal(c.tradesList.length, 5);
});

test("not a report", () => { assert.throws(() => parseBacktest("<html><body><p>hello</p></body></html>"), /no tables/); assert.throws(() => parseBacktest("<table><tr><td>x</td></tr></table>"), /Strategy Tester/); });

test("UTF-16 (MT5) and UTF-8 report files decode", () => {
  const text = "<table><tr><td>é</td></tr></table>";
  const u16 = new Uint8Array(2 + text.length * 2); u16[0] = 0xff; u16[1] = 0xfe; for (let i = 0; i < text.length; i++) { u16[2 + i * 2] = text.charCodeAt(i) & 0xff; u16[3 + i * 2] = text.charCodeAt(i) >> 8; }
  assert.equal(decodeReportFile(u16.buffer), text); assert.equal(decodeReportFile(new TextEncoder().encode(text).buffer), text);
});

test("pip size guesses", () => {
  assert.equal(guessPipSize("XAUUSD", 2), 0.1); assert.equal(guessPipSize("USDJPY", 3), 0.01); assert.equal(guessPipSize("EURUSD", 5), 0.0001); assert.equal(guessPipSize("US30", 2), 1); assert.equal(guessPipSize("GBPUSD", 4), 0.0001);
});
