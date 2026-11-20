"""Seven published intraday strategies, each written out as its authors state it (docs/tjr/edge-protocol.md has the
sources). Nothing here was chosen by looking at our data.

Shared conventions, a little harsher than the papers:
- a decision at HH:MM uses the last price known at HH:MM (the close of the bar before it);
- the order fills at the OPEN of the first bar at or after HH:MM, not at the price that made the decision;
- when one bar touches a stop and a target, the stop is taken.
Costs are added later, in score.py.
"""
from __future__ import annotations

import math

from .score import LabTrade
from .sessions import CLOSE, Day

HALF_HOURS = list(range(600, 931, 30))        # 10:00, 10:30, ... 15:30


def tradable(days: list[Day], warmup: int = 14) -> list[Day]:
    """Full New York sessions, after the first `warmup` of them (test 1 needs that history; all tests share the calendar)."""
    return [d for d in days if d.full][warmup:]


def _vwap_until(day: Day, minute: int) -> float | None:
    """Session VWAP known at `minute`: every bar that has closed by then, typical price weighted by volume."""
    pv = v = 0.0
    for m, b in zip(day.minutes, day.bars):
        if m + 1 > minute:
            break
        pv += b.volume * (b.high + b.low + b.close) / 3
        v += b.volume
    return pv / v if v > 0 else None


# ---------------------------------------------------------------- 1. noise-area intraday momentum
def noise_momentum(days: list[Day], lookback: int = 14, vol_target: float = 0.02, max_leverage: float = 4.0) -> list[LabTrade]:
    """Zarattini, Aziz, Barbon (2024). On each half hour: long above the noise area and VWAP, short below both, flat
    otherwise; flat at the close. `size` carries the paper's own sizing: min(4, 2% / daily volatility of the last 14 days)."""
    full = [d for d in days if d.full]
    out: list[LabTrade] = []
    for i, d in enumerate(full):
        if i < lookback or d.prev_close is None:
            continue
        hist = full[i - lookback:i]
        rets = [h.close / h.prev_close - 1 for h in hist if h.prev_close]
        if len(rets) < 3:
            continue
        mean = sum(rets) / len(rets)
        sd = math.sqrt(sum((r - mean) ** 2 for r in rets) / (len(rets) - 1))
        size = min(max_leverage, vol_target / sd) if sd > 0 else 1.0
        pos, entry, entry_m = 0, 0.0, 0
        for m in HALF_HOURS:
            p, vw = d.price_at(m), _vwap_until(d, m)
            moves = [abs(q / h.open - 1) for h in hist if (q := h.price_at(m)) is not None]
            if p is None or vw is None or len(moves) < lookback - 1:
                continue
            sigma = sum(moves) / len(moves)
            upper, lower = max(d.open, d.prev_close) * (1 + sigma), min(d.open, d.prev_close) * (1 - sigma)
            want = 1 if (p > upper and p > vw) else -1 if (p < lower and p < vw) else 0
            if want == pos:
                continue
            fill = d.next_open(m)
            if fill is None:
                break
            if pos != 0:
                out.append(LabTrade(d.day, pos, entry_m, entry, fill[0], fill[1], "signal", size))
            pos, entry_m, entry = want, fill[0], fill[1]
        if pos != 0:
            out.append(LabTrade(d.day, pos, entry_m, entry, CLOSE, d.close, "close", size))
    return out


# ---------------------------------------------------------------- 2. five-minute opening range breakout
def opening_range_breakout(days: list[Day], target_r: float = 10.0, risk: float = 0.01, max_leverage: float = 4.0, warmup: int = 14) -> list[LabTrade]:
    """Zarattini & Aziz (2023). Direction of the first 5-minute candle; stop at its far end; target 10R; else the close."""
    out: list[LabTrade] = []
    for d in tradable(days, warmup):
        first = [d.at(m) for m in range(570, 575)]
        if any(b is None for b in first):
            continue
        o, c = first[0].open, first[-1].close            # type: ignore[union-attr]
        if c == o:
            continue                                     # a doji: the paper takes no trade
        side = 1 if c > o else -1
        fill = d.next_open(575)
        if fill is None:
            continue
        entry_m, entry = fill
        stop = min(b.low for b in first) if side > 0 else max(b.high for b in first)   # type: ignore[union-attr]
        r = (entry - stop) * side
        if r <= 0:
            continue                                     # opened beyond its own stop: nothing to trade
        target = entry + side * target_r * r
        size = min(max_leverage, risk / (r / entry))
        done = False
        for m, b in zip(d.minutes, d.bars):
            if m < entry_m:
                continue
            adverse, favourable = (b.low, b.high) if side > 0 else (b.high, b.low)
            if (stop - adverse) * side >= 0:
                px = min(stop, b.open) if side > 0 else max(stop, b.open)
                out.append(LabTrade(d.day, side, entry_m, entry, m, px, "stop", size))
                done = True
                break
            if (favourable - target) * side >= 0:
                out.append(LabTrade(d.day, side, entry_m, entry, m, target, "target", size))
                done = True
                break
        if not done:
            out.append(LabTrade(d.day, side, entry_m, entry, CLOSE, d.close, "close", size))
    return out


# ---------------------------------------------------------------- 3. VWAP trend
def vwap_trend(days: list[Day], warmup: int = 14) -> list[LabTrade]:
    """Zarattini & Aziz (2023). Always in after 09:31: long while 1-minute closes are above the session VWAP, short
    while below, reversing on each close across it; flat at the close."""
    out: list[LabTrade] = []
    for d in tradable(days, warmup):
        pv = v = 0.0
        pos, entry, entry_m = 0, 0.0, 0
        last = len(d.bars) - 1
        for k, (m, b) in enumerate(zip(d.minutes, d.bars)):
            pv += b.volume * (b.high + b.low + b.close) / 3
            v += b.volume
            if k == last or v <= 0:
                continue
            vw = pv / v
            want = 1 if b.close > vw else -1 if b.close < vw else pos
            if want == pos or want == 0:
                continue
            nm, px = d.minutes[k + 1], d.bars[k + 1].open
            if pos != 0:
                out.append(LabTrade(d.day, pos, entry_m, entry, nm, px, "cross"))
            pos, entry_m, entry = want, nm, px
        if pos != 0:
            out.append(LabTrade(d.day, pos, entry_m, entry, CLOSE, d.close, "close"))
    return out


# ---------------------------------------------------------------- 4, 5, 6. the last half hour
def last_half_hour(days: list[Day], signal_minute: int, min_move: float = 0.0, warmup: int = 14) -> list[LabTrade]:
    """Trade 15:30 to 16:00 in the direction of the return from yesterday's close to `signal_minute`.
    signal_minute = 600: Gao, Han, Li, Zhou (2018), the first half hour.
    signal_minute = 930: Baltussen, Da, Lammers, Martens (2021), the rest of the day; `min_move` keeps only big days."""
    out: list[LabTrade] = []
    for d in tradable(days, warmup):
        p = d.price_at(signal_minute)
        if d.prev_close is None or p is None:
            continue
        r = p / d.prev_close - 1
        if r == 0 or abs(r) < min_move:
            continue
        fill = d.next_open(930)
        if fill is None:
            continue
        out.append(LabTrade(d.day, 1 if r > 0 else -1, fill[0], fill[1], CLOSE, d.close, "close"))
    return out


# ---------------------------------------------------------------- 7. overnight drift
def overnight_drift(days: list[Day], start: int = 120, end: int = 180, warmup: int = 14) -> list[LabTrade]:
    """Boyarchenko, Larsen, Whelan (2023). Long from 02:00 to 03:00 New York, in the night before each session."""
    out: list[LabTrade] = []
    for d in tradable(days, warmup):
        window = [(m, b) for m, b in zip(d.night_minutes, d.night) if start <= m < end]
        if len(window) < (end - start) // 2:
            continue                                     # a night with half the hour missing is not that trade
        out.append(LabTrade(d.day, 1, window[0][0], window[0][1].open, window[-1][0] + 1, window[-1][1].close, "time"))
    return out


#: the seven tests of the protocol: name, the market its paper was written on, and how to run it
TESTS = [
    ("1 Noise-area momentum", "ES", lambda ds: noise_momentum(ds), True),
    ("2 Opening range breakout", "NQ", lambda ds: opening_range_breakout(ds), True),
    ("3 VWAP trend", "NQ", lambda ds: vwap_trend(ds), False),
    ("4 First half hour", "ES", lambda ds: last_half_hour(ds, 600), False),
    ("5 Rest of day", "ES", lambda ds: last_half_hour(ds, 930), False),
    ("6 Rest of day, big days", "ES", lambda ds: last_half_hour(ds, 930, 0.01), False),
    ("7 Overnight drift", "ES", lambda ds: overnight_drift(ds), False),
]
