//+------------------------------------------------------------------+
//| XAU_RetraceEA_v3.2_NEW.mq5 — RetraceEA v3.2 (XAUUSD)              |
//| D1 MA trend + intraday retracement entry, % SL, ATR trail, EOD    |
//| v3: one-shot daily entry, loss breaker, safe trail, safe sizing,  |
//|     35K weekly investor report (built in — no .mqh needed)        |
//| v3.1: kill switch, early Friday close, input validation,          |
//|       fail-closed history check, re-arm on new filter bar         |
//| v3.2: Asian-session entry window (01:05-08:00 server). Replayed on|
//|       2015-2026 M1 data: PF 1.08 -> 1.49, max DD 28R -> 10.6R,    |
//|       ~31 trades/yr (London-open dips were the losing trades).    |
//|       Sends every trade to J with chart images (InpJKey); the J   |
//|       code is built in — no include file needed.                  |
//+------------------------------------------------------------------+
#include <Trade/Trade.mqh>

//==== J BRIDGE BEGIN (generated from ea/J_Signal.mqh — edit there, then run ea/embed_bridge.py) ====
//+------------------------------------------------------------------+
//| J bridge — sends an EA's trades to J (https://j-signals)          |
//| Source of truth for the block embedded in every EA in source/     |
//| (ea/embed_bridge.py copies it in; the EAs need no include file).  |
//|                                                                    |
//| Call J_Init + J_Options (+ J_TestButton) in OnInit,              |
//| J_OnTradeTransaction from OnTradeTransaction, J_OnTimer from      |
//| OnTimer, J_OnChartEvent from OnChartEvent, J_Deinit from OnDeinit.|
//| - Filters by magic number; never blocks trading; queues on failure|
//| - SL/TP of 0 (MT5's "none") is sent as null                       |
//| - SL/TP moves are merged: at most one update per position every   |
//|   J_updateEverySec (breakeven at once, latest value delivered)    |
//| - J_pendingAsMarket: pending orders are not sent; when one fills, |
//|   J gets one market signal at the fill (breakout EAs with OCO)    |
//| - Chart images: at open ("Nou achte la" / "Nou vann la") and at   |
//|   close ("Nou close la"), drawn on a clean temporary chart zoomed |
//|   to the trade, sent to J and stored with the signal (live only)  |
//| - "J TEST" button on the chart: one click sends a whole test      |
//|   trade to J (open, both images, close a minute later). It goes   |
//|   to admins only, places no order and needs no ticks, so it works |
//|   at the weekend with the market closed                           |
//+------------------------------------------------------------------+
#ifndef J_SIGNAL_MQH
#define J_SIGNAL_MQH

string   J_url = "";
string   J_key = "";
string   J_name = "";
long     J_magic = 0;
string   J_queueFile = "";
bool     J_ready = false;
datetime J_lastRetry = 0;
int      J_retryEverySec = 5;
int      J_updateEverySec = 300;          // SL/TP updates of one position: at most one per 5 min (breakeven moves go at once)
bool     J_pendingAsMarket = false;       // true: no pending-order signals; a fill becomes a market signal
bool     J_shotsOn = true;                // chart images at open and close
ENUM_TIMEFRAMES J_shotTf = PERIOD_M15;    // timeframe of the open image (close images pick one that fits the trade)
int      J_shotW = 1200;                  // image size in pixels
int      J_shotH = 675;                   // 16:9: two stack cleanly on a share card
int      J_lastCode = 0;                  // HTTP status of the last send (-1 = no connection)
int      J_lastErr = 0;

// Last levels sent per signal (uid) and updates held back by the rate limit (latest value wins)
string   J_sUid[];  double J_sOpen[]; double J_sSl[]; double J_sTp[]; datetime J_sAt[];
string   J_pUid[];  string J_pSym[];  double J_pOpen[]; double J_pSl[]; double J_pTp[]; datetime J_pDue[];
// Chart images waiting to be taken (from J_OnTimer, never inside a trade event)
string   J_jUid[];  string J_jKind[]; string J_jSym[]; int J_jDir[]; datetime J_jT1[]; double J_jP1[]; double J_jSl[]; datetime J_jT2[]; double J_jP2[]; datetime J_jDue[]; int J_jTries[];

void J_FlushHeld();
void J_QueueUpdate(string uid, string sym, double open, double sl, double tp, bool isPosition);
void J_Remember(string uid, double open, double sl, double tp);
void J_Forget(string uid);
void J_SendUpdate(string uid, string sym, double entry, double sl, double tp, bool be);
void J_ProcessShots();
string J_Base(string ev, string uid, string sym);
void   J_TestTick();

//--- helpers ---------------------------------------------------------
bool   J_InTester() { return (MQLInfoInteger(MQL_TESTER) || MQLInfoInteger(MQL_OPTIMIZATION)); }
// Clock for the bridge's own waits (retries, held updates, images). TimeCurrent() stands still while the market is
// closed, so waits measured with it would never end at the weekend; this one always runs.
datetime J_Now() { return (datetime)(GetTickCount64() / 1000); }
string J_Iso(datetime t)
  {
   string s = TimeToString(t, TIME_DATE | TIME_SECONDS);   // 2026.11.04 21:30:00
   StringReplace(s, ".", "-");
   StringReplace(s, " ", "T");
   return s + "Z";
  }
string J_Num(double v, int digits) { return DoubleToString(v, digits); }
string J_Lvl(double v, int digits) { return v == 0.0 ? "null" : DoubleToString(v, digits); }   // MT5 uses 0 for "no SL / no TP"
string J_Str(string v) { StringReplace(v, "\\", "\\\\"); StringReplace(v, "\"", "\\\""); return "\"" + v + "\""; }
bool   J_IsPending(ENUM_ORDER_TYPE t) { return t == ORDER_TYPE_BUY_STOP || t == ORDER_TYPE_SELL_STOP || t == ORDER_TYPE_BUY_LIMIT || t == ORDER_TYPE_SELL_LIMIT; }
string J_OrderTypeName(ENUM_ORDER_TYPE t)
  {
   switch(t)
     {
      case ORDER_TYPE_BUY_STOP:   return "buy_stop";
      case ORDER_TYPE_SELL_STOP:  return "sell_stop";
      case ORDER_TYPE_BUY_LIMIT:  return "buy_limit";
      case ORDER_TYPE_SELL_LIMIT: return "sell_limit";
      default:                    return "market";
     }
  }
string J_DirOfOrder(ENUM_ORDER_TYPE t) { return (t == ORDER_TYPE_BUY || t == ORDER_TYPE_BUY_STOP || t == ORDER_TYPE_BUY_LIMIT) ? "buy" : "sell"; }
double J_PipSize(string sym)
  {
   int digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   double point = SymbolInfoDouble(sym, SYMBOL_POINT);
   string u = sym; StringToUpper(u);
   if(StringFind(u, "XAU") >= 0) return 0.10;
   if(digits == 3 || digits == 5) return point * 10.0;
   return point;
  }

//--- symbol block shared by every payload
string J_SymbolJson(string sym)
  {
   int digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   return "\"symbol\":" + J_Str(sym)
        + ",\"digits\":" + IntegerToString(digits)
        + ",\"point\":" + J_Num(SymbolInfoDouble(sym, SYMBOL_POINT), 8)
        + ",\"pip_size\":" + J_Num(J_PipSize(sym), 8)
        + ",\"tick_size\":" + J_Num(SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_SIZE), 8)
        + ",\"tick_value\":" + J_Num(SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_VALUE), 6)
        + ",\"contract_size\":" + J_Num(SymbolInfoDouble(sym, SYMBOL_TRADE_CONTRACT_SIZE), 2)
        + ",\"vol_min\":" + J_Num(SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN), 2)
        + ",\"vol_step\":" + J_Num(SymbolInfoDouble(sym, SYMBOL_VOLUME_STEP), 2)
        + ",\"vol_max\":" + J_Num(SymbolInfoDouble(sym, SYMBOL_VOLUME_MAX), 2)
        + ",\"account_currency\":" + J_Str(AccountInfoString(ACCOUNT_CURRENCY));
  }

//--- transport -------------------------------------------------------
// Returns true when the server accepted the payload. 4xx (bad key / bad payload) is logged and dropped,
// everything else (timeouts, 5xx, no network) goes to the queue for OnTimer.
bool J_Post(string json, bool fromQueue)
  {
   if(J_InTester()) { if(StringLen(json) < 2000) Print("J (tester, not sent): ", json); return true; }
   if(J_url == "" || J_key == "") { Print("J: not initialised (url/key missing)"); return true; }
   char data[]; char result[]; string resultHeaders;
   int len = StringToCharArray(json, data, 0, WHOLE_ARRAY, CP_UTF8);
   if(len > 0) ArrayResize(data, len - 1);   // drop the terminating zero
   string headers = "Content-Type: application/json\r\nX-J-Key: " + J_key + "\r\n";
   int timeout = (StringLen(json) > 20000) ? 30000 : 3000;   // images take longer than signals
   ResetLastError();
   int code = WebRequest("POST", J_url, headers, timeout, data, result, resultHeaders);
   int err = GetLastError();
   J_lastCode = code; J_lastErr = err;
   if(code == 200 || code == 201 || code == 202) return true;
   if(code == -1 && err == 4014)
     {
      Print("J: WebRequest blocked (4014). Add this URL in Tools -> Options -> Expert Advisors -> 'Allow WebRequest for listed URL': ", J_url);
     }
   else if(code >= 400 && code < 500)
     {
      string body = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
      Print("J: rejected (", code, "): ", body, " — payload dropped");
      return true;   // permanent: do not retry
     }
   else
     {
      Print("J: send failed (code ", code, ", error ", err, ")", fromQueue ? " — stays queued" : " — queued for retry");
     }
   return false;
  }

void J_QueueAppend(string json)
  {
   int h = FileOpen(J_queueFile, FILE_READ | FILE_WRITE | FILE_TXT | FILE_ANSI | FILE_SHARE_READ | FILE_SHARE_WRITE);
   if(h == INVALID_HANDLE) { Print("J: cannot open queue file ", J_queueFile); return; }
   FileSeek(h, 0, SEEK_END);
   FileWriteString(h, json + "\n");
   FileClose(h);
  }

void J_Send(string json)
  {
   if(!J_Post(json, false)) J_QueueAppend(json);
  }

// Held SL updates, chart images, then the retry queue (in order; stops at the first failure so order is preserved).
void J_OnTimer()
  {
   if(!J_ready) return;
   J_FlushHeld();
   J_ProcessShots();
   J_TestTick();
   if(J_Now() - J_lastRetry < J_retryEverySec) return;
   J_lastRetry = J_Now();
   if(!FileIsExist(J_queueFile)) return;
   int h = FileOpen(J_queueFile, FILE_READ | FILE_TXT | FILE_ANSI | FILE_SHARE_READ | FILE_SHARE_WRITE);
   if(h == INVALID_HANDLE) return;
   string lines[]; int n = 0;
   while(!FileIsEnding(h))
     {
      string line = FileReadString(h);
      if(StringLen(line) > 2) { ArrayResize(lines, n + 1); lines[n++] = line; }
     }
   FileClose(h);
   int sent = 0;
   for(int i = 0; i < n; i++)
     {
      if(!J_Post(lines[i], true)) break;
      sent++;
     }
   if(sent == 0) return;
   FileDelete(J_queueFile);
   if(sent < n)
     {
      int w = FileOpen(J_queueFile, FILE_WRITE | FILE_TXT | FILE_ANSI);
      if(w != INVALID_HANDLE) { for(int i = sent; i < n; i++) FileWriteString(w, lines[i] + "\n"); FileClose(w); }
     }
  }

//--- init ------------------------------------------------------------
void J_Init(string url, string key, string eaName, long magic)
  {
   J_url = url; J_key = key; J_name = eaName; J_magic = magic;
   string safe = eaName; StringReplace(safe, " ", "_"); StringReplace(safe, "/", "_"); StringReplace(safe, "@", "_");
   J_queueFile = "J_queue_" + safe + "_" + IntegerToString(magic) + ".txt";
   J_ready = true;
   if(key == "") Print("J: InpJKey is empty — signals will not be sent");
  }
// pendingAsMarket: one market signal at the fill instead of pending-order signals. shots: chart images at open / close.
void J_Options(bool pendingAsMarket, bool shots, ENUM_TIMEFRAMES shotTf)
  {
   J_pendingAsMarket = pendingAsMarket; J_shotsOn = shots;
   J_shotTf = (shotTf == PERIOD_CURRENT) ? PERIOD_M15 : shotTf;
  }

//--- per-signal level memory and the update rate limit ---------------
int  J_Find(string &arr[], string uid) { for(int i = 0; i < ArraySize(arr); i++) if(arr[i] == uid) return i; return -1; }
void J_SetUpdatePolicy(int everySec) { J_updateEverySec = (int)MathMax(0, everySec); }   // 0 = send every SL/TP change at once

void J_Remember(string uid, double open, double sl, double tp)
  {
   int i = J_Find(J_sUid, uid);
   if(i < 0) { i = ArraySize(J_sUid); ArrayResize(J_sUid, i + 1); ArrayResize(J_sOpen, i + 1); ArrayResize(J_sSl, i + 1); ArrayResize(J_sTp, i + 1); ArrayResize(J_sAt, i + 1); J_sUid[i] = uid; }
   J_sOpen[i] = open; J_sSl[i] = sl; J_sTp[i] = tp; J_sAt[i] = J_Now();
  }
void J_DropHeld(int p)
  {
   ArrayRemove(J_pUid, p, 1); ArrayRemove(J_pSym, p, 1); ArrayRemove(J_pOpen, p, 1); ArrayRemove(J_pSl, p, 1); ArrayRemove(J_pTp, p, 1); ArrayRemove(J_pDue, p, 1);
  }
// The signal is over (closed / cancelled): forget its levels and any held update
void J_Forget(string uid)
  {
   int p = J_Find(J_pUid, uid); if(p >= 0) J_DropHeld(p);
   int i = J_Find(J_sUid, uid);
   if(i >= 0) { ArrayRemove(J_sUid, i, 1); ArrayRemove(J_sOpen, i, 1); ArrayRemove(J_sSl, i, 1); ArrayRemove(J_sTp, i, 1); ArrayRemove(J_sAt, i, 1); }
  }

// SL / TP / price of a live signal changed. Same levels as last sent: ignored. Breakeven, a first change, or the
// interval passed: sent now. Otherwise held, and the latest held value goes out from J_OnTimer when the interval ends.
void J_QueueUpdate(string uid, string sym, double open, double sl, double tp, bool isPosition)
  {
   double pt = SymbolInfoDouble(sym, SYMBOL_POINT) * 0.5;
   int i = J_Find(J_sUid, uid);
   int p = J_Find(J_pUid, uid);
   if(i >= 0 && MathAbs(J_sSl[i] - sl) < pt && MathAbs(J_sTp[i] - tp) < pt && MathAbs(J_sOpen[i] - open) < pt) { if(p >= 0) J_DropHeld(p); return; }
   bool be = isPosition && sl > 0 && MathAbs(sl - open) <= SymbolInfoDouble(sym, SYMBOL_POINT) * 1.0001;
   datetime now = J_Now();
   if(be || i < 0 || J_updateEverySec <= 0 || now - J_sAt[i] >= J_updateEverySec)
     {
      if(p >= 0) J_DropHeld(p);
      J_SendUpdate(uid, sym, open, sl, tp, be);
      return;
     }
   if(p < 0) { p = ArraySize(J_pUid); ArrayResize(J_pUid, p + 1); ArrayResize(J_pSym, p + 1); ArrayResize(J_pOpen, p + 1); ArrayResize(J_pSl, p + 1); ArrayResize(J_pTp, p + 1); ArrayResize(J_pDue, p + 1); J_pUid[p] = uid; }
   J_pSym[p] = sym; J_pOpen[p] = open; J_pSl[p] = sl; J_pTp[p] = tp; J_pDue[p] = J_sAt[i] + J_updateEverySec;
  }

void J_FlushHeld()
  {
   datetime now = J_Now();
   for(int p = ArraySize(J_pUid) - 1; p >= 0; p--)
     {
      if(now < J_pDue[p]) continue;
      string uid = J_pUid[p], sym = J_pSym[p]; double open = J_pOpen[p], sl = J_pSl[p], tp = J_pTp[p];
      J_DropHeld(p);
      J_SendUpdate(uid, sym, open, sl, tp, false);
     }
  }

//--- chart images ----------------------------------------------------
void J_QueueShot(string uid, string kind, string sym, int dir, datetime t1, double p1, double sl, datetime t2, double p2)
  {
   if(!J_shotsOn || J_InTester() || J_key == "") return;
   int n = ArraySize(J_jUid);
   ArrayResize(J_jUid, n + 1); ArrayResize(J_jKind, n + 1); ArrayResize(J_jSym, n + 1); ArrayResize(J_jDir, n + 1); ArrayResize(J_jT1, n + 1); ArrayResize(J_jP1, n + 1);
   ArrayResize(J_jSl, n + 1); ArrayResize(J_jT2, n + 1); ArrayResize(J_jP2, n + 1); ArrayResize(J_jDue, n + 1); ArrayResize(J_jTries, n + 1);
   J_jUid[n] = uid; J_jKind[n] = kind; J_jSym[n] = sym; J_jDir[n] = dir; J_jT1[n] = t1; J_jP1[n] = p1; J_jSl[n] = sl; J_jT2[n] = t2; J_jP2[n] = p2;
   J_jDue[n] = J_Now() + 3; J_jTries[n] = 0;
  }
void J_DropShot(int i)
  {
   ArrayRemove(J_jUid, i, 1); ArrayRemove(J_jKind, i, 1); ArrayRemove(J_jSym, i, 1); ArrayRemove(J_jDir, i, 1); ArrayRemove(J_jT1, i, 1); ArrayRemove(J_jP1, i, 1);
   ArrayRemove(J_jSl, i, 1); ArrayRemove(J_jT2, i, 1); ArrayRemove(J_jP2, i, 1); ArrayRemove(J_jDue, i, 1); ArrayRemove(J_jTries, i, 1);
  }

void J_ChartStyle(long id)
  {
   ChartSetInteger(id, CHART_MODE, CHART_CANDLES);
   ChartSetInteger(id, CHART_SHOW_GRID, false);
   ChartSetInteger(id, CHART_SHOW_VOLUMES, CHART_VOLUME_HIDE);
   ChartSetInteger(id, CHART_SHOW_OHLC, false);
   ChartSetInteger(id, CHART_SHOW_ASK_LINE, false);
   ChartSetInteger(id, CHART_SHOW_BID_LINE, false);
   ChartSetInteger(id, CHART_SHOW_TRADE_LEVELS, false);
   ChartSetInteger(id, CHART_SHOW_ONE_CLICK, false);
   ChartSetInteger(id, CHART_SHOW_PERIOD_SEP, false);
   ChartSetInteger(id, CHART_SHOW_TICKER, false);
   ChartSetInteger(id, CHART_FOREGROUND, false);
   ChartSetInteger(id, CHART_COLOR_BACKGROUND, C'10,10,12');
   ChartSetInteger(id, CHART_COLOR_FOREGROUND, C'142,142,147');
   ChartSetInteger(id, CHART_COLOR_GRID, C'28,28,32');
   ChartSetInteger(id, CHART_COLOR_CHART_UP, C'47,191,113');
   ChartSetInteger(id, CHART_COLOR_CHART_DOWN, C'229,72,77');
   ChartSetInteger(id, CHART_COLOR_CANDLE_BULL, C'47,191,113');
   ChartSetInteger(id, CHART_COLOR_CANDLE_BEAR, C'229,72,77');
   ChartSetInteger(id, CHART_COLOR_CHART_LINE, C'191,195,201');
   // a clean chart: no indicators from the default template
   int windows = (int)ChartGetInteger(id, CHART_WINDOWS_TOTAL);
   for(int w = windows - 1; w >= 0; w--)
      for(int k = ChartIndicatorsTotal(id, w) - 1; k >= 0; k--)
         ChartIndicatorDelete(id, w, ChartIndicatorName(id, w, k));
  }

void J_Text(long id, string name, datetime t, double p, string text, color clr, int size, ENUM_ANCHOR_POINT anchor)
  {
   ObjectCreate(id, name, OBJ_TEXT, 0, t, p);
   ObjectSetString(id, name, OBJPROP_TEXT, text);
   ObjectSetString(id, name, OBJPROP_FONT, "Arial Black");
   ObjectSetInteger(id, name, OBJPROP_FONTSIZE, size);
   ObjectSetInteger(id, name, OBJPROP_COLOR, clr);
   ObjectSetInteger(id, name, OBJPROP_ANCHOR, anchor);
  }
void J_Line(long id, string name, datetime t1, double p1, datetime t2, double p2, color clr, ENUM_LINE_STYLE style, int width)
  {
   ObjectCreate(id, name, OBJ_TREND, 0, t1, p1, t2, p2);
   ObjectSetInteger(id, name, OBJPROP_COLOR, clr);
   ObjectSetInteger(id, name, OBJPROP_STYLE, style);
   ObjectSetInteger(id, name, OBJPROP_WIDTH, width);
   ObjectSetInteger(id, name, OBJPROP_RAY_RIGHT, false);
   ObjectSetInteger(id, name, OBJPROP_BACK, true);
  }

// Draws the trade on a clean temporary chart zoomed to it, saves a PNG and returns it as base64.
// Open: the lead-up and the entry ("Nou achte la" / "Nou vann la", SL line). Close: entry to exit ("Nou close la", result).
// replay (the test button only): an open image of a moment in the past. The chart then ends at the entry bar, so
// nothing that came after shows, and the labels sit left of the entry because there is no free margin on the right.
bool J_TakeShot(string kind, string sym, int dir, datetime t1, double p1, double sl, datetime t2, double p2, bool replay, string &b64)
  {
   bool isClose = (kind == "close");
   datetime tEnd = isClose ? t2 : t1;
   ENUM_TIMEFRAMES tf = J_shotTf;
   if(isClose)
     {
      ENUM_TIMEFRAMES ladder[] = {PERIOD_M1, PERIOD_M5, PERIOD_M15, PERIOD_M30, PERIOD_H1, PERIOD_H4, PERIOD_D1};
      tf = PERIOD_D1;
      for(int i = 0; i < ArraySize(ladder); i++) if((long)(t2 - t1) / PeriodSeconds(ladder[i]) <= 60) { tf = ladder[i]; break; }
     }
   int tfSec = PeriodSeconds(tf);
   int tradeBars = (int)((tEnd - t1) / tfSec);
   int lead = isClose ? 24 : 48;
   int want = lead + tradeBars + 6;                               // bars that must fit across the image
   // price window: the candles shown plus every level drawn, with room for the labels
   MqlRates rates[];
   int got = CopyRates(sym, tf, tEnd, want, rates);              // by bar count, so a weekend between bars does not shrink it
   if(got <= 0) return false;
   double hi = MathMax(p1, isClose ? p2 : p1), lo = MathMin(p1, isClose ? p2 : p1);
   for(int i = 0; i < got; i++) { hi = MathMax(hi, rates[i].high); lo = MathMin(lo, rates[i].low); }
   if(!isClose && sl > 0) { hi = MathMax(hi, sl); lo = MathMin(lo, sl); }
   double pad = (hi - lo) * 0.22; if(pad <= 0) pad = SymbolInfoDouble(sym, SYMBOL_POINT) * 100;

   long id = ChartOpen(sym, tf);
   if(id == 0) { Print("J: chart image skipped — ChartOpen failed (", GetLastError(), ")"); return false; }
   J_ChartStyle(id);
   int scale = 5;                                                 // bar spacing 2^scale px: the largest that still fits the trade
   while(scale > 0 && (J_shotW - 90) / (1 << scale) < want) scale--;
   ChartSetInteger(id, CHART_SCALE, scale);
   int back = (replay && !isClose) ? iBarShift(sym, tf, t1, false) : 0;   // bars after the entry bar (a replayed test only)
   if(back < 0) back = 0;
   if(back > 0)
     {
      ChartSetInteger(id, CHART_AUTOSCROLL, false);
      ChartSetInteger(id, CHART_SHIFT, false);
     }
   else
     {
      ChartSetInteger(id, CHART_AUTOSCROLL, true);
      ChartSetInteger(id, CHART_SHIFT, true);
      ChartSetDouble(id, CHART_SHIFT_SIZE, 22.0);                // empty margin on the right: the labels go there, never over candles
     }
   ChartSetInteger(id, CHART_SCALEFIX, true);
   ChartSetDouble(id, CHART_FIXED_MAX, hi + pad);
   ChartSetDouble(id, CHART_FIXED_MIN, lo - pad);
   ChartNavigate(id, CHART_END, -back);

   color side = (dir > 0) ? C'47,191,113' : C'229,72,77';
   int d = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   ObjectCreate(id, "J_in", dir > 0 ? OBJ_ARROW_BUY : OBJ_ARROW_SELL, 0, t1, p1);
   ObjectSetInteger(id, "J_in", OBJPROP_COLOR, side);
   ObjectSetInteger(id, "J_in", OBJPROP_WIDTH, 3);
   string inText = dir > 0 ? "Nou achte la" : "Nou vann la";
   double off = (hi - lo) * 0.035;
   if(!isClose && back > 0)
     {
      double edge = p1;                                           // clear of the candles the label runs under / over
      for(int i = 0; i < got; i++)
         if(rates[i].time <= t1 && (long)(t1 - rates[i].time) <= 14 * tfSec) edge = (dir > 0) ? MathMin(edge, rates[i].low) : MathMax(edge, rates[i].high);
      J_Text(id, "J_in_t", t1, dir > 0 ? edge - off : edge + off, inText + " ", side, 18, dir > 0 ? ANCHOR_RIGHT_UPPER : ANCHOR_RIGHT_LOWER);
      J_Line(id, "J_in_l", t1 - (datetime)(10 * tfSec), p1, t1, p1, side, STYLE_SOLID, 2);
      if(sl > 0)
        {
         J_Line(id, "J_sl_l", t1 - (datetime)(10 * tfSec), sl, t1, sl, C'229,72,77', STYLE_DOT, 1);
         J_Text(id, "J_sl_t", t1 - (datetime)(10 * tfSec), sl, "SL " + DoubleToString(sl, d) + " ", C'229,72,77', 10, ANCHOR_RIGHT);
        }
     }
   else if(!isClose)
     {
      J_Text(id, "J_in_t", t1 + (datetime)tfSec, p1, " " + inText, side, 18, ANCHOR_LEFT_LOWER);   // in the right margin, above the entry line
      J_Line(id, "J_in_l", t1, p1, t1 + (datetime)(8 * tfSec), p1, side, STYLE_SOLID, 2);
      if(sl > 0)
        {
         J_Line(id, "J_sl_l", t1, sl, t1 + (datetime)(8 * tfSec), sl, C'229,72,77', STYLE_DOT, 1);
         J_Text(id, "J_sl_t", t1 + (datetime)(8 * tfSec), sl, " SL " + DoubleToString(sl, d), C'229,72,77', 10, ANCHOR_LEFT);
        }
     }
   else
     {
      double pips = (p2 - p1) * dir / J_PipSize(sym);
      color res = (pips >= 0) ? C'47,191,113' : C'229,72,77';
      // entry label under the lowest low around a buy / over the highest high around a sell (the window keeps 22% free)
      double edge = p1;
      for(int i = 0; i < got; i++)
         if(MathAbs((long)(rates[i].time - t1)) <= 3 * tfSec) edge = (dir > 0) ? MathMin(edge, rates[i].low) : MathMax(edge, rates[i].high);
      J_Text(id, "J_in_t", t1, dir > 0 ? edge - off : edge + off, inText, side, 16, dir > 0 ? ANCHOR_UPPER : ANCHOR_LOWER);
      J_Line(id, "J_tr", t1, p1, t2, p2, res, STYLE_DOT, 2);
      ObjectCreate(id, "J_out", pips >= 0 ? OBJ_ARROW_CHECK : OBJ_ARROW_STOP, 0, t2, p2);
      ObjectSetInteger(id, "J_out", OBJPROP_COLOR, res);
      ObjectSetInteger(id, "J_out", OBJPROP_WIDTH, 3);
      // exit labels in the right margin: "Nou close la" above the exit price, the result below it
      J_Line(id, "J_out_l", t2, p2, t2 + (datetime)(2 * tfSec), p2, res, STYLE_SOLID, 2);
      J_Text(id, "J_out_t", t2 + (datetime)tfSec, p2, " Nou close la", C'245,245,247', 18, ANCHOR_LEFT_LOWER);
      J_Text(id, "J_out_r", t2 + (datetime)tfSec, p2, " " + (pips >= 0 ? "+" : "") + DoubleToString(pips, 1) + " pips", res, 15, ANCHOR_LEFT_UPPER);
     }
   ObjectCreate(id, "J_brand", OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(id, "J_brand", OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(id, "J_brand", OBJPROP_XDISTANCE, 16);
   ObjectSetInteger(id, "J_brand", OBJPROP_YDISTANCE, 12);
   ObjectSetString(id, "J_brand", OBJPROP_TEXT, "J  ·  " + sym + "  ·  " + StringSubstr(EnumToString(tf), 7));
   ObjectSetString(id, "J_brand", OBJPROP_FONT, "Arial");
   ObjectSetInteger(id, "J_brand", OBJPROP_FONTSIZE, 12);
   ObjectSetInteger(id, "J_brand", OBJPROP_COLOR, C'142,142,147');

   for(int k = 0; k < 30 && ChartGetInteger(id, CHART_VISIBLE_BARS) <= 0; k++) { ChartRedraw(id); Sleep(100); }
   if(back > 0) ChartNavigate(id, CHART_END, -back);              // again once the bars are loaded: an empty chart cannot scroll
   ChartRedraw(id);
   Sleep(400);
   string file = "J_shot_" + IntegerToString(id) + ".png";
   bool ok = ChartScreenShot(id, file, J_shotW, J_shotH, ALIGN_RIGHT);
   ChartClose(id);
   if(!ok) { Print("J: chart image failed (", GetLastError(), ")"); return false; }
   uchar png[];
   for(int k = 0; k < 10; k++)
     {
      Sleep(200);
      int h = FileOpen(file, FILE_READ | FILE_BIN);
      if(h == INVALID_HANDLE) continue;
      int size = (int)FileSize(h);
      if(size > 0) { ArrayResize(png, size); FileReadArray(h, png, 0, size); }
      FileClose(h);
      if(ArraySize(png) > 0) break;
     }
   FileDelete(file);
   if(ArraySize(png) == 0) return false;
   uchar key[]; uchar enc[];
   int n = CryptEncode(CRYPT_BASE64, png, key, enc);
   if(n <= 0) return false;
   b64 = CharArrayToString(enc, 0, n);
   StringReplace(b64, "\r", ""); StringReplace(b64, "\n", "");
   return true;
  }

// One image per timer tick at most (each one blocks the EA for about a second); two tries per image.
void J_ProcessShots()
  {
   datetime now = J_Now();
   for(int i = 0; i < ArraySize(J_jUid); i++)
     {
      if(now < J_jDue[i]) continue;
      string b64 = "";
      bool replay = (StringFind(J_jUid[i], "test-") == 0);
      if(J_TakeShot(J_jKind[i], J_jSym[i], J_jDir[i], J_jT1[i], J_jP1[i], J_jSl[i], J_jT2[i], J_jP2[i], replay, b64))
        {
         J_Send(J_Base("shot", J_jUid[i], J_jSym[i]) + ",\"kind\":" + J_Str(J_jKind[i]) + ",\"png_base64\":\"" + b64 + "\"}");
         J_DropShot(i);
        }
      else
        {
         J_jTries[i]++;
         if(J_jTries[i] >= 2) J_DropShot(i);
         else J_jDue[i] = now + 60;
        }
      return;
     }
  }

//--- events ----------------------------------------------------------
string J_Base(string ev, string uid, string sym)
  {
   return "{\"event\":" + J_Str(ev) + ",\"ea_uid\":" + J_Str(uid) + ",\"ea\":" + J_Str(J_name) + "," + J_SymbolJson(sym)
        + ",\"sent_at\":" + J_Str(J_Iso(TimeGMT()));
  }

void J_SendOpen(string uid, string sym, string dir, string otype, double entry, double sl, double tp, double lots, int expirySec)
  {
   int d = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   J_Send(J_Base("open", uid, sym) + ",\"direction\":" + J_Str(dir) + ",\"order_type\":" + J_Str(otype)
          + ",\"entry\":" + J_Num(entry, d) + ",\"sl\":" + J_Lvl(sl, d) + ",\"tp\":" + J_Lvl(tp, d)
          + ",\"ea_lot\":" + J_Num(lots, 2) + ",\"expiry_sec\":" + IntegerToString(expirySec) + "}");
   J_Remember(uid, entry, sl, tp);
  }
void J_SendTriggered(string uid, string sym, double price) { int d = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS); J_Send(J_Base("triggered", uid, sym) + ",\"price\":" + J_Num(price, d) + "}"); }
void J_SendUpdate(string uid, string sym, double entry, double sl, double tp, bool be)
  {
   int d = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   J_Send(J_Base(be ? "move_be" : "update", uid, sym) + ",\"entry\":" + J_Num(entry, d) + ",\"sl\":" + J_Lvl(sl, d) + ",\"tp\":" + J_Lvl(tp, d) + "}");
   J_Remember(uid, entry, sl, tp);
  }
void J_SendPartial(string uid, string sym, double lots, double price) { int d = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS); J_Send(J_Base("partial", uid, sym) + ",\"lots\":" + J_Num(lots, 2) + ",\"price\":" + J_Num(price, d) + "}"); }
void J_SendClose(string uid, string sym, double price, string reason, double profit) { int d = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS); J_Send(J_Base("close", uid, sym) + ",\"price\":" + J_Num(price, d) + ",\"reason\":" + J_Str(reason) + ",\"profit\":" + J_Num(profit, 2) + "}"); }
void J_SendCancel(string uid, string sym) { J_Send(J_Base("cancel", uid, sym) + "}"); }

// Manual helper: a test signal (goes to admins only).
void J_SendTest(string sym, string dir, double entry, double sl, double tp, double lots)
  {
   int d = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   J_Send(J_Base("open", "test-" + IntegerToString((long)TimeGMT()), sym) + ",\"direction\":" + J_Str(dir) + ",\"order_type\":\"market\""
          + ",\"entry\":" + J_Num(entry, d) + ",\"sl\":" + J_Lvl(sl, d) + ",\"tp\":" + J_Lvl(tp, d) + ",\"ea_lot\":" + J_Num(lots, 2)
          + ",\"expiry_sec\":0,\"test\":true}");
  }

//--- test button -----------------------------------------------------
// One click sends a whole test trade to J: the open, the open image, and about a minute later the close and the
// close image. J shows it to admins only (marked TEST). No order is placed and no tick is needed: the test replays
// the last J_testBars bars of this chart's symbol, so it works at the weekend with the market closed.
string   J_testBtn = "J_TEST_BTN";
string   J_testIdle = "J: SEND TEST SIGNAL";
color    J_testIdleClr = C'34,34,40';
string   J_testUid = "";                  // "" = no test running
string   J_testSym = "";
int      J_testDir = 0;
datetime J_testT1 = 0; double J_testP1 = 0; datetime J_testT2 = 0; double J_testP2 = 0; double J_testLot = 0;
datetime J_testCloseDue = 0;
datetime J_testLabelDue = 0;
int      J_testBars = 20;                 // the test trade "opened" this many bars ago and "closes" on the latest bar
int      J_testCloseSec = 60;             // time to open the signal in J and swipe "I took it" before the close arrives

void J_TestLabel(string text, color bg)
  {
   if(ObjectFind(0, J_testBtn) < 0) return;
   ObjectSetString(0, J_testBtn, OBJPROP_TEXT, text);
   ObjectSetInteger(0, J_testBtn, OBJPROP_BGCOLOR, bg);
   ObjectSetInteger(0, J_testBtn, OBJPROP_STATE, false);          // un-press
   ChartRedraw(0);
  }

// Call from OnInit. Sits under the 35K button in the top-right corner (a button is anchored by its top-left corner).
void J_TestButton(bool show)
  {
   if(!show || J_InTester()) { ObjectDelete(0, J_testBtn); return; }
   if(ObjectFind(0, J_testBtn) < 0 && !ObjectCreate(0, J_testBtn, OBJ_BUTTON, 0, 0, 0)) return;
   ObjectSetInteger(0, J_testBtn, OBJPROP_CORNER, CORNER_RIGHT_UPPER);
   ObjectSetInteger(0, J_testBtn, OBJPROP_XDISTANCE, 210);
   ObjectSetInteger(0, J_testBtn, OBJPROP_YDISTANCE, 64);
   ObjectSetInteger(0, J_testBtn, OBJPROP_XSIZE, 200);
   ObjectSetInteger(0, J_testBtn, OBJPROP_YSIZE, 28);
   ObjectSetInteger(0, J_testBtn, OBJPROP_FONTSIZE, 9);
   ObjectSetString(0, J_testBtn, OBJPROP_FONT, "Arial");
   ObjectSetInteger(0, J_testBtn, OBJPROP_COLOR, clrWhite);
   ObjectSetInteger(0, J_testBtn, OBJPROP_BORDER_COLOR, C'191,195,201');
   ObjectSetInteger(0, J_testBtn, OBJPROP_BACK, false);
   ObjectSetInteger(0, J_testBtn, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, J_testBtn, OBJPROP_HIDDEN, true);
   J_TestLabel(J_testIdle, J_testIdleClr);
  }
// Call from OnDeinit.
void J_Deinit() { ObjectDelete(0, J_testBtn); }

// An image taken right now (the test does not wait for the timer); if the chart is not ready it is queued for one more try.
void J_ShotNow(string uid, string kind, string sym, int dir, datetime t1, double p1, double sl, datetime t2, double p2)
  {
   if(!J_shotsOn) return;
   string b64 = "";
   if(J_TakeShot(kind, sym, dir, t1, p1, sl, t2, p2, true, b64))
      J_Send(J_Base("shot", uid, sym) + ",\"kind\":" + J_Str(kind) + ",\"png_base64\":\"" + b64 + "\"}");
   else J_QueueShot(uid, kind, sym, dir, t1, p1, sl, t2, p2);
  }

void J_TestStart()
  {
   if(J_InTester()) return;
   if(J_testUid != "") { Print("J test: one is already running, it closes by itself"); J_TestLabel("TEST RUNNING, CLOSES SOON", clrDarkOrange); return; }
   if(J_key == "")
     {
      J_TestLabel("NO J KEY (InpJKey)", clrFireBrick); J_testLabelDue = J_Now() + 6;
      Print("J test: InpJKey is empty. Paste the key from J -> Admin -> EA sources into the EA inputs.");
      return;
     }
   string sym = _Symbol;
   MqlRates r[];
   int got = CopyRates(sym, J_shotTf, 0, J_testBars + 16, r);    // oldest first; no ticks needed
   if(got < J_testBars + 2)
     {
      J_TestLabel("NO CHART DATA YET, TRY AGAIN", clrFireBrick); J_testLabelDue = J_Now() + 6;
      Print("J test: not enough ", StringSubstr(EnumToString(J_shotTf), 7), " bars for ", sym, " yet (", got, "). Open that chart once so MT5 loads it.");
      return;
     }
   int last = got - 1, inBar = last - J_testBars;
   double p1 = r[inBar].close, p2 = r[last].close;
   int dir = (p2 >= p1) ? 1 : -1;                                  // the test follows what price did, so it closes green
   double range = 0; int cnt = 0;
   for(int i = (int)MathMax(0, inBar - 13); i <= inBar; i++) { range += r[i].high - r[i].low; cnt++; }
   double atr = (cnt > 0) ? range / cnt : 0;
   if(atr <= 0) atr = SymbolInfoDouble(sym, SYMBOL_POINT) * 100;
   int d = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   double sl = NormalizeDouble(p1 - dir * 1.5 * atr, d), tp = NormalizeDouble(p1 + dir * 3.0 * atr, d);
   double lot = SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN);
   string uid = "test-" + IntegerToString((long)TimeGMT());
   J_TestLabel("SENDING...", clrDarkOrange);
   string json = J_Base("open", uid, sym) + ",\"direction\":" + J_Str(dir > 0 ? "buy" : "sell") + ",\"order_type\":\"market\""
               + ",\"entry\":" + J_Num(p1, d) + ",\"sl\":" + J_Lvl(sl, d) + ",\"tp\":" + J_Lvl(tp, d) + ",\"ea_lot\":" + J_Num(lot, 2)
               + ",\"expiry_sec\":0,\"test\":true}";
   J_Post(json, false);
   if(J_lastCode != 200 && J_lastCode != 201 && J_lastCode != 202)
     {
      string why = "FAILED (" + IntegerToString(J_lastCode) + ")";
      if(J_lastCode == -1 && J_lastErr == 4014) why = "ALLOW THE J URL (SEE EXPERTS)";
      else if(J_lastCode == -1) why = "NO CONNECTION";
      else if(J_lastCode == 401 || J_lastCode == 403) why = "KEY REFUSED, CHECK InpJKey";
      J_TestLabel(why, clrFireBrick); J_testLabelDue = J_Now() + 10;
      Print("J test: the test signal was not accepted (status ", J_lastCode, ", error ", J_lastErr, "). Nothing was queued.");
      return;
     }
   J_testUid = uid; J_testSym = sym; J_testDir = dir; J_testT1 = r[inBar].time; J_testP1 = p1; J_testT2 = r[last].time; J_testP2 = p2; J_testLot = lot;
   J_testCloseDue = J_Now() + J_testCloseSec; J_testLabelDue = 0;
   J_TestLabel("TEST SENT, CLOSES IN ~1 MIN", clrSeaGreen);
   Print("J test: test signal sent (", sym, " ", dir > 0 ? "BUY" : "SELL", " ", J_Num(p1, d), "). Admins see it in J marked TEST. It closes by itself in about a minute.");
   J_ShotNow(uid, "open", sym, dir, J_testT1, p1, sl, 0, 0);
  }

// From J_OnTimer: closes the running test when its minute is up, and puts the button label back.
void J_TestTick()
  {
   datetime now = J_Now();
   if(J_testLabelDue > 0 && now >= J_testLabelDue) { J_testLabelDue = 0; if(J_testUid == "") J_TestLabel(J_testIdle, J_testIdleClr); }
   if(J_testUid == "" || now < J_testCloseDue) return;
   string uid = J_testUid; J_testUid = "";
   double profit = 0;
   if(!OrderCalcProfit(J_testDir > 0 ? ORDER_TYPE_BUY : ORDER_TYPE_SELL, J_testSym, J_testLot, J_testP1, J_testP2, profit)) profit = 0;
   J_SendClose(uid, J_testSym, J_testP2, "manual", profit);
   J_ShotNow(uid, "close", J_testSym, J_testDir, J_testT1, J_testP1, 0, J_testT2, J_testP2);
   J_TestLabel("TEST CLOSED, CHECK J", clrSeaGreen); J_testLabelDue = J_Now() + 10;
   Print("J test: test trade closed and both chart images sent.");
  }

// Call from OnChartEvent.
void J_OnChartEvent(const int id, const string &sparam)
  {
   if(id != CHARTEVENT_OBJECT_CLICK || sparam != J_testBtn) return;
   J_TestStart();
  }

// Hook this from OnTradeTransaction. Only this EA's magic number is reported.
void J_OnTradeTransaction(const MqlTradeTransaction &trans, const MqlTradeRequest &request, const MqlTradeResult &result)
  {
   if(!J_ready) return;
   //--- pending order placed (not sent when pending orders become market signals at the fill)
   if(trans.type == TRADE_TRANSACTION_ORDER_ADD)
     {
      if(J_pendingAsMarket) return;
      if(!OrderSelect(trans.order)) return;
      if(OrderGetInteger(ORDER_MAGIC) != J_magic) return;
      ENUM_ORDER_TYPE t = (ENUM_ORDER_TYPE)OrderGetInteger(ORDER_TYPE);
      if(!J_IsPending(t)) return;
      J_SendOpen(IntegerToString(trans.order), OrderGetString(ORDER_SYMBOL), J_DirOfOrder(t), J_OrderTypeName(t),
                 OrderGetDouble(ORDER_PRICE_OPEN), OrderGetDouble(ORDER_SL), OrderGetDouble(ORDER_TP), OrderGetDouble(ORDER_VOLUME_INITIAL), 0);
      return;
     }
   //--- pending order modified (price / SL / TP)
   if(trans.type == TRADE_TRANSACTION_ORDER_UPDATE)
     {
      if(J_pendingAsMarket) return;
      if(!OrderSelect(trans.order)) return;
      if(OrderGetInteger(ORDER_MAGIC) != J_magic) return;
      ENUM_ORDER_TYPE t = (ENUM_ORDER_TYPE)OrderGetInteger(ORDER_TYPE);
      if(!J_IsPending(t)) return;
      J_QueueUpdate(IntegerToString(trans.order), OrderGetString(ORDER_SYMBOL), OrderGetDouble(ORDER_PRICE_OPEN), OrderGetDouble(ORDER_SL), OrderGetDouble(ORDER_TP), false);
      return;
     }
   //--- pending order cancelled or expired
   if(trans.type == TRADE_TRANSACTION_HISTORY_ADD)
     {
      if(J_pendingAsMarket) return;
      if(!HistoryOrderSelect(trans.order)) return;
      if(HistoryOrderGetInteger(trans.order, ORDER_MAGIC) != J_magic) return;
      ENUM_ORDER_TYPE t = (ENUM_ORDER_TYPE)HistoryOrderGetInteger(trans.order, ORDER_TYPE);
      ENUM_ORDER_STATE st = (ENUM_ORDER_STATE)HistoryOrderGetInteger(trans.order, ORDER_STATE);
      if(J_IsPending(t) && (st == ORDER_STATE_CANCELED || st == ORDER_STATE_EXPIRED))
        {
         J_SendCancel(IntegerToString(trans.order), HistoryOrderGetString(trans.order, ORDER_SYMBOL));
         J_Forget(IntegerToString(trans.order));
        }
      return;
     }
   //--- position SL/TP changed
   if(trans.type == TRADE_TRANSACTION_POSITION)
     {
      if(!PositionSelectByTicket(trans.position)) return;
      if(PositionGetInteger(POSITION_MAGIC) != J_magic) return;
      string sym = PositionGetString(POSITION_SYMBOL);
      double open = PositionGetDouble(POSITION_PRICE_OPEN), sl = PositionGetDouble(POSITION_SL), tp = PositionGetDouble(POSITION_TP);
      J_QueueUpdate(IntegerToString(PositionGetInteger(POSITION_IDENTIFIER)), sym, open, sl, tp, true);
      return;
     }
   //--- deals: open / triggered / partial / close
   if(trans.type == TRADE_TRANSACTION_DEAL_ADD)
     {
      if(!HistoryDealSelect(trans.deal)) return;
      if(HistoryDealGetInteger(trans.deal, DEAL_MAGIC) != J_magic) return;
      ENUM_DEAL_ENTRY entry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(trans.deal, DEAL_ENTRY);
      long posId = HistoryDealGetInteger(trans.deal, DEAL_POSITION_ID);
      long orderTicket = HistoryDealGetInteger(trans.deal, DEAL_ORDER);
      string sym = HistoryDealGetString(trans.deal, DEAL_SYMBOL);
      double price = HistoryDealGetDouble(trans.deal, DEAL_PRICE);
      double vol = HistoryDealGetDouble(trans.deal, DEAL_VOLUME);
      datetime when = (datetime)HistoryDealGetInteger(trans.deal, DEAL_TIME);
      string uid = IntegerToString(posId);
      if(entry == DEAL_ENTRY_IN)
        {
         ENUM_DEAL_TYPE dt = (ENUM_DEAL_TYPE)HistoryDealGetInteger(trans.deal, DEAL_TYPE);
         int dir = (dt == DEAL_TYPE_BUY) ? 1 : -1;
         double sl = 0, tp = 0;
         if(PositionSelectByTicket(posId)) { sl = PositionGetDouble(POSITION_SL); tp = PositionGetDouble(POSITION_TP); }
         bool fromPending = false;
         if(HistoryOrderSelect(orderTicket)) fromPending = J_IsPending((ENUM_ORDER_TYPE)HistoryOrderGetInteger(orderTicket, ORDER_TYPE));
         if(fromPending && !J_pendingAsMarket)
           {
            J_SendTriggered(uid, sym, price);
            J_Remember(uid, price, sl, tp);
           }
         else J_SendOpen(uid, sym, dir > 0 ? "buy" : "sell", "market", price, sl, tp, vol, 0);   // market order, or a breakout fill
         J_QueueShot(uid, "open", sym, dir, when, price, sl, 0, 0);
         return;
        }
      if(entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_OUT_BY)
        {
         bool stillOpen = PositionSelectByTicket(posId) && PositionGetDouble(POSITION_VOLUME) > 0;
         if(stillOpen) { J_SendPartial(uid, sym, vol, price); return; }
         ENUM_DEAL_REASON r = (ENUM_DEAL_REASON)HistoryDealGetInteger(trans.deal, DEAL_REASON);
         string reason = (r == DEAL_REASON_TP) ? "tp" : (r == DEAL_REASON_SL) ? "sl" : "manual";
         double profit = HistoryDealGetDouble(trans.deal, DEAL_PROFIT);
         J_SendClose(uid, sym, price, reason, profit);
         J_Forget(uid);
         // the close image needs the entry: first IN deal of this position
         datetime tIn = 0; double pIn = 0; int inDir = 0;
         if(HistorySelectByPosition(posId))
            for(int k = 0; k < HistoryDealsTotal(); k++)
              {
               ulong dk = HistoryDealGetTicket(k);
               if(dk == 0 || HistoryDealGetInteger(dk, DEAL_ENTRY) != DEAL_ENTRY_IN) continue;
               tIn = (datetime)HistoryDealGetInteger(dk, DEAL_TIME); pIn = HistoryDealGetDouble(dk, DEAL_PRICE);
               inDir = (HistoryDealGetInteger(dk, DEAL_TYPE) == DEAL_TYPE_BUY) ? 1 : -1;
               break;
              }
         if(tIn > 0) J_QueueShot(uid, "close", sym, inDir, tIn, pIn, 0, when, price);
         return;
        }
     }
  }
#endif
//==== J BRIDGE END ====


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
input string InpJKey   = "";     // J → Admin → EA sources → key for this EA (empty = J off)
input bool   InpJShots = true;   // Chart images to J at open ("Nou achte la / Nou vann la") and close ("Nou close la")
input bool   InpJTestButton = true;   // "J: SEND TEST SIGNAL" button on the chart (works with the market closed)

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
   J_Options(false, InpJShots, PERIOD_M15);
   J_TestButton(InpJTestButton);

   SendTelegramPhoto(
      "🤖 *RetraceEA v3.2 started* on " + _Symbol +
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
   J_Deinit();
   SendTelegram("🔴 *RetraceEA v3.2 stopped* on " + _Symbol);
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
   J_OnChartEvent(id, sparam);   // "J: SEND TEST SIGNAL" button
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
