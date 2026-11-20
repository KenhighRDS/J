"""Historical 1-minute futures bars from Massive (formerly Polygon.io): GET /futures/v1/aggs/{ticker}.

Massive serves each contract under its own ticker (NQZ6 = Nasdaq-100 December 2026), so this module walks the
quarterly contracts and keeps, for every moment, the bars of the contract that was the front one. The switch to the
next contract happens `roll_days` before the third Friday of the expiry month (4 = the Monday before, CME's published
roll date), at 18:00 New York time the evening before, i.e. at the start of that trading day.

Prices are NOT adjusted: the file holds what each contract actually traded at, with a `ticker` column, and the engine
rebuilds its levels at every change of ticker.

The key is read from the MASSIVE_API_KEY environment variable and sent as a bearer token. It is never written to disk.
The Basic (free) plan allows 5 calls a minute; this client waits between calls accordingly.
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, timedelta
from pathlib import Path

from ..clock import iso, to_ts
from ..data import write_csv
from ..types import Bar

BASE = "https://api.massive.com"
MONTHS = {3: "H", 6: "M", 9: "U", 12: "Z"}


def third_friday(year: int, month: int) -> date:
    d = date(year, month, 1)
    d += timedelta(days=(4 - d.weekday()) % 7)        # first Friday
    return d + timedelta(days=14)


def roll_moment(year: int, month: int, roll_days: int = 4) -> int:
    """When the contract expiring in (year, month) stops being the front one."""
    roll = third_friday(year, month) - timedelta(days=roll_days)
    return to_ts(roll - timedelta(days=1), 18 * 60)


def front_contracts(root: str, start: int, end: int, roll_days: int = 4) -> list[tuple[str, int, int]]:
    """[(ticker, from, to)] covering [start, end): each contract for the stretch in which it was the front one."""
    out: list[tuple[str, int, int]] = []
    first = date.fromtimestamp(start).year - 1
    prev = 0
    for year in range(first, date.fromtimestamp(end).year + 2):
        for month, code in MONTHS.items():
            stop = roll_moment(year, month, roll_days)
            lo, hi = max(prev, start), min(stop, end)
            if hi > lo:
                out.append((f"{root}{code}{year % 10}", lo, hi))
            prev = stop
    return out


class Massive:
    def __init__(self, key: str | None = None, calls_per_minute: float = 5.0) -> None:
        self.key = key or os.environ.get("MASSIVE_API_KEY") or ""
        if not self.key:
            raise RuntimeError("MASSIVE_API_KEY is not set")
        self.gap = 60.0 / calls_per_minute + 0.5
        self._last = 0.0
        self.calls = 0

    def _get(self, url: str) -> dict:
        wait = self.gap - (time.monotonic() - self._last)
        if wait > 0:
            time.sleep(wait)
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {self.key}", "User-Agent": "jtjr"})
        for attempt in range(4):
            self._last = time.monotonic()
            self.calls += 1
            try:
                with urllib.request.urlopen(req, timeout=60) as r:
                    return json.loads(r.read())
            except urllib.error.HTTPError as e:
                body = e.read().decode("utf8", "replace")[:300]
                if e.code == 429 and attempt < 3:
                    time.sleep(self.gap * (attempt + 2))
                    continue
                raise RuntimeError(f"Massive answered {e.code} for {urllib.parse.urlsplit(url).path}: {body}") from None
        raise RuntimeError("Massive kept answering 429 (rate limit)")

    def minute_bars(self, ticker: str, start: int, end: int) -> list[Bar]:
        q = urllib.parse.urlencode({"resolution": "1min", "window_start.gte": start * 10**9, "window_start.lt": end * 10**9, "limit": 50000, "sort": "window_start.asc"})
        url: str | None = f"{BASE}/futures/v1/aggs/{ticker}?{q}"
        bars: list[Bar] = []
        while url:
            page = self._get(url)
            for r in page.get("results") or []:
                ts = int(r["window_start"]) // 10**9
                bars.append(Bar(ts - ts % 60, float(r["open"]), float(r["high"]), float(r["low"]), float(r["close"]), float(r.get("volume") or 0)))
            url = page.get("next_url")
        bars.sort(key=lambda b: b.ts)
        return [b for i, b in enumerate(bars) if i == 0 or b.ts != bars[i - 1].ts]


def download(root: str, start: date, end: date, out_dir: str | Path, roll_days: int = 4, client: Massive | None = None, log=print) -> Path:
    """Front-contract 1-minute bars for `root` (NQ, ES, MNQ, MES) from `start` to `end`, as one CSV."""
    client = client or Massive()
    lo, hi = to_ts(start, 0), to_ts(end, 0)
    rows: list[tuple[str, Bar]] = []
    for ticker, a, b in front_contracts(root, lo, hi, roll_days):
        bars = client.minute_bars(ticker, a, b)
        log(f"  {ticker}: {len(bars):>7} bars  {iso(a)} -> {iso(b)}")
        rows += [(ticker, bar) for bar in bars]
    if not rows:
        raise RuntimeError(f"Massive returned no {root} bars for {start} to {end}")
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    path = out / f"{root}_1m_{start}_{end}_massive.csv"
    write_csv(path, rows)
    return path


SOURCE = "Massive futures aggregates, 1-minute, built from trades (api.massive.com/futures/v1/aggs)"


def roll_note(roll_days: int) -> str:
    return f"front contract until {roll_days} days before the third Friday of its month, switched at 18:00 New York the evening before"
