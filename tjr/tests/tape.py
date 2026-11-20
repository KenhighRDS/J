"""Hand-drawn 1-minute tapes for the tests. These are NOT market data and are never used for a result: they exist so
each rule can be checked against a situation whose right answer is known by construction."""
from __future__ import annotations

import random
from datetime import date, timedelta

from jtjr.clock import to_ts
from jtjr.types import Bar

Q = 0.25


def q(x: float) -> float:
    return round(round(x / Q) * Q, 2)


class Tape:
    def __init__(self) -> None:
        self.bars: dict[int, Bar] = {}

    def flat(self, day: date, start: str, end: str, price: float, half: float = 0.5) -> "Tape":
        """Quiet minutes from `start` to `end` (New York time; `end` may be on the next morning)."""
        a, b = _hm(start), _hm(end)
        t0, t1 = to_ts(day, a), to_ts(day + timedelta(days=1) if b <= a else day, b)
        for ts in range(t0, t1, 60):
            self.bars[ts] = Bar(ts, price, price + half, price - half, price)
        return self

    def bar1(self, day: date, at: str, o: float, h: float, l: float, c: float) -> "Tape":
        ts = to_ts(day, _hm(at))
        self.bars[ts] = Bar(ts, o, h, l, c)
        return self

    def bar5(self, day: date, at: str, o: float, h: float, l: float, c: float) -> "Tape":
        """Five 1-minute bars that add up to exactly this 5-minute candle."""
        ts = to_ts(day, _hm(at))
        mid = q((h + l) / 2)
        path = [o, l, mid, h, c, c] if c >= o else [o, h, mid, l, c, c]
        for i in range(5):
            a, b = path[i], path[i + 1]
            self.bars[ts + i * 60] = Bar(ts + i * 60, a, max(a, b), min(a, b), b)
        return self

    def mirror(self, around: float) -> "Tape":
        """The same tape upside down: every long situation becomes the matching short one."""
        t = Tape()
        for ts, b in self.bars.items():
            t.bars[ts] = Bar(ts, 2 * around - b.open, 2 * around - b.low, 2 * around - b.high, 2 * around - b.close)
        return t

    def list(self) -> list[Bar]:
        return [self.bars[ts] for ts in sorted(self.bars)]


def _hm(text: str) -> int:
    h, m = text.split(":")
    return int(h) * 60 + int(m)


D0 = date(2026, 3, 3)      # a Tuesday
D1 = date(2026, 3, 4)      # the Wednesday the scenario trades on


def sweep_long(base: float = 20000.0, gap: bool = True) -> Tape:
    """Tuesday leaves a high 100 above. Overnight, Asia puts in a low 12 under the base and London one 8 under. After
    the New York open price dips through both, closes back above (the sweep), breaks the swing high made at the open
    (BOS), pulls back to a higher low and closes above that candle (the trigger). Then it runs to Tuesday's high.
    With gap=False the down-leg leaves no fair value gap, so there is nothing to inverse."""
    t = Tape()
    b = base
    t.flat(D0 - timedelta(days=1), "18:00", "17:00", b)                       # Tuesday's trading day
    t.bar5(D0, "10:00", b, b + 100, b - 1, b + 2)                            # Tuesday's high
    t.bar5(D0, "14:00", b, b + 1, b - 100, b - 2)                            # Tuesday's low
    t.flat(D0, "18:00", "09:30", b)                                           # Wednesday overnight
    t.bar5(D0, "20:00", b, b + 0.5, b - 12, b - 1)                           # Asia low = overnight low
    t.bar5(D1, "04:00", b, b + 0.5, b - 8, b - 1)                            # London low, above it
    t.bar5(D1, "09:30", b, b + 5, b - 6, b - 5)                              # swing high at the open
    t.bar5(D1, "09:35", b - 5, b, b - 10, b - 9)                             # through the London low, no reclaim
    t.bar5(D1, "09:40", b - 9, b - (7 if gap else 5), b - 20, b - 11)        # through the Asia low, closes back above it: SWEEP
    t.bar5(D1, "09:45", b - 11, b - 1, b - 14, b - 2)                        # back above the London low too
    t.bar5(D1, "09:50", b - 2, b + 12, b - 4, b + 10)                        # closes above the swing high: BOS
    t.bar5(D1, "09:55", b + 10, b + 13, b + 1, b + 3)                        # pullback
    t.bar5(D1, "10:00", b + 3, b + 9, b - 1, b + 7)                          # higher low (the continuation candle)
    t.bar5(D1, "10:05", b + 7, b + 16, b + 4, b + 14)                        # closes above it: TRIGGER
    t.bar5(D1, "10:10", b + 14, b + 40, b + 12, b + 38)
    t.bar5(D1, "10:15", b + 38, b + 70, b + 36, b + 68)
    t.bar5(D1, "10:20", b + 68, b + 104, b + 66, b + 102)                    # through Tuesday's high: target
    t.flat(D1, "10:25", "17:00", b + 102)
    return t


def other_index(base: float = 5000.0, takes_low: bool = False) -> Tape:
    """The second index over the same two days. Its overnight (Asia) low is 3 under its base; in the New York dip it
    either holds above its lows (a divergence) or takes them out as well."""
    t = Tape()
    b = base
    t.flat(D0 - timedelta(days=1), "18:00", "17:00", b)
    t.bar5(D0, "10:00", b, b + 25, b - 0.5, b + 0.5)
    t.bar5(D0, "14:00", b, b + 0.5, b - 25, b - 0.5)
    t.flat(D0, "18:00", "09:30", b)
    t.bar5(D0, "20:00", b, b + 0.5, b - 3, b - 0.5)
    t.bar5(D1, "04:00", b, b + 0.5, b - 2, b - 0.5)
    t.bar5(D1, "09:30", b, b + 1, b - 1.5, b - 1)
    t.bar5(D1, "09:35", b - 1, b - 0.5, b - 1.75, b - 1.5)
    t.bar5(D1, "09:40", b - 1.5, b - 1, b - (4 if takes_low else 1.75), b - 1.25)
    t.flat(D1, "09:45", "17:00", b)
    return t


def random_walk(days: int = 8, seed: int = 3, base: float = 20000.0, first: date = date(2026, 3, 1)) -> list[Bar]:
    """A noisy walk with bursts, long enough to make levels and sweeps. Only for the no-look-ahead check."""
    rng = random.Random(seed)
    out: list[Bar] = []
    price = base
    day = first                                                               # an evening open (1 March 2026 is a Sunday)
    for _ in range(days):
        if day.weekday() in (4, 5):                                           # Friday and Saturday evenings: closed
            day += timedelta(days=1)
            continue
        t0, t1 = to_ts(day, 18 * 60), to_ts(day + timedelta(days=1), 17 * 60)
        for ts in range(t0, t1, 60):
            vol = 6.0 if rng.random() < 0.04 else 1.6
            o = price
            c = q(o + rng.gauss(0, vol))
            h = q(max(o, c) + abs(rng.gauss(0, vol * 0.6)))
            l = q(min(o, c) - abs(rng.gauss(0, vol * 0.6)))
            out.append(Bar(ts, o, h, l, c))
            price = c
        day += timedelta(days=1)
    return out


def mixed(days: int = 12, seed: int = 3) -> list[Bar]:
    """The drawn long setup (which does produce a signal) followed by a random walk (which produces many sweeps and
    dead setups): something of everything for the no-look-ahead check."""
    return sweep_long().list() + random_walk(days=days, seed=seed, base=20102.0, first=D1)
