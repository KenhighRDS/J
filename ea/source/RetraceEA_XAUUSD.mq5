//+------------------------------------------------------------------+
//| xaulast.mq5 — RetraceEA v3 (XAUUSD)                               |
//| D1 MA trend + intraday retracement entry, % SL, ATR trail, EOD    |
//| v3: one-shot daily entry, loss breaker, safe trail, safe sizing,  |
//|     35K weekly investor report (built in — no .mqh needed)        |
//| v3.1: kill switch, early Friday close, input validation,          |
//|       fail-closed history check, re-arm on new filter bar         |
//| v3.2: Asian-session entry window (01:05-08:00 server). Replayed on|
//|       2015-2026 M1 data: PF 1.08 -> 1.49, max DD 28R -> 10.6R,    |
//|       ~31 trades/yr (London-open dips were the losing trades).    |
//|       Sends every trade to J (J_Signal.mqh, InpJKey).             |
//+------------------------------------------------------------------+
#include <Trade/Trade.mqh>
#include <J_Signal.mqh>          // J signals: copy J_Signal.mqh to MQL5/Include

#property strict
#property version "3.20"

#define  LIC_EXPIRES_DAYS  30
#define  LIC_EXPIRES_START D'2026.11.15'


//===========================================
//  INPUTS
//===========================================

input group "=== Risk Management ==="
input double RiskPercent        = 1.0;   // Risk % per trade (of min(balance, equity))
input double SlPercent          = 0.5;   // Stop Loss % from entry price
input double RetracementPercent = 0.5;   // Retracement % from today's open to trigger entry
input double MaxMinLotRiskPct   = 2.0;   // Account too small for RiskPercent: use min lot only if its risk <= this %, else SKIP

input group "=== Safety Limits ==="
input int    MaxTradesPerDay        = 1;    // Max entries per server day (0 = unlimited — NOT recommended)
input double MaxDailyLossPercent    = 2.0;  // No new entries today after losing this % (0 = off)
input int    CooldownMinutes        = 60;   // Minutes to wait after a position closes before a new entry
input double MaxSpreadPctOfSL       = 10.0; // Skip entry if spread > this % of the SL distance (0 = off)
input int    NoEntryMinsBeforeClose = 60;   // No new entries in the last N minutes before EOD close
input bool   CloseCarriedPositions  = true; // Close a position left over from a previous day
input double MaxDrawdownPct         = 20.0; // KILL SWITCH: stop new entries if equity falls this % below its peak (0 = off)
input bool   ResetDrawdownGuard     = false;// TRUE once = clear a TRIPPED kill switch (max once per 24h), then set back to FALSE
input int    FridayCloseHour        = 21;   // Friday: close + stop entries from this server hour (weekend-gap guard; -1 = same as TimeCloseHour)

input group "=== ATR Trailing Stop ==="
input bool            UseTrailingStop = true;      // Enable ATR trailing stop
input int             AtrPeriod       = 14;        // ATR period
input double          AtrMultiplier   = 2.0;       // Trail distance = ATR x this
input ENUM_TIMEFRAMES AtrTimeframe    = PERIOD_H1; // ATR timeframe (PERIOD_CURRENT is forced to H1)
input double          TrailStartAtr   = 1.0;       // Start trailing only after profit >= ATR x this
input double          TrailStepAtr    = 0.25;      // Move SL only when it improves by >= ATR x this

input group "=== Session Timing ==="
input int TimeCloseHour = 22;
input int TimeCloseMin  = 0;
input int EntryFromHour   = 1;   // New entries only from this server hour... (skips the midnight rollover spread)
input int EntryFromMinute = 5;   // ...and minute
input int EntryUntilHour  = 8;   // ...until this server hour (Asian session). -1 = all day (v3.1 behaviour)

input group "=== MA Filter ==="
input ENUM_TIMEFRAMES    Timeframe  = PERIOD_D1;
input int                MaPeriods  = 100;
input ENUM_MA_METHOD     MaMethod   = MODE_SMA;
input ENUM_APPLIED_PRICE MaAppPrice = PRICE_CLOSE;

input group "=== Telegram ==="
input bool   TelegramEnabled = true;   // Enable Telegram alerts
input string TelegramToken   = "";       // Bot token (from @BotFather) — paste it here; never stored in the code
input string TelegramChatID  = "-1002312330155";     // Chat ID or group ID
input int    TrailMsgMinutes = 15;     // Min minutes between "SL trailed" messages

input group "=== J signals ==="
input string InpJKey = "";       // J → Admin → EA sources → key for this EA (empty = J off)

input group "=== General ==="
input int  Magic          = 112314;
input bool DiagEnabled    = true;   // Filter diagnostics (journal once per minute + heartbeat)
input int  MaxSlippagePts = 30;     // Max slippage in points (real account tolerance)

//+------------------------------------------------------------------+
//| 35K REPORT — weekly investor report from this EA to 35K          |
//|                                                                    |
//| Hooks used by this EA:                                             |
//|   K35_OnInit();        in OnInit                                   |
//|   K35_OnTimer();       in OnTimer   (EA owns EventSetTimer)        |
//|   K35_OnDeinit();      in OnDeinit                                 |
//|   K35_OnChartEvent(id, sparam);  in OnChartEvent (test button)     |
//| Nothing about the strategy runs through here; this only reads      |
//| account/history data and POSTs it. The report is ACCOUNT-WIDE      |
//| (all symbols / all EAs on the account).                            |
//|                                                                    |
//| Several EAs in the same terminal can run this block with           |
//| the same company key — only ONE of them sends the weekly report    |
//| (shared terminal variables), so the 35K price never moves twice.   |
//|                                                                    |
//| One-time terminal step: Tools → Options → Expert Advisors →        |
//| "Allow WebRequest for listed URL" → add                            |
//|   https://bbghrtvtnceoatyrnqud.supabase.co                         |
//+------------------------------------------------------------------+

//--- inputs (appear in the EA's Inputs tab)
input group "==== 📡 35K Investor Report ===="
input string K35_Connection      = "";          // 35K connection string (35k://ingest?u=...&k=...)
input string K35_CompanyKey      = "jarvis-ai"; // Company key shown in 35K
input int    K35_BrokerGmtOffset = 2;           // Broker server time = GMT + this many hours
input int    K35_ReportHourNY    = 13;          // Weekly report: Friday HH (New York time)
input int    K35_ReportMinuteNY  = 5;           // Weekly report: Friday MM (New York time)
input bool   K35_SendTestNow     = false;       // TRUE = send one [TEST] report on load, then set back to FALSE
input bool   K35_ShowTestButton  = true;        // Show the "35K: SEND TEST REPORT" chart button (FALSE = hide it when done testing)
input ENUM_BASE_CORNER K35_ButtonCorner = CORNER_RIGHT_UPPER; // Button corner
input int    K35_ButtonX         = 10;          // Button X offset from corner
input int    K35_ButtonY         = 30;          // Button Y offset from corner

//--- internals
string   k35_url = "", k35_secret = "";
datetime k35_lastSent = 0;
bool     k35_testDone = false;

bool K35_InTester() { return (MQLInfoInteger(MQL_TESTER) || MQLInfoInteger(MQL_OPTIMIZATION)); }

//--- parse "35k://ingest?u=<url>&k=<secret>"
bool K35_Parse(const string conn)
  {
   int u = StringFind(conn, "u="); int k = StringFind(conn, "&k=");
   if(u < 0 || k < 0) return false;
   k35_url    = StringSubstr(conn, u + 2, k - (u + 2));
   k35_secret = StringSubstr(conn, k + 3);
   return (StringLen(k35_url) > 10 && StringLen(k35_secret) > 20);
  }

//--- GMT now, from the broker's server clock and the configured offset
datetime K35_GmtNow() { return TimeCurrent() - K35_BrokerGmtOffset * 3600; }

//--- New York offset from GMT: -4 during US DST (2nd Sunday of March → 1st Sunday of November), else -5
int K35_NyOffsetHours(datetime gmt)
  {
   MqlDateTime t; TimeToStruct(gmt, t);
   MqlDateTime m; m.year=t.year; m.mon=3;  m.day=1; m.hour=7; m.min=0; m.sec=0; datetime mar1 = StructToTime(m); TimeToStruct(mar1, m);
   int marSecondSunday = 1 + ((7 - m.day_of_week) % 7) + 7;
   MqlDateTime n; n.year=t.year; n.mon=11; n.day=1; n.hour=6; n.min=0; n.sec=0; datetime nov1 = StructToTime(n); TimeToStruct(nov1, n);
   int novFirstSunday = 1 + ((7 - n.day_of_week) % 7);
   MqlDateTime s; s.year=t.year; s.mon=3;  s.day=marSecondSunday; s.hour=7; s.min=0; s.sec=0;   // 2:00 local = 07:00 GMT
   MqlDateTime e; e.year=t.year; e.mon=11; e.day=novFirstSunday;  e.hour=6; e.min=0; e.sec=0;   // 2:00 local = 06:00 GMT
   datetime dstStart = StructToTime(s), dstEnd = StructToTime(e);
   return (gmt >= dstStart && gmt < dstEnd) ? -4 : -5;
  }

//--- JSON helpers (no library needed for a fixed schema)
string K35_Num(double v, int digits=2) { return DoubleToString(v, digits); }
string K35_Str(const string v)
  {
   string s = v; StringReplace(s, "\\", "\\\\"); StringReplace(s, "\"", "\\\""); StringReplace(s, "\n", " ");
   return "\"" + s + "\"";
  }
string K35_Iso(datetime gmt) { return TimeToString(gmt, TIME_DATE|TIME_SECONDS); } // "yyyy.mm.dd hh:mi:ss"
string K35_IsoJson(datetime gmt)
  {
   string s = K35_Iso(gmt); StringReplace(s, ".", "-"); StringReplace(s, " ", "T"); return s + "Z";
  }

//--- collect the week's closed deals from history
struct K35Perf { double pnl; int trades; int wins; int losses; double sumWin; double sumLoss; double maxDdPct; };
void K35_Collect(datetime fromGmt, datetime toGmt, K35Perf &p)
  {
   p.pnl=0; p.trades=0; p.wins=0; p.losses=0; p.sumWin=0; p.sumLoss=0; p.maxDdPct=0;
   datetime from = fromGmt + K35_BrokerGmtOffset*3600, to = toGmt + K35_BrokerGmtOffset*3600; // history is in server time
   if(!HistorySelect(from, to)) return;
   double running = 0, peak = 0;
   int total = HistoryDealsTotal();
   for(int i = 0; i < total; i++)
     {
      ulong ticket = HistoryDealGetTicket(i); if(ticket == 0) continue;
      ENUM_DEAL_ENTRY entry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(ticket, DEAL_ENTRY);
      if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_INOUT) continue;
      ENUM_DEAL_TYPE type = (ENUM_DEAL_TYPE)HistoryDealGetInteger(ticket, DEAL_TYPE);
      if(type != DEAL_TYPE_BUY && type != DEAL_TYPE_SELL) continue;      // skip balance/credit operations
      double profit = HistoryDealGetDouble(ticket, DEAL_PROFIT) + HistoryDealGetDouble(ticket, DEAL_SWAP) + HistoryDealGetDouble(ticket, DEAL_COMMISSION);
      p.pnl += profit; p.trades++;
      if(profit >= 0) { p.wins++; p.sumWin += profit; } else { p.losses++; p.sumLoss += profit; }
      running += profit; if(running > peak) peak = running;
      double base = AccountInfoDouble(ACCOUNT_BALANCE) - p.pnl + (p.pnl - running); // balance at that point, approximated
      if(base > 0) { double dd = (peak - running) / base * 100.0; if(dd > p.maxDdPct) p.maxDdPct = dd; }
     }
  }

//--- build and send the report
bool K35_Send(bool isTest)
  {
   if(K35_InTester()) return false;                       // never report backtests to investors
   if(k35_url == "") { Print("[35K] no connection string — nothing sent"); return false; }
   datetime nowGmt = K35_GmtNow();
   datetime endGmt = nowGmt, startGmt = nowGmt - 7*24*3600;
   K35Perf p; K35_Collect(startGmt, endGmt, p);
   double balance = AccountInfoDouble(ACCOUNT_BALANCE), equity = AccountInfoDouble(ACCOUNT_EQUITY);
   double startBalance = balance - p.pnl;
   double pnlPct = (startBalance > 0) ? p.pnl / startBalance * 100.0 : 0.0;
   double winRate = (p.trades > 0) ? (double)p.wins / p.trades * 100.0 : 0.0;
   double avgWin = (p.wins > 0) ? p.sumWin / p.wins : 0.0, avgLoss = (p.losses > 0) ? p.sumLoss / p.losses : 0.0;
   string open = "["; int np = PositionsTotal(); int added = 0;
   for(int i = 0; i < np; i++)
     {
      ulong t = PositionGetTicket(i); if(t == 0) continue;
      if(added > 0) open += ",";
      open += "{\"symbol\":" + K35_Str(PositionGetString(POSITION_SYMBOL)) + ",\"type\":" + K35_Str(PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY ? "buy" : "sell") + ",\"lots\":" + K35_Num(PositionGetDouble(POSITION_VOLUME), 2) + ",\"floating_pnl\":" + K35_Num(PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP), 2) + "}";
      added++;
     }
   open += "]";
   string reportId = K35_CompanyKey + ":" + K35_IsoJson(startGmt) + ".." + K35_IsoJson(endGmt);
   if(isTest) reportId = K35_CompanyKey + ":test-" + IntegerToString((long)nowGmt);
   string body = "{"
     + "\"version\":1,\"company\":" + K35_Str(K35_CompanyKey) + ",\"report_id\":" + K35_Str(reportId)
     + ",\"period_start\":" + K35_Str(K35_IsoJson(startGmt)) + ",\"period_end\":" + K35_Str(K35_IsoJson(endGmt))
     + ",\"currency\":" + K35_Str(AccountInfoString(ACCOUNT_CURRENCY)) + ",\"triggered_by\":" + K35_Str(isTest ? "manual" : "schedule")
     + ",\"test\":" + (isTest ? "true" : "false")
     + ",\"notes\":" + K35_Str((isTest ? "TEST — " : "") + "Automatic weekly report from " + MQLInfoString(MQL_PROGRAM_NAME) + " on " + AccountInfoString(ACCOUNT_SERVER))
     + ",\"metrics\":{"
     +   "\"account\":{\"starting_balance\":" + K35_Num(startBalance) + ",\"ending_balance\":" + K35_Num(balance) + ",\"starting_equity\":" + K35_Num(startBalance) + ",\"ending_equity\":" + K35_Num(equity) + ",\"currency\":" + K35_Str(AccountInfoString(ACCOUNT_CURRENCY)) + "},"
     +   "\"performance\":{\"realized_pnl\":" + K35_Num(p.pnl) + ",\"realized_pnl_pct\":" + K35_Num(pnlPct, 3) + ",\"trades_total\":" + IntegerToString(p.trades) + ",\"wins\":" + IntegerToString(p.wins) + ",\"losses\":" + IntegerToString(p.losses) + ",\"win_rate_pct\":" + K35_Num(winRate, 1) + ",\"avg_win\":" + K35_Num(avgWin) + ",\"avg_loss\":" + K35_Num(avgLoss) + ",\"max_drawdown_pct\":" + K35_Num(p.maxDdPct) + "},"
     +   "\"open_positions\":" + open
     + "}}";
   char data[]; char result[]; string headers = "Content-Type: application/json\r\nx-partner-secret: " + k35_secret + "\r\nx-report-id: " + reportId + "\r\n";
   StringToCharArray(body, data, 0, StringLen(body), CP_UTF8);
   string resultHeaders;
   ResetLastError();
   int code = WebRequest("POST", k35_url, headers, 15000, data, result, resultHeaders);
   string resp = CharArrayToString(result, 0, -1, CP_UTF8);
   if(code == -1) { Print("[35K] WebRequest failed, error ", GetLastError(), " — is the URL allowed in Tools > Options > Expert Advisors?"); return false; }
   Print("[35K] report ", (isTest ? "(TEST) " : ""), "HTTP ", code, ": ", resp);
   if(code == 200) { if(!isTest) { k35_lastSent = nowGmt; GlobalVariableSet("K35_LAST_SENT_" + K35_CompanyKey, (double)nowGmt); } return true; }
   return false;
  }

//--- one weekly report per terminal + company, even when several EAs include this file.
//    Terminal global variables are shared by all EAs; SetOnCondition is atomic, so exactly one EA wins the slot.
//    Also gives the hourly retry while a send keeps failing that Friday.
bool K35_ClaimSlot(datetime gmt)
  {
   string gvSent = "K35_LAST_SENT_" + K35_CompanyKey, gvTry = "K35_LAST_TRY_" + K35_CompanyKey;
   if(GlobalVariableCheck(gvSent)) { datetime g = (datetime)GlobalVariableGet(gvSent); if(g > k35_lastSent) k35_lastSent = g; }
   if(k35_lastSent > 0 && (gmt - k35_lastSent) < 6*24*3600) return false;   // already reported this week (by this or another EA)
   if(!GlobalVariableCheck(gvTry)) GlobalVariableSet(gvTry, 0.0);
   double prev = GlobalVariableGet(gvTry);
   if((double)gmt - prev < 3600.0) return false;                             // an attempt was made within the hour
   return GlobalVariableSetOnCondition(gvTry, (double)gmt, prev);
  }

//+------------------------------------------------------------------+
//| 🧪 TEST BUTTON — click on the chart to fire a [TEST] report.      |
//| Hide it with K35_ShowTestButton = false once you're done testing. |
//+------------------------------------------------------------------+
const string K35_BTN         = "K35_TEST_BTN";
const string K35_BTN_IDLE    = "35K: SEND TEST REPORT";
const color  K35_BTN_IDLECLR = C'40,90,160';
const int    K35_BTN_W       = 200;
const int    K35_BTN_H       = 28;
datetime     k35_btnResetAt  = 0;

void K35_SetButton(const string text, const color bg)
  {
   if(ObjectFind(0, K35_BTN) < 0) return;
   ObjectSetString (0, K35_BTN, OBJPROP_TEXT,    text);
   ObjectSetInteger(0, K35_BTN, OBJPROP_BGCOLOR, bg);
   ObjectSetInteger(0, K35_BTN, OBJPROP_STATE,   false);   // un-press
   ChartRedraw(0);
  }

void K35_CreateButton()
  {
   if(!K35_ShowTestButton || K35_InTester()) { ObjectDelete(0, K35_BTN); return; }
   if(ObjectFind(0, K35_BTN) < 0 && !ObjectCreate(0, K35_BTN, OBJ_BUTTON, 0, 0, 0)) return;
   // A button is anchored by its top-left corner: from a right/bottom corner add its own size so it stays on the chart
   bool right  = (K35_ButtonCorner == CORNER_RIGHT_UPPER || K35_ButtonCorner == CORNER_RIGHT_LOWER);
   bool bottom = (K35_ButtonCorner == CORNER_LEFT_LOWER  || K35_ButtonCorner == CORNER_RIGHT_LOWER);
   ObjectSetInteger(0, K35_BTN, OBJPROP_CORNER,       K35_ButtonCorner);
   ObjectSetInteger(0, K35_BTN, OBJPROP_XDISTANCE,    K35_ButtonX + (right  ? K35_BTN_W : 0));
   ObjectSetInteger(0, K35_BTN, OBJPROP_YDISTANCE,    K35_ButtonY + (bottom ? K35_BTN_H : 0));
   ObjectSetInteger(0, K35_BTN, OBJPROP_XSIZE,        K35_BTN_W);
   ObjectSetInteger(0, K35_BTN, OBJPROP_YSIZE,        K35_BTN_H);
   ObjectSetInteger(0, K35_BTN, OBJPROP_FONTSIZE,     9);
   ObjectSetString (0, K35_BTN, OBJPROP_FONT,         "Arial");
   ObjectSetInteger(0, K35_BTN, OBJPROP_COLOR,        clrWhite);
   ObjectSetInteger(0, K35_BTN, OBJPROP_BORDER_COLOR, C'80,80,150');
   ObjectSetInteger(0, K35_BTN, OBJPROP_BACK,         false);
   ObjectSetInteger(0, K35_BTN, OBJPROP_SELECTABLE,   false);
   ObjectSetInteger(0, K35_BTN, OBJPROP_HIDDEN,       true);
   K35_SetButton(K35_BTN_IDLE, K35_BTN_IDLECLR);
  }

void K35_DeleteButton() { ObjectDelete(0, K35_BTN); }

// Call from the EA's OnChartEvent — handles the button click.
void K35_OnChartEvent(const int id, const string &sparam)
  {
   if(id != CHARTEVENT_OBJECT_CLICK || sparam != K35_BTN) return;
   if(k35_url == "")
     {
      K35_SetButton("NO 35K CONNECTION STRING", clrFireBrick);
      Print("[35K] test button: paste your connection string in K35_Connection first.");
      k35_btnResetAt = TimeLocal() + 6;
      return;
     }
   K35_SetButton("SENDING...", clrDarkOrange);
   bool ok = K35_Send(true);
   K35_SetButton(ok ? "TEST REPORT SENT  OK" : "FAILED - SEE EXPERTS LOG", ok ? clrSeaGreen : clrFireBrick);
   k35_btnResetAt = TimeLocal() + 8;
  }

//--- schedule: Friday 13:05 New York time, at most once per 6 days; retries hourly while it fails that day
void K35_OnTimer()
  {
   if(K35_InTester()) return;
   // restore the button label a few seconds after a click
   if(k35_btnResetAt > 0 && TimeLocal() >= k35_btnResetAt) { k35_btnResetAt = 0; K35_SetButton(K35_BTN_IDLE, K35_BTN_IDLECLR); }

   if(k35_url == "") return;
   if(K35_SendTestNow && !k35_testDone) { k35_testDone = true; K35_Send(true); return; }
   datetime gmt = K35_GmtNow(); datetime ny = gmt + K35_NyOffsetHours(gmt) * 3600;
   MqlDateTime t; TimeToStruct(ny, t);
   bool windowOpen = (t.day_of_week == 5) && (t.hour > K35_ReportHourNY || (t.hour == K35_ReportHourNY && t.min >= K35_ReportMinuteNY));
   if(!windowOpen) return;
   if(!K35_ClaimSlot(gmt)) return;                     // already sent / being sent by this or another EA
   K35_Send(false);
  }

// NOTE: the host EA owns EventSetTimer/EventKillTimer — nothing here touches the timer.
int K35_OnInit()
  {
   K35_CreateButton();
   if(!K35_Parse(K35_Connection)) { Print("[35K] connection string missing or malformed — paste it in the K35_Connection input"); return INIT_SUCCEEDED; }
   if(GlobalVariableCheck("K35_LAST_SENT_" + K35_CompanyKey)) k35_lastSent = (datetime)GlobalVariableGet("K35_LAST_SENT_" + K35_CompanyKey);
   Print("[35K] reporting enabled for ", K35_CompanyKey, " — Friday ", K35_ReportHourNY, ":", (K35_ReportMinuteNY < 10 ? "0" : ""), K35_ReportMinuteNY, " New York");
   return INIT_SUCCEEDED;
  }

void K35_OnDeinit() { K35_DeleteButton(); }
//+------------------------------------------------------------------+



//===========================================
// ✏️  JOKES LIBRARY — PASTE YOUR JOKES HERE
//===========================================
//
//  HOW TO ADD JOKES:
//  ─────────────────────────────────────────────────────────
//  • Paste your joke text between the quotes
//  • Every joke line MUST end with a comma — except the last
//  • Use \n inside a joke string for a line break
//  • Positive jokes fire when equity ≥ balance (you're winning)
//  • Negative jokes fire when in drawdown (you're hurting 😅)
//
//  EXAMPLE:
//      "Why did the trader cross the road? To get to the other trend. 📈",
//
//  ─────────────────────────────────────────────────────────
//
// ✅ POSITIVE JOKES  (profits / good vibes / green candles)
// ─────────────────────────────────────────────────────────
string PosJokes[] =
{
   "Why did the trader smile? Because his P&L did! 💰",
   "Green candles are the market's love language. 💚",
   "Compound interest: the 8th wonder of the world — and Jarvis is capitalizing. 🌍",
   "When in doubt, zoom out — it's all green up there! 🚀",
   "Profits are just losses that never gave up. 🏆",
   "The trend is your friend — and today, you have a great friend. 😎",
   "I don't always trade, but when I do, I print. 🖨️",
   "Risk managed. Trade placed. Money made. That's called cooking. 🍳"
   // ↑↑↑  ADD MORE POSITIVE JOKES ABOVE THIS LINE  ↑↑↑
   // Remember: comma after each line except the last
};

// ❌ NEGATIVE JOKES  (drawdowns / bad days / character building)
// ─────────────────────────────────────────────────────────
string NegJokes[] =
{
   "The market is like my ex — takes everything and gives nothing back. 💸",
   "I asked the chart for direction. It ghosted me. 👻",
   "Stop losses: the market's way of saying 'not today, buddy.' 😤",
   "Drawdown? More like draw-DOWN my patience. 😮‍💨",
   "Even the Titanic had a stop loss — it just didn't use it. 🚢",
   "I'm not losing money. I'm buying experience. Very expensive experience. 📚",
   "The market humbled me again. At least it's consistent. 🙃",
   "My stop loss triggered. My therapist says it was necessary. 🛋️"
   // ↑↑↑  ADD MORE NEGATIVE JOKES ABOVE THIS LINE  ↑↑↑
   // Remember: comma after each line except the last
};

// 🙏 MORNING PRAYER  (sent daily at 05:00 AM local time)
// ─────────────────────────────────────────────────────────
string MorningPrayer =
   "🙏 *Morning Prayer — Jarvis@RDS.AI*\n\n"
   "Lord, grant us wisdom in our entries,\n"
   "patience through our drawdowns,\n"
   "and the discipline to always respect the stop loss.\n\n"
   "May the spreads be tight,\n"
   "the trends be clear,\n"
   "and the profits flow like living water. 💧\n\n"
   "Protect our capital as we protect our faith.\n"
   "Let every trade be placed with clarity, not emotion.\n\n"
   "In Jesus' name — *let's trade!* ✝️";


//===========================================
//  GLOBALS
//===========================================
CTrade trade;
int    handleMa;
int    handleAtr;
long   AccountNumber;
ENUM_TIMEFRAMES g_atrTf = PERIOD_H1;

// Timer state — track heartbeat and prayer
int    g_lastHourSent   = -1;     // which hour last hourly message was sent
string g_lastPrayerDate = "";     // "YYYY-MM-DD" of last prayer sent

// Entry control (all reset at the start of each server day)
datetime g_day          = 0;      // current server day (00:00)
bool     g_armed        = false;  // true once price has been on the "no signal" side of the threshold today
int      g_memEntries   = 0;      // entries sent today (in-memory, backs up the history count)
int      g_failsToday   = 0;      // rejected / skipped attempts today
datetime g_nextTryTime  = 0;      // no entry attempt before this time
bool     g_blockMsgSent = false;  // "blocked for today" Telegram sent

// Day stats from deal history (cached; refreshed on trade events)
bool     g_statsDirty    = true;
datetime g_statsAt       = 0;
int      g_entriesToday  = 0;
double   g_realizedToday = 0;
datetime g_lastExit      = 0;

// Throttles
datetime g_nextCloseTry = 0;
datetime g_nextTrailTry = 0;
datetime g_lastTrailMsg = 0;
datetime g_lastDiag      = 0;
datetime g_lastSpreadLog = 0;

// Kill switch (terminal global variables → survives restarts)
string   g_gvPeak    = "";
string   g_gvHalt    = "";
bool     g_halted    = false;
string   g_gvDay     = "";      // persistent day + entry count → limits survive a restart even before history syncs
string   g_gvEnt     = "";
bool     g_licExpired = false;  // licence expired → manage open positions only, never open new ones
datetime g_filterBar = 0;        // current filter-timeframe bar (re-arm on a new bar)


//===========================================
//  INIT
//===========================================
int OnInit()
{
   if(!CheckAccountNumber()) return INIT_FAILED;
   g_licExpired = !LicenceCheck();
   if(g_licExpired) Print("Licence expired — MANAGE-ONLY mode: open positions are still closed/trailed, no new entries.");

   // Refuse dangerous settings instead of trading them
   if(RiskPercent <= 0 || RiskPercent > 5 || SlPercent <= 0 || RetracementPercent <= 0 ||
      MaxMinLotRiskPct < 0 || MaxDrawdownPct < 0 || AtrMultiplier <= 0)
   {
      Print("Invalid inputs: RiskPercent must be >0 and <=5, SlPercent / RetracementPercent / AtrMultiplier > 0.");
      return INIT_PARAMETERS_INCORRECT;
   }
   if(EntryUntilHour >= 0 && (EntryFromHour < 0 || EntryFromHour > 23 || EntryFromMinute < 0 || EntryFromMinute > 59 || EntryUntilHour > 24 ||
                              EntryFromHour * 60 + EntryFromMinute >= EntryUntilHour * 60))
   {
      Print("Invalid entry window: EntryFromHour:EntryFromMinute must be before EntryUntilHour (server time), or EntryUntilHour = -1.");
      return INIT_PARAMETERS_INCORRECT;
   }

   g_gvPeak = "RetraceEA_PEAK_" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + "_" + IntegerToString(Magic);
   g_gvHalt = "RetraceEA_HALT_" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + "_" + IntegerToString(Magic);
   g_gvDay  = "RetraceEA_DAY_"  + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + "_" + IntegerToString(Magic);
   g_gvEnt  = "RetraceEA_ENT_"  + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + "_" + IntegerToString(Magic);
   string gvReset = "RetraceEA_RESET_" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + "_" + IntegerToString(Magic);
   if(ResetDrawdownGuard)
   {
      bool tripped = (GlobalVariableCheck(g_gvHalt) && GlobalVariableGet(g_gvHalt) > 0.5);
      bool recent  = (GlobalVariableCheck(gvReset) && TimeCurrent() - (datetime)GlobalVariableGet(gvReset) < 86400);
      if(!tripped)
         Print("ResetDrawdownGuard IGNORED — the kill switch is not tripped. Set it back to FALSE.");
      else if(recent)
         Print("ResetDrawdownGuard IGNORED — already reset in the last 24h (input left TRUE?). Set it back to FALSE.");
      else
      {
         GlobalVariableSet(g_gvPeak, AccountInfoDouble(ACCOUNT_EQUITY));
         GlobalVariableSet(g_gvHalt, 0.0);
         GlobalVariableSet(gvReset, (double)TimeCurrent());
         GlobalVariablesFlush();
         Print("Kill switch reset — peak equity set to ", DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2),
               ". Set ResetDrawdownGuard back to FALSE.");
      }
   }
   g_halted = (GlobalVariableCheck(g_gvHalt) && GlobalVariableGet(g_gvHalt) > 0.5);
   if(g_halted) Print("KILL SWITCH IS ACTIVE — no new entries. Re-attach with ResetDrawdownGuard = true to resume.");

   trade.SetExpertMagicNumber(Magic);
   trade.SetDeviationInPoints(MaxSlippagePts); // tolerate spread movement on real accounts
   trade.SetTypeFillingBySymbol(_Symbol);      // broker-correct filling mode (avoids "unsupported filling" rejects)

   g_atrTf = (AtrTimeframe == PERIOD_CURRENT) ? PERIOD_H1 : AtrTimeframe;
   if(AtrTimeframe == PERIOD_CURRENT)
      Print("AtrTimeframe=PERIOD_CURRENT is not allowed (trail would depend on the chart) — using H1.");

   handleMa  = iMA (_Symbol, Timeframe, MaPeriods, 0, MaMethod, MaAppPrice);
   handleAtr = iATR(_Symbol, g_atrTf,   AtrPeriod);

   if(handleMa == INVALID_HANDLE || handleAtr == INVALID_HANDLE)
   {
      Print("Failed to create indicator handles.");
      return INIT_FAILED;
   }

   MathSrand((uint)TimeLocal()); // seed random number generator for jokes

   // Timer fires every 30 seconds — hourly heartbeat, 5 AM prayer, 35K weekly report
   EventSetTimer(30);

   K35_OnInit();
   J_Init("https://ismyqqqfmvvlupufcqys.supabase.co/functions/v1/ingest-signal", InpJKey, "RetraceEA XAUUSD", Magic);

   SendTelegramPhoto(
      "🤖 *RetraceEA v3 started* on " + _Symbol +
      " | Risk: " + DoubleToString(RiskPercent, 1) + "%" +
      " | Max trades/day: " + IntegerToString(MaxTradesPerDay) +
      " | Entries: " + EntryWindowText() +
      " | ATR Trail: " + (UseTrailingStop ? "ON ✅" : "OFF ❌")
   );

   return INIT_SUCCEEDED;
}


//===========================================
//  DEINIT
//===========================================
void OnDeinit(const int reason)
{
   EventKillTimer();
   K35_OnDeinit();
   SendTelegram("🔴 *RetraceEA v3 stopped* on " + _Symbol);
}


//===========================================
//  TRADE / CHART EVENTS
//===========================================
void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest &request,
                        const MqlTradeResult &result)
{
   if(trans.type == TRADE_TRANSACTION_DEAL_ADD) g_statsDirty = true; // a deal landed → recount the day
   J_OnTradeTransaction(trans, request, result);                     // every open / SL move / close → J
}

void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
{
   K35_OnChartEvent(id, sparam); // "35K: SEND TEST REPORT" button
}


//===========================================
//  DAY STATS  (entries, realized P&L, last exit — from deal history,
//  so the limits survive restarts / re-attaching the EA)
//===========================================
//===========================================
//  EOD CLOSE TIME for the server day of t (earlier on Friday → no weekend gap risk)
//===========================================
datetime CloseTimeFor(datetime t)
{
   MqlDateTime d;
   TimeToStruct(t, d);
   int h = TimeCloseHour, m = TimeCloseMin;
   if(d.day_of_week == 5 && FridayCloseHour >= 0 && FridayCloseHour * 60 < h * 60 + m) { h = FridayCloseHour; m = 0; }
   d.hour = h; d.min = m; d.sec = 0;
   return StructToTime(d);
}


//===========================================
//  ENTRY WINDOW (v3.2) — new entries only in the Asian session, server time.
//  Arming (price back on the normal side of the threshold) still runs all day.
//===========================================
bool InEntryWindow(datetime t)
{
   if(EntryUntilHour < 0) return true;
   MqlDateTime d; TimeToStruct(t, d);
   int m = d.hour * 60 + d.min;
   return (m >= EntryFromHour * 60 + EntryFromMinute && m < EntryUntilHour * 60);
}

string EntryWindowText()
{
   if(EntryUntilHour < 0) return "all day";
   return StringFormat("%02d:%02d-%02d:00 server", EntryFromHour, EntryFromMinute, EntryUntilHour);
}


//===========================================
//  KILL SWITCH — equity peak-to-trough guard. Once hit, no new entries until reset by hand.
//===========================================
bool DrawdownGuardOk()
{
   if(MaxDrawdownPct <= 0) return true;
   double eq = AccountInfoDouble(ACCOUNT_EQUITY);
   if(eq <= 0) return false;
   double peak = GlobalVariableCheck(g_gvPeak) ? GlobalVariableGet(g_gvPeak) : 0.0;
   if(eq > peak) { peak = eq; GlobalVariableSet(g_gvPeak, peak); }
   if(g_halted) return false;
   double dd = (peak - eq) / peak * 100.0;
   if(dd < MaxDrawdownPct) return true;
   g_halted = true;
   GlobalVariableSet(g_gvHalt, 1.0);
   GlobalVariablesFlush();
   string m = "🚨 *KILL SWITCH* | " + _Symbol + " | equity " + DoubleToString(dd, 1) +
              "% below its peak — NO new entries until the EA is re-attached with ResetDrawdownGuard = true";
   Print(m);
   SendTelegram(m);
   return false;
}


bool RefreshDayStats(datetime dayStart)
{
   datetime now = TimeCurrent();
   if(!g_statsDirty && (now - g_statsAt) < 60) return true;

   if(!MQLInfoInteger(MQL_TESTER) && !TerminalInfoInteger(TERMINAL_CONNECTED)) { g_statsDirty = true; return false; }
   g_entriesToday = 0; g_realizedToday = 0; g_lastExit = 0;
   if(!HistorySelect(dayStart, now + 3600)) { g_statsDirty = true; return false; } // unknown → caller must NOT trade
   g_statsDirty = false;
   g_statsAt    = now;

   long posIds[]; int nIds = 0;
   int total = HistoryDealsTotal();
   for(int i = 0; i < total; i++)
   {
      ulong tk = HistoryDealGetTicket(i);
      if(tk == 0) continue;
      if(HistoryDealGetString(tk, DEAL_SYMBOL) != _Symbol) continue;

      ENUM_DEAL_ENTRY e   = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(tk, DEAL_ENTRY);
      long            mg  = HistoryDealGetInteger(tk, DEAL_MAGIC);
      long            pid = HistoryDealGetInteger(tk, DEAL_POSITION_ID);

      if(e == DEAL_ENTRY_IN)
      {
         if(mg != Magic) continue;
         g_entriesToday++;
         ArrayResize(posIds, nIds + 1); posIds[nIds++] = pid;
      }
      else
      {
         bool mine = (mg == Magic);           // SL/TP exits can carry magic 0 on some servers → match by position id
         for(int k = 0; k < nIds && !mine; k++) if(posIds[k] == pid) mine = true;
         if(!mine) continue;
         g_realizedToday += HistoryDealGetDouble(tk, DEAL_PROFIT) + HistoryDealGetDouble(tk, DEAL_SWAP) +
                            HistoryDealGetDouble(tk, DEAL_COMMISSION);
         datetime t = (datetime)HistoryDealGetInteger(tk, DEAL_TIME);
         if(t > g_lastExit) g_lastExit = t;
      }
   }
   if(g_memEntries > g_entriesToday) g_entriesToday = g_memEntries;
   if(GlobalVariableCheck(g_gvDay) && (datetime)GlobalVariableGet(g_gvDay) == dayStart && GlobalVariableCheck(g_gvEnt))
   {
      int gvCount = (int)GlobalVariableGet(g_gvEnt);
      if(gvCount > g_entriesToday) g_entriesToday = gvCount;
   }
   return true;
}

void NotifyBlockedOnce(const string reason)
{
   if(g_blockMsgSent) return;
   g_blockMsgSent = true;
   Print("Entries blocked for today: ", reason);
   SendTelegram("🛑 *No more entries today* | " + _Symbol + " | " + reason);
}

// A failed / skipped attempt: wait before trying again; 5 failures = stop for the day (no order / Telegram storms)
void RegisterFail(datetime now, int waitSeconds)
{
   g_failsToday++;
   g_nextTryTime = (g_failsToday >= 5) ? g_day + 86400 : now + waitSeconds;
}


//===========================================
//  ON TICK
//===========================================
void OnTick()
{
   datetime now      = TimeCurrent();
   datetime dayStart = (datetime)((long)now - ((long)now % 86400));

   // Today's EOD close time (earlier on Friday)
   datetime timeClose = CloseTimeFor(now);

   // ── New server day → reset the daily state ─────────────
   if(dayStart != g_day)
   {
      g_day = dayStart; g_armed = false; g_memEntries = 0; g_failsToday = 0;
      g_nextTryTime = 0; g_blockMsgSent = false; g_statsDirty = true;
   }

   // ATR of the last CLOSED bar (stable). Missing ATR must never stop position management.
   double atrBuf[1]; double atr = 0;
   if(CopyBuffer(handleAtr, 0, 1, 1, atrBuf) == 1) atr = atrBuf[0];

   // ── Manage open positions ───────────────────────────────
   int openCount = 0;
   for(int i = PositionsTotal()-1; i >= 0; i--)
   {
      CPositionInfo pos;
      if(!pos.SelectByIndex(i)) continue;
      if(pos.Symbol() != _Symbol || pos.Magic() != Magic) continue;

      openCount++;

      // EOD close — also closes a position carried over from a previous day (terminal was off at close time)
      bool carried = (CloseCarriedPositions && pos.Time() < dayStart);
      if(now >= timeClose || carried)
      {
         if(now < g_nextCloseTry) continue;
         double pnl = pos.Profit(); // kept for journal only
         ulong  tk  = pos.Ticket();
         if(trade.PositionClose(tk))
         {
            openCount--;
            g_statsDirty = true;
            string msg = (carried ? "🧹 *Carried-over position closed* | " : "🕙 *EOD Close* | ") + _Symbol +
                         " | Ticket: #" + IntegerToString((long)tk) +
                         "\n" + GetRandomJoke(pnl >= 0);
            Print(__FUNCTION__, " > Close Ticket #", tk, " P&L: ", pnl);
            SendTelegramPhoto(msg);
         }
         else
         {
            g_nextCloseTry = now + 10;
            Print(__FUNCTION__, " > close failed, retcode ", trade.ResultRetcode(), " — retry in 10s");
         }
         continue;
      }

      // ATR Trailing Stop
      if(UseTrailingStop && atr > 0)
         ApplyAtrTrail(pos, atr);
   }

   // ── Entry gates ─────────────────────────────────────────
   bool ddOk = DrawdownGuardOk();                                        // runs every tick so the equity peak stays current
   if(!ddOk) return;                                                     // kill switch active
   if(g_licExpired) return;                                              // licence expired → manage only
   if(openCount > 0) return;                                             // one position at a time
   if(now >= timeClose - NoEntryMinsBeforeClose * 60) return;            // too close to / past EOD
   if(now < g_nextTryTime) return;                                       // backing off after a failed attempt

   double ma[1];
   if(CopyBuffer(handleMa, 0, 1, 1, ma) < 1) return;

   double close1 = iClose(_Symbol, Timeframe, 1);
   double open0  = iOpen (_Symbol, Timeframe, 0);
   double ask    = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid    = SymbolInfoDouble(_Symbol, SYMBOL_BID);

   // History not loaded yet returns 0 → in v2 that produced instant false signals. Never trade on zeros.
   if(ma[0] <= 0 || close1 <= 0 || open0 <= 0 || ask <= 0 || bid <= 0) return;
   // Filter-timeframe series must already contain the current bar (otherwise open0 is yesterday's open)
   datetime bar0 = iTime(_Symbol, Timeframe, 0);
   int      tfSec = PeriodSeconds(Timeframe);
   if(bar0 <= 0 || (tfSec <= 86400 && now >= bar0 + tfSec)) return;
   if(bar0 != g_filterBar) { g_filterBar = bar0; g_armed = false; }      // new reference bar → must re-arm

   // ── Retracement thresholds ──────────────────────────────
   double retraceLongThresh  = open0 - RetracementPercent * open0 / 100.0;
   double retraceShortThresh = open0 + RetracementPercent * open0 / 100.0;

   int  bias   = (close1 > ma[0]) ? 1 : (close1 < ma[0]) ? -1 : 0;
   bool signal = false;
   // Edge trigger: price must first be on the normal side of the threshold (arm), THEN cross it (signal).
   // v2 used a level test, so the signal stayed TRUE after every stop-out and re-fired on the next tick.
   if(bias > 0) { if(bid > retraceLongThresh)  g_armed = true; else if(bid < retraceLongThresh)  signal = true; }
   if(bias < 0) { if(bid < retraceShortThresh) g_armed = true; else if(bid > retraceShortThresh) signal = true; }

   // ── Diagnostics: once per minute in the journal (was every tick) ─
   if(DiagEnabled && now - g_lastDiag >= 60)
   {
      g_lastDiag = now;
      PrintFormat("DIAG | %s | close1=%.2f MA=%.2f | open0=%.2f bid=%.2f | LongThr=%.2f ShortThr=%.2f | armed=%s signal=%s | window=%s",
                  (bias > 0 ? "LONG bias" : bias < 0 ? "SHORT bias" : "NO bias"),
                  close1, ma[0], open0, bid, retraceLongThresh, retraceShortThresh,
                  (g_armed ? "Y" : "N"), (signal ? "Y" : "N"), (InEntryWindow(now) ? "open" : "closed"));
   }

   if(!InEntryWindow(now)) return;                                     // v3.2: Asian-session entries only
   if(bias == 0 || !signal || !g_armed) return;

   // ── Safety limits (from deal history — survive restarts) ─
   if(!RefreshDayStats(dayStart)) return;                                // history unavailable → fail closed
   if(MaxTradesPerDay > 0 && g_entriesToday >= MaxTradesPerDay)
   {
      NotifyBlockedOnce("daily trade limit reached (" + IntegerToString(g_entriesToday) + "/" + IntegerToString(MaxTradesPerDay) + ")");
      return;
   }
   if(MaxDailyLossPercent > 0 && g_realizedToday < 0)
   {
      double dayStartBal = AccountInfoDouble(ACCOUNT_BALANCE) - g_realizedToday;
      double lossPct     = (dayStartBal > 0) ? -g_realizedToday / dayStartBal * 100.0 : 100.0;
      if(lossPct >= MaxDailyLossPercent)
      {
         NotifyBlockedOnce("daily loss limit hit (-" + DoubleToString(lossPct, 2) + "%)");
         return;
      }
   }
   if(CooldownMinutes > 0 && g_lastExit > 0 && now - g_lastExit < CooldownMinutes * 60) return;

   // ── Build the order ─────────────────────────────────────
   bool            isBuy = (bias > 0);
   ENUM_ORDER_TYPE type  = isBuy ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   double          entry = isBuy ? ask : bid;
   double          sl    = NormalizePrice(isBuy ? entry - entry * SlPercent / 100.0
                                                : entry + entry * SlPercent / 100.0);
   double          slDist = MathAbs(entry - sl);
   if(slDist <= 0) return;

   // Spread filter (rollover / news spreads)
   if(MaxSpreadPctOfSL > 0 && (ask - bid) > slDist * MaxSpreadPctOfSL / 100.0)
   {
      if(now - g_lastSpreadLog >= 60)
      {
         g_lastSpreadLog = now;
         PrintFormat("Entry delayed — spread %.2f > %.1f%% of SL distance %.2f", ask - bid, MaxSpreadPctOfSL, slDist);
      }
      return;
   }

   string why  = "";
   double lots = CalculateLotSize(type, entry, sl, why);
   string side = isBuy ? "BUY" : "SELL";

   if(lots <= 0)
   {
      Print(__FUNCTION__, " > ", side, " skipped — ", why);
      if(DiagEnabled) SendTelegram("⚠️ *" + side + " skipped* | " + _Symbol + " | " + why);
      RegisterFail(now, 3600);
      return;
   }

   bool sent = isBuy ? trade.Buy (lots, _Symbol, 0.0, sl, 0.0, "RetraceEA v3")
                     : trade.Sell(lots, _Symbol, 0.0, sl, 0.0, "RetraceEA v3");
   uint rc   = trade.ResultRetcode();

   if(sent && (rc == TRADE_RETCODE_DONE || rc == TRADE_RETCODE_DONE_PARTIAL || rc == TRADE_RETCODE_PLACED))
   {
      g_armed = false;          // must re-arm (price back across the threshold) before any further entry
      g_memEntries++;
      g_statsDirty = true;
      if(!GlobalVariableCheck(g_gvDay) || (datetime)GlobalVariableGet(g_gvDay) != g_day)
      {
         GlobalVariableSet(g_gvDay, (double)g_day);
         GlobalVariableSet(g_gvEnt, 0.0);
      }
      GlobalVariableSet(g_gvEnt, GlobalVariableGet(g_gvEnt) + 1.0);
      GlobalVariablesFlush();
      string msg = (isBuy ? "📈 *BUY opened* | " : "📉 *SELL opened* | ") + _Symbol +
                   " | Entry: " + DoubleToString(trade.ResultPrice() > 0 ? trade.ResultPrice() : entry, _Digits) +
                   " | SL: "    + DoubleToString(sl,   _Digits) +
                   " | Lots: "  + DoubleToString(lots, 2) +
                   " | Risk: "  + DoubleToString(RiskPercent, 1) + "%" +
                   "\n" + GetRandomJoke(isBuy);
      Print(__FUNCTION__, " > ", msg);
      SendTelegramPhoto(msg);
   }
   else
   {
      // ── Trade was REJECTED — log, back off 60s, give up for the day after 5 failures ─
      RegisterFail(now, 60);
      string errMsg = "❌ *" + side + " REJECTED* | " + _Symbol +
                      " | Lots: "    + DoubleToString(lots, 2) +
                      " | Entry: "   + DoubleToString(entry, _Digits) +
                      " | SL: "      + DoubleToString(sl,    _Digits) +
                      " | Retcode: " + IntegerToString((long)rc) +
                      " | Comment: " + trade.ResultComment() +
                      " | Attempt "  + IntegerToString(g_failsToday) + "/5";
      Print(__FUNCTION__, " > ", errMsg);
      if(DiagEnabled) SendTelegram(errMsg);
   }
}


//===========================================
//  ON TIMER  (fires every 30 seconds)
//  Runs on weekends too — no tick dependency
//===========================================
void OnTimer()
{
   J_OnTimer();   // held trailing-stop updates + retry queue for J
   K35_OnTimer(); // 35K weekly investor report + test-button label reset

   datetime    localNow = TimeLocal(); // always ticking, even on weekends
   MqlDateTime dt;
   TimeToStruct(localNow, dt);

   // ── Morning Prayer at exactly 05:00 AM ─────────────────
   string todayStr = StringFormat("%04d-%02d-%02d", dt.year, dt.mon, dt.day);
   if(dt.hour == 5 && dt.min == 0 && g_lastPrayerDate != todayStr)
   {
      g_lastPrayerDate = todayStr;
      SendTelegram(MorningPrayer);
   }

   // ── Hourly Heartbeat + Screenshot ──────────────────────
   if(dt.hour != g_lastHourSent)
   {
      g_lastHourSent = dt.hour;
      SendHourlyUpdate();
   }
}


//===========================================
//  HOURLY STATUS UPDATE
//===========================================
void SendHourlyUpdate()
{
   datetime localNow = TimeLocal();
   // balance/equity used only to pick positive vs negative joke — never displayed
   bool inProfit = (AccountInfoDouble(ACCOUNT_EQUITY) >= AccountInfoDouble(ACCOUNT_BALANCE));

   // Count open positions managed by this EA
   int    posCount  = 0;
   string posDetail = "";
   for(int i = 0; i < PositionsTotal(); i++)
   {
      CPositionInfo pos;
      if(!pos.SelectByIndex(i)) continue;
      if(pos.Symbol() != _Symbol || pos.Magic() != Magic) continue;
      posCount++;
      string dir = (pos.PositionType() == POSITION_TYPE_BUY) ? "📈 BUY" : "📉 SELL";
      posDetail += "  " + dir + " " + DoubleToString(pos.Volume(), 2) + " lots\n";
   }

   // ── Live filter status for diagnostics ──────────────────
   string filterBlock = "";
   if(DiagEnabled)
   {
      double ma[1];
      double close1 = iClose(_Symbol, Timeframe, 1);
      double open0  = iOpen (_Symbol, Timeframe, 0);
      double close0 = iClose(_Symbol, Timeframe, 0);
      bool   maOk   = (CopyBuffer(handleMa, MAIN_LINE, 1, 1, ma) >= 1);

      datetime timeClose = CloseTimeFor(TimeCurrent());
      bool timeOk = (TimeCurrent() < timeClose);

      string maBias   = !maOk ? "N/A" : (close1 > ma[0] ? "LONG ✅" : (close1 < ma[0] ? "SHORT ✅" : "FLAT ❌"));
      double retL     = open0 - RetracementPercent * open0 / 100.0;
      double retS     = open0 + RetracementPercent * open0 / 100.0;
      bool   retLong  = maOk && close1 > ma[0] && close0 < retL;
      bool   retShort = maOk && close1 < ma[0] && close0 > retS;

      filterBlock  = "──────────────────────\n";
      filterBlock += "🔍 *Filter Snapshot*\n";
      filterBlock += "  🕐 Time gate: "      + (timeOk  ? "OPEN ✅"  : "CLOSED ❌ (past " + TimeToString(timeClose, TIME_MINUTES) + " server)") + "\n";
      filterBlock += "  🌏 Entry window: "   + EntryWindowText() + (InEntryWindow(TimeCurrent()) ? " — OPEN ✅" : " — closed ⏸") + "\n";
      filterBlock += "  📊 MA bias: "         + maBias + "\n";
      if(maOk)
      {
         filterBlock += "  🔢 close1=" + DoubleToString(close1, _Digits) +
                        " vs MA=" + DoubleToString(ma[0], _Digits) + "\n";
         filterBlock += "  📉 Retrace LONG:  close0=" + DoubleToString(close0, _Digits) +
                        " thresh=" + DoubleToString(retL, _Digits) +
                        (retLong  ? (g_armed ? " ✅ TRIGGERED" : " ⏸ below, waiting to re-arm") : " ❌ NOT YET") + "\n";
         filterBlock += "  📈 Retrace SHORT: close0=" + DoubleToString(close0, _Digits) +
                        " thresh=" + DoubleToString(retS, _Digits) +
                        (retShort ? (g_armed ? " ✅ TRIGGERED" : " ⏸ above, waiting to re-arm") : " ❌ NOT YET") + "\n";
      }
      filterBlock += "  💼 Pos open: " + (posCount > 0 ? "YES ❌ (blocked)" : "NO ✅ (can trade)") + "\n";
      datetime srvNow = TimeCurrent();
      g_statsDirty = true;
      RefreshDayStats((datetime)((long)srvNow - ((long)srvNow % 86400)));
      filterBlock += "  🎯 Entries today: " + IntegerToString(g_entriesToday) + "/" + IntegerToString(MaxTradesPerDay) +
                     " | Realized: " + DoubleToString(g_realizedToday, 2) + "\n";
      filterBlock += "  🛡 Kill switch: " + (MaxDrawdownPct <= 0 ? "OFF" : (g_halted ? "TRIPPED 🚨 (no entries)" : "armed ✅ (" + DoubleToString(MaxDrawdownPct, 0) + "% from peak)")) + "\n";
   }

   string msg = "⏰ *Hourly Heartbeat — Jarvis@RDS.AI*\n";
   msg += "📅 " + TimeToString(localNow, TIME_DATE | TIME_MINUTES) + "\n";
   msg += "  🖥 Server: " + TimeToString(TimeCurrent(), TIME_DATE | TIME_MINUTES) + "\n";
   msg += "──────────────────────\n";
   msg += "🔄 Open Trades: " + IntegerToString(posCount) + "\n";
   if(posCount > 0) msg += posDetail;
   msg += filterBlock;
   msg += "──────────────────────\n";
   msg += GetRandomJoke(inProfit);

   SendTelegramPhoto(msg);
}


//===========================================
//  GET RANDOM JOKE
//===========================================
string GetRandomJoke(bool positive)
{
   if(positive && ArraySize(PosJokes) > 0)
   {
      int idx = (int)(MathRand() % ArraySize(PosJokes));
      return "😄 _" + PosJokes[idx] + "_";
   }
   else if(!positive && ArraySize(NegJokes) > 0)
   {
      int idx = (int)(MathRand() % ArraySize(NegJokes));
      return "😅 _" + NegJokes[idx] + "_";
   }
   return "";
}


//===========================================
//  PRICE HELPER — round to the symbol's tick size
//===========================================
double NormalizePrice(double price)
{
   double ts = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   if(ts <= 0) return NormalizeDouble(price, _Digits);
   return NormalizeDouble(MathRound(price / ts) * ts, _Digits);
}


//===========================================
//  ATR TRAILING STOP
//  v2 bug: trail started on the first tick using the CHART timeframe's ATR, so on M1/M5 the 0.5% stop
//  was instantly replaced by a stop a few dollars away → stopped out within minutes → re-entry loop.
//  v3: fixed ATR timeframe, starts only once in profit, moves in steps, respects broker stop level,
//      never loosens, no screenshot per modification.
//===========================================
void ApplyAtrTrail(CPositionInfo &pos, double atr)
{
   datetime now = TimeCurrent();
   if(atr <= 0 || now < g_nextTrailTry) return;

   double tick      = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   double minDist   = (double)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL) * _Point;
   double trailDist = MathMax(atr * AtrMultiplier, minDist + tick);
   double startDist = atr * TrailStartAtr;
   double step      = MathMax(atr * TrailStepAtr, tick);
   double price     = pos.PriceCurrent();
   double openPrice = pos.PriceOpen();
   double currentSl = pos.StopLoss();
   bool   isBuy     = (pos.PositionType() == POSITION_TYPE_BUY);
   double newSl     = 0;

   if(isBuy)
   {
      if(price - openPrice < startDist) return;                   // not enough profit yet
      newSl = NormalizePrice(price - trailDist);
      if(currentSl > 0 && newSl < currentSl + step) return;       // only tighten, and only by a full step
   }
   else
   {
      if(openPrice - price < startDist) return;
      newSl = NormalizePrice(price + trailDist);
      if(currentSl > 0 && newSl > currentSl - step) return;
   }

   if(trade.PositionModify(pos.Ticket(), newSl, pos.TakeProfit()))
   {
      Print(__FUNCTION__, " > ", (isBuy ? "BUY" : "SELL"), " trail SL → ", DoubleToString(newSl, _Digits));
      if(now - g_lastTrailMsg >= TrailMsgMinutes * 60)             // text only + throttled: never block ticks on screenshots
      {
         g_lastTrailMsg = now;
         SendTelegram("🔧 *SL Trailed — " + (isBuy ? "BUY" : "SELL") + "* | " + _Symbol +
                      " | New SL: " + DoubleToString(newSl, _Digits) +
                      " | Price: "  + DoubleToString(price, _Digits));
      }
   }
   else
   {
      g_nextTrailTry = now + 30;                                   // don't hammer the server with rejected modifies
      Print(__FUNCTION__, " > modify failed, retcode ", trade.ResultRetcode(), " — retry in 30s");
   }
}


//===========================================
//  LOT SIZE CALCULATOR (% risk based)
//  v2 bug: MathMax(minLot, lots) silently forced the minimum lot, so on a small account one 0.5% stop could cost
//  10-20% instead of 1%. v3: loss per lot from OrderCalcProfit (exact for the broker/currency), min lot is used
//  only if its real risk <= MaxMinLotRiskPct (else the trade is skipped), and free margin is checked.
//  Returns 0 and fills 'why' when the trade must be skipped.
//===========================================
double CalculateLotSize(ENUM_ORDER_TYPE orderType, double entryPrice, double slPrice, string &why)
{
   why = "";
   double base       = MathMin(AccountInfoDouble(ACCOUNT_BALANCE), AccountInfoDouble(ACCOUNT_EQUITY));
   double riskAmount = base * RiskPercent / 100.0;
   double lotStep    = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   double minLot     = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double maxLot     = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   if(base <= 0 || lotStep <= 0 || minLot <= 0) { why = "bad account/symbol data"; return 0; }

   // Money lost per 1.00 lot if the SL is hit
   double lossPerLot = 0, p = 0;
   if(OrderCalcProfit(orderType, _Symbol, 1.0, entryPrice, slPrice, p) && p < 0)
      lossPerLot = -p;
   else
   {
      double tickSize  = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
      double tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE_LOSS);
      if(tickValue <= 0) tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
      if(tickSize > 0 && tickValue > 0) lossPerLot = MathAbs(entryPrice - slPrice) / tickSize * tickValue;
   }
   if(lossPerLot <= 0) { why = "cannot value the stop distance (symbol properties)"; return 0; }

   double lots = MathFloor(riskAmount / lossPerLot / lotStep + 1e-9) * lotStep;

   if(lots < minLot)
   {
      double minLotRiskPct = lossPerLot * minLot / base * 100.0;
      if(minLotRiskPct > MaxMinLotRiskPct)
      {
         why = "account too small: min lot " + DoubleToString(minLot, 2) + " would risk " +
               DoubleToString(minLotRiskPct, 1) + "% (limit " + DoubleToString(MaxMinLotRiskPct, 1) + "%)";
         return 0;
      }
      lots = minLot;
   }
   if(maxLot > 0 && lots > maxLot) lots = maxLot;

   // Free-margin check — shrink to fit, or skip
   double margin = 0;
   if(OrderCalcMargin(orderType, _Symbol, lots, entryPrice, margin) && margin > 0)
   {
      double usable = AccountInfoDouble(ACCOUNT_MARGIN_FREE) * 0.9;
      if(margin > usable)
      {
         lots = MathFloor(lots * usable / margin / lotStep + 1e-9) * lotStep;
         if(lots < minLot) { why = "not enough free margin"; return 0; }
      }
   }

   int volDigits = (int)MathMax(0.0, MathCeil(-MathLog10(lotStep) - 1e-9));
   lots = NormalizeDouble(lots, volDigits);

   PrintFormat("LotCalc OK | base=%.2f risk=%.2f lossPerLot=%.2f lots=%.2f (real risk %.2f%%)",
               base, riskAmount, lossPerLot, lots, lossPerLot * lots / base * 100.0);
   return lots;
}


//===========================================
//  HELPER: APPEND STRING → CHAR ARRAY
//  (Used to build multipart/form-data bodies)
//===========================================
void AppendStr(char &arr[], const string text)
{
   uchar tmp[];
   int len = StringToCharArray(text, tmp, 0, WHOLE_ARRAY, CP_UTF8);
   if(len > 0) len--; // exclude null terminator
   int prev = ArraySize(arr);
   ArrayResize(arr, prev + len);
   for(int i = 0; i < len; i++)
      arr[prev + i] = (char)tmp[i];
}


//===========================================
//  SEND TELEGRAM PHOTO  (screenshot + caption)
//  Falls back to text-only if screenshot fails
//===========================================
bool SendTelegramPhoto(string caption)
{
   if(!TelegramReady())
      return false;

   // ── Take chart screenshot ────────────────────────────────
   string filename = "jarvis_screen.png";
   if(!ChartScreenShot(0, filename, 1280, 720, ALIGN_RIGHT))
   {
      Print("ChartScreenShot() failed — sending text only. Error: ", GetLastError());
      SendTelegram(caption);
      return false;
   }
   Sleep(300); // brief pause to ensure file is fully written to disk

   // ── Read screenshot binary data ──────────────────────────
   int fh = FileOpen(filename, FILE_READ | FILE_BIN);
   if(fh == INVALID_HANDLE)
   {
      Print("Cannot open screenshot file — sending text only. Error: ", GetLastError());
      SendTelegram(caption);
      return false;
   }
   ulong fileSize = FileSize(fh);
   char  imgData[];
   ArrayResize(imgData, (int)fileSize);
   uint bytesRead = FileReadArray(fh, imgData, 0, (int)fileSize);
   FileClose(fh);

   if(bytesRead == 0 || fileSize == 0)
   {
      Print("Empty screenshot file — sending text only.");
      SendTelegram(caption);
      return false;
   }

   // ── Build multipart/form-data body ───────────────────────
   string boundary = "JarvisEA" + IntegerToString(GetTickCount());
   string CRLF     = "\r\n";
   char   post[];

   // Field: chat_id
   AppendStr(post, "--" + boundary + CRLF);
   AppendStr(post, "Content-Disposition: form-data; name=\"chat_id\"" + CRLF + CRLF);
   AppendStr(post, TelegramChatID + CRLF);

   // Field: parse_mode
   AppendStr(post, "--" + boundary + CRLF);
   AppendStr(post, "Content-Disposition: form-data; name=\"parse_mode\"" + CRLF + CRLF);
   AppendStr(post, "Markdown" + CRLF);

   // Field: caption (Telegram caps at 1024 chars)
   AppendStr(post, "--" + boundary + CRLF);
   AppendStr(post, "Content-Disposition: form-data; name=\"caption\"" + CRLF + CRLF);
   AppendStr(post, StringSubstr(caption, 0, 1020) + CRLF);

   // Field: photo (binary PNG)
   AppendStr(post, "--" + boundary + CRLF);
   AppendStr(post, "Content-Disposition: form-data; name=\"photo\"; filename=\"chart.png\"" + CRLF);
   AppendStr(post, "Content-Type: image/png" + CRLF + CRLF);
   int imgStart = ArraySize(post);
   ArrayResize(post, imgStart + (int)bytesRead);
   ArrayCopy(post, imgData, imgStart, 0, (int)bytesRead);

   // Closing boundary
   AppendStr(post, CRLF + "--" + boundary + "--" + CRLF);

   // ── POST to Telegram sendPhoto ───────────────────────────
   string url     = "https://api.telegram.org/bot" + TelegramToken + "/sendPhoto";
   string headers = "Content-Type: multipart/form-data; boundary=" + boundary + "\r\n";
   char   result[];
   string resHeaders;

   int res = WebRequest("POST", url, headers, 10000, post, result, resHeaders);
   if(res == -1)
   {
      Print("SendTelegramPhoto WebRequest failed. Error: ", GetLastError(),
            " — Falling back to text. Make sure https://api.telegram.org is whitelisted.");
      SendTelegram(caption);
      return false;
   }
   return true;
}


//===========================================
//  TELEGRAM READY?  (off in the Strategy Tester — WebRequest is not available there)
//===========================================
bool TelegramReady()
{
   if(MQLInfoInteger(MQL_TESTER) || MQLInfoInteger(MQL_OPTIMIZATION)) return false;
   return (TelegramEnabled && TelegramToken != "" && TelegramChatID != "");
}


//===========================================
//  SEND TELEGRAM TEXT  (fallback / prayer)
//===========================================
int TelegramPost(const string body)
{
   string url = "https://api.telegram.org/bot" + TelegramToken + "/sendMessage";
   char   postData[];
   char   resultData[];
   string responseHeaders;
   StringToCharArray(body, postData, 0, StringLen(body), CP_UTF8); // body is pure ASCII after UrlEncode

   return WebRequest("POST", url,
      "Content-Type: application/x-www-form-urlencoded\r\n",
      5000, postData, resultData, responseHeaders);
}

void SendTelegram(string message)
{
   if(!TelegramReady()) return;

   string base = "chat_id=" + TelegramChatID + "&text=" + UrlEncode(message);
   int res = TelegramPost(base + "&parse_mode=Markdown");

   // 400 = Telegram could not parse the Markdown (e.g. a stray _ or * in a broker comment) → resend as plain text
   if(res == 400) res = TelegramPost(base);

   if(res == -1)
      Print("SendTelegram (text) failed. Error: ", GetLastError(),
            " — Make sure https://api.telegram.org is whitelisted in Tools > Options > Expert Advisors.");
}


//===========================================
//  URL ENCODER  (for text messages)
//  v2 encoded UTF-16 code units (%D83D…), which breaks every emoji / "—" in text messages.
//  v3 converts to UTF-8 first and percent-encodes byte by byte.
//===========================================
string UrlEncode(string text)
{
   uchar bytes[];
   int n = StringToCharArray(text, bytes, 0, WHOLE_ARRAY, CP_UTF8);
   if(n > 0) n--; // drop the null terminator

   string result = "";
   for(int i = 0; i < n; i++)
   {
      uchar c = bytes[i];
      if((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') ||
         (c >= '0' && c <= '9') ||
          c == '-' || c == '_' || c == '.' || c == '~')
         result += CharToString(c);
      else
         result += StringFormat("%%%02X", c);
   }
   return result;
}


//===========================================
//  LICENCE / SECURITY
//===========================================
// Add a demo login here to forward-test on demo before going live, e.g. {510358874, 12345678}
long AllowedAccounts[] = { 510358874 };

bool CheckAccountNumber()
{
   AccountNumber = AccountInfoInteger(ACCOUNT_LOGIN);
   for(int i = 0; i < ArraySize(AllowedAccounts); i++)
   {
      if(AccountNumber == AllowedAccounts[i])
      {
         Print("### Licensed account: ", AccountNumber);
         return true;
      }
   }
   Print("### Ou pa gen lisans ###");
   return false;
}

bool LicenceCheck()
{
#ifdef LIC_EXPIRES_DAYS
#ifndef LIC_EXPIRES_START
   #define LIC_EXPIRES_START __DATETIME__
#endif
   datetime expiredDate = LIC_EXPIRES_START + (LIC_EXPIRES_DAYS * 86400);
   PrintFormat("Time-limited copy — expires: %s", TimeToString(expiredDate));
   if(TimeCurrent() > expiredDate)
   {
      Print("Licence has expired.");
      return false;
   }
#endif
   return true;
}
