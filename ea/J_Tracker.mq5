//+------------------------------------------------------------------+
//| J_Tracker.mq5 — read-only tracker for J subscribers              |
//| Attach to any chart. Works with the investor password. Never     |
//| trades. Sends a heartbeat (balance) every 60 s and every position |
//| open / modify / close so J knows which signals you took.         |
//+------------------------------------------------------------------+
#property copyright "J"
#property version   "1.00"
#property strict

input string InpJUrl = "https://<ref>.supabase.co/functions/v1/tracker-report";   // J tracker URL (from the app)
input string InpJKey = "";                                                          // Pairing key from J → Settings → Connect MT5 tracker

string   T_queueFile = "J_tracker_queue.txt";
datetime T_lastRetry = 0;

string T_Iso(datetime t) { string s = TimeToString(t, TIME_DATE | TIME_SECONDS); StringReplace(s, ".", "-"); StringReplace(s, " ", "T"); return s + "Z"; }
string T_Str(string v) { StringReplace(v, "\\", "\\\\"); StringReplace(v, "\"", "\\\""); return "\"" + v + "\""; }
string T_Num(double v, int d) { return DoubleToString(v, d); }

bool T_Post(string json, bool fromQueue)
  {
   if(MQLInfoInteger(MQL_TESTER)) { Print("J tracker (tester, not sent): ", json); return true; }
   if(InpJKey == "") { Print("J tracker: InpJKey is empty"); return true; }
   char data[]; char result[]; string rh;
   int len = StringToCharArray(json, data, 0, WHOLE_ARRAY, CP_UTF8);
   if(len > 0) ArrayResize(data, len - 1);
   string headers = "Content-Type: application/json\r\nX-J-Tracker-Key: " + InpJKey + "\r\n";
   ResetLastError();
   int code = WebRequest("POST", InpJUrl, headers, 3000, data, result, rh);
   if(code == 200 || code == 201) return true;
   int err = GetLastError();
   if(code == -1 && err == 4014) Print("J tracker: add this URL under Tools -> Options -> Expert Advisors -> Allow WebRequest: ", InpJUrl);
   else if(code >= 400 && code < 500) { Print("J tracker: rejected (", code, "): ", CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8)); return true; }
   else Print("J tracker: send failed (", code, "/", err, ")", fromQueue ? "" : " — queued");
   return false;
  }
void T_Queue(string json)
  {
   int h = FileOpen(T_queueFile, FILE_READ | FILE_WRITE | FILE_TXT | FILE_ANSI | FILE_SHARE_READ | FILE_SHARE_WRITE);
   if(h == INVALID_HANDLE) return;
   FileSeek(h, 0, SEEK_END); FileWriteString(h, json + "\n"); FileClose(h);
  }
void T_Send(string json) { if(!T_Post(json, false)) T_Queue(json); }
void T_Retry()
  {
   if(TimeCurrent() - T_lastRetry < 5) return;
   T_lastRetry = TimeCurrent();
   if(!FileIsExist(T_queueFile)) return;
   int h = FileOpen(T_queueFile, FILE_READ | FILE_TXT | FILE_ANSI | FILE_SHARE_READ | FILE_SHARE_WRITE);
   if(h == INVALID_HANDLE) return;
   string lines[]; int n = 0;
   while(!FileIsEnding(h)) { string l = FileReadString(h); if(StringLen(l) > 2) { ArrayResize(lines, n + 1); lines[n++] = l; } }
   FileClose(h);
   int sent = 0;
   for(int i = 0; i < n; i++) { if(!T_Post(lines[i], true)) break; sent++; }
   if(sent == 0) return;
   FileDelete(T_queueFile);
   if(sent < n) { int w = FileOpen(T_queueFile, FILE_WRITE | FILE_TXT | FILE_ANSI); if(w != INVALID_HANDLE) { for(int i = sent; i < n; i++) FileWriteString(w, lines[i] + "\n"); FileClose(w); } }
  }

string T_Base(string type)
  {
   return "{\"type\":" + T_Str(type) + ",\"account_login\":" + T_Str(IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)))
        + ",\"server\":" + T_Str(AccountInfoString(ACCOUNT_SERVER)) + ",\"sent_at\":" + T_Str(T_Iso(TimeGMT()));
  }
void T_Heartbeat()
  {
   T_Send(T_Base("heartbeat") + ",\"balance\":" + T_Num(AccountInfoDouble(ACCOUNT_BALANCE), 2) + ",\"currency\":" + T_Str(AccountInfoString(ACCOUNT_CURRENCY)) + "}");
  }
void T_Position(string ev, long ticket, string sym, string type, double vol, double openP, datetime openT, double sl, double tp, double closeP, datetime closeT, double profit)
  {
   int d = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   string j = T_Base("position") + ",\"event\":" + T_Str(ev) + ",\"ticket\":" + IntegerToString(ticket) + ",\"symbol\":" + T_Str(sym) + ",\"position_type\":" + T_Str(type)
            + ",\"volume\":" + T_Num(vol, 2) + ",\"open_price\":" + T_Num(openP, d) + ",\"open_time\":" + T_Str(T_Iso(openT))
            + ",\"sl\":" + T_Num(sl, d) + ",\"tp\":" + T_Num(tp, d);
   if(closeT > 0) j += ",\"close_price\":" + T_Num(closeP, d) + ",\"close_time\":" + T_Str(T_Iso(closeT)) + ",\"profit\":" + T_Num(profit, 2);
   T_Send(j + "}");
  }

int OnInit()
  {
   EventSetTimer(60);
   T_Heartbeat();
   // report positions already open so a restart does not lose them
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong tk = PositionGetTicket(i);
      if(!PositionSelectByTicket(tk)) continue;
      T_Position("open", (long)PositionGetInteger(POSITION_IDENTIFIER), PositionGetString(POSITION_SYMBOL),
                 PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY ? "buy" : "sell", PositionGetDouble(POSITION_VOLUME),
                 PositionGetDouble(POSITION_PRICE_OPEN), (datetime)PositionGetInteger(POSITION_TIME), PositionGetDouble(POSITION_SL), PositionGetDouble(POSITION_TP), 0, 0, 0);
     }
   return INIT_SUCCEEDED;
  }
void OnDeinit(const int reason) { EventKillTimer(); }
void OnTick() {}
void OnTimer() { T_Heartbeat(); T_Retry(); }

void OnTradeTransaction(const MqlTradeTransaction &trans, const MqlTradeRequest &request, const MqlTradeResult &result)
  {
   if(trans.type == TRADE_TRANSACTION_POSITION)
     {
      if(!PositionSelectByTicket(trans.position)) return;
      T_Position("modify", (long)PositionGetInteger(POSITION_IDENTIFIER), PositionGetString(POSITION_SYMBOL),
                 PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY ? "buy" : "sell", PositionGetDouble(POSITION_VOLUME),
                 PositionGetDouble(POSITION_PRICE_OPEN), (datetime)PositionGetInteger(POSITION_TIME), PositionGetDouble(POSITION_SL), PositionGetDouble(POSITION_TP), 0, 0, 0);
      return;
     }
   if(trans.type != TRADE_TRANSACTION_DEAL_ADD) return;
   if(!HistoryDealSelect(trans.deal)) return;
   ENUM_DEAL_ENTRY entry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(trans.deal, DEAL_ENTRY);
   long posId = HistoryDealGetInteger(trans.deal, DEAL_POSITION_ID);
   string sym = HistoryDealGetString(trans.deal, DEAL_SYMBOL);
   double price = HistoryDealGetDouble(trans.deal, DEAL_PRICE);
   datetime t = (datetime)HistoryDealGetInteger(trans.deal, DEAL_TIME);
   if(entry == DEAL_ENTRY_IN)
     {
      double sl = 0, tp = 0, vol = HistoryDealGetDouble(trans.deal, DEAL_VOLUME);
      if(PositionSelectByTicket(posId)) { sl = PositionGetDouble(POSITION_SL); tp = PositionGetDouble(POSITION_TP); vol = PositionGetDouble(POSITION_VOLUME); }
      T_Position("open", posId, sym, HistoryDealGetInteger(trans.deal, DEAL_TYPE) == DEAL_TYPE_BUY ? "buy" : "sell", vol, price, t, sl, tp, 0, 0, 0);
     }
   else if(entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_OUT_BY)
     {
      bool stillOpen = PositionSelectByTicket(posId) && PositionGetDouble(POSITION_VOLUME) > 0;
      if(stillOpen)
        {
         T_Position("modify", posId, sym, PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY ? "buy" : "sell", PositionGetDouble(POSITION_VOLUME),
                    PositionGetDouble(POSITION_PRICE_OPEN), (datetime)PositionGetInteger(POSITION_TIME), PositionGetDouble(POSITION_SL), PositionGetDouble(POSITION_TP), 0, 0, 0);
         return;
        }
      // closed: open details from history
      double openP = 0; datetime openT = 0; string type = HistoryDealGetInteger(trans.deal, DEAL_TYPE) == DEAL_TYPE_BUY ? "sell" : "buy";
      if(HistorySelectByPosition(posId))
        {
         for(int i = 0; i < HistoryDealsTotal(); i++)
           {
            ulong dk = HistoryDealGetTicket(i);
            if(HistoryDealGetInteger(dk, DEAL_ENTRY) == DEAL_ENTRY_IN) { openP = HistoryDealGetDouble(dk, DEAL_PRICE); openT = (datetime)HistoryDealGetInteger(dk, DEAL_TIME); break; }
           }
        }
      T_Position("close", posId, sym, type, HistoryDealGetDouble(trans.deal, DEAL_VOLUME), openP, openT, 0, 0, price, t, HistoryDealGetDouble(trans.deal, DEAL_PROFIT));
     }
  }
