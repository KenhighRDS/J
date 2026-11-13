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
   double barsRange = 0; int barsCount = 0;                        // names no host EA is likely to use as a global
   for(int i = (int)MathMax(0, inBar - 13); i <= inBar; i++) { barsRange += r[i].high - r[i].low; barsCount++; }
   double testAtr = (barsCount > 0) ? barsRange / barsCount : 0;
   if(testAtr <= 0) testAtr = SymbolInfoDouble(sym, SYMBOL_POINT) * 100;
   int d = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   double sl = NormalizeDouble(p1 - dir * 1.5 * testAtr, d), tp = NormalizeDouble(p1 + dir * 3.0 * testAtr, d);
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
