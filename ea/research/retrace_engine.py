# Replays RetraceEA v3 (XAUUSD) on M1 bars in broker server time. Results in R (1 R = the 0.5% stop), costs included.
import numpy as np
import os
D = os.environ.get("XAU_NPZ", "data/m1_server.npz")   # written by load_xauusd.py
z = np.load(D); T = z["time"]; O, H, L, C = z["o"], z["h"], z["l"], z["c"]
DAY = T // 1440; MIN = T % 1440
# server days
dstart = np.flatnonzero(np.r_[True, DAY[1:] != DAY[:-1]]); dend = np.r_[dstart[1:], len(T)]
dday = DAY[dstart]; dopen = O[dstart]; dclose = C[dend - 1]
dow = ((dday + 4) % 7)              # 1970-01-01 was a Thursday → 0=Sun..6=Sat with this offset
# H1 ATR (simple average of true range, like MT5 iATR), indexed by hour number
HR = T // 60
hs = np.flatnonzero(np.r_[True, HR[1:] != HR[:-1]]); he = np.r_[hs[1:], len(T)]
hnum = HR[hs]; hh = np.maximum.reduceat(H, hs); hl = np.minimum.reduceat(L, hs); hc = C[he - 1]
def sma(x, n):
    c = np.cumsum(np.r_[0.0, x]); out = np.full(len(x), np.nan); out[n - 1:] = (c[n:] - c[:-n]) / n; return out
tr = np.maximum(hh - hl, np.maximum(np.abs(hh - np.r_[hc[0], hc[:-1]]), np.abs(hl - np.r_[hc[0], hc[:-1]])))
hour_pos = {int(h): k for k, h in enumerate(hnum)}
def atr_series(n):
    a = sma(tr, n); return a
ATR_CACHE = {}
def atr_for_bars(n, tf=60):
    key = (n, tf)
    if key in ATR_CACHE: return ATR_CACHE[key]
    B = T // tf
    bs = np.flatnonzero(np.r_[True, B[1:] != B[:-1]]); be = np.r_[bs[1:], len(T)]
    bnum = B[bs]; bh = np.maximum.reduceat(H, bs); bl = np.minimum.reduceat(L, bs); bc = C[be - 1]
    pc = np.r_[bc[0], bc[:-1]]
    trr = np.maximum(bh - bl, np.maximum(np.abs(bh - pc), np.abs(bl - pc)))
    a = sma(trr, n)
    idx = np.searchsorted(bnum, B, side="left") - 1           # last CLOSED bar of that timeframe
    res = np.where(idx >= 0, a[np.clip(idx, 0, len(a) - 1)], np.nan)
    ATR_CACHE[key] = res; return res

def run(ret=0.5, slp=0.5, trail=True, mult=2.0, start=1.0, step=0.25, atr_n=14, atr_tf=60, level=False, close_h=22, fri_h=21, no_entry=60,
        max_trades=1, cooldown=60, ma=100, entry_until=None, longs_only=False, shorts_only=False, spread=0.30, comm=0.07, tp_r=None, entry_from=0, years=None, be_r=None, bias_mode="ma"):
    atr = atr_for_bars(atr_n, atr_tf)
    mav = sma(dclose, ma)
    trades = []
    for d in range(ma + 1, len(dstart)):
        if dow[d] in (0, 6): continue
        prev = d - 1
        if np.isnan(mav[prev]): continue
        if bias_mode == "ma": bias = 1 if dclose[prev] > mav[prev] else (-1 if dclose[prev] < mav[prev] else 0)
        if bias == 0: continue
        if longs_only and bias < 0: continue
        if shorts_only and bias > 0: continue
        s, e = dstart[d], dend[d]
        o0 = dopen[d]
        ch = fri_h if dow[d] == 5 else close_h
        close_min = ch * 60
        thL = o0 * (1 - ret / 100); thS = o0 * (1 + ret / 100)
        armed = True; n_tr = 0; i = s; last_exit_min = -10**9
        while i < e and n_tr < max_trades:
            # find the trigger bar: inside the entry window, after cooldown
            lim = close_min - no_entry if entry_until is None else min(close_min - no_entry, entry_until * 60)
            win_end = s + np.searchsorted(MIN[s:e], lim)
            if i >= win_end: break
            seg = slice(i, win_end)
            if bias > 0:
                if not armed:
                    rearm = np.flatnonzero(H[seg] > thL)
                    if len(rearm) == 0: break
                    i = i + rearm[0]; armed = True; continue
                hit = np.flatnonzero((L[seg] <= thL) & (MIN[seg] >= max(entry_from, 0)) & (MIN[seg] >= last_exit_min + cooldown))
            else:
                if not armed:
                    rearm = np.flatnonzero(L[seg] < thS)
                    if len(rearm) == 0: break
                    i = i + rearm[0]; armed = True; continue
                hit = np.flatnonzero((H[seg] >= thS) & (MIN[seg] >= max(entry_from, 0)) & (MIN[seg] >= last_exit_min + cooldown))
            if len(hit) == 0: break
            j = i + hit[0]
            if bias > 0:
                fill = O[j] if O[j] <= thL else thL; entry = fill + spread; sl = entry * (1 - slp / 100)
            else:
                fill = O[j] if O[j] >= thS else thS; entry = fill; sl = entry * (1 + slp / 100)
            risk = entry * slp / 100
            tp = (entry + bias * tp_r * risk) if tp_r else None
            exit_p = None; reason = ""; k = j; moved_be = False
            while k < e:
                if MIN[k] >= close_min:
                    exit_p = O[k] if bias > 0 else O[k] + spread; reason = "eod"; break
                if bias > 0:
                    if L[k] <= sl: exit_p = sl; reason = "sl"; break
                    if tp and H[k] >= tp: exit_p = tp; reason = "tp"; break
                    px = C[k]
                else:
                    if H[k] + spread >= sl: exit_p = sl; reason = "sl"; break
                    if tp and L[k] + spread <= tp: exit_p = tp; reason = "tp"; break
                    px = C[k] + spread
                if be_r and not moved_be and (px - entry) * bias >= be_r * risk:
                    sl = entry if bias > 0 else entry; moved_be = True
                a = atr[k]
                if trail and a > 0:
                    if (px - entry) * bias >= start * a:
                        nsl = px - bias * mult * a
                        if bias > 0 and nsl >= sl + step * a: sl = nsl
                        if bias < 0 and nsl <= sl - step * a: sl = nsl
                k += 1
            if exit_p is None: exit_p = C[e - 1] if bias > 0 else C[e - 1] + spread; reason = "eod"; k = e - 1
            r = ((exit_p - entry) * bias - comm) / risk
            yr = 1970 + int(dday[d] // 365.2425)
            trades.append((int(dday[d]), bias, r, reason, int(MIN[j]), int(MIN[k])))
            n_tr += 1; armed = level; last_exit_min = int(MIN[k]); i = k + 1
    return trades

def year_of(day):
    return int(np.datetime64(int(day), "D").astype("datetime64[Y]").astype(int) + 1970)

def stats(trades, label="", years=None, show_years=False):
    if years: trades = [t for t in trades if year_of(t[0]) in years]
    r = np.array([t[2] for t in trades]) if trades else np.zeros(0)
    if len(r) == 0: print(f"{label:38s} no trades"); return {}
    eq = np.cumsum(r); dd = np.max(np.maximum.accumulate(eq) - eq)
    pf = r[r > 0].sum() / max(1e-9, -r[r < 0].sum())
    out = dict(n=len(r), total=r.sum(), avg=r.mean(), win=(r > 0).mean() * 100, pf=pf, dd=dd)
    line = f"{label:38s} n={len(r):4d} totR={r.sum():7.1f} avgR={r.mean():6.3f} win={out['win']:5.1f}% PF={pf:4.2f} maxDD={dd:5.1f}R"
    if show_years:
        ys = {}
        for t in trades: ys.setdefault(year_of(t[0]), []).append(t[2])
        line += " | " + " ".join(f"{y % 100:02d}:{sum(v):+.0f}" for y, v in sorted(ys.items()))
    print(line); return out
