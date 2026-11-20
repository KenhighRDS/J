"""Market time. Everything is decided on the New York clock (America/New_York), daylight saving included, because the
sessions of this strategy are New York times. Stored times stay UTC.

CME Globex equity-index futures trade Sunday 18:00 to Friday 17:00 New York time with a daily break 17:00-18:00. The
"trading day" therefore starts at 18:00 the evening before: Monday's trading day opens Sunday 18:00.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

NY = ZoneInfo("America/New_York")
DAY_OPEN = 18 * 60       # minutes after New York midnight
DAY_CLOSE = 17 * 60


def hm(text: str) -> int:
    """'09:30' -> minutes after midnight."""
    h, m = text.split(":")
    return int(h) * 60 + int(m)


@dataclass(frozen=True, slots=True)
class Tick:
    """One instant, on the New York clock."""
    ts: int
    minutes: int         # minutes after New York midnight
    day: date            # New York calendar date
    trading_day: date    # the CME trading day this instant belongs to
    weekday: int         # Monday = 0, of the New York calendar date
    offset: int          # seconds east of UTC (negative in New York)


class Clock:
    """Converts epoch seconds to New York time, remembering the UTC offset hour by hour (the conversion is the slow
    part of a backtest, and the offset only changes twice a year, at a whole hour)."""

    def __init__(self) -> None:
        self._offsets: dict[int, int] = {}

    def at(self, ts: int) -> Tick:
        hour = ts // 3600
        off = self._offsets.get(hour)
        if off is None:
            off = int(datetime.fromtimestamp(hour * 3600, NY).utcoffset().total_seconds())  # type: ignore[union-attr]
            self._offsets[hour] = off
        local = ts + off
        days, rest = divmod(local, 86400)
        minutes = rest // 60
        day = date(1970, 1, 1) + timedelta(days=days)
        trading = day + timedelta(days=1) if minutes >= DAY_OPEN else day
        return Tick(ts, minutes, day, trading, day.weekday(), off)


def to_ts(day: date, minutes: int) -> int:
    """New York wall time -> epoch seconds."""
    naive = datetime(day.year, day.month, day.day) + timedelta(minutes=minutes)
    return int(naive.replace(tzinfo=NY).timestamp())


def ny(ts: int) -> datetime:
    return datetime.fromtimestamp(ts, NY)


def iso(ts: int) -> str:
    return datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def in_window(minutes: int, start: int, end: int) -> bool:
    """Is a New York minute-of-day inside [start, end)? A window may run over midnight (18:00 -> 03:00)."""
    if start <= end:
        return start <= minutes < end
    return minutes >= start or minutes < end


def window_minutes(start: int, end: int) -> int:
    return (end - start) % 1440 or 1440
