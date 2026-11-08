//+------------------------------------------------------------------+
//|                                         JARVIS@AI v11.0          |
//|                              Copyright 2024, RDS_Academy         |
//|                              https://www.rdsaibot.online         |
//+------------------------------------------------------------------+
//| USDJPY opening-range breakout. One file: the strategy (unchanged  |
//| from v10), Telegram (free / premium / premium+ routes), the       |
//| intelligence layer (setup snapshots, outcomes, trust score from   |
//| Focus Week), the Focus Week trade link and the 35K investor       |
//| report. Guide: docs/mql5/JARVIS_GUIDE.md in the Focus Week repo.  |
//|                                                                    |
//| One-time terminal step: Tools → Options → Expert Advisors →        |
//| "Allow WebRequest for listed URL" → add                            |
//|   https://api.telegram.org                                         |
//|   https://fbkltjhbmmoryixcbbiw.supabase.co                         |
//|   https://bbghrtvtnceoatyrnqud.supabase.co                         |
//|   https://ismyqqqfmvvlupufcqys.supabase.co   (J signals)           |
//|                                                                    |
//| J (v11.2): the two stop orders stay in MT5 and are NOT sent; when  |
//| one side breaks, J gets ONE market signal at the fill, then its SL |
//| moves, partial, close, and chart images at open and close. The J   |
//| code is built in (no include file). The strategy is unchanged.     |
//+------------------------------------------------------------------+
#property copyright  "Copyright 2024, RDS_Academy"
#property link       "https://www.rdsaibot.online"
#property version    "11.20"
#property strict

#include <Trade/Trade.mqh>

//==== J BRIDGE BEGIN (generated from ea/J_Signal.mqh — edit there, then run ea/embed_bridge.py) ====
//+------------------------------------------------------------------+
//| J bridge — sends an EA's trades to J (https://j-signals)          |
//| Source of truth for the block embedded in every EA in source/     |
//| (ea/embed_bridge.py copies it in; the EAs need no include file).  |
//|                                                                    |
//| Call J_Init + J_Options in OnInit, J_OnTradeTransaction from      |
//| OnTradeTransaction and J_OnTimer from OnTimer.                    |
//| - Filters by magic number; never blocks trading; queues on failure|
//| - SL/TP of 0 (MT5's "none") is sent as null                       |
//| - SL/TP moves are merged: at most one update per position every   |
//|   J_updateEverySec (breakeven at once, latest value delivered)    |
//| - J_pendingAsMarket: pending orders are not sent; when one fills, |
//|   J gets one market signal at the fill (breakout EAs with OCO)    |
//| - Chart images: at open ("Nou achte la" / "Nou vann la") and at   |
//|   close ("Nou close la"), drawn on a clean temporary chart zoomed |
//|   to the trade, sent to J and stored with the signal (live only)  |
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

//--- helpers ---------------------------------------------------------
bool   J_InTester() { return (MQLInfoInteger(MQL_TESTER) || MQLInfoInteger(MQL_OPTIMIZATION)); }
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
   if(code == 200 || code == 201 || code == 202) return true;
   int err = GetLastError();
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
   if(TimeCurrent() - J_lastRetry < J_retryEverySec) return;
   J_lastRetry = TimeCurrent();
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
   J_sOpen[i] = open; J_sSl[i] = sl; J_sTp[i] = tp; J_sAt[i] = TimeCurrent();
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
   datetime now = TimeCurrent();
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
   datetime now = TimeCurrent();
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
   J_jDue[n] = TimeCurrent() + 3; J_jTries[n] = 0;
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
bool J_TakeShot(string kind, string sym, int dir, datetime t1, double p1, double sl, datetime t2, double p2, string &b64)
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
   ChartSetInteger(id, CHART_AUTOSCROLL, true);
   ChartSetInteger(id, CHART_SHIFT, true);
   ChartSetDouble(id, CHART_SHIFT_SIZE, 22.0);                   // empty margin on the right: the labels go there, never over candles
   ChartSetInteger(id, CHART_SCALEFIX, true);
   ChartSetDouble(id, CHART_FIXED_MAX, hi + pad);
   ChartSetDouble(id, CHART_FIXED_MIN, lo - pad);
   ChartNavigate(id, CHART_END, 0);

   color side = (dir > 0) ? C'47,191,113' : C'229,72,77';
   int d = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   ObjectCreate(id, "J_in", dir > 0 ? OBJ_ARROW_BUY : OBJ_ARROW_SELL, 0, t1, p1);
   ObjectSetInteger(id, "J_in", OBJPROP_COLOR, side);
   ObjectSetInteger(id, "J_in", OBJPROP_WIDTH, 3);
   string inText = dir > 0 ? "Nou achte la" : "Nou vann la";
   double off = (hi - lo) * 0.035;
   if(!isClose)
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
   datetime now = TimeCurrent();
   for(int i = 0; i < ArraySize(J_jUid); i++)
     {
      if(now < J_jDue[i]) continue;
      string b64 = "";
      if(J_TakeShot(J_jKind[i], J_jSym[i], J_jDir[i], J_jT1[i], J_jP1[i], J_jSl[i], J_jT2[i], J_jP2[i], b64))
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


#define  EA_VERSION        "11.1"
#define  LIC_EXPIRES_DAYS  30
#define  LIC_EXPIRES_START D'2026.11.23'
#define  FV_DIM            28

//+==================================================================+
//|                              INPUTS                              |
//+==================================================================+
enum ENUM_ROUTE {
   ROUTE_OFF         = 0,  // Off — send nowhere
   ROUTE_FREE        = 1,  // Free channel only
   ROUTE_PREMIUM     = 2,  // Premium channel only
   ROUTE_PREMIUMPLUS = 3,  // Premium+ channel only
   ROUTE_PAID        = 4,  // Premium + Premium+
   ROUTE_FREE_PREM   = 5,  // Free + Premium
   ROUTE_ALL         = 6   // All channels
};
enum ENUM_NEWS_SCOPE  { NEWS_JPY_ONLY = 0, NEWS_USD_ONLY = 1, NEWS_BOTH = 2 };                       // which currency's news skips the day
enum ENUM_NEWS_WINDOW { NEWS_DURING_RANGE = 0, NEWS_AFTER_RANGE = 1, NEWS_BOTH_WINDOWS = 2 };         // when the release must fall to skip
enum ENUM_INTEL_MODE  { INTEL_OFF = 0, INTEL_ADVISORY = 1, INTEL_FILTER = 2 };                        // Off · Advisory (log + show) · Filter (can skip a side)

input group "==== 💰 Risk ===="
input double            InpLots                  = 5;        // Risk per trade, % of equity (× grade: A+ 100%, A 70%, B 50%)

input group "==== 📡 Telegram ===="
input string            InpTelegramToken         = "";       // Bot token — paste it here; never stored in the code
input string            InpFreeChannelID         = "";                 // Free channel chat ID(s), comma-separated (empty = off)
input string            InpPremiumChannelID      = "-1002312330155";   // Premium channel chat ID(s)
input string            InpPremiumPlusChannelID  = "";                 // Premium+ channel chat ID(s) (empty = off)
input string            InpPremiumUpgradeLink    = "https://t.me/your_premium_channel";   // Link in free-channel ads and reports
input double            InpSignalRiskPercent     = 1.0;      // Risk % shown in premium signals
input bool              InpShowLotTable          = true;     // Suggested-lots table in premium signals
input string            InpAccountSizes          = "1000,5000,10000,25000,50000,100000"; // Account sizes for the lot table
input bool              InpHideUsdInTelegram     = true;     // TRUE = no balance / $ amounts in any message

input group "==== 📲 J signals ===="
input string            InpJKey                  = "";       // J → Admin → EA sources → key for this EA (empty = J off)
input bool              InpJShots                = true;     // Chart images to J at open and close

input group "==== 📬 Routes — who gets what ===="
input ENUM_ROUTE        InpRouteSignals          = ROUTE_PREMIUM;   // Potential trade, signal, fill, SL move, partial, exit, OCO
input ENUM_ROUTE        InpRouteTradeUpdates     = ROUTE_PREMIUM;   // Position closed (with the trust it had)
input ENUM_ROUTE        InpRouteDailyReport      = ROUTE_FREE;      // End-of-day report (+ chart)
input ENUM_ROUTE        InpRouteReports          = ROUTE_FREE;      // Weekly / monthly / annual
input ENUM_ROUTE        InpRouteNews             = ROUTE_ALL;       // News preview / briefing / reminders / results
input ENUM_ROUTE        InpRouteHeartbeat        = ROUTE_ALL;       // Hourly LIVE pulse
input ENUM_ROUTE        InpRouteAds              = ROUTE_FREE;      // Upgrade ads
input ENUM_ROUTE        InpRouteWelcome          = ROUTE_ALL;       // "Live" at start
input bool              InpEnableHeartbeat       = true;     // Hourly LIVE pulse (old one deleted first)
input int               InpFreeAdvertsPerDay     = 3;        // Ads per day on the ads route (random times)

input group "==== 📰 Economic news ===="
input bool              InpEnableNewsWeekly      = true;     // Weekly preview (Sunday 18:00 broker)
input bool              InpEnableNewsDaily       = true;     // Daily briefing (00:05 broker)
input bool              InpEnableNewsReminder    = true;     // 2 h / 1 h / 30 min before HIGH-impact events
input bool              InpEnableNewsResults     = true;     // The released figure after each HIGH-impact event
input string            InpNewsCurrencies        = "USD,EUR,JPY,GBP,AUD,CHF,CAD,NZD";
input int               InpNewsMinImportance     = 2;        // 1 = LOW, 2 = MODERATE, 3 = HIGH

input group "==== 🚫 Blackout ===="
input bool              InpSkipJpyNewsDays       = true;     // Skip the day when major news hits (scope / window below)
input ENUM_NEWS_SCOPE   InpNewsSkipScope         = NEWS_BOTH;
input ENUM_NEWS_WINDOW  InpNewsSkipWindow        = NEWS_AFTER_RANGE;
input int               InpJpyMinImportance      = 3;        // 2 = MODERATE+, 3 = HIGH only
input bool              InpNotifySkipDays        = true;     // Tell premium why a day is skipped
input bool              InpSkipNFPDays           = false;    // Skip the first Friday of the month (works in backtests)
input string            InpSkipDates             = "";       // Manual skip dates "YYYY.MM.DD,YYYY.MM.DD"
input string            InpTradeMonths           = "1,2,3,4,5,6,7,8,9,10,11,12";   // Months traded

input group "==== 🏆 Trade selection ===="
input bool              InpOnlyAPlusTrades       = false;    // Take ONLY A+ setups

input group "==== 🧠 Intelligence (Focus Week) ===="
input ENUM_INTEL_MODE   InpIntelMode             = INTEL_ADVISORY;  // Off · Advisory · Filter
input int               InpIntelMinTrust         = 55;       // Filter: skip a side below this trust score
input int               InpIntelMinSamples       = 40;       // Filter: skip a side with fewer comparable trades
input bool              InpIntelFailOpen         = true;     // No answer from Focus Week → trade as usual (FALSE = skip)
input bool              InpIntelTelegram         = true;     // Add the intelligence block to premium signals

input group "==== 📡 Focus Week ===="
input string            FW_Connection            = "";       // Focus Week connection string (focusweek://ea?u=...&k=...&s=...)
input int               FW_BrokerGmtOffset       = 2;        // Broker server time = GMT + this many hours
input int               FW_SnapshotMinutes       = 15;       // Account snapshot every N minutes
input bool              FW_ResendAll             = false;    // TRUE once to resend the whole trade history

input group "==== 📡 35K investor report ===="
input string            K35_Connection           = "";       // 35K connection string (35k://ingest?u=...&k=...)
input string            K35_CompanyKey           = "jarvis-ai";
input int               K35_ReportHourNY         = 13;       // Weekly report: Friday HH (New York)
input int               K35_ReportMinuteNY       = 5;        // Weekly report: Friday MM (New York)
input bool              K35_ShowTestButton       = true;     // "35K: SEND TEST REPORT" button on the chart

input group "==== 📊 Dashboard ===="
input int               InpDashScalePct          = 100;      // Size in % (70 = 30% smaller)
input int               InpStartDay              = 1;        // Day count anchor (daily report "Day N") — day
input int               InpStartMonth            = 1;        // — month
input int               InpStartYear             = 2026;     // — year

//+==================================================================+
//|          FIXED STRATEGY SETTINGS — the rules of JARVIS           |
//|  Unchanged from v10. Edit here only if the strategy changes:     |
//|  the strategy hash below changes with them, so old datasets      |
//|  are never mixed with new rules.                                 |
//+==================================================================+
long     InpMagicNumber          = 12345;
string   InpEAName               = "JARVIS@AI v11";
int      InpStopLoss             = 120;        // SL as % of range size
int      InpTakeProfit           = 0;          // TP as % of range size (0 = none)
int      InpRangeStart           = 80;         // minutes from midnight (broker)
int      InpRangeDuration        = 270;        // minutes
int      InpRangeClose           = 1200;       // minutes from midnight (-1 = never)
bool     InpUseEMAFilter         = true;
ENUM_TIMEFRAMES InpEMATimeframe  = PERIOD_M15;
int      InpFastEMAPeriod        = 60;
int      InpSlowEMAPeriod        = 200;
ENUM_APPLIED_PRICE InpEMAPrice   = PRICE_HIGH;
bool     InpUseHTFConfirmation   = true;
ENUM_TIMEFRAMES InpHTFTimeframe  = PERIOD_M20;
int      InpHTFFastEMA           = 20;
int      InpHTFSlowEMA           = 21;
bool     InpUseRangeSizeFilter   = true;
double   InpMinRangePoints       = 100;
double   InpAPlusLotMultiplier   = 1.00, InpALotMultiplier = 0.70, InpBLotMultiplier = 0.50;
bool     InpUsePartialClose      = true;
double   InpPartialPercent       = 90;
int      InpPartialTargetPct     = 720;
int      InpTrailActivationPoints= 164;
int      InpATRPeriod            = 134;
double   InpATRMultiplier        = 9;
bool     InpOCO                  = true;
int      InpTelegramDelay        = 2000;       // ms between Telegram messages
int      InpReportHour           = 23;         // weekly / monthly / annual reports
int      SS_Hour                 = 23, SS_Minute = 30;   // daily report
int      InpHeartbeatIntervalHours = 1;
int      InpDashXOffset          = 14, InpDashYOffset = 28;
bool     InpSendScreenshots      = true;

//+==================================================================+
//|                             GLOBALS                              |
//+==================================================================+
CTrade  trade;
MqlTick lastTick;

struct RANGE_STRUCT {
   datetime start_time, end_time, close_time;
   double high, low;
   bool f_entry, f_high_breakout, f_low_breakout, f_partial_closed;
   RANGE_STRUCT() : start_time(0), end_time(0), close_time(0), high(0), low(DBL_MAX), f_entry(false), f_high_breakout(false), f_low_breakout(false), f_partial_closed(false) {}
};
RANGE_STRUCT range;

struct POSITION_STATE { ulong ticket; double lastSL; double lastTP; };
POSITION_STATE positionStates[];

struct SetupGrade { string grade; double sizeMultiplier; int alignedCount; int totalCount; string stars; };

// Indicator handles
int fastEMAHandle = INVALID_HANDLE, slowEMAHandle = INVALID_HANDLE, htfFastEMAHandle = INVALID_HANDLE, htfSlowEMAHandle = INVALID_HANDLE, atrTrailHandle = INVALID_HANDLE;
int hAtrD1 = INVALID_HANDLE, hAtrD1L = INVALID_HANDLE, hAtrM15 = INVALID_HANDLE, hRsi = INVALID_HANDLE, hAdx = INVALID_HANDLE, hMacd = INVALID_HANDLE, hBB = INVALID_HANDLE;

// Telegram
string chatIDsFree[], chatIDsPremium[], chatIDsPremiumPlus[], chatIDsPaid[], chatIDsAll[];
datetime lastTelegramTime = 0, lastHeartbeatTime = 0;
string   g_LiveMsgChatIDs[]; long g_LiveMsgIDs[];
bool     welcomeMessageSent = false, setupGradeSent = false;
bool     signalBuyFilledSent = false, signalSellFilledSent = false;
double   signalBuyEntry = 0, signalSellEntry = 0;
ulong    g_ClosedSignalTickets[], g_AnnouncedCloseDeals[];
datetime g_EAStartTime = 0; bool g_CloseDetectFirstRun = true;
datetime lastWeeklyReportDate = 0, lastMonthlyReportDate = 0, lastAnnualReportDate = 0;
datetime g_ScheduleBuiltForDay = 0; bool g_FirstScheduleBuild = true;
datetime g_TodayAds[]; bool g_TodayAdsSent[]; datetime g_TodayFreeReportTime = 0; bool g_FreeReportSent = false;
datetime g_LastWeeklyNewsDate = 0, g_LastDailyNewsDate = 0;
ulong    g_Remind2hIds[], g_Remind1hIds[], g_Remind30mIds[], g_ResultSentIds[];
datetime g_previousRangeStartTime = 0;
long     AccountNumber = 0;
int      g_SS_TradeCount = 0;

struct NewsItem { datetime time; string curr; string name; int importance; };

// Skip-day state
datetime g_JpySkipCachedDay = 0; bool g_JpySkipCachedValue = false; datetime g_SkipNotifiedDay = 0;
string   g_SkipReasonCurr = "", g_SkipReasonName = ""; datetime g_SkipReasonTime = 0;

//+==================================================================+
//|                        INTELLIGENCE STATE                        |
//+==================================================================+
// One record per side of today's range: everything known when the range closed (features), the decision, the trust
// card Focus Week answered with, and — at close time — what happened. The same record is written to the JSONL file
// (backtests: the only channel; live: a backup) and posted to Focus Week (live).
struct Setup {
   string   key;           // yyyy-mm-dd:buy|sell
   string   side;          // buy | sell
   bool     isBuy;
   double   entry, sl, risk;
   string   grade; double mult;
   string   decision;      // placed · skipped:<why> · filtered:<score>
   string   features;      // JSON object (named values)
   double   fv[FV_DIM];
   bool     analysed; double score; string advice; int n; string tg;   // from Focus Week (live)
   bool     placed;
};
Setup    g_setup[2];                 // [0] = buy, [1] = sell
bool     g_setupBuilt = false, g_outcomeDone = false;
datetime g_dayStart = 0, g_dayEnd = 0, g_dayClose = 0; double g_dayHigh = 0, g_dayLow = 0;   // today's range, kept past CalculateRange()
string   g_runId = "", g_mode = "backtest", g_strategyHash = "", g_intelFile = "";
bool     g_intelRunLineWritten = false;
string   g_bars = "";               // v3.28: the raw context of today's setup (last 60 M5 + 20 D1 bars), JSON
string   g_lastIntelLine = "";       // dashboard
string   g_tradeLine = "";           // dashboard: today's trade
datetime g_fwLastOk = 0;             // dashboard: last successful Focus Week post
// Focus Week link (FW_) — declared here because the intelligence posts through it
string   fw_url = "", fw_key = "", fw_secret = ""; datetime fw_lastSync = 0, fw_lastSnapshot = 0; string fw_events = ""; bool fw_fullDone = false;

//+==================================================================+
//|                            UTILITIES                             |
//+==================================================================+
string Num(double v, int digits = 5) { return DoubleToString(v, digits); }
string Str(const string v) { string s = v; StringReplace(s, "\\", "\\\\"); StringReplace(s, "\"", "\\\""); StringReplace(s, "\r", ""); StringReplace(s, "\n", "\\n"); return "\"" + s + "\""; }
string Bool(bool b) { return b ? "true" : "false"; }
datetime ToGmt(datetime server) { return server - FW_BrokerGmtOffset * 3600; }
string IsoGmt(datetime server) { string s = TimeToString(ToGmt(server), TIME_DATE | TIME_SECONDS); StringReplace(s, ".", "-"); StringReplace(s, " ", "T"); return s + "Z"; }
string DayKey(datetime server) { string s = TimeToString(ToGmt(server), TIME_DATE); StringReplace(s, ".", "-"); return s; }
datetime DayStart(datetime t) { return t - (t % 86400); }
string GetMonthName(int month) { string names[] = {"Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"}; return (month < 1 || month > 12) ? "???" : names[month - 1]; }
string ShortDayName(int dow) { string names[] = {"Sun","Mon","Tue","Wed","Thu","Fri","Sat"}; return names[MathMax(0, MathMin(6, dow))]; }
bool InTester() { return (bool)MQLInfoInteger(MQL_TESTER); }

// New York offset from GMT: -4 during US DST (2nd Sunday of March → 1st Sunday of November), else -5
int NyOffsetHours(datetime gmt) {
   MqlDateTime t; TimeToStruct(gmt, t);
   MqlDateTime m; m.year = t.year; m.mon = 3; m.day = 1; m.hour = 7; m.min = 0; m.sec = 0; datetime mar1 = StructToTime(m); TimeToStruct(mar1, m);
   int marSecondSunday = 1 + ((7 - m.day_of_week) % 7) + 7;
   MqlDateTime n; n.year = t.year; n.mon = 11; n.day = 1; n.hour = 6; n.min = 0; n.sec = 0; datetime nov1 = StructToTime(n); TimeToStruct(nov1, n);
   int novFirstSunday = 1 + ((7 - n.day_of_week) % 7);
   MqlDateTime s; s.year = t.year; s.mon = 3; s.day = marSecondSunday; s.hour = 7; s.min = 0; s.sec = 0;
   MqlDateTime e; e.year = t.year; e.mon = 11; e.day = novFirstSunday; e.hour = 6; e.min = 0; e.sec = 0;
   return (gmt >= StructToTime(s) && gmt < StructToTime(e)) ? -4 : -5;
}

// 32-bit FNV-1a of a string, as 8 hex characters
string HashStr(const string s) {
   uint h = (uint)0x811C9DC5;
   for(int i = 0; i < StringLen(s); i++) { h ^= (uint)StringGetCharacter(s, i); h *= 16777619; }
   return StringFormat("%08x", h);
}

// Minimal JSON reading (fixed schema from Focus Week). JsonObj: the object value of a TOP-LEVEL key ("sell": {...});
// the same key nested deeper (the buy card's dir.sell) is ignored. JsonNum / JsonStr: first occurrence inside a card.
string JsonObj(const string json, const string key) {
   int depth = 0, n = StringLen(json), klen = StringLen(key);
   for(int p = 0; p < n; p++) {
      ushort c = StringGetCharacter(json, p);
      if(c == '"') {
         if(depth == 1 && StringSubstr(json, p, klen) == key) {
            int start = StringFind(json, "{", p + klen); if(start < 0) return "";
            int d = 0;
            for(int q = start; q < n; q++) {
               ushort ch = StringGetCharacter(json, q);
               if(ch == '"') { q++; while(q < n && StringGetCharacter(json, q) != '"') { if(StringGetCharacter(json, q) == '\\') q++; q++; } continue; }
               if(ch == '{') d++; else if(ch == '}') { d--; if(d == 0) return StringSubstr(json, start, q - start + 1); }
            }
            return "";
         }
         p++; while(p < n && StringGetCharacter(json, p) != '"') { if(StringGetCharacter(json, p) == '\\') p++; p++; }
         continue;
      }
      if(c == '{') depth++; else if(c == '}') depth--;
   }
   return "";
}
double JsonNum(const string json, const string key, double dflt = -1) {
   int i = StringFind(json, key); if(i < 0) return dflt;
   int p = i + StringLen(key); while(p < StringLen(json) && StringGetCharacter(json, p) == ' ') p++;
   if(StringSubstr(json, p, 4) == "null") return dflt;
   return StringToDouble(StringSubstr(json, p, 24));
}
string JsonStr(const string json, const string key) {
   int i = StringFind(json, key); if(i < 0) return "";
   int p = i + StringLen(key); string out = "";
   while(p < StringLen(json)) {
      ushort c = StringGetCharacter(json, p);
      if(c == '"') break;
      if(c == '\\' && p + 1 < StringLen(json)) { ushort n = StringGetCharacter(json, p + 1); if(n == 'n') out += "\n"; else if(n == '"') out += "\""; else if(n == '\\') out += "\\"; else if(n == 'u') { out += "?"; p += 4; } p += 2; continue; }
      out += ShortToString(c); p++;
   }
   return out;
}

string FillTemplate(string tmpl, string symbol, string dir, string entry, string sl, string tp, string ticket, string risk, string oldsl, string newsl, string closePct, string keepPct, string grade = "", string slPoints = "", string lotTable = "") {
   StringReplace(tmpl, "{SYMBOL}", symbol); StringReplace(tmpl, "{DIR}", dir); StringReplace(tmpl, "{ENTRY}", entry); StringReplace(tmpl, "{SL}", sl); StringReplace(tmpl, "{TP}", tp);
   StringReplace(tmpl, "{TICKET}", ticket); StringReplace(tmpl, "{RISK}", risk); StringReplace(tmpl, "{OLDSL}", oldsl); StringReplace(tmpl, "{NEWSL}", newsl);
   StringReplace(tmpl, "{CLOSEPCT}", closePct); StringReplace(tmpl, "{KEEPPCT}", keepPct); StringReplace(tmpl, "{GRADE}", grade); StringReplace(tmpl, "{SLPOINTS}", slPoints); StringReplace(tmpl, "{LOTTABLE}", lotTable);
   return tmpl;
}

// Suggested lots by account size (Markdown code block) — premium signals
string BuildLotSizeTable(double slDistance) {
   if(!InpShowLotTable || InpHideUsdInTelegram) return "  _Size your lot from your own account and risk %._";
   if(slDistance <= 0) return "  _(No fixed SL — use your own risk management)_";
   string s = InpAccountSizes; StringReplace(s, " ", ""); string sizes[]; int n = StringSplit(s, StringGetCharacter(",", 0), sizes);
   if(n == 0) return "  _(No account sizes configured)_";
   double tickSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE), tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE), volStep = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   double minLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN), maxLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   if(tickSize <= 0 || tickValue <= 0 || volStep <= 0) return "  _(Symbol info unavailable)_";
   string table = "```\n";
   for(int i = 0; i < n; i++) {
      double acc = StringToDouble(sizes[i]); if(acc <= 0) continue;
      double moneyPerStep = (slDistance / tickSize) * tickValue * volStep; if(moneyPerStep <= 0) continue;
      double lots = MathFloor(acc * (InpSignalRiskPercent / 100.0) / moneyPerStep) * volStep; if(lots < minLot) lots = minLot; if(lots > maxLot) lots = maxLot;
      string accStr = (acc >= 1000) ? "$" + DoubleToString(acc / 1000.0, 0) + "K" : "$" + DoubleToString(acc, 0);
      while(StringLen(accStr) < 8) accStr += " ";
      table += "  " + accStr + " →  " + DoubleToString(lots, 2) + " lots\n";
   }
   return table + "```";
}

//+==================================================================+
//|                            TELEGRAM                              |
//+==================================================================+
void ParseChannelList(const string raw, string &out[]) {
   ArrayResize(out, 0); if(StringLen(raw) == 0) return;
   string s = raw; StringReplace(s, " ", ""); string parts[]; int n = StringSplit(s, StringGetCharacter(",", 0), parts);
   if(n > 0) { ArrayResize(out, n); for(int i = 0; i < n; i++) out[i] = parts[i]; }
}
void AddChatIDsUnique(string &dst[], string &src[]) {
   for(int i = 0; i < ArraySize(src); i++) { bool exists = false; for(int j = 0; j < ArraySize(dst); j++) if(dst[j] == src[i]) { exists = true; break; } if(!exists) { int sz = ArraySize(dst); ArrayResize(dst, sz + 1); dst[sz] = src[i]; } }
}
void ParseChatIDs() {
   ParseChannelList(InpFreeChannelID, chatIDsFree); ParseChannelList(InpPremiumChannelID, chatIDsPremium); ParseChannelList(InpPremiumPlusChannelID, chatIDsPremiumPlus);
   ArrayResize(chatIDsPaid, 0); AddChatIDsUnique(chatIDsPaid, chatIDsPremium); AddChatIDsUnique(chatIDsPaid, chatIDsPremiumPlus);
   ArrayResize(chatIDsAll, 0); AddChatIDsUnique(chatIDsAll, chatIDsFree); AddChatIDsUnique(chatIDsAll, chatIDsPaid);
   Print("📡 Channels — free: ", ArraySize(chatIDsFree), " · premium: ", ArraySize(chatIDsPremium), " · premium+: ", ArraySize(chatIDsPremiumPlus));
}
void GetRouteChatIDs(ENUM_ROUTE route, string &out[]) {
   ArrayResize(out, 0);
   switch(route) {
      case ROUTE_FREE:        AddChatIDsUnique(out, chatIDsFree); break;
      case ROUTE_PREMIUM:     AddChatIDsUnique(out, chatIDsPremium); break;
      case ROUTE_PREMIUMPLUS: AddChatIDsUnique(out, chatIDsPremiumPlus); break;
      case ROUTE_PAID:        AddChatIDsUnique(out, chatIDsPaid); break;
      case ROUTE_FREE_PREM:   AddChatIDsUnique(out, chatIDsFree); AddChatIDsUnique(out, chatIDsPremium); break;
      case ROUTE_ALL:         AddChatIDsUnique(out, chatIDsAll); break;
      default: break;
   }
}
bool RouteActive(ENUM_ROUTE route) { string ids[]; GetRouteChatIDs(route, ids); return ArraySize(ids) > 0; }
bool TelegramOn() { return StringLen(InpTelegramToken) > 10 && ArraySize(chatIDsAll) > 0 && !InTester(); }

bool StringToUtf8CharArray(string str, char &array[]) {
   uchar utf8[]; int len = StringToCharArray(str, utf8, 0, WHOLE_ARRAY, CP_UTF8); if(len <= 0) return false;
   ArrayResize(array, len - 1); for(int i = 0; i < len - 1; i++) array[i] = (char)utf8[i]; return true;
}
string TgEscape(string message) { StringReplace(message, "\\", "\\\\"); StringReplace(message, "\"", "\\\""); StringReplace(message, "\n", "\\n"); StringReplace(message, "\r", ""); return message; }
long SendTextOneGetId(string message, string chatID) {
   if(chatID == "") return 0;
   string url = "https://api.telegram.org/bot" + InpTelegramToken + "/sendMessage";
   string jsonData = "{\"chat_id\":\"" + chatID + "\",\"text\":\"" + TgEscape(message) + "\",\"parse_mode\":\"Markdown\"}";
   char post[]; char result[]; string resultHeaders; if(!StringToUtf8CharArray(jsonData, post)) return 0;
   int r = WebRequest("POST", url, "Content-Type: application/json; charset=utf-8", 10000, post, result, resultHeaders);
   if(r != 200) { Print("⚠️ Telegram ", r, ": ", StringSubstr(CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8), 0, 160)); return 0; }
   string resp = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8); int idx = StringFind(resp, "\"message_id\":"); if(idx < 0) return 1;
   string tail = StringSubstr(resp, idx + 13); long mid = 0;
   for(int i = 0; i < StringLen(tail); i++) { ushort c = StringGetCharacter(tail, i); if(c < '0' || c > '9') break; mid = mid * 10 + (long)(c - '0'); }
   return mid > 0 ? mid : 1;
}
bool SendTextOne(string message, string chatID) { return SendTextOneGetId(message, chatID) > 0; }
bool DeleteTelegramMessage(string chatID, long messageId) {
   if(chatID == "" || messageId <= 1) return false;
   string url = StringFormat("https://api.telegram.org/bot%s/deleteMessage?chat_id=%s&message_id=%I64d", InpTelegramToken, chatID, messageId);
   char result[]; string headers; int r = WebRequest("GET", url, "", "", 5000, result, 0, result, headers); return (r == 200);
}
int FindLiveMsgIdx(string chatID) { for(int i = 0; i < ArraySize(g_LiveMsgChatIDs); i++) if(g_LiveMsgChatIDs[i] == chatID) return i; return -1; }
void SetLiveMsgId(string chatID, long mid) { int idx = FindLiveMsgIdx(chatID); if(idx >= 0) { g_LiveMsgIDs[idx] = mid; return; } int n = ArraySize(g_LiveMsgChatIDs); ArrayResize(g_LiveMsgChatIDs, n + 1); ArrayResize(g_LiveMsgIDs, n + 1); g_LiveMsgChatIDs[n] = chatID; g_LiveMsgIDs[n] = mid; }
long GetLiveMsgId(string chatID) { int idx = FindLiveMsgIdx(chatID); return (idx >= 0) ? g_LiveMsgIDs[idx] : 0; }

// multipart photo post
void ArrayCopyHelper(uchar &dst[], string src) { uchar srcArr[]; StringToCharArray(src, srcArr, 0, StringLen(src)); ArrayCopy(dst, srcArr, ArraySize(dst), 0, ArraySize(srcArr)); }
bool SendPhotoOne(string caption, string fileName, string chatID) {
   if(chatID == "" || fileName == "" || !FileIsExist(fileName)) return false;
   int f = FileOpen(fileName, FILE_READ | FILE_BIN); if(f == INVALID_HANDLE) return false;
   uchar photo[]; int fSize = (int)FileSize(f); ArrayResize(photo, fSize); FileReadArray(f, photo, 0, fSize); FileClose(f);
   string boundary = StringFormat("%08x%08x", (uint)TimeCurrent(), (uint)MathRand());
   uchar data[]; uchar val[];
   ArrayCopyHelper(data, "\r\n--" + boundary + "\r\nContent-Disposition: form-data; name=\"chat_id\"\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n" + chatID);
   if(StringLen(caption) > 0) {
      ArrayCopyHelper(data, "\r\n--" + boundary + "\r\nContent-Disposition: form-data; name=\"caption\"\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n");
      StringToCharArray(caption, val, 0, WHOLE_ARRAY, CP_UTF8); int start = ArraySize(data), vSize = ArraySize(val) - 1; ArrayResize(data, start + vSize); for(int i = 0; i < vSize; i++) data[start + i] = val[i];
   }
   ArrayCopyHelper(data, "\r\n--" + boundary + "\r\nContent-Disposition: form-data; name=\"photo\"; filename=\"" + fileName + "\"\r\n\r\n");
   ArrayCopy(data, photo, ArraySize(data)); ArrayCopyHelper(data, "\r\n--" + boundary + "--\r\n");
   char post[]; ArrayResize(post, ArraySize(data)); for(int i = 0; i < ArraySize(data); i++) post[i] = (char)data[i];
   char result[]; string resultHeaders;
   int r = WebRequest("POST", "https://api.telegram.org/bot" + InpTelegramToken + "/sendPhoto", "Content-Type: multipart/form-data; boundary=" + boundary, 10000, post, result, resultHeaders);
   return (r == 200);
}
void RespectDelay() { datetime now = TimeCurrent(); if(lastTelegramTime > 0 && now - lastTelegramTime < InpTelegramDelay / 1000) Sleep(InpTelegramDelay - (int)((now - lastTelegramTime) * 1000)); lastTelegramTime = now; }
bool RoutedText(ENUM_ROUTE route, string message) {
   if(!TelegramOn()) return false; string ids[]; GetRouteChatIDs(route, ids); if(ArraySize(ids) == 0) return false;
   RespectDelay(); bool ok = false;
   for(int i = 0; i < ArraySize(ids); i++) { if(SendTextOne(message, ids[i])) ok = true; if(i < ArraySize(ids) - 1) Sleep(500); }
   return ok;
}
bool RoutedPhoto(ENUM_ROUTE route, string caption, string imagePath) {
   if(!TelegramOn()) return false; if(imagePath == "" || !InpSendScreenshots) return RoutedText(route, caption);
   string ids[]; GetRouteChatIDs(route, ids); if(ArraySize(ids) == 0) return false;
   RespectDelay(); bool ok = false;
   for(int i = 0; i < ArraySize(ids); i++) { if(SendPhotoOne(caption, imagePath, ids[i]) || SendTextOne(caption, ids[i])) ok = true; if(i < ArraySize(ids) - 1) Sleep(500); }
   return ok;
}
string CaptureChartScreenshot(string prefix) {
   if(!InpSendScreenshots || InTester()) return "";
   MqlDateTime tm; TimeToStruct(TimeCurrent(), tm);
   string filename = StringFormat("%s_%s_%04d%02d%02d_%02d%02d.png", _Symbol, prefix, tm.year, tm.mon, tm.day, tm.hour, tm.min);
   ChartRedraw(0); return ChartScreenShot(0, filename, 1600, 900, ALIGN_RIGHT) ? filename : "";
}

//+==================================================================+
//|                     MESSAGE TEMPLATES (fixed)                    |
//+==================================================================+
string msgPotentialTrade = "🆕 *Potential trade incoming*\n\nThe range has closed and a setup is forming. The full signal with entry & SL is on its way.";
string sigEntry          = "🎯 *NEW SIGNAL — {GRADE} setup*\n\nPair: {SYMBOL}\nAction: Place {DIR} STOP order\nEntry: {ENTRY}\nStop Loss: {SL}\nTake Profit: {TP}\n\n📏 SL distance: {SLPOINTS} points\n⚖️ Risk: {RISK}% per trade\n\n📊 *Suggested lots by account size:*\n{LOTTABLE}\n\n📌 Place the pending stop order now. I'll notify you the moment it fills.";
string sigFilled         = "✅ *WE'RE IN!*\n\n{SYMBOL} {DIR} STOP just triggered at {ENTRY}\nYour pending order should now be a live position — manage to plan.";
string sigMoveSL         = "🔧 *MANAGE SL*\n\n{SYMBOL} ticket #{TICKET}\nMove SL from {OLDSL} to {NEWSL}";
string sigPartialClose   = "💰 *PARTIAL CLOSE*\n\n{SYMBOL} ticket #{TICKET}\nClose {CLOSEPCT}% of position\nLet {KEEPPCT}% continue running";
string sigFullClose      = "🏁 *CLOSE TRADE*\n\n{SYMBOL} ticket #{TICKET}\nClose 100% of position at market";
string sigCancel         = "🧹 *OCO CLEANUP — opposite side voided*\n\nWe already filled on the other side, so this pending is no longer needed.\n\n👉 Please cancel: *{SYMBOL} {DIR} @ {ENTRY}*\n\n✅ The live trade is fine — keep managing it to plan.";
string adVariants[] = {
   "📢 *Catch tomorrow's trade LIVE?*\n\nPremium members get the setup, entry, SL/TP and fill alerts in real time.\n\n👉 Join here: ",
   "📢 *Trading without signals?*\n\nPremium gives you the exact entry, stop-loss and lot-size table — the moment the setup forms.\n\n👉 Upgrade: ",
   "📢 *Same EA. Two views.*\n\nFree channel = end-of-day report.\nPremium = live entry alerts, fills, SL moves, partials & closes.\n\n👉 Switch sides: " };

//+==================================================================+
//|                     NEWS (MT5 calendar) + BLACKOUT               |
//+==================================================================+
string CurrencyToFlag(string curr) {
   if(curr == "USD") return "🇺🇸"; if(curr == "EUR") return "🇪🇺"; if(curr == "JPY") return "🇯🇵"; if(curr == "GBP") return "🇬🇧"; if(curr == "AUD") return "🇦🇺";
   if(curr == "CHF") return "🇨🇭"; if(curr == "CAD") return "🇨🇦"; if(curr == "NZD") return "🇳🇿"; if(curr == "CNY") return "🇨🇳"; return "🌐";
}
string ImportanceEmoji(int imp) { return imp >= 3 ? "🔴" : (imp == 2 ? "🟠" : (imp == 1 ? "🟡" : "⚪")); }
string DualTime(datetime brokerEventTime) {
   datetime gmtEventTime = ToGmt(brokerEventTime); datetime gmt4 = gmtEventTime - 4 * 3600;
   return StringFormat("%s broker / %s", TimeToString(brokerEventTime, TIME_MINUTES), TimeToString(gmt4, TIME_MINUTES));
}
string FmtCalVal(long val, bool hasVal, MqlCalendarEvent &ev) {
   if(!hasVal) return "—"; double d = (double)val / 1000000.0; string suffix = (ev.unit == CALENDAR_UNIT_PERCENT) ? "%" : "";
   return ((MathAbs(d) >= 1000) ? DoubleToString(d, 0) : DoubleToString(d, (MathAbs(d) < 10 ? 2 : 1))) + suffix;
}
bool IdInArray(ulong id, ulong &arr[]) { for(int i = 0; i < ArraySize(arr); i++) if(arr[i] == id) return true; return false; }
void AddIdToArray(ulong id, ulong &arr[]) { int sz = ArraySize(arr); ArrayResize(arr, sz + 1); arr[sz] = id; }

bool ScanCurrencyForHighImpact(string curr, datetime dayStart, datetime dayEnd, datetime rangeStartT, datetime rangeEndT, string &hitName, datetime &hitTime, bool &anyData) {
   MqlCalendarValue values[]; int n = CalendarValueHistory(values, dayStart, dayEnd - 1, NULL, curr); if(n > 0) anyData = true; if(n <= 0) return false;
   for(int i = 0; i < n; i++) {
      datetime et = values[i].time; if(et < dayStart || et >= dayEnd) continue;
      MqlCalendarEvent ev; if(!CalendarEventById(values[i].event_id, ev)) continue; if((int)ev.importance < InpJpyMinImportance) continue;
      bool duringRange = (et >= rangeStartT && et < rangeEndT), afterRange = (et >= rangeEndT), windowMatch = false;
      if(InpNewsSkipWindow == NEWS_DURING_RANGE) windowMatch = duringRange; else if(InpNewsSkipWindow == NEWS_AFTER_RANGE) windowMatch = afterRange; else windowMatch = (duringRange || afterRange);
      if(!windowMatch) continue;
      hitName = ev.name; hitTime = et; return true;
   }
   return false;
}
bool IsJpyHighImpactDay() {
   if(!InpSkipJpyNewsDays) return false;
   datetime dayStart = DayStart(TimeCurrent()), dayEnd = dayStart + 86400;
   datetime rangeStartT = dayStart + InpRangeStart * 60, rangeEndT = rangeStartT + InpRangeDuration * 60;
   if(g_JpySkipCachedDay == dayStart) return g_JpySkipCachedValue;
   string hitName = ""; datetime hitTime = 0; bool anyData = false;
   bool wantJPY = (InpNewsSkipScope == NEWS_JPY_ONLY || InpNewsSkipScope == NEWS_BOTH), wantUSD = (InpNewsSkipScope == NEWS_USD_ONLY || InpNewsSkipScope == NEWS_BOTH);
   if(wantJPY && StringFind(_Symbol, "JPY") >= 0 && ScanCurrencyForHighImpact("JPY", dayStart, dayEnd, rangeStartT, rangeEndT, hitName, hitTime, anyData)) { g_JpySkipCachedDay = dayStart; g_JpySkipCachedValue = true; g_SkipReasonCurr = "JPY"; g_SkipReasonName = hitName; g_SkipReasonTime = hitTime; return true; }
   if(wantUSD && StringFind(_Symbol, "USD") >= 0 && ScanCurrencyForHighImpact("USD", dayStart, dayEnd, rangeStartT, rangeEndT, hitName, hitTime, anyData)) { g_JpySkipCachedDay = dayStart; g_JpySkipCachedValue = true; g_SkipReasonCurr = "USD"; g_SkipReasonName = hitName; g_SkipReasonTime = hitTime; return true; }
   if(InTester()) return false;                       // no calendar in most backtests: keep trying, never cache
   if(anyData) { g_JpySkipCachedDay = dayStart; g_JpySkipCachedValue = false; }
   return false;
}
void NotifySkipDay() {
   if(!TelegramOn() || !InpNotifySkipDays || !IsJpyHighImpactDay()) return;
   datetime dayStart = DayStart(TimeCurrent()); if(g_SkipNotifiedDay == dayStart) return; g_SkipNotifiedDay = dayStart;
   MqlDateTime dt; TimeToStruct(TimeCurrent(), dt);
   string msg = "🚫  *NO TRADES TODAY*\n━━━━━━━━━━━━━━━━━━━━\n" + StringFormat("🗓️ %s, %s %d\n\n", ShortDayName(dt.day_of_week), GetMonthName(dt.mon), dt.day)
              + "We're sitting out today to protect the account.\n\n📰 Reason — high-impact " + g_SkipReasonCurr + " news:\n" + (g_SkipReasonCurr == "JPY" ? "🇯🇵" : "🇺🇸") + "  *" + g_SkipReasonName + "*\n🕐 " + DualTime(g_SkipReasonTime)
              + "\n━━━━━━━━━━━━━━━━━━━━\n_News like this can spike " + _Symbol + " hard and stop us out._\n\n#NoTrades #" + g_SkipReasonCurr;
   RoutedText(ROUTE_PREMIUM, msg);
}
bool IsMonthEnabled(int mon) {
   string parts[]; int n = StringSplit(InpTradeMonths, ',', parts); if(n <= 0) return true;
   for(int i = 0; i < n; i++) { string p = parts[i]; StringTrimLeft(p); StringTrimRight(p); if((int)StringToInteger(p) == mon) return true; }
   return false;
}
bool IsNFPDay() { if(!InpSkipNFPDays) return false; MqlDateTime dt; TimeToStruct(TimeCurrent(), dt); return (dt.day_of_week == 5 && dt.day <= 7); }
bool IsSkipDate() {
   if(StringLen(InpSkipDates) == 0) return false; MqlDateTime dt; TimeToStruct(TimeCurrent(), dt); string today = StringFormat("%04d.%02d.%02d", dt.year, dt.mon, dt.day);
   string dates[]; int n = StringSplit(InpSkipDates, ',', dates); for(int i = 0; i < n; i++) { string d = dates[i]; StringTrimLeft(d); StringTrimRight(d); if(d == today) return true; }
   return false;
}
// Why today is not traded ("" = tradable). Also the decision reason of the intelligence record.
string BlackoutReason() {
   MqlDateTime dt; TimeToStruct(TimeCurrent(), dt);
   if(!IsMonthEnabled(dt.mon)) return "month";
   if(IsJpyHighImpactDay()) return "news:" + g_SkipReasonCurr;
   if(IsNFPDay()) return "nfp";
   if(IsSkipDate()) return "date";
   return "";
}
bool TradingAllowedToday() { return BlackoutReason() == ""; }

void GatherNews(datetime fromTime, datetime toTime, NewsItem &out[]) {
   ArrayResize(out, 0); string currencies[]; int cn = StringSplit(InpNewsCurrencies, ',', currencies);
   for(int c = 0; c < cn; c++) {
      string curr = currencies[c]; StringTrimLeft(curr); StringTrimRight(curr); if(StringLen(curr) == 0) continue;
      MqlCalendarValue values[]; int n = CalendarValueHistory(values, fromTime, toTime, NULL, curr);
      for(int i = 0; i < n; i++) { MqlCalendarEvent ev; if(!CalendarEventById(values[i].event_id, ev)) continue; if((int)ev.importance < InpNewsMinImportance) continue;
         int sz = ArraySize(out); ArrayResize(out, sz + 1); out[sz].time = values[i].time; out[sz].curr = curr; out[sz].name = ev.name; out[sz].importance = (int)ev.importance; }
   }
   int n = ArraySize(out);
   for(int i = 0; i < n - 1; i++) for(int j = 0; j < n - 1 - i; j++) if(out[j].time > out[j + 1].time) { NewsItem tmp = out[j]; out[j] = out[j + 1]; out[j + 1] = tmp; }
}
string FormatNewsList(NewsItem &items[], bool groupByDay) {
   string msg = "", lastDay = ""; int n = ArraySize(items);
   for(int i = 0; i < n; i++) {
      MqlDateTime dt; TimeToStruct(items[i].time, dt);
      if(groupByDay) { string thisDay = StringFormat("%s, %s %d", ShortDayName(dt.day_of_week), GetMonthName(dt.mon), dt.day); if(thisDay != lastDay) { msg += "\n📅 *" + thisDay + "*\n"; lastDay = thisDay; } }
      msg += StringFormat("%s  %s %s  •  %s\n      └ %s\n", ImportanceEmoji(items[i].importance), CurrencyToFlag(items[i].curr), items[i].curr, DualTime(items[i].time), items[i].name);
   }
   return msg;
}
void TriggerWeeklyNewsPreview() {
   if(!InpEnableNewsWeekly || !TelegramOn() || !RouteActive(InpRouteNews)) return;
   datetime now = TimeCurrent(); MqlDateTime dt; TimeToStruct(now, dt); if(dt.day_of_week != 0 || dt.hour != 18) return;
   datetime today = DayStart(now); if(g_LastWeeklyNewsDate == today) return; g_LastWeeklyNewsDate = today;
   NewsItem items[]; GatherNews(now, now + 7 * 86400, items);
   RoutedText(InpRouteNews, "📰  *WEEKLY NEWS PREVIEW*\n━━━━━━━━━━━━━━━━━━━━\n🗓️ Major events for the week ahead\n" + (ArraySize(items) == 0 ? "\n_Quiet week — no major events scheduled._\n" : FormatNewsList(items, true))
              + "━━━━━━━━━━━━━━━━━━━━\n🔴 High   🟠 Medium   🟡 Low\n🕐 Times: broker / GMT-4\n_Expect volatility & wider spreads on 🔴 events._\n\n#WeeklyNews");
}
void TriggerDailyNewsBriefing() {
   if(!InpEnableNewsDaily || !TelegramOn() || !RouteActive(InpRouteNews)) return;
   datetime now = TimeCurrent(); MqlDateTime dt; TimeToStruct(now, dt); datetime today = DayStart(now);
   if(g_LastDailyNewsDate == today || dt.hour * 60 + dt.min < 5) return; g_LastDailyNewsDate = today;
   NewsItem items[]; GatherNews(today, today + 23 * 3600, items);
   RoutedText(InpRouteNews, "📰  *DAILY NEWS BRIEFING*\n━━━━━━━━━━━━━━━━━━━━\n" + StringFormat("🗓️ %s, %s %d\n", ShortDayName(dt.day_of_week), GetMonthName(dt.mon), dt.day)
              + (ArraySize(items) == 0 ? "\n_Calm day ahead — no major scheduled events._\n" : FormatNewsList(items, false)) + "━━━━━━━━━━━━━━━━━━━━\n🔴 High   🟠 Medium   🟡 Low\n🕐 Times: broker / GMT-4\n_Trade carefully around 🔴 events._\n\n#DailyBriefing");
}
void FireReminderSlot(int targetMins, int windowMins, ulong &trackArr[], string label) {
   datetime now = TimeCurrent(), to = now + (targetMins + windowMins + 5) * 60; string currencies[]; int cn = StringSplit(InpNewsCurrencies, ',', currencies);
   for(int c = 0; c < cn; c++) {
      string curr = currencies[c]; StringTrimLeft(curr); StringTrimRight(curr); if(StringLen(curr) == 0) continue;
      MqlCalendarValue values[]; int n = CalendarValueHistory(values, now, to, NULL, curr);
      for(int i = 0; i < n; i++) {
         MqlCalendarEvent ev; if(!CalendarEventById(values[i].event_id, ev)) continue; if((int)ev.importance < 3) continue;
         int minsToEvent = (int)((values[i].time - now) / 60); if(minsToEvent > targetMins || minsToEvent < targetMins - windowMins) continue;
         if(IdInArray(values[i].id, trackArr)) continue; AddIdToArray(values[i].id, trackArr);
         RoutedText(InpRouteNews, StringFormat("⚠️  *NEWS INCOMING — %s*\n━━━━━━━━━━━━━━━━━━━━\n%s  *%s — %s*\n🔴 High impact\n\n🕐 %s\n📈 Forecast:  %s\n📉 Previous:  %s\n━━━━━━━━━━━━━━━━━━━━\n_Tighten risk, sit out, or be ready for volatility._\n\n#NewsAlert #%s",
                    label, CurrencyToFlag(curr), curr, ev.name, DualTime(values[i].time), FmtCalVal(values[i].forecast_value, values[i].forecast_value != LONG_MIN, ev), FmtCalVal(values[i].prev_value, values[i].prev_value != LONG_MIN, ev), curr));
      }
   }
}
void CheckNewsReminders() {
   if(!InpEnableNewsReminder || !TelegramOn() || !RouteActive(InpRouteNews)) return;
   FireReminderSlot(120, 10, g_Remind2hIds, "2 hours away"); FireReminderSlot(60, 10, g_Remind1hIds, "1 hour away"); FireReminderSlot(30, 10, g_Remind30mIds, "30 minutes away");
}
void CheckNewsResults() {
   if(!InpEnableNewsResults || !TelegramOn() || !RouteActive(InpRouteNews)) return;
   datetime now = TimeCurrent(), from = now - 90 * 60; string currencies[]; int cn = StringSplit(InpNewsCurrencies, ',', currencies);
   for(int c = 0; c < cn; c++) {
      string curr = currencies[c]; StringTrimLeft(curr); StringTrimRight(curr); if(StringLen(curr) == 0) continue;
      MqlCalendarValue values[]; int n = CalendarValueHistory(values, from, now, NULL, curr);
      for(int i = 0; i < n; i++) {
         MqlCalendarEvent ev; if(!CalendarEventById(values[i].event_id, ev)) continue; if((int)ev.importance < 3 || values[i].time > now || values[i].actual_value == LONG_MIN) continue;
         if(IdInArray(values[i].id, g_ResultSentIds)) continue; AddIdToArray(values[i].id, g_ResultSentIds);
         string verdict = "Result is in.";
         if(values[i].forecast_value != LONG_MIN) verdict = values[i].actual_value > values[i].forecast_value ? "🟢 Beat forecast" : (values[i].actual_value < values[i].forecast_value ? "🔴 Missed forecast" : "⚪ Matched forecast");
         RoutedText(InpRouteNews, StringFormat("📢  *NEWS RELEASED*\n━━━━━━━━━━━━━━━━━━━━\n%s  *%s — %s*\n🕐 %s\n\n✅ Actual:    *%s*\n📈 Forecast:  %s\n📉 Previous:  %s\n━━━━━━━━━━━━━━━━━━━━\n%s\n\n#NewsResult #%s",
                    CurrencyToFlag(curr), curr, ev.name, DualTime(values[i].time), FmtCalVal(values[i].actual_value, true, ev), FmtCalVal(values[i].forecast_value, values[i].forecast_value != LONG_MIN, ev), FmtCalVal(values[i].prev_value, values[i].prev_value != LONG_MIN, ev), verdict, curr));
      }
   }
}

//+==================================================================+
//|                        STRATEGY CORE (v10)                       |
//+==================================================================+
int CountOpenPositions() {
   int c = 0; for(int i = PositionsTotal() - 1; i >= 0; i--) { ulong t = PositionGetTicket(i); if(t <= 0 || !PositionSelectByTicket(t)) continue; long m; if(!PositionGetInteger(POSITION_MAGIC, m)) continue; if(m == InpMagicNumber) c++; }
   return c;
}
int CountPendingOrders() {
   int c = 0; for(int i = OrdersTotal() - 1; i >= 0; i--) { ulong t = OrderGetTicket(i); if(t <= 0) continue; long m; if(!OrderGetInteger(ORDER_MAGIC, m)) continue; if(m != InpMagicNumber) continue; long ot; if(!OrderGetInteger(ORDER_TYPE, ot)) continue; if(ot == ORDER_TYPE_BUY_STOP || ot == ORDER_TYPE_SELL_STOP) c++; }
   return c;
}

void DrawObjects() {
   string s = (string)range.start_time;
   ObjectCreate(0, "range start " + s, OBJ_VLINE, 0, range.start_time, 0); ObjectSetInteger(0, "range start " + s, OBJPROP_COLOR, clrLimeGreen); ObjectSetInteger(0, "range start " + s, OBJPROP_WIDTH, 2);
   ObjectCreate(0, "range end " + s, OBJ_VLINE, 0, range.end_time, 0); ObjectSetInteger(0, "range end " + s, OBJPROP_COLOR, clrGold); ObjectSetInteger(0, "range end " + s, OBJPROP_WIDTH, 2);
   ObjectCreate(0, "close time " + s, OBJ_VLINE, 0, range.close_time, 0); ObjectSetInteger(0, "close time " + s, OBJPROP_COLOR, clrCrimson); ObjectSetInteger(0, "close time " + s, OBJPROP_WIDTH, 3); ObjectSetInteger(0, "close time " + s, OBJPROP_STYLE, STYLE_DASHDOTDOT);
   ObjectCreate(0, "range high " + s, OBJ_TREND, 0, range.start_time, range.high, range.end_time, range.high); ObjectSetInteger(0, "range high " + s, OBJPROP_COLOR, clrRoyalBlue); ObjectSetInteger(0, "range high " + s, OBJPROP_WIDTH, 3); ObjectSetInteger(0, "range high " + s, OBJPROP_RAY_RIGHT, false);
   ObjectCreate(0, "range high " + s + " ", OBJ_TREND, 0, range.end_time, range.high, InpRangeClose >= 0 ? range.close_time : INT_MAX, range.high); ObjectSetInteger(0, "range high " + s + " ", OBJPROP_COLOR, clrSteelBlue); ObjectSetInteger(0, "range high " + s + " ", OBJPROP_WIDTH, 2); ObjectSetInteger(0, "range high " + s + " ", OBJPROP_STYLE, STYLE_DASHDOT); ObjectSetInteger(0, "range high " + s + " ", OBJPROP_RAY_RIGHT, false);
   ObjectCreate(0, "range low " + s, OBJ_TREND, 0, range.start_time, range.low, range.end_time, range.low); ObjectSetInteger(0, "range low " + s, OBJPROP_COLOR, clrRoyalBlue); ObjectSetInteger(0, "range low " + s, OBJPROP_WIDTH, 3); ObjectSetInteger(0, "range low " + s, OBJPROP_RAY_RIGHT, false);
   ObjectCreate(0, "range low " + s + " ", OBJ_TREND, 0, range.end_time, range.low, InpRangeClose >= 0 ? range.close_time : INT_MAX, range.low); ObjectSetInteger(0, "range low " + s + " ", OBJPROP_COLOR, clrSteelBlue); ObjectSetInteger(0, "range low " + s + " ", OBJPROP_WIDTH, 2); ObjectSetInteger(0, "range low " + s + " ", OBJPROP_STYLE, STYLE_DASHDOT); ObjectSetInteger(0, "range low " + s + " ", OBJPROP_RAY_RIGHT, false);
}
void UpdateObjects() {
   string s = (string)range.start_time;
   ObjectSetDouble(0, "range high " + s, OBJPROP_PRICE, 0, range.high); ObjectSetDouble(0, "range high " + s, OBJPROP_PRICE, 1, range.high); ObjectSetDouble(0, "range high " + s + " ", OBJPROP_PRICE, 0, range.high); ObjectSetDouble(0, "range high " + s + " ", OBJPROP_PRICE, 1, range.high);
   ObjectSetDouble(0, "range low " + s, OBJPROP_PRICE, 0, range.low); ObjectSetDouble(0, "range low " + s, OBJPROP_PRICE, 1, range.low); ObjectSetDouble(0, "range low " + s + " ", OBJPROP_PRICE, 0, range.low); ObjectSetDouble(0, "range low " + s + " ", OBJPROP_PRICE, 1, range.low);
}
void DeletePreviousRangeLines(datetime prevStartTime) {
   if(prevStartTime == 0) return; string s = (string)prevStartTime;
   ObjectDelete(0, "range start " + s); ObjectDelete(0, "range end " + s); ObjectDelete(0, "close time " + s); ObjectDelete(0, "range high " + s); ObjectDelete(0, "range high " + s + " "); ObjectDelete(0, "range low " + s); ObjectDelete(0, "range low " + s + " ");
   ChartRedraw(0);
}

void CalculateRange() {
   datetime oldStart = range.start_time;
   range.start_time = 0; range.end_time = 0; range.close_time = 0; range.high = 0.0; range.low = DBL_MAX;
   range.f_entry = false; range.f_high_breakout = false; range.f_low_breakout = false; range.f_partial_closed = false;
   setupGradeSent = false; signalBuyFilledSent = false; signalSellFilledSent = false; signalBuyEntry = 0; signalSellEntry = 0;
   g_setupBuilt = false; g_outcomeDone = false;
   int cycle = 86400;
   datetime candStart = DayStart(lastTick.time) + InpRangeStart * 60, candEnd = candStart + InpRangeDuration * 60;
   datetime candClose = (InpRangeClose >= 0) ? (DayStart(candEnd) + InpRangeClose * 60) : candEnd;
   if(InpRangeClose >= 0 && candClose <= candEnd) candClose += cycle;
   range.start_time = candStart; if(lastTick.time >= candClose) range.start_time = candStart + cycle;
   for(int i = 0; i < 10; i++) { MqlDateTime tmp; TimeToStruct(range.start_time, tmp); if(tmp.day_of_week != 6 && tmp.day_of_week != 0) break; range.start_time += cycle; }
   range.end_time = range.start_time + InpRangeDuration * 60;
   for(int i = 0; i < 2; i++) { MqlDateTime tmp; TimeToStruct(range.end_time, tmp); if(tmp.day_of_week == 6 || tmp.day_of_week == 0) range.end_time += cycle; }
   if(InpRangeClose >= 0) { range.close_time = DayStart(range.end_time) + InpRangeClose * 60; for(int i = 0; i < 3; i++) { MqlDateTime tmp; TimeToStruct(range.close_time, tmp); if(range.close_time <= range.end_time || tmp.day_of_week == 6 || tmp.day_of_week == 0) range.close_time += cycle; } }
   // Backfill when attached mid-range (or after the range, before close): rebuild high / low from the M1 bars already printed
   if(lastTick.time >= range.start_time) {
      datetime hiloEnd = (lastTick.time < range.end_time) ? lastTick.time : range.end_time;
      MqlRates rates[]; int copied = CopyRates(_Symbol, PERIOD_M1, range.start_time, hiloEnd, rates);
      if(copied > 0) { for(int i = 0; i < copied; i++) { if(rates[i].time < range.start_time || rates[i].time > hiloEnd) continue; if(rates[i].high > range.high) range.high = rates[i].high; if(rates[i].low < range.low) range.low = rates[i].low; } range.f_entry = true; }
      if(lastTick.time > range.end_time && range.high > 0 && range.low < DBL_MAX) {
         MqlRates post[]; int p = CopyRates(_Symbol, PERIOD_M1, range.end_time, lastTick.time, post);
         for(int i = 0; i < p; i++) { if(!range.f_high_breakout && post[i].high > range.high) range.f_high_breakout = true; if(!range.f_low_breakout && post[i].low < range.low) range.f_low_breakout = true; }
      }
   }
   DrawObjects();
   g_previousRangeStartTime = (oldStart > 0 && oldStart != range.start_time) ? oldStart : 0;
}
void HandlePendingLineDeletion() { if(g_previousRangeStartTime == 0 || range.start_time == 0 || lastTick.time < range.start_time) return; DeletePreviousRangeLines(g_previousRangeStartTime); g_previousRangeStartTime = 0; }

double IndVal(int h, int buf, int shift) { double a[]; if(h == INVALID_HANDLE) return 0; if(CopyBuffer(h, buf, shift, 1, a) < 1) return 0; return a[0]; }

SetupGrade EvaluateSetup(bool isBuy) {
   SetupGrade g; g.alignedCount = 0; g.totalCount = 0; g.grade = "F"; g.sizeMultiplier = 0; g.stars = "";
   if(InpUseEMAFilter) { g.totalCount++; double f = IndVal(fastEMAHandle, 0, 0), s = IndVal(slowEMAHandle, 0, 0); if(f != 0 && s != 0 && (isBuy ? f > s : f < s)) g.alignedCount++; }
   if(InpUseHTFConfirmation) { g.totalCount++; double f = IndVal(htfFastEMAHandle, 0, 0), s = IndVal(htfSlowEMAHandle, 0, 0); if(f != 0 && s != 0 && (isBuy ? f > s : f < s)) g.alignedCount++; }
   if(InpUseRangeSizeFilter) { g.totalCount++; if((range.high - range.low) / _Point >= InpMinRangePoints) g.alignedCount++; }
   if(g.totalCount == 0) { g.grade = "A+"; g.sizeMultiplier = 1.0; g.stars = "⭐⭐⭐"; }
   else if(g.alignedCount == 0) { g.grade = "F"; g.sizeMultiplier = 0; }
   else { int notAligned = g.totalCount - g.alignedCount;
      if(notAligned == 0) { g.grade = "A+"; g.sizeMultiplier = InpAPlusLotMultiplier; g.stars = "⭐⭐⭐"; } else if(notAligned == 1) { g.grade = "A"; g.sizeMultiplier = InpALotMultiplier; g.stars = "⭐⭐"; }
      else if(notAligned == 2) { g.grade = "B"; g.sizeMultiplier = InpBLotMultiplier; g.stars = "⭐"; } else { g.grade = "F"; g.sizeMultiplier = 0; } }
   return g;
}
bool CalculateLots(double slDistance, double &lots) {
   lots = 0.0;
   double tickSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE), tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE), volStep = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   if(tickSize <= 0 || tickValue <= 0 || volStep <= 0 || slDistance <= 0) return false;
   double riskMoney = AccountInfoDouble(ACCOUNT_EQUITY) * InpLots * 0.01, moneyVolStep = (slDistance / tickSize) * tickValue * volStep; if(moneyVolStep <= 0) return false;
   lots = MathFloor(riskMoney / moneyVolStep) * volStep;
   double minLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN), maxLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   if(lots < minLot) lots = minLot; if(lots > maxLot) return false;
   lots = MathFloor(lots / volStep) * volStep; return true;
}

void SendSetupGradeAlert(SetupGrade &g, string direction) {
   if(!TelegramOn() || g.grade == "F" || !RouteActive(InpRouteSignals)) return;
   string full = msgPotentialTrade + "\n\n━━━━━━━━━━━━━━━\n💱 Pair: " + _Symbol + "\n📈 Direction: " + direction + "\n⭐ Grade: " + g.grade + " " + g.stars + "\n⚖️ Risk: " + DoubleToString(InpSignalRiskPercent * g.sizeMultiplier, 2) + "%\n━━━━━━━━━━━━━━━\n\n#PotentialTrade #" + _Symbol;
   RoutedPhoto(InpRouteSignals, full, CaptureChartScreenshot("POTENTIAL_" + direction));
}

// The range closed: snapshot both sides (intelligence), ask Focus Week (live), then place what the rules allow.
void CreatePendingOrders() {
   if(lastTick.time < range.end_time || range.end_time == 0 || !range.f_entry) return;
   if(range.f_high_breakout && range.f_low_breakout) return;      // this range is done
   if(!g_setupBuilt) IntelBuildSetups();                            // once per range, before any decision
   string blackout = BlackoutReason();
   double curBid = (lastTick.bid > 0) ? lastTick.bid : SymbolInfoDouble(_Symbol, SYMBOL_BID), curAsk = (lastTick.ask > 0) ? lastTick.ask : SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   if(curBid <= 0 || curAsk <= 0) return;
   double minDist = (double)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL) * _Point;
   SetupGrade buyG = EvaluateSetup(true), sellG = EvaluateSetup(false);
   string whyBuy = "", whySell = "";
   if(blackout != "") { whyBuy = "skipped:" + blackout; whySell = whyBuy; }
   if(InpOnlyAPlusTrades) { if(buyG.grade != "A+") { buyG.sizeMultiplier = 0; if(whyBuy == "") whyBuy = "skipped:notAplus"; } if(sellG.grade != "A+") { sellG.sizeMultiplier = 0; if(whySell == "") whySell = "skipped:notAplus"; } }
   if(buyG.sizeMultiplier <= 0 && whyBuy == "") whyBuy = "skipped:gradeF"; if(sellG.sizeMultiplier <= 0 && whySell == "") whySell = "skipped:gradeF";
   bool buyValid = (!range.f_high_breakout) && (curAsk < range.high - minDist) && (buyG.sizeMultiplier > 0) && whyBuy == "";
   bool sellValid = (!range.f_low_breakout) && (curBid > range.low + minDist) && (sellG.sizeMultiplier > 0) && whySell == "";
   if(whyBuy == "" && !buyValid) whyBuy = "skipped:stale"; if(whySell == "" && !sellValid) whySell = "skipped:stale";
   // Intelligence filter (live, Filter mode): a side below the trust threshold is not placed
   string fBuy = "", fSell = "";
   if(buyValid && !IntelAllows(0, fBuy)) { buyValid = false; whyBuy = fBuy; }
   if(sellValid && !IntelAllows(1, fSell)) { sellValid = false; whySell = fSell; }
   g_setup[0].decision = buyValid ? "placed" : whyBuy; g_setup[1].decision = sellValid ? "placed" : whySell;
   // Mark this range handled: a side that is not placed now is never retried later in the day
   range.f_high_breakout = true; range.f_low_breakout = true;
   if(!buyValid && !sellValid) { setupGradeSent = true; return; }
   if(!setupGradeSent) {
      setupGradeSent = true; bool buyBetter = buyG.sizeMultiplier >= sellG.sizeMultiplier;
      if(buyBetter && buyValid) SendSetupGradeAlert(buyG, "BUY"); else if(!buyBetter && sellValid) SendSetupGradeAlert(sellG, "SELL"); else if(buyValid) SendSetupGradeAlert(buyG, "BUY"); else SendSetupGradeAlert(sellG, "SELL");
   }
   double rangeSize = range.high - range.low, minLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN), volStep = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   for(int side = 0; side < 2; side++) {
      bool isBuy = (side == 0); if(isBuy ? !buyValid : !sellValid) continue;
      SetupGrade g = isBuy ? buyG : sellG;
      double entry = isBuy ? range.high : range.low;
      double sl = InpStopLoss == 0 ? 0 : NormalizeDouble(isBuy ? range.high - rangeSize * InpStopLoss * 0.01 : range.low + rangeSize * InpStopLoss * 0.01, _Digits);
      double tp = InpTakeProfit == 0 ? 0 : NormalizeDouble(isBuy ? range.high + rangeSize * InpTakeProfit * 0.01 : range.low - rangeSize * InpTakeProfit * 0.01, _Digits);
      double slDist = (sl == 0) ? rangeSize : MathAbs(entry - sl); double lots;
      if(!CalculateLots(slDist, lots)) { g_setup[side].decision = "skipped:lots"; continue; }
      lots = MathFloor((lots * g.sizeMultiplier) / volStep) * volStep; if(lots < minLot) { g_setup[side].decision = "skipped:lots"; continue; }
      bool placed = isBuy ? trade.BuyStop(lots, entry, _Symbol, sl, tp, ORDER_TIME_SPECIFIED, range.close_time, "Range Breakout BUY " + g.grade)
                          : trade.SellStop(lots, entry, _Symbol, sl, tp, ORDER_TIME_SPECIFIED, range.close_time, "Range Breakout SELL " + g.grade);
      if(!placed) { PrintFormat("⚠️ %sStop rejected (%d) — no signal sent.", isBuy ? "Buy" : "Sell", trade.ResultRetcode()); g_setup[side].decision = "skipped:rejected"; continue; }
      g_setup[side].placed = true;
      if(TelegramOn() && RouteActive(InpRouteSignals)) {
         string slPoints = (sl == 0) ? "—" : DoubleToString(slDist / _Point, 0);
         string m = FillTemplate(sigEntry, _Symbol, isBuy ? "BUY" : "SELL", DoubleToString(entry, _Digits), DoubleToString(sl, _Digits), InpTakeProfit == 0 ? "OPEN" : DoubleToString(tp, _Digits),
                                 "—", DoubleToString(InpSignalRiskPercent * g.sizeMultiplier, 2), "—", "—", "—", "—", g.grade, slPoints, BuildLotSizeTable(sl == 0 ? 0 : slDist));
         if(InpIntelTelegram && g_setup[side].analysed && StringLen(g_setup[side].tg) > 0) m += "\n\n" + g_setup[side].tg;
         RoutedText(InpRouteSignals, m);
         if(isBuy) signalBuyEntry = entry; else signalSellEntry = entry;
      }
   }
   IntelAfterDecision();   // the decisions are written to the file / sent with the outcome; the dashboard line is refreshed
}

void MonitorSignalFills() {
   if(!RouteActive(InpRouteSignals) || !TelegramOn()) return;
   if(signalBuyEntry > 0 && !signalBuyFilledSent && lastTick.ask >= signalBuyEntry) {
      signalBuyFilledSent = true; RoutedText(InpRouteSignals, FillTemplate(sigFilled, _Symbol, "BUY", DoubleToString(signalBuyEntry, _Digits), "—", "—", "—", "—", "—", "—", "—", "—"));
      if(InpOCO && signalSellEntry > 0 && !signalSellFilledSent) { RoutedText(InpRouteSignals, FillTemplate(sigCancel, _Symbol, "SELL", DoubleToString(signalSellEntry, _Digits), "—", "—", "—", "—", "—", "—", "—", "—")); signalSellFilledSent = true; }
   }
   if(signalSellEntry > 0 && !signalSellFilledSent && lastTick.bid <= signalSellEntry) {
      signalSellFilledSent = true; RoutedText(InpRouteSignals, FillTemplate(sigFilled, _Symbol, "SELL", DoubleToString(signalSellEntry, _Digits), "—", "—", "—", "—", "—", "—", "—", "—"));
      if(InpOCO && signalBuyEntry > 0 && !signalBuyFilledSent) { RoutedText(InpRouteSignals, FillTemplate(sigCancel, _Symbol, "BUY", DoubleToString(signalBuyEntry, _Digits), "—", "—", "—", "—", "—", "—", "—", "—")); signalBuyFilledSent = true; }
   }
}
void EnforceOCO() {
   if(!InpOCO || CountOpenPositions() == 0 || CountPendingOrders() == 0) return;
   int cancelled = 0;
   for(int i = OrdersTotal() - 1; i >= 0; i--) { ulong t = OrderGetTicket(i); if(t <= 0) continue; long m; if(!OrderGetInteger(ORDER_MAGIC, m)) continue; if(m != InpMagicNumber) continue; long ot; if(!OrderGetInteger(ORDER_TYPE, ot)) continue; if((ot == ORDER_TYPE_BUY_STOP || ot == ORDER_TYPE_SELL_STOP) && trade.OrderDelete(t)) cancelled++; }
   if(cancelled > 0) Print("🚫 OCO: cancelled ", cancelled, " opposite pending order(s)");
}
void UpdateStopLoss() {
   if(InpStopLoss == 0) return;
   for(int i = PositionsTotal() - 1; i >= 0; i--) {
      ulong t = PositionGetTicket(i); if(t <= 0 || !PositionSelectByTicket(t)) continue; long m; if(!PositionGetInteger(POSITION_MAGIC, m)) continue; if(m != InpMagicNumber) continue;
      long type; double openPrice, currSL, currTP;
      if(!PositionGetInteger(POSITION_TYPE, type) || !PositionGetDouble(POSITION_PRICE_OPEN, openPrice) || !PositionGetDouble(POSITION_SL, currSL) || !PositionGetDouble(POSITION_TP, currTP)) continue;
      double currPrice = type == POSITION_TYPE_BUY ? lastTick.bid : lastTick.ask; int dir = type == POSITION_TYPE_BUY ? 1 : -1;
      if((currPrice - openPrice) * dir / _Point < InpTrailActivationPoints) continue;
      double atr = IndVal(atrTrailHandle, 0, 0); if(atr <= 0) continue;
      double newSL = NormalizeDouble(currPrice - (atr * InpATRMultiplier * dir), _Digits);
      if(currSL != 0 && ((type == POSITION_TYPE_BUY && newSL <= currSL) || (type == POSITION_TYPE_SELL && newSL >= currSL))) continue;
      trade.PositionModify(t, newSL, currTP);   // the SL-move message comes from MonitorPositionChanges, whatever moved it
   }
}
void ManagePartialClose() {
   if(!InpUsePartialClose || range.f_partial_closed) return;
   for(int i = PositionsTotal() - 1; i >= 0; i--) {
      ulong t = PositionGetTicket(i); if(t <= 0 || !PositionSelectByTicket(t)) continue; long m; if(!PositionGetInteger(POSITION_MAGIC, m)) continue; if(m != InpMagicNumber) continue;
      double openPrice, currentVolume; long type;
      if(!PositionGetDouble(POSITION_PRICE_OPEN, openPrice) || !PositionGetDouble(POSITION_VOLUME, currentVolume) || !PositionGetInteger(POSITION_TYPE, type)) continue;
      double currentPrice = type == POSITION_TYPE_BUY ? lastTick.bid : lastTick.ask;
      double rangeSize = g_dayHigh > 0 ? g_dayHigh - g_dayLow : range.high - range.low;
      if(MathAbs(currentPrice - openPrice) < rangeSize * InpPartialTargetPct * 0.01) continue;
      double closeVol = NormalizeDouble(currentVolume * InpPartialPercent * 0.01, 2), minVol = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
      if(closeVol >= minVol && closeVol < currentVolume && trade.PositionClosePartial(t, closeVol)) {
         range.f_partial_closed = true;
         RoutedText(InpRouteSignals, FillTemplate(sigPartialClose, _Symbol, "—", "—", "—", "—", IntegerToString((int)t), "—", "—", "—", DoubleToString(InpPartialPercent, 0), DoubleToString(100.0 - InpPartialPercent, 0)));
      }
   }
}
bool IdInArrayU(ulong id, ulong &arr[]) { for(int i = 0; i < ArraySize(arr); i++) if(arr[i] == id) return true; return false; }
void AddIdToArrayU(ulong id, ulong &arr[]) { int sz = ArraySize(arr); ArrayResize(arr, sz + 1); arr[sz] = id; }
// Close time: every position closes at market (no hold-over), premium gets the exit signal once per ticket
void ClosePositions() {
   for(int i = PositionsTotal() - 1; i >= 0; i--) {
      ulong t = PositionGetTicket(i); if(t <= 0 || !PositionSelectByTicket(t)) continue; long m; if(!PositionGetInteger(POSITION_MAGIC, m)) continue; if(m != InpMagicNumber) continue;
      if(RouteActive(InpRouteSignals) && !IdInArrayU(t, g_ClosedSignalTickets)) { RoutedText(InpRouteSignals, FillTemplate(sigFullClose, _Symbol, "—", "—", "—", "—", IntegerToString((int)t), "—", "—", "—", "—", "—")); AddIdToArrayU(t, g_ClosedSignalTickets); }
      trade.PositionClose(t);
   }
}
// SL changes → premium "MANAGE SL" (one source of truth, whatever moved the stop)
void MonitorPositionChanges() {
   for(int i = 0; i < PositionsTotal(); i++) {
      ulong t = PositionGetTicket(i); if(t <= 0 || !PositionSelectByTicket(t)) continue; long m; if(!PositionGetInteger(POSITION_MAGIC, m)) continue; if(m != InpMagicNumber) continue;
      bool isNew = true;
      for(int j = 0; j < ArraySize(positionStates); j++) {
         if(positionStates[j].ticket != t) continue; isNew = false;
         double curSL = PositionGetDouble(POSITION_SL);
         if(curSL != positionStates[j].lastSL) { double oldSL = positionStates[j].lastSL; positionStates[j].lastSL = curSL;
            RoutedText(InpRouteSignals, FillTemplate(sigMoveSL, _Symbol, "—", "—", DoubleToString(curSL, _Digits), "—", IntegerToString((int)t), "—", DoubleToString(oldSL, _Digits), DoubleToString(curSL, _Digits), "—", "—")); }
         break;
      }
      if(isNew) { int sz = ArraySize(positionStates); ArrayResize(positionStates, sz + 1); positionStates[sz].ticket = t; positionStates[sz].lastSL = PositionGetDouble(POSITION_SL); positionStates[sz].lastTP = PositionGetDouble(POSITION_TP); }
   }
   for(int j = ArraySize(positionStates) - 1; j >= 0; j--) if(!PositionSelectByTicket(positionStates[j].ticket)) { for(int k = j; k < ArraySize(positionStates) - 1; k++) positionStates[k] = positionStates[k + 1]; ArrayResize(positionStates, ArraySize(positionStates) - 1); }
}
// Closed-trade detector (deal history scan): the close message, once per closing deal, with the trust the side had
void DetectClosedTrades() {
   datetime now = TimeCurrent(); if(!HistorySelect(now - 24 * 3600, now)) return; int deals = HistoryDealsTotal();
   if(g_CloseDetectFirstRun) { g_CloseDetectFirstRun = false; for(int k = 0; k < deals; k++) { ulong dtk = HistoryDealGetTicket(k); if(dtk == 0) continue; if(HistoryDealGetInteger(dtk, DEAL_MAGIC) != InpMagicNumber || HistoryDealGetInteger(dtk, DEAL_ENTRY) != DEAL_ENTRY_OUT) continue; AddIdToArrayU(dtk, g_AnnouncedCloseDeals); } return; }
   for(int k = 0; k < deals; k++) {
      ulong dealTicket = HistoryDealGetTicket(k); if(dealTicket == 0) continue;
      if(HistoryDealGetInteger(dealTicket, DEAL_MAGIC) != InpMagicNumber || HistoryDealGetInteger(dealTicket, DEAL_ENTRY) != DEAL_ENTRY_OUT) continue;
      if(IdInArrayU(dealTicket, g_AnnouncedCloseDeals)) continue;
      datetime dealTime = (datetime)HistoryDealGetInteger(dealTicket, DEAL_TIME); if(dealTime < g_EAStartTime) { AddIdToArrayU(dealTicket, g_AnnouncedCloseDeals); continue; }
      ulong posId = (ulong)HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID); double closePrice = HistoryDealGetDouble(dealTicket, DEAL_PRICE); int reason = (int)HistoryDealGetInteger(dealTicket, DEAL_REASON);
      double pl = HistoryDealGetDouble(dealTicket, DEAL_PROFIT) + HistoryDealGetDouble(dealTicket, DEAL_SWAP) + HistoryDealGetDouble(dealTicket, DEAL_COMMISSION);
      double openPrice = 0; int dir = 1;
      for(int j = 0; j < deals; j++) { ulong dt2 = HistoryDealGetTicket(j); if(dt2 == 0 || (ulong)HistoryDealGetInteger(dt2, DEAL_POSITION_ID) != posId || HistoryDealGetInteger(dt2, DEAL_ENTRY) != DEAL_ENTRY_IN) continue; openPrice = HistoryDealGetDouble(dt2, DEAL_PRICE); dir = (HistoryDealGetInteger(dt2, DEAL_TYPE) == DEAL_TYPE_BUY) ? 1 : -1; break; }
      double pips = (openPrice > 0) ? (closePrice - openPrice) * dir / _Point : 0;
      string reasonText = reason == DEAL_REASON_SL ? "SL HIT 🛑" : (reason == DEAL_REASON_TP ? "TP HIT 🎯" : (reason == DEAL_REASON_EXPERT ? "EA close" : (reason == DEAL_REASON_SO ? "Stop-Out" : "manual close")));
      AddIdToArrayU(dealTicket, g_AnnouncedCloseDeals); g_SS_TradeCount++;
      int side = dir > 0 ? 0 : 1; string trust = "";
      if(g_setup[side].analysed && g_setup[side].score >= 0) trust = "\n🧠 Trust was " + DoubleToString(g_setup[side].score, 0) + " · " + g_setup[side].advice;
      g_tradeLine = StringFormat("Trade: %s %s → %s%.1f pts%s", dir > 0 ? "BUY" : "SELL", DoubleToString(openPrice, _Digits), pips >= 0 ? "+" : "", pips, InpHideUsdInTelegram ? "" : StringFormat(" $%.2f", pl));
      string m = "🏁 *POSITION CLOSED — " + reasonText + "*\n\nPair: " + _Symbol + "\nTicket: #" + IntegerToString((int)posId) + "\nClose price: `" + DoubleToString(closePrice, _Digits) + "`\nResult: " + (pips >= 0 ? "+" : "") + DoubleToString(pips, 1) + " pips\n";
      if(!InpHideUsdInTelegram) m += "P/L: $" + DoubleToString(pl, 2) + "\n";
      m += trust + "\n\n#Closed #" + _Symbol;
      RoutedPhoto(InpRouteTradeUpdates, m, CaptureChartScreenshot("CLOSED"));
   }
}

//+==================================================================+
//|                          INTELLIGENCE                            |
//+==================================================================+
// The feature vector (28 numbers, all scale-free; same order as intel.ts FV_NAMES). Everything here is known when the
// range closes; nothing from after that moment ever enters it.
string IntelConfigJson() {
   return "{\"range_start\":" + IntegerToString(InpRangeStart) + ",\"range_duration\":" + IntegerToString(InpRangeDuration) + ",\"range_close\":" + IntegerToString(InpRangeClose)
        + ",\"sl_pct\":" + IntegerToString(InpStopLoss) + ",\"tp_pct\":" + IntegerToString(InpTakeProfit) + ",\"ema\":\"" + EnumToString(InpEMATimeframe) + " " + IntegerToString(InpFastEMAPeriod) + "/" + IntegerToString(InpSlowEMAPeriod) + " " + EnumToString(InpEMAPrice) + "\""
        + ",\"htf\":\"" + EnumToString(InpHTFTimeframe) + " " + IntegerToString(InpHTFFastEMA) + "/" + IntegerToString(InpHTFSlowEMA) + "\",\"min_range_points\":" + Num(InpMinRangePoints, 0)
        + ",\"partial\":\"" + Num(InpPartialPercent, 0) + "% at " + IntegerToString(InpPartialTargetPct) + "%\",\"trail\":\"ATR " + IntegerToString(InpATRPeriod) + " x " + Num(InpATRMultiplier, 1) + " after " + IntegerToString(InpTrailActivationPoints) + " pts\""
        + ",\"only_aplus\":" + Bool(InpOnlyAPlusTrades) + ",\"intel_mode\":" + IntegerToString((int)InpIntelMode) + ",\"min_trust\":" + IntegerToString(InpIntelMinTrust) + "}";
}
string IntelStrategyHash() {
   return HashStr("v11|" + IntegerToString(InpRangeStart) + "|" + IntegerToString(InpRangeDuration) + "|" + IntegerToString(InpRangeClose) + "|" + IntegerToString(InpStopLoss) + "|" + IntegerToString(InpTakeProfit)
                  + "|" + EnumToString(InpEMATimeframe) + IntegerToString(InpFastEMAPeriod) + "/" + IntegerToString(InpSlowEMAPeriod) + EnumToString(InpEMAPrice) + "|" + EnumToString(InpHTFTimeframe) + IntegerToString(InpHTFFastEMA) + "/" + IntegerToString(InpHTFSlowEMA)
                  + "|" + Num(InpMinRangePoints, 0) + "|" + Num(InpPartialPercent, 0) + "@" + IntegerToString(InpPartialTargetPct) + "|atr" + IntegerToString(InpATRPeriod) + "x" + Num(InpATRMultiplier, 1) + "@" + IntegerToString(InpTrailActivationPoints));
}
string IntelMode() { if(InTester()) return "backtest"; return (AccountInfoInteger(ACCOUNT_TRADE_MODE) == ACCOUNT_TRADE_MODE_DEMO) ? "demo" : "live"; }

// JSONL file in Common\Files\FocusWeek — the backtest's only channel, the live run's backup. One file per EA run.
bool IntelFileWrite(const string line) {
   if(g_intelFile == "") return false;
   if(!g_intelRunLineWritten) {
      FolderCreate("FocusWeek", FILE_COMMON);
      int h0 = FileOpen(g_intelFile, FILE_READ | FILE_WRITE | FILE_TXT | FILE_COMMON, 0, CP_UTF8); if(h0 == INVALID_HANDLE) { Print("[intel] cannot open ", g_intelFile, " err ", GetLastError()); return false; }
      FileSeek(h0, 0, SEEK_END);
      FileWriteString(h0, "{\"t\":\"run\",\"run_id\":" + Str(g_runId) + ",\"mode\":" + Str(g_mode) + ",\"symbol\":" + Str(_Symbol) + ",\"ea_version\":\"" + EA_VERSION + "\",\"strategy_hash\":" + Str(g_strategyHash) + ",\"config\":" + IntelConfigJson()
                        + ",\"broker\":" + Str(AccountInfoString(ACCOUNT_COMPANY)) + ",\"login\":" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + ",\"started\":" + Str(IsoGmt(TimeCurrent())) + "}\n");
      FileClose(h0); g_intelRunLineWritten = true;
   }
   int h = FileOpen(g_intelFile, FILE_READ | FILE_WRITE | FILE_TXT | FILE_COMMON, 0, CP_UTF8); if(h == INVALID_HANDLE) { Print("[intel] cannot open ", g_intelFile, " err ", GetLastError()); return false; }
   FileSeek(h, 0, SEEK_END); FileWriteString(h, line + "\n"); FileClose(h); return true;
}

// v3.28: the raw bars behind the setup — what the trained model (PC, ML.NET) learns from. [t,o,h,l,c,v] per bar, oldest first.
string BarsJson(ENUM_TIMEFRAMES tf, datetime before, int count) {
   MqlRates r[]; int n = CopyRates(_Symbol, tf, before, count, r); if(n <= 0) return "[]";
   string s = "["; for(int i = 0; i < n; i++) { if(r[i].time >= before) continue; if(StringLen(s) > 1) s += ","; s += "[" + IntegerToString((long)r[i].time) + "," + DoubleToString(r[i].open, _Digits) + "," + DoubleToString(r[i].high, _Digits) + "," + DoubleToString(r[i].low, _Digits) + "," + DoubleToString(r[i].close, _Digits) + "," + IntegerToString(r[i].tick_volume) + "]"; }
   return s + "]";
}
string FvJson(const double &fv[]) { string s = "["; for(int i = 0; i < FV_DIM; i++) { if(i > 0) s += ","; double v = fv[i]; if(!MathIsValidNumber(v)) v = 0; s += DoubleToString(v, 6); } return s + "]"; }

// Snapshot of both sides when the range closes. Shared features, then per-side entry / stop / grade.
void IntelBuildSetups() {
   if(range.high <= 0 || range.low >= DBL_MAX) return;
   double size = range.high - range.low; if(size <= 0) return;
   g_dayStart = range.start_time; g_dayEnd = range.end_time; g_dayClose = range.close_time; g_dayHigh = range.high; g_dayLow = range.low;
   double close = lastTick.bid > 0 ? lastTick.bid : SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double atrD1 = IndVal(hAtrD1, 0, 1), atrD1L = IndVal(hAtrD1L, 0, 1), atrM15 = IndVal(hAtrM15, 0, 0);
   if(atrD1 <= 0) atrD1 = size; if(atrM15 <= 0) atrM15 = size / 4; if(atrD1L <= 0) atrD1L = atrD1;
   double emaF = IndVal(fastEMAHandle, 0, 0), emaS = IndVal(slowEMAHandle, 0, 0), emaF8 = IndVal(fastEMAHandle, 0, 8), htfF = IndVal(htfFastEMAHandle, 0, 0), htfS = IndVal(htfSlowEMAHandle, 0, 0);
   double rsi = IndVal(hRsi, 0, 0), rsi4 = IndVal(hRsi, 0, 4), adx = IndVal(hAdx, 0, 0), macdH = IndVal(hMacd, 0, 0) - IndVal(hMacd, 1, 0);
   double bbU = IndVal(hBB, 1, 0), bbL = IndVal(hBB, 2, 0), bbM = IndVal(hBB, 0, 0);
   double pdh = iHigh(_Symbol, PERIOD_D1, 1), pdl = iLow(_Symbol, PERIOD_D1, 1), pdc = iClose(_Symbol, PERIOD_D1, 1), dOpen = iOpen(_Symbol, PERIOD_D1, 0), c5 = iClose(_Symbol, PERIOD_D1, 5);
   if(pdc <= 0) pdc = close; if(dOpen <= 0) dOpen = close; if(c5 <= 0) c5 = close; if(pdh <= 0) pdh = range.high; if(pdl <= 0) pdl = range.low;
   // inside the range: when the high / low printed, how often the edges were touched, activity
   MqlRates r[]; int n = CopyRates(_Symbol, PERIOD_M1, range.start_time, range.end_time - 1, r);
   double hiT = 0.5, loT = 0.5; int touches = 0; long vol = 0;
   if(n > 0) { int hiI = 0, loI = 0; for(int i = 0; i < n; i++) { if(r[i].high >= r[hiI].high) hiI = i; if(r[i].low <= r[loI].low) loI = i; vol += r[i].tick_volume; if(r[i].high >= range.high - size * 0.1 || r[i].low <= range.low + size * 0.1) touches++; } hiT = (double)hiI / n; loT = (double)loI / n; }
   double volAvg = 0; int days = 0;
   for(int k = 1; k <= 9 && days < 5; k++) { MqlRates p[]; int m = CopyRates(_Symbol, PERIOD_M1, range.start_time - k * 86400, range.end_time - 1 - k * 86400, p); if(m <= 0) continue; long v = 0; for(int i = 0; i < m; i++) v += p[i].tick_volume; volAvg += (double)v; days++; }
   volAvg = days > 0 ? volAvg / days : 0;
   double spread = (lastTick.ask > 0 && lastTick.bid > 0) ? lastTick.ask - lastTick.bid : SymbolInfoInteger(_Symbol, SYMBOL_SPREAD) * _Point;
   MqlDateTime dt; TimeToStruct(range.end_time, dt); datetime gmt = ToGmt(range.end_time); MqlDateTime ny; TimeToStruct(gmt + NyOffsetHours(gmt) * 3600, ny);
   double fv[FV_DIM];
   fv[0] = size / atrD1; fv[1] = size / close * 100; fv[2] = (close - range.low) / size; fv[3] = (emaF - emaS) / atrM15; fv[4] = (emaF - emaF8) / atrM15; fv[5] = (htfF - htfS) / atrM15;
   fv[6] = rsi / 100; fv[7] = (rsi - rsi4) / 100; fv[8] = adx / 100; fv[9] = macdH / atrM15; fv[10] = bbM > 0 ? (bbU - bbL) / bbM * 100 : 0; fv[11] = atrM15 / atrD1; fv[12] = atrD1 / atrD1L;
   fv[13] = (pdh - pdl) / atrD1; fv[14] = (pdh - close) / size; fv[15] = (close - pdl) / size; fv[16] = (dOpen - pdc) / atrD1; fv[17] = (close - pdc) / atrD1; fv[18] = (close - c5) / atrD1;
   fv[19] = hiT; fv[20] = loT; fv[21] = touches / 10.0; fv[22] = volAvg > 0 ? (double)vol / volAvg : 1; fv[23] = spread / size;
   fv[24] = MathSin(2 * M_PI * dt.day_of_week / 7.0); fv[25] = MathCos(2 * M_PI * dt.day_of_week / 7.0); fv[26] = MathSin(2 * M_PI * dt.mon / 12.0); fv[27] = MathCos(2 * M_PI * dt.mon / 12.0);
   SetupGrade gb = EvaluateSetup(true), gs = EvaluateSetup(false); string blackout = BlackoutReason();
   string feat = "{\"range_high\":" + Num(range.high, _Digits) + ",\"range_low\":" + Num(range.low, _Digits) + ",\"range_size_pts\":" + Num(size / _Point, 1) + ",\"close\":" + Num(close, _Digits)
      + ",\"atr_d1\":" + Num(atrD1) + ",\"atr_d1_50\":" + Num(atrD1L) + ",\"atr_m15\":" + Num(atrM15) + ",\"ema_fast\":" + Num(emaF) + ",\"ema_slow\":" + Num(emaS) + ",\"ema_fast_8\":" + Num(emaF8) + ",\"htf_fast\":" + Num(htfF) + ",\"htf_slow\":" + Num(htfS)
      + ",\"rsi\":" + Num(rsi, 2) + ",\"rsi_1h_ago\":" + Num(rsi4, 2) + ",\"adx\":" + Num(adx, 2) + ",\"macd_hist\":" + Num(macdH) + ",\"bb_upper\":" + Num(bbU) + ",\"bb_lower\":" + Num(bbL) + ",\"bb_mid\":" + Num(bbM)
      + ",\"prev_high\":" + Num(pdh) + ",\"prev_low\":" + Num(pdl) + ",\"prev_close\":" + Num(pdc) + ",\"day_open\":" + Num(dOpen) + ",\"close_5d\":" + Num(c5)
      + ",\"hi_time\":" + Num(hiT, 3) + ",\"lo_time\":" + Num(loT, 3) + ",\"touches\":" + IntegerToString(touches) + ",\"bars\":" + IntegerToString(n) + ",\"vol_range\":" + IntegerToString(vol) + ",\"vol_avg5\":" + Num(volAvg, 0) + ",\"spread_pts\":" + Num(spread / _Point, 1)
      + ",\"dow\":" + IntegerToString(dt.day_of_week) + ",\"dom\":" + IntegerToString(dt.day) + ",\"month\":" + IntegerToString(dt.mon) + ",\"year\":" + IntegerToString(dt.year) + ",\"doy\":" + IntegerToString(dt.day_of_year) + ",\"minute_of_day\":" + IntegerToString(dt.hour * 60 + dt.min) + ",\"ny_hour\":" + IntegerToString(ny.hour)
      + ",\"ema_ok_buy\":" + Bool(emaF > emaS) + ",\"htf_ok_buy\":" + Bool(htfF > htfS) + ",\"size_ok\":" + Bool(size / _Point >= InpMinRangePoints) + ",\"grade_buy\":" + Str(gb.grade) + ",\"grade_sell\":" + Str(gs.grade) + ",\"blackout\":" + Str(blackout) + "}";
   for(int side = 0; side < 2; side++) {
      bool isBuy = (side == 0);
      g_setup[side].key = DayKey(range.end_time) + (isBuy ? ":buy" : ":sell"); g_setup[side].side = isBuy ? "buy" : "sell"; g_setup[side].isBuy = isBuy;
      g_setup[side].entry = isBuy ? range.high : range.low; g_setup[side].risk = size * InpStopLoss * 0.01; if(g_setup[side].risk <= 0) g_setup[side].risk = size;
      g_setup[side].sl = isBuy ? g_setup[side].entry - g_setup[side].risk : g_setup[side].entry + g_setup[side].risk;
      g_setup[side].grade = isBuy ? gb.grade : gs.grade; g_setup[side].mult = isBuy ? gb.sizeMultiplier : gs.sizeMultiplier;
      g_setup[side].decision = "pending"; g_setup[side].features = feat; for(int i = 0; i < FV_DIM; i++) g_setup[side].fv[i] = fv[i];
      g_setup[side].analysed = false; g_setup[side].score = -1; g_setup[side].advice = ""; g_setup[side].n = 0; g_setup[side].tg = ""; g_setup[side].placed = false;
   }
   g_bars = "{\"m5\":" + BarsJson(PERIOD_M5, range.end_time, 60) + ",\"d1\":" + BarsJson(PERIOD_D1, range.end_time, 20) + "}";
   g_setupBuilt = true; g_outcomeDone = false; g_lastIntelLine = ""; g_tradeLine = "";
   if(InpIntelMode != INTEL_OFF && !InTester() && fw_url != "") IntelAnalyse();
   Print("[intel] setup ", g_setup[0].key, " size ", Num(size / _Point, 0), " pts · grades ", gb.grade, "/", gs.grade, (blackout != "" ? " · blackout " + blackout : ""));
}
string IntelSetupJson(int i) {
   return "{\"setup_key\":" + Str(g_setup[i].key) + ",\"at\":" + Str(IsoGmt(g_dayEnd)) + ",\"side\":" + Str(g_setup[i].side) + ",\"grade\":" + Str(g_setup[i].grade) + ",\"decision\":" + Str(g_setup[i].decision)
        + ",\"features\":" + g_setup[i].features + ",\"fv\":" + FvJson(g_setup[i].fv) + (g_bars != "" ? ",\"bars\":" + g_bars : "") + "}";
}
string IntelMetaJson() { return "\"run_id\":" + Str(g_runId) + ",\"mode\":" + Str(g_mode) + ",\"symbol\":" + Str(_Symbol) + ",\"ea_version\":\"" + EA_VERSION + "\",\"strategy_hash\":" + Str(g_strategyHash) + ",\"config\":" + IntelConfigJson(); }

// Live: POST both sides, read the two cards back (score, advice, sample size, the Telegram block)
void IntelAnalyse() {
   string body = "{" + IntelMetaJson() + ",\"analyze\":true,\"setups\":[" + IntelSetupJson(0) + "," + IntelSetupJson(1) + "]}";
   string resp = ""; int code = FwPost(fw_url + "/setup", body, resp);
   if(code != 200) { Print("[intel] analysis request failed (HTTP ", code, ") — ", InpIntelMode == INTEL_FILTER ? (InpIntelFailOpen ? "fail-open: trading as usual" : "fail-closed: no trade today") : "advisory only"); return; }
   g_fwLastOk = TimeCurrent();
   for(int i = 0; i < 2; i++) {
      string c = JsonObj(resp, "\"" + g_setup[i].side + "\":"); if(c == "") continue;
      g_setup[i].analysed = true; g_setup[i].score = JsonNum(c, "\"score\":", -1); g_setup[i].advice = JsonStr(c, "\"advice\":\""); g_setup[i].n = (int)JsonNum(c, "\"nt\":", 0); g_setup[i].tg = JsonStr(c, "\"tg\":\"");
      Print("[intel] ", g_setup[i].side, " → ", g_setup[i].score >= 0 ? "trust " + DoubleToString(g_setup[i].score, 0) + " " + g_setup[i].advice + " on " + IntegerToString(g_setup[i].n) + " comparable trades" : "no data (" + g_setup[i].advice + ")");
   }
}
// Filter mode only: may this side be placed? (why = the decision recorded when it may not)
bool IntelAllows(int i, string &why) {
   if(InpIntelMode != INTEL_FILTER || InTester()) return true;
   if(!g_setup[i].analysed) { if(InpIntelFailOpen) return true; why = "filtered:noanswer"; return false; }
   if(g_setup[i].score < 0) { if(InpIntelFailOpen) return true; why = "filtered:nodata"; return false; }
   if(g_setup[i].score < InpIntelMinTrust || g_setup[i].n < InpIntelMinSamples) { why = "filtered:" + DoubleToString(g_setup[i].score, 0); return false; }
   return true;
}
// After the orders are placed (or not): the file gets both setup lines with the final decisions; the dashboard its line.
void IntelAfterDecision() {
   if(!g_setupBuilt) return;
   for(int i = 0; i < 2; i++) IntelFileWrite("{\"t\":\"setup\"," + IntelMetaJson() + ",\"setup\":" + IntelSetupJson(i) + "}");
   g_lastIntelLine = "";
   for(int i = 0; i < 2; i++) {
      string s = (i == 0 ? "BUY " : "SELL ") + g_setup[i].grade;
      if(g_setup[i].analysed && g_setup[i].score >= 0) s += " · " + DoubleToString(g_setup[i].score, 0) + " " + g_setup[i].advice; else if(g_setup[i].analysed) s += " · no data";
      s += g_setup[i].placed ? " ✓" : " ✗";
      g_lastIntelLine += (i == 0 ? "" : "  |  ") + s;
   }
}

// Close time: what both sides would have done (M1 path from range end to close), and what the real trade did.
// Conservative within a bar: on the bar that reaches the stop, the stop counts first and that bar's high is not credited.
void IntelComputeOutcomes() {
   if(g_dayEnd == 0 || g_dayClose == 0 || g_dayHigh <= g_dayLow) return;
   double size = g_dayHigh - g_dayLow;
   MqlRates r[]; int n = CopyRates(_Symbol, PERIOD_M1, g_dayEnd, g_dayClose, r);
   string outs = "", fileLines = "";
   for(int side = 0; side < 2; side++) {
      bool isBuy = (side == 0); double entry = isBuy ? g_dayHigh : g_dayLow, risk = size * InpStopLoss * 0.01; if(risk <= 0) risk = size; double sl = isBuy ? entry - risk : entry + risk;
      bool trig = false, slHit = false; double mfe = 0, mae = 0, resultR = 0, lastClose = entry; datetime tTrig = 0, tEnd = 0;
      for(int i = 0; i < n; i++) {
         if(r[i].time >= g_dayClose) break; lastClose = r[i].close; tEnd = r[i].time;
         if(!trig) { if(isBuy ? r[i].high >= entry : r[i].low <= entry) { trig = true; tTrig = r[i].time; } else continue; }
         double adverse = isBuy ? (entry - r[i].low) / risk : (r[i].high - entry) / risk; if(adverse > mae) mae = adverse;
         if(isBuy ? r[i].low <= sl : r[i].high >= sl) { slHit = true; resultR = -1; tEnd = r[i].time; break; }
         double fav = isBuy ? (r[i].high - entry) / risk : (entry - r[i].low) / risk; if(fav > mfe) mfe = fav;
      }
      if(trig && !slHit) resultR = (isBuy ? lastClose - entry : entry - lastClose) / risk;
      int minutes = (trig && tEnd > tTrig) ? (int)((tEnd - tTrig) / 60) : 0;
      // the real trade of this side, if one was placed: deals with the magic, entered after the range closed
      double realR = 0, realPnl = 0; bool hasReal = false; string ticket = "", exitReason = ""; datetime tIn = 0, tOut = 0;
      if(HistorySelect(g_dayEnd, g_dayClose + 3600)) {
         int deals = HistoryDealsTotal(); long posId = 0; double lotsIn = 0;
         for(int k = 0; k < deals; k++) { ulong d = HistoryDealGetTicket(k); if(d == 0 || HistoryDealGetInteger(d, DEAL_MAGIC) != InpMagicNumber || HistoryDealGetInteger(d, DEAL_ENTRY) != DEAL_ENTRY_IN) continue;
            if((HistoryDealGetInteger(d, DEAL_TYPE) == DEAL_TYPE_BUY) != isBuy) continue; posId = HistoryDealGetInteger(d, DEAL_POSITION_ID); lotsIn = HistoryDealGetDouble(d, DEAL_VOLUME); tIn = (datetime)HistoryDealGetInteger(d, DEAL_TIME); break; }
         if(posId != 0) {
            hasReal = true; ticket = IntegerToString(posId); double outVol = 0;
            for(int k = 0; k < deals; k++) { ulong d = HistoryDealGetTicket(k); if(d == 0 || HistoryDealGetInteger(d, DEAL_POSITION_ID) != posId) continue;
               ENUM_DEAL_ENTRY e = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(d, DEAL_ENTRY); if(e != DEAL_ENTRY_OUT && e != DEAL_ENTRY_INOUT && e != DEAL_ENTRY_OUT_BY) continue;
               realPnl += HistoryDealGetDouble(d, DEAL_PROFIT) + HistoryDealGetDouble(d, DEAL_SWAP) + HistoryDealGetDouble(d, DEAL_COMMISSION); outVol += HistoryDealGetDouble(d, DEAL_VOLUME);
               tOut = (datetime)HistoryDealGetInteger(d, DEAL_TIME); int rs = (int)HistoryDealGetInteger(d, DEAL_REASON); exitReason = rs == DEAL_REASON_SL ? "sl" : (rs == DEAL_REASON_TP ? "tp" : (rs == DEAL_REASON_EXPERT ? "close_time" : "other")); }
            double tickSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE), tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
            double riskMoney = (tickSize > 0) ? lotsIn * (risk / tickSize) * tickValue : 0; realR = riskMoney > 0 ? realPnl / riskMoney : 0;
            if(outVol < lotsIn - 1e-9) { hasReal = false; }   // still open (should not happen past close time)
         }
      }
      string oc = "{\"setup_key\":" + Str(g_setup[side].key) + ",\"decision\":" + Str(g_setup[side].decision) + ",\"triggered\":" + Bool(trig) + ",\"result_r\":" + Num(resultR, 3) + ",\"mfe_r\":" + Num(mfe, 3) + ",\"mae_r\":" + Num(mae, 3)
         + ",\"sl_hit\":" + Bool(slHit) + ",\"minutes\":" + IntegerToString(minutes) + (hasReal ? ",\"real_r\":" + Num(realR, 3) + ",\"real_pnl\":" + Num(realPnl, 2) + ",\"ticket\":" + Str(ticket) : "") + ",\"outcome_at\":" + Str(IsoGmt(g_dayClose))
         + ",\"outcome\":{\"entry\":" + Num(entry, _Digits) + ",\"sl\":" + Num(sl, _Digits) + ",\"risk_pts\":" + Num(risk / _Point, 1) + ",\"trigger_at\":" + (trig ? Str(IsoGmt(tTrig)) : "null") + ",\"end_at\":" + (trig ? Str(IsoGmt(tEnd)) : "null")
         + ",\"close_at_end\":" + Num(lastClose, _Digits) + ",\"bars\":" + IntegerToString(n) + (hasReal ? ",\"real\":{\"entry_at\":" + Str(IsoGmt(tIn)) + ",\"exit_at\":" + Str(IsoGmt(tOut)) + ",\"exit_reason\":" + Str(exitReason) + ",\"pnl\":" + Num(realPnl, 2) + "}" : "") + "}}";
      outs += (side == 0 ? "" : ",") + oc;
      fileLines += "{\"t\":\"outcome\"," + IntelMetaJson() + ",\"outcome\":" + oc + "}\n";
      PrintFormat("[intel] outcome %s: %s %s mfe %.2fR mae %.2fR result %.2fR%s", g_setup[side].key, trig ? "triggered" : "not triggered", slHit ? "SL" : "", mfe, mae, resultR, hasReal ? StringFormat(" · real %.2fR (%.2f)", realR, realPnl) : "");
   }
   if(fileLines != "") IntelFileWrite(StringSubstr(fileLines, 0, StringLen(fileLines) - 1));
   g_outcomeDone = true; g_dayClose = 0;   // the day is consumed: never computed twice
   if(InpIntelMode != INTEL_OFF && !InTester() && fw_url != "") { string resp = ""; int code = FwPost(fw_url + "/outcome", "{" + IntelMetaJson() + ",\"outcomes\":[" + outs + "]}", resp); if(code == 200) g_fwLastOk = TimeCurrent(); else Print("[intel] outcome post failed HTTP ", code); }
}
// Runs from OnTimer and OnTick: 90 s after close time (deals settled), once per range. A late attach (no setup
// snapshot) still gets its outcome when the day's range is known — the records of both sides are keyed by day.
void IntelCheckOutcome() {
   if(g_outcomeDone || g_dayClose == 0) return;
   datetime now = TimeCurrent(); if(now < g_dayClose + (InTester() ? 0 : 90)) return;
   if(g_setup[0].key != DayKey(g_dayEnd) + ":buy") {   // attached after the range closed: keys and decisions are unknown, the hypothetical path still counts
      for(int side = 0; side < 2; side++) { g_setup[side].key = DayKey(g_dayEnd) + (side == 0 ? ":buy" : ":sell"); g_setup[side].side = side == 0 ? "buy" : "sell"; g_setup[side].isBuy = side == 0; g_setup[side].decision = "unknown"; g_setup[side].grade = ""; g_setup[side].analysed = false; g_setup[side].score = -1; g_setup[side].advice = ""; g_setup[side].placed = false; }
   }
   IntelComputeOutcomes();
}
// Called at the first tick past close time, before CalculateRange() replaces the range with tomorrow's
void IntelStashDay() { if(g_setupBuilt || range.end_time == 0 || range.high <= 0 || range.low >= DBL_MAX) return; g_dayStart = range.start_time; g_dayEnd = range.end_time; g_dayClose = range.close_time; g_dayHigh = range.high; g_dayLow = range.low; }

//+==================================================================+
//|                     FOCUS WEEK TRADE LINK (FW_)                  |
//+==================================================================+
bool FW_Parse(const string conn) {
   int u = StringFind(conn, "u="), k = StringFind(conn, "&k="), s = StringFind(conn, "&s="); if(u < 0 || k < 0 || s < 0) return false;
   fw_url = StringSubstr(conn, u + 2, k - (u + 2)); fw_key = StringSubstr(conn, k + 3, s - (k + 3)); fw_secret = StringSubstr(conn, s + 3);
   return (StringLen(fw_url) > 10 && StringLen(fw_key) > 0 && StringLen(fw_secret) > 20);
}
// POST with the EA key + secret; returns the HTTP code (-1 = WebRequest refused) and the body
int FwPost(const string url, const string body, string &resp) {
   char data[]; char result[]; string headers = "Content-Type: application/json\r\nx-ea-key: " + fw_key + "\r\nx-ea-secret: " + fw_secret + "\r\n";
   StringToCharArray(body, data, 0, StringLen(body), CP_UTF8); string resultHeaders; ResetLastError();
   int code = WebRequest("POST", url, headers, 20000, data, result, resultHeaders); resp = CharArrayToString(result, 0, -1, CP_UTF8);
   if(code == -1) Print("[FocusWeek] WebRequest failed, error ", GetLastError(), " — is https://fbkltjhbmmoryixcbbiw.supabase.co allowed in Tools > Options > Expert Advisors?");
   else if(code != 200) Print("[FocusWeek] HTTP ", code, ": ", StringSubstr(resp, 0, 200));
   return code;
}
string FW_PositionJson(long posId, datetime from, datetime to, bool &ok) {
   ok = false; if(!HistorySelectByPosition(posId)) return ""; int n = HistoryDealsTotal(); if(n == 0) return "";
   double inVol = 0, inPx = 0, outVol = 0, outPx = 0, profit = 0, swap = 0, comm = 0; datetime tIn = 0, tOut = 0; string sym = "", side = "buy", comment = ""; long magic = 0;
   for(int i = 0; i < n; i++) {
      ulong d = HistoryDealGetTicket(i); if(d == 0) continue; ENUM_DEAL_TYPE type = (ENUM_DEAL_TYPE)HistoryDealGetInteger(d, DEAL_TYPE); if(type != DEAL_TYPE_BUY && type != DEAL_TYPE_SELL) continue;
      ENUM_DEAL_ENTRY entry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(d, DEAL_ENTRY); double vol = HistoryDealGetDouble(d, DEAL_VOLUME), px = HistoryDealGetDouble(d, DEAL_PRICE); datetime t = (datetime)HistoryDealGetInteger(d, DEAL_TIME);
      swap += HistoryDealGetDouble(d, DEAL_SWAP); comm += HistoryDealGetDouble(d, DEAL_COMMISSION);
      if(sym == "") { sym = HistoryDealGetString(d, DEAL_SYMBOL); magic = HistoryDealGetInteger(d, DEAL_MAGIC); comment = HistoryDealGetString(d, DEAL_COMMENT); }
      if(entry == DEAL_ENTRY_IN || entry == DEAL_ENTRY_INOUT) { if(tIn == 0 || t < tIn) { tIn = t; side = (type == DEAL_TYPE_BUY) ? "buy" : "sell"; } inVol += vol; inPx += vol * px; }
      if(entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_INOUT || entry == DEAL_ENTRY_OUT_BY) { if(t > tOut) tOut = t; outVol += vol; outPx += vol * px; profit += HistoryDealGetDouble(d, DEAL_PROFIT); }
   }
   if(inVol <= 0 || tIn == 0) return ""; bool closed = (outVol >= inVol - 1e-9) && tOut > 0; if(!closed || tOut < from || tOut > to) return "";
   double ePx = inPx / inVol, xPx = outPx / outVol, pt = SymbolInfoDouble(sym, SYMBOL_POINT), points = (pt > 0) ? ((side == "buy") ? (xPx - ePx) : (ePx - xPx)) / pt : 0;
   ok = true;
   return "{\"ticket\":" + Str(IntegerToString(posId)) + ",\"symbol\":" + Str(sym) + ",\"side\":" + Str(side) + ",\"lots\":" + Num(inVol, 2) + ",\"entry_time\":" + Str(IsoGmt(tIn)) + ",\"entry_price\":" + Num(ePx) + ",\"exit_time\":" + Str(IsoGmt(tOut)) + ",\"exit_price\":" + Num(xPx)
        + ",\"commission\":" + Num(comm, 2) + ",\"swap\":" + Num(swap, 2) + ",\"profit\":" + Num(profit, 2) + ",\"net\":" + Num(profit + swap + comm, 2) + ",\"points\":" + Num(points, 1) + ",\"magic\":" + IntegerToString(magic) + ",\"comment\":" + Str(comment)
        + ",\"strategy\":" + Str(InpEAName) + ",\"version\":\"" + EA_VERSION + "\",\"status\":\"closed\"}";
}
string FW_OpenJson(int &count) {
   string s = ""; count = 0;
   for(int i = 0; i < PositionsTotal(); i++) {
      ulong t = PositionGetTicket(i); if(t == 0) continue; long posId = PositionGetInteger(POSITION_IDENTIFIER); bool buy = PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY;
      if(s != "") s += ",";
      s += "{\"ticket\":" + Str(IntegerToString(posId)) + ",\"symbol\":" + Str(PositionGetString(POSITION_SYMBOL)) + ",\"side\":" + Str(buy ? "buy" : "sell") + ",\"lots\":" + Num(PositionGetDouble(POSITION_VOLUME), 2) + ",\"entry_time\":" + Str(IsoGmt((datetime)PositionGetInteger(POSITION_TIME))) + ",\"entry_price\":" + Num(PositionGetDouble(POSITION_PRICE_OPEN))
         + ",\"sl\":" + Num(PositionGetDouble(POSITION_SL)) + ",\"tp\":" + Num(PositionGetDouble(POSITION_TP)) + ",\"swap\":" + Num(PositionGetDouble(POSITION_SWAP), 2) + ",\"profit\":" + Num(PositionGetDouble(POSITION_PROFIT), 2) + ",\"net\":" + Num(PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP), 2)
         + ",\"magic\":" + IntegerToString(PositionGetInteger(POSITION_MAGIC)) + ",\"comment\":" + Str(PositionGetString(POSITION_COMMENT)) + ",\"strategy\":" + Str(InpEAName) + ",\"version\":\"" + EA_VERSION + "\",\"status\":\"open\"}";
      count++;
   }
   return s;
}
string FW_ClosedJson(datetime from, datetime to, int &count) {
   string s = ""; count = 0; if(!HistorySelect(from, to)) return ""; int n = HistoryDealsTotal(); long seen[]; ArrayResize(seen, 0);
   for(int i = 0; i < n; i++) {
      ulong d = HistoryDealGetTicket(i); if(d == 0) continue; ENUM_DEAL_ENTRY entry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(d, DEAL_ENTRY); if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_INOUT && entry != DEAL_ENTRY_OUT_BY) continue;
      long posId = HistoryDealGetInteger(d, DEAL_POSITION_ID); if(posId == 0) continue; bool dup = false; for(int j = 0; j < ArraySize(seen); j++) if(seen[j] == posId) { dup = true; break; } if(dup) continue;
      int k = ArraySize(seen); ArrayResize(seen, k + 1); seen[k] = posId;
      bool ok; string one = FW_PositionJson(posId, from, to, ok); HistorySelect(from, to); if(!ok) continue;
      if(s != "") s += ","; s += one; count++;
   }
   return s;
}
string FW_SnapshotJson() {
   return "{\"at\":" + Str(IsoGmt(TimeCurrent())) + ",\"balance\":" + Num(AccountInfoDouble(ACCOUNT_BALANCE), 2) + ",\"equity\":" + Num(AccountInfoDouble(ACCOUNT_EQUITY), 2) + ",\"margin_free\":" + Num(AccountInfoDouble(ACCOUNT_MARGIN_FREE), 2)
        + ",\"margin_level\":" + Num(AccountInfoDouble(ACCOUNT_MARGIN_LEVEL), 2) + ",\"floating\":" + Num(AccountInfoDouble(ACCOUNT_PROFIT), 2) + ",\"open_count\":" + IntegerToString(PositionsTotal()) + "}";
}
bool FW_Sync(bool full) {
   datetime now = TimeCurrent(), from = full ? (datetime)0 : fw_lastSync - 3600; int nc = 0, no = 0;
   string closed = FW_ClosedJson(from, now, nc), open = FW_OpenJson(no), trades = closed; if(open != "") trades += (trades == "" ? "" : ",") + open;
   bool snap = (fw_lastSnapshot == 0) || (now - fw_lastSnapshot >= FW_SnapshotMinutes * 60) || full;
   string body = "{\"version\":1,\"full\":" + Bool(full) + ",\"broker\":" + Str(AccountInfoString(ACCOUNT_COMPANY) + " · " + AccountInfoString(ACCOUNT_SERVER)) + ",\"login\":" + Str(IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN))) + ",\"currency\":" + Str(AccountInfoString(ACCOUNT_CURRENCY))
      + ",\"tz_offset_minutes\":" + IntegerToString(FW_BrokerGmtOffset * 60) + ",\"trades\":[" + trades + "],\"events\":[" + fw_events + "]" + (snap ? ",\"snapshot\":" + FW_SnapshotJson() : "") + "}";
   string resp = ""; if(FwPost(fw_url, body, resp) != 200) return false;
   fw_lastSync = now; fw_events = ""; if(snap) fw_lastSnapshot = now; g_fwLastOk = now; GlobalVariableSet("FW_LAST_SYNC_" + fw_key, (double)now);
   if(full) Print("[FocusWeek] full history sent: ", nc, " closed, ", no, " open");
   return true;
}
void FW_OnTradeTransaction(const MqlTradeTransaction &trans) {
   if(fw_url == "" || InTester()) return;
   string ev = ""; long ticket = 0; double price = trans.price, sl = trans.price_sl, tp = trans.price_tp, lots = trans.volume;
   if(trans.type == TRADE_TRANSACTION_DEAL_ADD) {
      if(!HistoryDealSelect(trans.deal)) return; ENUM_DEAL_ENTRY entry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(trans.deal, DEAL_ENTRY); ENUM_DEAL_TYPE type = (ENUM_DEAL_TYPE)HistoryDealGetInteger(trans.deal, DEAL_TYPE);
      if(type != DEAL_TYPE_BUY && type != DEAL_TYPE_SELL) return;
      ticket = HistoryDealGetInteger(trans.deal, DEAL_POSITION_ID); price = HistoryDealGetDouble(trans.deal, DEAL_PRICE); lots = HistoryDealGetDouble(trans.deal, DEAL_VOLUME);
      if(entry == DEAL_ENTRY_IN) ev = "open"; else { bool still = false; for(int i = 0; i < PositionsTotal(); i++) { if(PositionGetTicket(i) != 0 && PositionGetInteger(POSITION_IDENTIFIER) == ticket) { still = true; break; } } ev = still ? "partial" : "close"; }
   }
   else if(trans.type == TRADE_TRANSACTION_POSITION) { ev = "modify"; ticket = (long)trans.position; }
   else if(trans.type == TRADE_TRANSACTION_ORDER_ADD && trans.order_type >= ORDER_TYPE_BUY_LIMIT) { ev = "pending"; ticket = (long)trans.order; }
   else if(trans.type == TRADE_TRANSACTION_ORDER_DELETE && trans.order_state == ORDER_STATE_CANCELED) { ev = "cancel"; ticket = (long)trans.order; }
   if(ev == "" || ticket == 0) return;
   fw_events += (fw_events == "" ? "" : ",") + "{\"ticket\":" + Str(IntegerToString(ticket)) + ",\"event\":" + Str(ev) + ",\"at\":" + Str(IsoGmt(TimeCurrent())) + ",\"price\":" + Num(price) + ",\"sl\":" + Num(sl) + ",\"tp\":" + Num(tp) + ",\"lots\":" + Num(lots, 2) + ",\"symbol\":" + Str(trans.symbol) + "}";
   if(ev == "close" || ev == "open") FW_Sync(false);
}
void FW_OnTimer() {
   if(fw_url == "" || InTester()) return;
   if(!fw_fullDone) { fw_fullDone = FW_Sync(true); return; }
   static datetime lastTry = 0; datetime now = TimeCurrent(); if(now - lastTry < 60) return; lastTry = now; FW_Sync(false);
}
void FW_OnInit() {
   if(!FW_Parse(FW_Connection)) { if(StringLen(FW_Connection) > 0) Print("[FocusWeek] connection string malformed — paste the one from Trading → EA → connection"); return; }
   if(!FW_ResendAll && GlobalVariableCheck("FW_LAST_SYNC_" + fw_key)) { fw_lastSync = (datetime)GlobalVariableGet("FW_LAST_SYNC_" + fw_key); fw_fullDone = (fw_lastSync > 0); }
   Print("[FocusWeek] link enabled for ", fw_key, fw_fullDone ? " — incremental" : " — full history on the first timer tick", " · intelligence ", EnumToString(InpIntelMode));
}
//+==================================================================+
//|                   35K INVESTOR REPORT (K35_)                     |
//+==================================================================+
// Weekly performance report to 35K: Friday at K35_ReportHourNY:K35_ReportMinuteNY New York, at most once per 6 days,
// retried hourly while it fails. The chart button fires a [TEST] report.
string   k35_url = "", k35_secret = ""; datetime k35_lastSent = 0, k35_btnResetAt = 0;
const string K35_BTN = "K35_TEST_BTN";
const string K35_BTN_IDLE = "35K: SEND TEST REPORT";
const color  K35_BTN_IDLECLR = C'40,90,160';

bool K35_Parse(const string conn) {
   int u = StringFind(conn, "u="), k = StringFind(conn, "&k="); if(u < 0 || k < 0) return false;
   k35_url = StringSubstr(conn, u + 2, k - (u + 2)); k35_secret = StringSubstr(conn, k + 3);
   return (StringLen(k35_url) > 10 && StringLen(k35_secret) > 20);
}
struct K35Perf { double pnl; int trades; int wins; int losses; double sumWin; double sumLoss; double maxDdPct; };
void K35_Collect(datetime from, datetime to, K35Perf &p) {   // server times
   p.pnl = 0; p.trades = 0; p.wins = 0; p.losses = 0; p.sumWin = 0; p.sumLoss = 0; p.maxDdPct = 0;
   if(!HistorySelect(from, to)) return;
   double running = 0, peak = 0; int total = HistoryDealsTotal();
   for(int i = 0; i < total; i++) {
      ulong ticket = HistoryDealGetTicket(i); if(ticket == 0) continue;
      ENUM_DEAL_ENTRY entry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(ticket, DEAL_ENTRY); if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_INOUT) continue;
      ENUM_DEAL_TYPE type = (ENUM_DEAL_TYPE)HistoryDealGetInteger(ticket, DEAL_TYPE); if(type != DEAL_TYPE_BUY && type != DEAL_TYPE_SELL) continue;
      double profit = HistoryDealGetDouble(ticket, DEAL_PROFIT) + HistoryDealGetDouble(ticket, DEAL_SWAP) + HistoryDealGetDouble(ticket, DEAL_COMMISSION);
      p.pnl += profit; p.trades++; if(profit >= 0) { p.wins++; p.sumWin += profit; } else { p.losses++; p.sumLoss += profit; }
      running += profit; if(running > peak) peak = running;
      double base = AccountInfoDouble(ACCOUNT_BALANCE) - p.pnl + (p.pnl - running);
      if(base > 0) { double dd = (peak - running) / base * 100.0; if(dd > p.maxDdPct) p.maxDdPct = dd; }
   }
}
bool K35_Send(bool isTest) {
   if(k35_url == "") { Print("[35K] no connection string — nothing sent"); return false; }
   datetime now = TimeCurrent(), start = now - 7 * 24 * 3600;
   K35Perf p; K35_Collect(start, now, p);
   double balance = AccountInfoDouble(ACCOUNT_BALANCE), equity = AccountInfoDouble(ACCOUNT_EQUITY), startBalance = balance - p.pnl;
   double pnlPct = (startBalance > 0) ? p.pnl / startBalance * 100.0 : 0.0, winRate = (p.trades > 0) ? (double)p.wins / p.trades * 100.0 : 0.0;
   double avgWin = (p.wins > 0) ? p.sumWin / p.wins : 0.0, avgLoss = (p.losses > 0) ? p.sumLoss / p.losses : 0.0;
   string open = "["; int added = 0;
   for(int i = 0; i < PositionsTotal(); i++) {
      ulong t = PositionGetTicket(i); if(t == 0) continue; if(added > 0) open += ",";
      open += "{\"symbol\":" + Str(PositionGetString(POSITION_SYMBOL)) + ",\"type\":" + Str(PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY ? "buy" : "sell") + ",\"lots\":" + Num(PositionGetDouble(POSITION_VOLUME), 2) + ",\"floating_pnl\":" + Num(PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP), 2) + "}";
      added++;
   }
   open += "]";
   string reportId = isTest ? K35_CompanyKey + ":test-" + IntegerToString((long)ToGmt(now)) : K35_CompanyKey + ":" + IsoGmt(start) + ".." + IsoGmt(now);
   string body = "{\"version\":1,\"company\":" + Str(K35_CompanyKey) + ",\"report_id\":" + Str(reportId) + ",\"period_start\":" + Str(IsoGmt(start)) + ",\"period_end\":" + Str(IsoGmt(now))
      + ",\"currency\":" + Str(AccountInfoString(ACCOUNT_CURRENCY)) + ",\"triggered_by\":" + Str(isTest ? "manual" : "schedule") + ",\"test\":" + Bool(isTest)
      + ",\"notes\":" + Str((isTest ? "TEST — " : "") + "Automatic weekly report from " + InpEAName + " on " + AccountInfoString(ACCOUNT_SERVER))
      + ",\"metrics\":{\"account\":{\"starting_balance\":" + Num(startBalance, 2) + ",\"ending_balance\":" + Num(balance, 2) + ",\"starting_equity\":" + Num(startBalance, 2) + ",\"ending_equity\":" + Num(equity, 2) + ",\"currency\":" + Str(AccountInfoString(ACCOUNT_CURRENCY)) + "},"
      + "\"performance\":{\"realized_pnl\":" + Num(p.pnl, 2) + ",\"realized_pnl_pct\":" + Num(pnlPct, 3) + ",\"trades_total\":" + IntegerToString(p.trades) + ",\"wins\":" + IntegerToString(p.wins) + ",\"losses\":" + IntegerToString(p.losses) + ",\"win_rate_pct\":" + Num(winRate, 1) + ",\"avg_win\":" + Num(avgWin, 2) + ",\"avg_loss\":" + Num(avgLoss, 2) + ",\"max_drawdown_pct\":" + Num(p.maxDdPct, 2) + "},"
      + "\"open_positions\":" + open + "}}";
   char data[]; char result[]; string headers = "Content-Type: application/json\r\nx-partner-secret: " + k35_secret + "\r\nx-report-id: " + reportId + "\r\n";
   StringToCharArray(body, data, 0, StringLen(body), CP_UTF8); string resultHeaders; ResetLastError();
   int code = WebRequest("POST", k35_url, headers, 15000, data, result, resultHeaders); string resp = CharArrayToString(result, 0, -1, CP_UTF8);
   if(code == -1) { Print("[35K] WebRequest failed, error ", GetLastError(), " — is https://bbghrtvtnceoatyrnqud.supabase.co allowed in Tools > Options > Expert Advisors?"); return false; }
   Print("[35K] report ", (isTest ? "(TEST) " : ""), "HTTP ", code, ": ", StringSubstr(resp, 0, 200));
   if(code == 200) { if(!isTest) { k35_lastSent = now; GlobalVariableSet("K35_LAST_SENT_" + K35_CompanyKey, (double)now); } return true; }
   return false;
}
void K35_SetButton(const string text, const color bg) {
   if(ObjectFind(0, K35_BTN) < 0) return;
   ObjectSetString(0, K35_BTN, OBJPROP_TEXT, text); ObjectSetInteger(0, K35_BTN, OBJPROP_BGCOLOR, bg); ObjectSetInteger(0, K35_BTN, OBJPROP_STATE, false); ChartRedraw(0);
}
void K35_CreateButton() {
   if(!K35_ShowTestButton || InTester()) { ObjectDelete(0, K35_BTN); return; }
   if(ObjectFind(0, K35_BTN) < 0 && !ObjectCreate(0, K35_BTN, OBJ_BUTTON, 0, 0, 0)) return;
   ObjectSetInteger(0, K35_BTN, OBJPROP_CORNER, CORNER_RIGHT_UPPER); ObjectSetInteger(0, K35_BTN, OBJPROP_XDISTANCE, 10); ObjectSetInteger(0, K35_BTN, OBJPROP_YDISTANCE, 30);
   ObjectSetInteger(0, K35_BTN, OBJPROP_XSIZE, 200); ObjectSetInteger(0, K35_BTN, OBJPROP_YSIZE, 28); ObjectSetInteger(0, K35_BTN, OBJPROP_FONTSIZE, 9); ObjectSetString(0, K35_BTN, OBJPROP_FONT, "Arial");
   ObjectSetInteger(0, K35_BTN, OBJPROP_COLOR, clrWhite); ObjectSetInteger(0, K35_BTN, OBJPROP_BORDER_COLOR, C'80,80,150'); ObjectSetInteger(0, K35_BTN, OBJPROP_BACK, false); ObjectSetInteger(0, K35_BTN, OBJPROP_SELECTABLE, false); ObjectSetInteger(0, K35_BTN, OBJPROP_HIDDEN, true);
   K35_SetButton(K35_BTN_IDLE, K35_BTN_IDLECLR);
}
void K35_DeleteButton() { ObjectDelete(0, K35_BTN); }
void K35_OnChartEvent(const int id, const string &sparam) {
   if(id != CHARTEVENT_OBJECT_CLICK || sparam != K35_BTN) return;
   if(k35_url == "") { K35_SetButton("NO 35K CONNECTION STRING", clrFireBrick); Print("[35K] test button: paste your connection string in K35_Connection first."); k35_btnResetAt = TimeLocal() + 6; return; }
   K35_SetButton("SENDING...", clrDarkOrange);
   bool ok = K35_Send(true);
   K35_SetButton(ok ? "TEST REPORT SENT  OK" : "FAILED - SEE EXPERTS LOG", ok ? clrSeaGreen : clrFireBrick); k35_btnResetAt = TimeLocal() + 8;
}
void K35_OnTimer() {
   if(k35_btnResetAt > 0 && TimeLocal() >= k35_btnResetAt) { k35_btnResetAt = 0; K35_SetButton(K35_BTN_IDLE, K35_BTN_IDLECLR); }
   if(k35_url == "" || InTester()) return;
   datetime now = TimeCurrent(), gmt = ToGmt(now), ny = gmt + NyOffsetHours(gmt) * 3600; MqlDateTime t; TimeToStruct(ny, t);
   bool windowOpen = (t.day_of_week == 5) && (t.hour > K35_ReportHourNY || (t.hour == K35_ReportHourNY && t.min >= K35_ReportMinuteNY)); if(!windowOpen) return;
   if(k35_lastSent > 0 && (now - k35_lastSent) < 6 * 24 * 3600) return;
   static datetime lastTry = 0; if(now - lastTry < 3600) return; lastTry = now;
   K35_Send(false);
}
void K35_OnInit() {
   K35_CreateButton();
   if(!K35_Parse(K35_Connection)) { if(StringLen(K35_Connection) > 0) Print("[35K] connection string malformed — paste the one from 35K in K35_Connection"); return; }
   if(GlobalVariableCheck("K35_LAST_SENT_" + K35_CompanyKey)) k35_lastSent = (datetime)GlobalVariableGet("K35_LAST_SENT_" + K35_CompanyKey);
   Print("[35K] reporting enabled for ", K35_CompanyKey, " — Friday ", K35_ReportHourNY, ":", (K35_ReportMinuteNY < 10 ? "0" : ""), K35_ReportMinuteNY, " New York");
}
void K35_OnDeinit() { K35_DeleteButton(); }

//+==================================================================+
//|                            DASHBOARD                             |
//+==================================================================+
double AllTimePnLSinceStart() {
   datetime startDate = StringToTime(StringFormat("%04d.%02d.%02d 00:00", InpStartYear, MathMax(1, MathMin(12, InpStartMonth)), MathMax(1, MathMin(31, InpStartDay)))), now = TimeCurrent();
   if(!HistorySelect(startDate, now)) return 0;
   double total = 0; int deals = HistoryDealsTotal();
   for(int i = 0; i < deals; i++) { ulong dt = HistoryDealGetTicket(i); if(dt == 0 || HistoryDealGetInteger(dt, DEAL_MAGIC) != InpMagicNumber || HistoryDealGetInteger(dt, DEAL_ENTRY) != DEAL_ENTRY_OUT) continue; total += HistoryDealGetDouble(dt, DEAL_PROFIT) + HistoryDealGetDouble(dt, DEAL_SWAP) + HistoryDealGetDouble(dt, DEAL_COMMISSION); }
   return total;
}
string Money(double v) { return (v < 0 ? "-$" : "$") + DoubleToString(MathAbs(v), 2); }
// One compact panel, top-left, scaled by InpDashScalePct: title · clock · account · range · intelligence · today's trade · links
void DrawDashboard() {
   static datetime lastDraw = 0; datetime now = TimeCurrent(); if(now == lastDraw) return; lastDraw = now;
   double scale = MathMax(40, MathMin(200, InpDashScalePct)) / 100.0;
   int x = InpDashXOffset, y = InpDashYOffset, lineH = (int)MathRound(22 * scale), fSize = (int)MathMax(6, MathRound(10 * scale)), panelW = (int)MathRound(480 * scale), pad = (int)MathRound(10 * scale);
   int openPos = 0; double floating = 0, openPts = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--) {
      ulong tk = PositionGetTicket(i); if(tk <= 0 || !PositionSelectByTicket(tk)) continue; long m; if(!PositionGetInteger(POSITION_MAGIC, m) || m != InpMagicNumber) continue;
      openPos++; floating += PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP);
      double op = PositionGetDouble(POSITION_PRICE_OPEN); bool buy = PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY; openPts += (buy ? lastTick.bid - op : op - lastTick.ask) / _Point;
   }
   double allTime = AllTimePnLSinceStart();
   string blackout = (range.end_time > 0) ? BlackoutReason() : "";
   string lines[7]; color cols[7];
   lines[0] = "JARVIS@AI v" + EA_VERSION + "  ·  " + _Symbol + "  ·  " + (g_mode == "backtest" ? "BACKTEST" : (g_mode == "demo" ? "DEMO" : "LIVE")); cols[0] = clrGold;
   lines[1] = TimeToString(now, TIME_DATE | TIME_MINUTES) + " broker  ·  " + TimeToString(ToGmt(now), TIME_MINUTES) + " GMT  ·  risk " + DoubleToString(InpLots, 1) + "%"; cols[1] = C'150,255,200';
   if(InpHideUsdInTelegram) lines[2] = "Open " + IntegerToString(openPos) + "  ·  P&L " + (openPos > 0 ? (openPts >= 0 ? "+" : "") + DoubleToString(openPts, 0) + " pts" : "—") + "  ·  Closed this session " + IntegerToString(g_SS_TradeCount);
   else lines[2] = "Bal " + Money(AccountInfoDouble(ACCOUNT_BALANCE)) + "  ·  Eq " + Money(AccountInfoDouble(ACCOUNT_EQUITY)) + "  ·  Open " + IntegerToString(openPos) + " " + Money(floating) + "  ·  All-time " + Money(allTime);
   cols[2] = (openPos > 0) ? (floating > 0 || (InpHideUsdInTelegram && openPts > 0) ? clrLime : clrTomato) : clrWhite;
   if(range.start_time > 0 && range.low < DBL_MAX && range.high > 0) {
      bool forming = now < range.end_time;
      lines[3] = "Range " + DoubleToString(range.low, _Digits) + " – " + DoubleToString(range.high, _Digits) + "  ·  " + DoubleToString((range.high - range.low) / _Point, 0) + " pts  ·  " + (forming ? "closes " + TimeToString(range.end_time, TIME_MINUTES) : "exit " + TimeToString(range.close_time, TIME_MINUTES));
   } else lines[3] = "Range forms " + (range.start_time > 0 ? TimeToString(range.start_time, TIME_DATE | TIME_MINUTES) : "…") + "  ·  " + IntegerToString(InpRangeDuration) + " min";
   cols[3] = clrWhite;
   if(blackout != "") { lines[4] = "No trade today  ·  " + blackout; cols[4] = clrOrange; }
   else if(g_lastIntelLine != "") { lines[4] = g_lastIntelLine; cols[4] = C'140,200,255'; }
   else if(range.end_time > 0 && now >= range.end_time && g_setupBuilt) { lines[4] = "Grades BUY " + g_setup[0].grade + " · SELL " + g_setup[1].grade + "  ·  " + (InpIntelMode == INTEL_OFF ? "intelligence off" : "asking Focus Week…"); cols[4] = C'140,200,255'; }
   else { lines[4] = "Intelligence: " + (InpIntelMode == INTEL_OFF ? "off" : (InpIntelMode == INTEL_FILTER ? "filter ≥ " + IntegerToString(InpIntelMinTrust) : "advisory")) + (fw_url == "" ? "  ·  Focus Week not linked" : ""); cols[4] = C'140,200,255'; }
   lines[5] = (g_tradeLine != "") ? g_tradeLine : (openPos > 0 ? "In the trade — SL managed by ATR" : "No trade yet today"); cols[5] = (g_tradeLine != "") ? (StringFind(g_tradeLine, "→ +") >= 0 ? clrLime : clrTomato) : clrSilver;
   lines[6] = "Focus Week " + (fw_url == "" ? "off" : (g_fwLastOk > 0 ? "✓ " + TimeToString(g_fwLastOk, TIME_MINUTES) : "…")) + "  ·  35K " + (k35_url == "" ? "off" : "✓") + "  ·  Telegram " + (TelegramOn() ? "✓" : "off") + "  ·  log " + (g_intelFile == "" ? "off" : "✓"); cols[6] = clrSilver;
   string pfx = "DASH_"; int panelH = ArraySize(lines) * lineH + pad * 2;
   if(ObjectFind(0, pfx + "BG") < 0) ObjectCreate(0, pfx + "BG", OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, pfx + "BG", OBJPROP_CORNER, CORNER_LEFT_UPPER); ObjectSetInteger(0, pfx + "BG", OBJPROP_XDISTANCE, x - pad); ObjectSetInteger(0, pfx + "BG", OBJPROP_YDISTANCE, y - pad);
   ObjectSetInteger(0, pfx + "BG", OBJPROP_XSIZE, panelW); ObjectSetInteger(0, pfx + "BG", OBJPROP_YSIZE, panelH); ObjectSetInteger(0, pfx + "BG", OBJPROP_BGCOLOR, C'12,14,32'); ObjectSetInteger(0, pfx + "BG", OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, pfx + "BG", OBJPROP_COLOR, C'70,80,140'); ObjectSetInteger(0, pfx + "BG", OBJPROP_BACK, false); ObjectSetInteger(0, pfx + "BG", OBJPROP_SELECTABLE, false); ObjectSetInteger(0, pfx + "BG", OBJPROP_HIDDEN, true);
   for(int i = 0; i < ArraySize(lines); i++) {
      string name = pfx + "L" + IntegerToString(i);
      if(ObjectFind(0, name) < 0) ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER); ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x); ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y + i * lineH);
      ObjectSetString(0, name, OBJPROP_TEXT, lines[i]); ObjectSetInteger(0, name, OBJPROP_COLOR, cols[i]); ObjectSetInteger(0, name, OBJPROP_FONTSIZE, i == 0 ? fSize + 1 : fSize); ObjectSetString(0, name, OBJPROP_FONT, i == 0 ? "Segoe UI Semibold" : "Consolas");
      ObjectSetInteger(0, name, OBJPROP_BACK, false); ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false); ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
   }
}
void ClearDashboard() { ObjectDelete(0, "DASH_BG"); for(int i = 0; i < 8; i++) ObjectDelete(0, "DASH_L" + IntegerToString(i)); }

//+==================================================================+
//|              SCHEDULE · ADS · DAILY REPORT · HEARTBEAT           |
//+==================================================================+
// Once per broker day: the ad times (random inside 08–22) and the daily report time. On the first build after the EA
// loads, anything already past is marked sent so nothing replays at once.
void BuildTodaysSchedule() {
   datetime now = TimeCurrent(), today00 = DayStart(now); if(g_ScheduleBuiltForDay == today00) return; g_ScheduleBuiltForDay = today00;
   g_FreeReportSent = false; int adN = MathMax(0, MathMin(12, InpFreeAdvertsPerDay));
   ArrayResize(g_TodayAds, adN); ArrayResize(g_TodayAdsSent, adN);
   MathSrand((int)(today00 % 0x7FFFFFFF));
   int wStart = 8, wEnd = 22, totalMins = (wEnd - wStart) * 60, adSeg = adN > 0 ? MathMax(1, totalMins / adN) : 1;
   for(int i = 0; i < adN; i++) { g_TodayAds[i] = today00 + (wStart * 60 + adSeg * i + (MathRand() % adSeg)) * 60; g_TodayAdsSent[i] = false; }
   g_TodayFreeReportTime = today00 + (SS_Hour * 60 + SS_Minute) * 60;
   if(g_FirstScheduleBuild) {
      g_FirstScheduleBuild = false;
      for(int i = 0; i < adN; i++) if(now >= g_TodayAds[i]) g_TodayAdsSent[i] = true;
      if(now >= g_TodayFreeReportTime) g_FreeReportSent = true;
      if(now >= today00 + 5 * 60) g_LastDailyNewsDate = today00;
      MqlDateTime t; TimeToStruct(now, t); if(t.day_of_week == 0 && t.hour >= 18) g_LastWeeklyNewsDate = today00;
   }
}
void TriggerFreeAdverts() {
   if(!TelegramOn() || !RouteActive(InpRouteAds)) return; datetime now = TimeCurrent();
   for(int i = 0; i < ArraySize(g_TodayAds); i++) { if(g_TodayAdsSent[i] || now < g_TodayAds[i]) continue; g_TodayAdsSent[i] = true; RoutedText(InpRouteAds, adVariants[i % ArraySize(adVariants)] + InpPremiumUpgradeLink); }
}
// The free channel's view of the day: the trade (direction, entry, exit, pips, result) — never the account, never the
// intelligence. Premium already had everything live.
string BuildFreeDailyReport() {
   datetime now = TimeCurrent(); MqlDateTime dt; TimeToStruct(now, dt); string dayNames[] = {"Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"};
   datetime startDate = StringToTime(StringFormat("%04d.%02d.%02d 00:00", InpStartYear, MathMax(1, MathMin(12, InpStartMonth)), MathMax(1, MathMin(31, InpStartDay))));
   int daysSinceStart = MathMax(1, (int)((now - startDate) / 86400) + 1);
   datetime todayStart = DayStart(now); HistorySelect(0, now); int totalDeals = HistoryDealsTotal();
   int totalTrades = 0, tradesToday = 0, lastDir = 0; double lastEntry = 0, lastClose = 0, lastPips = 0; string lastResult = "—"; bool foundToday = false;
   for(int i = 0; i < totalDeals; i++) {
      ulong d = HistoryDealGetTicket(i); if(d == 0 || HistoryDealGetInteger(d, DEAL_MAGIC) != InpMagicNumber) continue;
      int entry = (int)HistoryDealGetInteger(d, DEAL_ENTRY); datetime t = (datetime)HistoryDealGetInteger(d, DEAL_TIME);
      if(entry == DEAL_ENTRY_IN) { totalTrades++; if(t >= todayStart) { tradesToday++; lastEntry = HistoryDealGetDouble(d, DEAL_PRICE); lastDir = (HistoryDealGetInteger(d, DEAL_TYPE) == DEAL_TYPE_BUY) ? 1 : -1; foundToday = true; lastClose = 0; } }
      else if(entry == DEAL_ENTRY_OUT && foundToday && t >= todayStart) { lastClose = HistoryDealGetDouble(d, DEAL_PRICE); lastPips = (lastClose - lastEntry) * lastDir / _Point; lastResult = (lastPips > 0) ? "✅ WIN" : (lastPips < 0 ? "❌ LOSS" : "➖ BREAK-EVEN"); }
   }
   string msg = "🎯 *DAILY REPORT*\n━━━━━━━━━━━━━━━━━━━━\n📅 " + dayNames[dt.day_of_week] + ", " + StringFormat("%04d.%02d.%02d", dt.year, dt.mon, dt.day) + "\n🕐 " + StringFormat("%02d:%02d", dt.hour, dt.min) + "\n🗓️ Day " + IntegerToString(daysSinceStart) + " since launch\n\n"
              + "📊 *Trades today:* " + IntegerToString(tradesToday) + "\n🏆 *Trades all-time:* " + IntegerToString(totalTrades) + "\n\n";
   if(tradesToday > 0 && foundToday) {
      msg += "💎 *Today's trade*\n  • Direction: " + (lastDir > 0 ? "BUY 📈" : "SELL 📉") + "\n  • Entry: `" + DoubleToString(lastEntry, _Digits) + "`\n";
      if(lastClose > 0) msg += "  • Closed: `" + DoubleToString(lastClose, _Digits) + "`\n  • Pips: `" + (lastPips >= 0 ? "+" : "") + DoubleToString(lastPips, 1) + "`\n  • Result: " + lastResult + "\n"; else msg += "  • Still running\n";
   } else msg += "_No trade taken today — no setup met the strategy criteria._\n";
   msg += "\n━━━━━━━━━━━━━━━━━━━━\n⏰ *Same time tomorrow!*\n";
   if(RouteActive(InpRouteAds)) msg += "\n💎 _Want to see this signal LIVE next time? Join premium:_\n" + InpPremiumUpgradeLink;
   return msg;
}
void TriggerFreeDailyReport() {
   if(!TelegramOn() || !RouteActive(InpRouteDailyReport) || g_FreeReportSent || TimeCurrent() < g_TodayFreeReportTime) return; g_FreeReportSent = true;
   if(RoutedPhoto(InpRouteDailyReport, BuildFreeDailyReport(), CaptureChartScreenshot("DAILY_REPORT"))) Print("📤 Daily report sent");
}
void SendWelcomeMessage() { if(welcomeMessageSent) return; welcomeMessageSent = true; if(RouteActive(InpRouteWelcome)) RoutedText(InpRouteWelcome, "Live"); }
// Hourly LIVE pulse: the previous one is deleted first so the channel never fills with pulses. Skipped while in a trade.
void SendHourlyHeartbeat() {
   if(!InpEnableHeartbeat || !TelegramOn()) return; string hbIDs[]; GetRouteChatIDs(InpRouteHeartbeat, hbIDs); if(ArraySize(hbIDs) == 0 || CountOpenPositions() > 0) return;
   int intervalSecs = MathMax(1, InpHeartbeatIntervalHours) * 3600; datetime now = TimeCurrent(), bucket = now - (now % intervalSecs);
   if(lastHeartbeatTime != 0 && bucket <= lastHeartbeatTime) return; lastHeartbeatTime = bucket;
   MqlDateTime dt; TimeToStruct(now, dt); string txt = StringFormat("🟢 *LIVE* — %02d:%02d broker time\n_Still watching the markets._", dt.hour, dt.min);
   RespectDelay();
   for(int i = 0; i < ArraySize(hbIDs); i++) { long oldMid = GetLiveMsgId(hbIDs[i]); if(oldMid > 0) DeleteTelegramMessage(hbIDs[i], oldMid); long newMid = SendTextOneGetId(txt, hbIDs[i]); if(newMid > 0) SetLiveMsgId(hbIDs[i], newMid); if(i < ArraySize(hbIDs) - 1) Sleep(500); }
}

//+==================================================================+
//|                  WEEKLY / MONTHLY / ANNUAL REPORTS               |
//+==================================================================+
struct TradeStats { int totalTrades, wins, losses; double winRate, netProfit, totalPips; };
bool CalculateStats(datetime fromDate, datetime toDate, TradeStats &s) {
   s.totalTrades = 0; s.wins = 0; s.losses = 0; s.winRate = 0; s.netProfit = 0; s.totalPips = 0;
   if(!HistorySelect(fromDate, toDate)) return false; int total = HistoryDealsTotal();
   ulong posIds[]; double openPrices[]; int openDirs[];
   for(int i = 0; i < total; i++) {
      ulong dt = HistoryDealGetTicket(i); if(dt == 0 || HistoryDealGetInteger(dt, DEAL_MAGIC) != InpMagicNumber || HistoryDealGetInteger(dt, DEAL_ENTRY) != DEAL_ENTRY_IN) continue;
      int k = ArraySize(posIds); ArrayResize(posIds, k + 1); ArrayResize(openPrices, k + 1); ArrayResize(openDirs, k + 1);
      posIds[k] = (ulong)HistoryDealGetInteger(dt, DEAL_POSITION_ID); openPrices[k] = HistoryDealGetDouble(dt, DEAL_PRICE); openDirs[k] = (HistoryDealGetInteger(dt, DEAL_TYPE) == DEAL_TYPE_BUY) ? 1 : -1;
   }
   for(int i = 0; i < total; i++) {
      ulong dt = HistoryDealGetTicket(i); if(dt == 0 || HistoryDealGetInteger(dt, DEAL_MAGIC) != InpMagicNumber || HistoryDealGetInteger(dt, DEAL_ENTRY) != DEAL_ENTRY_OUT) continue;
      double net = HistoryDealGetDouble(dt, DEAL_PROFIT) + HistoryDealGetDouble(dt, DEAL_COMMISSION) + HistoryDealGetDouble(dt, DEAL_SWAP);
      s.totalTrades++; if(net > 0) s.wins++; else s.losses++; s.netProfit += net;
      ulong posId = (ulong)HistoryDealGetInteger(dt, DEAL_POSITION_ID); double outPrice = HistoryDealGetDouble(dt, DEAL_PRICE);
      for(int k = 0; k < ArraySize(posIds); k++) if(posIds[k] == posId) { s.totalPips += (outPrice - openPrices[k]) * openDirs[k] / _Point; break; }
   }
   if(s.totalTrades > 0) s.winRate = (double)s.wins / s.totalTrades * 100.0;
   return true;
}
string StatsBlock(TradeStats &s) {
   string m = "━━━━━━━━━━━━━━━\n🏆 Total trades: " + IntegerToString(s.totalTrades) + "\n✅ Wins: " + IntegerToString(s.wins) + " | ❌ Losses: " + IntegerToString(s.losses) + "\n📈 Win Rate: " + DoubleToString(s.winRate, 1) + "%\n📏 Net pips: " + (s.totalPips >= 0 ? "+" : "") + DoubleToString(s.totalPips, 1) + " pips\n";
   if(!InpHideUsdInTelegram) m += "💰 Net P&L: $" + DoubleToString(s.netProfit, 2) + "\n";
   return m + "━━━━━━━━━━━━━━━\n";
}
void SendWeeklyReport() {
   MqlDateTime tm; TimeToStruct(TimeCurrent(), tm); int daysFromMon = tm.day_of_week - 1; if(daysFromMon < 0) daysFromMon = 6;
   datetime monday = DayStart(TimeCurrent() - daysFromMon * 86400), friday = monday + 4 * 86400 + 86399; TradeStats s; if(!CalculateStats(monday, friday, s)) return;
   string msg = "📊 *WEEKLY REPORT*\n\n" + StatsBlock(s) + "\n#WeeklyReport"; if(RouteActive(InpRouteAds)) msg += "\n\n_Want this LIVE during the week? Premium: " + InpPremiumUpgradeLink + "_";
   RoutedText(InpRouteReports, msg);
}
void SendMonthlyReport() {
   MqlDateTime tm; TimeToStruct(TimeCurrent(), tm); datetime first = StringToTime(StringFormat("%04d.%02d.01 00:00", tm.year, tm.mon)); TradeStats s; if(!CalculateStats(first, TimeCurrent() + 86399, s)) return;
   string msg = "📈 *MONTHLY REPORT — " + GetMonthName(tm.mon) + "*\n\n" + StatsBlock(s) + "\n#MonthlyReport"; if(RouteActive(InpRouteAds)) msg += "\n\n_Get the play-by-play LIVE next month — premium: " + InpPremiumUpgradeLink + "_";
   RoutedText(InpRouteReports, msg);
}
void SendAnnualReport() {
   MqlDateTime tm; TimeToStruct(TimeCurrent(), tm); datetime yearStart = StringToTime(StringFormat("%04d.01.01 00:00", tm.year)); TradeStats s; if(!CalculateStats(yearStart, TimeCurrent() + 86399, s)) return;
   string msg = "🎊 *ANNUAL REPORT — " + IntegerToString(tm.year) + "*\n\n" + StatsBlock(s) + "\n🥂 _Thanks for being part of the journey — here's to next year._\n\n#AnnualReport #" + IntegerToString(tm.year);
   if(RouteActive(InpRouteAds)) msg += "\n\n_Premium members watched every trade live: " + InpPremiumUpgradeLink + "_";
   RoutedText(InpRouteReports, msg);
}
void CheckAndSendReports() {
   if(!TelegramOn() || !RouteActive(InpRouteReports)) return; MqlDateTime tm; TimeToStruct(TimeCurrent(), tm); if(tm.hour != InpReportHour) return; datetime today = DayStart(TimeCurrent());
   if(tm.day_of_week == 5 && lastWeeklyReportDate != today) { lastWeeklyReportDate = today; SendWeeklyReport(); }
   MqlDateTime tt; TimeToStruct(TimeCurrent() + 86400, tt);
   if(tt.mon != tm.mon && lastMonthlyReportDate != today) { lastMonthlyReportDate = today; SendMonthlyReport(); }
   if(tm.mon == 12 && tm.day == 31 && lastAnnualReportDate != today) { lastAnnualReportDate = today; SendAnnualReport(); }
}

//+==================================================================+
//|                        LICENCE · INPUT CHECKS                    |
//+==================================================================+
bool CheckAccountNumber() { AccountNumber = AccountInfoInteger(ACCOUNT_LOGIN); return AccountNumber == 510358874; }
bool LicenceCheck() { return TimeCurrent() <= LIC_EXPIRES_START + (LIC_EXPIRES_DAYS * 86400); }
bool CheckInputs() {
   if(InpMagicNumber <= 0) return false;
   if(InpLots <= 0 || InpLots > 100) { Print("❌ Risk % per trade must be between 0 and 100"); return false; }
   if(InpStopLoss < 0 || InpStopLoss > 1000) return false;
   if(InpIntelMinTrust < 0 || InpIntelMinTrust > 100 || InpIntelMinSamples < 0) { Print("❌ Intelligence thresholds out of range"); return false; }
   if(InpFreeAdvertsPerDay < 0 || InpFreeAdvertsPerDay > 12) { Print("❌ Ads per day must be 0–12"); return false; }
   return true;
}

//+==================================================================+
//|                       EXPERT EVENT HANDLERS                      |
//+==================================================================+
int OnInit() {
   if(!CheckAccountNumber()) { Print("❌ JARVIS is licensed to another account (login ", AccountNumber, ")"); return INIT_FAILED; }
   if(!LicenceCheck()) { Print("❌ JARVIS licence expired"); return INIT_FAILED; }
   if(!CheckInputs()) return INIT_PARAMETERS_INCORRECT;
   trade.SetExpertMagicNumber(InpMagicNumber);
   fastEMAHandle = iMA(_Symbol, InpEMATimeframe, InpFastEMAPeriod, 0, MODE_EMA, InpEMAPrice); slowEMAHandle = iMA(_Symbol, InpEMATimeframe, InpSlowEMAPeriod, 0, MODE_EMA, InpEMAPrice);
   htfFastEMAHandle = iMA(_Symbol, InpHTFTimeframe, InpHTFFastEMA, 0, MODE_EMA, PRICE_CLOSE); htfSlowEMAHandle = iMA(_Symbol, InpHTFTimeframe, InpHTFSlowEMA, 0, MODE_EMA, PRICE_CLOSE);
   atrTrailHandle = iATR(_Symbol, PERIOD_CURRENT, InpATRPeriod);
   if(fastEMAHandle == INVALID_HANDLE || slowEMAHandle == INVALID_HANDLE || htfFastEMAHandle == INVALID_HANDLE || htfSlowEMAHandle == INVALID_HANDLE || atrTrailHandle == INVALID_HANDLE) { Print("❌ indicator handles"); return INIT_FAILED; }
   // intelligence features (the strategy never reads these)
   hAtrD1 = iATR(_Symbol, PERIOD_D1, 14); hAtrD1L = iATR(_Symbol, PERIOD_D1, 50); hAtrM15 = iATR(_Symbol, PERIOD_M15, 14); hRsi = iRSI(_Symbol, PERIOD_M15, 14, PRICE_CLOSE);
   hAdx = iADX(_Symbol, PERIOD_M15, 14); hMacd = iMACD(_Symbol, PERIOD_M15, 12, 26, 9, PRICE_CLOSE); hBB = iBands(_Symbol, PERIOD_M15, 20, 0, 2, PRICE_CLOSE);
   if(hAtrD1 == INVALID_HANDLE || hAtrD1L == INVALID_HANDLE || hAtrM15 == INVALID_HANDLE || hRsi == INVALID_HANDLE || hAdx == INVALID_HANDLE || hMacd == INVALID_HANDLE || hBB == INVALID_HANDLE) Print("⚠️ some feature indicators failed — their features will read 0");
   g_mode = IntelMode(); g_strategyHash = IntelStrategyHash();
   MqlDateTime d; TimeToStruct(TimeCurrent(), d);
   g_runId = StringFormat("%s_%s_%04d%02d%02d_%x", g_mode == "backtest" ? "bt" : g_mode, _Symbol, d.year, d.mon, d.day, GetTickCount());
   g_intelFile = "FocusWeek\\JARVIS_" + g_runId + ".jsonl"; g_intelRunLineWritten = false;
   SymbolInfoTick(_Symbol, lastTick);
   if(_UninitReason == REASON_PARAMETERS && CountOpenPositions() == 0 && lastTick.time > 0) CalculateRange();
   ArrayResize(positionStates, 0);
   ParseChatIDs(); FW_OnInit(); K35_OnInit();
   J_Init("https://ismyqqqfmvvlupufcqys.supabase.co/functions/v1/ingest-signal", InpJKey, InpEAName, InpMagicNumber);
   J_Options(true, InpJShots, PERIOD_M15);   // breakout fills → one market signal; no pending-order signals
   if(TelegramOn()) SendWelcomeMessage();
   EventSetTimer(60); g_EAStartTime = TimeCurrent(); BuildTodaysSchedule();
   if(InpSkipJpyNewsDays && !InTester()) { MqlCalendarValue probe[]; int got = CalendarValueHistory(probe, TimeCurrent() - 7 * 86400, TimeCurrent(), NULL, "JPY"); if(got <= 0) Print("⚠️ News skip is ON but the calendar returned no JPY events for the last 7 days — Tools → Options → Server → 'Enable news'"); }
   Print("🧠 ", InpEAName, " · ", g_mode, " · run ", g_runId, " · strategy ", g_strategyHash, " · log Common\\Files\\", g_intelFile, " · intelligence ", EnumToString(InpIntelMode));
   return INIT_SUCCEEDED;
}
void Release(int &h) { if(h != INVALID_HANDLE) IndicatorRelease(h); h = INVALID_HANDLE; }
void OnDeinit(const int reason) {
   K35_OnDeinit(); ClearDashboard(); ObjectsDeleteAll(0, "range "); ObjectsDeleteAll(0, "close time ");
   Release(fastEMAHandle); Release(slowEMAHandle); Release(htfFastEMAHandle); Release(htfSlowEMAHandle); Release(atrTrailHandle);
   Release(hAtrD1); Release(hAtrD1L); Release(hAtrM15); Release(hRsi); Release(hAdx); Release(hMacd); Release(hBB);
   EventKillTimer();
}
void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam) { K35_OnChartEvent(id, sparam); }
void OnTradeTransaction(const MqlTradeTransaction &trans, const MqlTradeRequest &request, const MqlTradeResult &result) { FW_OnTradeTransaction(trans); J_OnTradeTransaction(trans, request, result); }
// Every 60 s, market open or closed: links, scheduled messages, news, close detection, the outcome, the dashboard
void OnTimer() {
   J_OnTimer(); K35_OnTimer(); FW_OnTimer();
   SymbolInfoTick(_Symbol, lastTick); if(lastTick.time == 0) lastTick.time = TimeCurrent();
   BuildTodaysSchedule(); CheckAndSendReports(); SendHourlyHeartbeat(); TriggerFreeAdverts(); TriggerFreeDailyReport();
   TriggerWeeklyNewsPreview(); TriggerDailyNewsBriefing(); CheckNewsReminders(); CheckNewsResults(); NotifySkipDay();
   DetectClosedTrades(); IntelCheckOutcome(); DrawDashboard();
}
void OnTick() {
   SymbolInfoTick(_Symbol, lastTick);
   if(lastTick.time >= range.start_time && lastTick.time < range.end_time) {
      range.f_entry = true;
      if(lastTick.ask > range.high) { range.high = lastTick.ask; UpdateObjects(); }
      if(lastTick.bid < range.low) { range.low = lastTick.bid; UpdateObjects(); }
   }
   if(InpRangeClose >= 0 && range.close_time > 0 && lastTick.time >= range.close_time) { IntelStashDay(); ClosePositions(); }
   IntelCheckOutcome();
   if(((lastTick.time >= range.close_time) || (range.end_time == 0) || (range.end_time != 0 && lastTick.time > range.end_time && !range.f_entry)) && CountOpenPositions() == 0) CalculateRange();
   CreatePendingOrders(); MonitorSignalFills(); EnforceOCO(); HandlePendingLineDeletion();
   UpdateStopLoss(); ManagePartialClose(); MonitorPositionChanges(); DetectClosedTrades();
   UpdateObjects(); DrawDashboard();
}
//+==================================================================+
//|                          END OF FILE                             |
//+==================================================================+
