//+------------------------------------------------------------------+
//| J_Signal.mqh — sends an EA's trades to J (https://j-signals)      |
//| Include once, call J_Init / J_OnTradeTransaction / J_OnTimer.     |
//| Filters by magic number; never blocks trading; queues on failure. |
//| SL/TP of 0 (MT5's "none") is sent as null. Trailing-stop moves are |
//| merged: at most one update per position every J_updateEverySec,   |
//| the latest value always delivered; repeats that change nothing are |
//| dropped. Call J_OnTimer from OnTimer so held updates go out.       |
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
int      J_updateEverySec = 300;   // SL/TP updates of one position: at most one per 5 min (breakeven moves go at once)

// Last levels sent per signal (uid) and updates held back by the rate limit (latest value wins)
string   J_sUid[];  double J_sOpen[]; double J_sSl[]; double J_sTp[]; datetime J_sAt[];
string   J_pUid[];  string J_pSym[];  double J_pOpen[]; double J_pSl[]; double J_pTp[]; datetime J_pDue[];

//--- helpers ---------------------------------------------------------
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

void J_FlushHeld();
void J_QueueUpdate(string uid, string sym, double open, double sl, double tp, bool isPosition);
void J_Remember(string uid, double open, double sl, double tp);
void J_Forget(string uid);
void J_SendUpdate(string uid, string sym, double entry, double sl, double tp, bool be);

//--- transport -------------------------------------------------------
// Returns true when the server accepted the payload. 4xx (bad key / bad payload) is logged and dropped,
// everything else (timeouts, 5xx, no network) goes to the queue for OnTimer.
bool J_Post(string json, bool fromQueue)
  {
   if(MQLInfoInteger(MQL_TESTER)) { Print("J (tester, not sent): ", json); return true; }
   if(J_url == "" || J_key == "") { Print("J: not initialised (url/key missing)"); return true; }
   char data[]; char result[]; string resultHeaders;
   int len = StringToCharArray(json, data, 0, WHOLE_ARRAY, CP_UTF8);
   if(len > 0) ArrayResize(data, len - 1);   // drop the terminating zero
   string headers = "Content-Type: application/json\r\nX-J-Key: " + J_key + "\r\n";
   ResetLastError();
   int code = WebRequest("POST", J_url, headers, 3000, data, result, resultHeaders);
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

// Retries queued payloads in order; stops at the first failure so order is preserved.
void J_OnTimer()
  {
   if(!J_ready) return;
   J_FlushHeld();                                   // trailing-stop updates held back by the rate limit
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
   string safe = eaName; StringReplace(safe, " ", "_"); StringReplace(safe, "/", "_");
   J_queueFile = "J_queue_" + safe + "_" + IntegerToString(magic) + ".txt";
   J_ready = true;
   if(key == "") Print("J: InpJKey is empty — signals will not be sent");
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
   //--- pending order placed
   if(trans.type == TRADE_TRANSACTION_ORDER_ADD)
     {
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
      string uid = IntegerToString(posId);
      if(entry == DEAL_ENTRY_IN)
        {
         bool fromPending = false;
         if(HistoryOrderSelect(orderTicket)) fromPending = J_IsPending((ENUM_ORDER_TYPE)HistoryOrderGetInteger(orderTicket, ORDER_TYPE));
         if(fromPending)
           {
            J_SendTriggered(uid, sym, price);
            if(PositionSelectByTicket(posId)) J_Remember(uid, PositionGetDouble(POSITION_PRICE_OPEN), PositionGetDouble(POSITION_SL), PositionGetDouble(POSITION_TP));
            return;
           }
         double sl = 0, tp = 0;
         if(PositionSelectByTicket(posId)) { sl = PositionGetDouble(POSITION_SL); tp = PositionGetDouble(POSITION_TP); }
         ENUM_DEAL_TYPE dt = (ENUM_DEAL_TYPE)HistoryDealGetInteger(trans.deal, DEAL_TYPE);
         J_SendOpen(uid, sym, dt == DEAL_TYPE_BUY ? "buy" : "sell", "market", price, sl, tp, vol, 0);
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
         return;
        }
     }
  }
#endif
