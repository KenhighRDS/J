"""One New York cash session at a time. Futures trade almost round the clock; the published effects are defined on the
stock-market day, 09:30 to 16:00 New York, so the 1-minute futures bars are cut into those days here.

`minute` is always minutes after New York midnight of the bar's OPEN: the 09:30 bar is 570, the last bar of the day,
15:59, is 959. A price "at 10:00" means the close of the 09:59 bar: the first moment that price is known.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from ..clock import Clock
from ..data import Dataset
from ..types import Bar

OPEN, CLOSE = 570, 960          # 09:30 and 16:00
FULL = CLOSE - OPEN             # 390 minutes


@dataclass(slots=True)
class Day:
    day: date
    bars: list[Bar]                         # 09:30 to 15:59, in order (a minute with no trade has no bar)
    minutes: list[int]                      # the minute of each bar
    night: list[Bar] = field(default_factory=list)       # from the previous 16:00 up to 09:29
    night_minutes: list[int] = field(default_factory=list)   # minute of the day of each night bar (0..1439, New York)
    prev_close: float | None = None         # previous session's last price, same contract; None after a roll or a gap
    rolled: bool = False                    # the contract changed since the previous session
    _at: dict[int, Bar] = field(default_factory=dict)

    @property
    def open(self) -> float:
        return self.bars[0].open

    @property
    def close(self) -> float:
        return self.bars[-1].close

    @property
    def full(self) -> bool:
        """A normal full session (not a holiday half day, not a day with a big hole in it)."""
        return len(self.bars) >= FULL - 20 and self.minutes[0] <= OPEN + 1 and self.minutes[-1] >= CLOSE - 2

    def at(self, minute: int) -> Bar | None:
        return self._at.get(minute)

    def price_at(self, minute: int) -> float | None:
        """The last traded price known at `minute` o'clock: the close of the latest bar that ended by then."""
        best = None
        for m, b in zip(self.minutes, self.bars):
            if m + 1 > minute:
                break
            best = b.close
        return best if best is not None else (self.open if minute <= OPEN else None)

    def next_open(self, minute: int) -> tuple[int, float] | None:
        """Where an order sent at `minute` o'clock can first trade: the open of the first bar at or after it."""
        for m, b in zip(self.minutes, self.bars):
            if m >= minute:
                return m, b.open
        return None


def days(data: Dataset, clock: Clock | None = None) -> list[Day]:
    """Cut a dataset into New York sessions, weekdays only, with each one's night before it."""
    clock = clock or Clock()
    out: list[Day] = []
    rolls = sorted(data.rolls)
    cur: Day | None = None
    night: list[Bar] = []
    night_m: list[int] = []
    last_rth_ts = 0
    for b in data.bars:
        t = clock.at(b.ts)
        if OPEN <= t.minutes < CLOSE and t.weekday < 5:
            if cur is None or cur.day != t.day:
                cur = Day(t.day, [], [], night, night_m)
                prev = out[-1] if out else None
                if prev is not None:
                    cur.rolled = any(last_rth_ts < r <= b.ts for r in rolls)
                    gap_days = (t.day - prev.day).days
                    if not cur.rolled and gap_days <= 5:
                        cur.prev_close = prev.close
                night, night_m = [], []
                out.append(cur)
            cur.bars.append(b)
            cur.minutes.append(t.minutes)
            cur._at[t.minutes] = b
            last_rth_ts = b.ts
        else:
            night.append(b)
            night_m.append(t.minutes)
    return out
