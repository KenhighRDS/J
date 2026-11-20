"""Reads real 1-minute futures bars from CSV or Parquet and remembers where they came from. Nothing in this package
makes prices up: a backtest runs on a file the owner supplied or downloaded from a licensed source, and its report
carries the file's fingerprint.

Expected columns (any order, any case): a time column (`ts`, `timestamp`, `time`, `datetime`, `date`, `window_start` or
`ts_event`), `open`, `high`, `low`, `close`, and optionally `volume` and a contract column (`ticker`, `symbol`,
`contract` or `instrument_id`). Times are the bar OPEN, in UTC: whole numbers (seconds, milliseconds, microseconds or
nanoseconds, told apart by size) or ISO 8601 text. Text without an offset is taken as UTC and that is noted.
"""
from __future__ import annotations

import csv
import hashlib
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from .clock import iso
from .types import Bar

TIME_COLUMNS = ("ts", "timestamp", "time", "datetime", "date", "window_start", "ts_event")
CONTRACT_COLUMNS = ("ticker", "contract", "instrument_id", "symbol")


@dataclass
class Dataset:
    symbol: str
    bars: list[Bar]
    rolls: list[int] = field(default_factory=list)      # first bar of each new contract after the first
    provenance: dict = field(default_factory=dict)


def _ts(value: str) -> tuple[int, bool]:
    """-> (epoch seconds, was the zone assumed?)."""
    v = value.strip()
    if v.lstrip("-").isdigit():
        n = int(v)
        for div in (1, 1_000, 1_000_000, 1_000_000_000):
            if abs(n) // div < 100_000_000_000:        # below the year 5138 in seconds
                return n // div, False
        raise ValueError(f"time out of range: {value}")
    d = datetime.fromisoformat(v.replace("Z", "+00:00").replace(" ", "T", 1))
    assumed = d.tzinfo is None
    if assumed:
        d = d.replace(tzinfo=timezone.utc)
    return int(d.timestamp()), assumed


def _rows(path: Path) -> tuple[list[str], list[dict]]:
    if path.suffix.lower() in (".parquet", ".pq"):
        try:
            import pandas as pd
        except ImportError as e:                         # pragma: no cover
            raise RuntimeError("reading Parquet needs pandas and pyarrow: pip install 'jtjr[parquet]'") from e
        df = pd.read_parquet(path)
        if df.index.name:
            df = df.reset_index()
        cols = [str(c) for c in df.columns]
        return cols, [{c: str(v) for c, v in zip(cols, row)} for row in df.itertuples(index=False, name=None)]
    with path.open(newline="") as f:
        reader = csv.DictReader(f)
        return list(reader.fieldnames or []), list(reader)


def load(path: str | Path, symbol: str, source: str = "", roll_method: str = "") -> Dataset:
    p = Path(path)
    cols, rows = _rows(p)
    low = {c.lower().strip(): c for c in cols}
    tcol = next((low[c] for c in TIME_COLUMNS if c in low), None)
    missing = [c for c in ("open", "high", "low", "close") if c not in low]
    if tcol is None or missing:
        raise ValueError(f"{p.name}: need a time column and open/high/low/close; found {cols}")
    ccol = next((low[c] for c in CONTRACT_COLUMNS if c in low), None)
    vcol = low.get("volume")
    bars: list[Bar] = []
    rolls: list[int] = []
    assumed = False
    contract = None
    contracts: list[str] = []
    for r in rows:
        ts, a = _ts(str(r[tcol]))
        assumed = assumed or a
        ts -= ts % 60
        o, h, l, c = (float(r[low[k]]) for k in ("open", "high", "low", "close"))
        if not (l <= min(o, c) and h >= max(o, c)) or l <= 0:
            raise ValueError(f"{p.name}: impossible bar at {iso(ts)} (o={o} h={h} l={l} c={c})")
        bars.append(Bar(ts, o, h, l, c, float(r[vcol] or 0) if vcol else 0.0))
        if ccol is not None:
            cur = str(r[ccol])
            if cur != contract:
                if contract is not None:
                    rolls.append(ts)
                contract = cur
                contracts.append(cur)
    if not bars:
        raise ValueError(f"{p.name}: no rows")
    for a, b in zip(bars, bars[1:]):
        if b.ts <= a.ts:
            raise ValueError(f"{p.name}: bars out of order or repeated at {iso(b.ts)}")
    steps = [b.ts - a.ts for a, b in zip(bars, bars[1:])]
    if steps and sorted(steps)[len(steps) // 2] != 60:
        raise ValueError(f"{p.name}: these are not 1-minute bars (typical step {sorted(steps)[len(steps) // 2]} s)")
    digest = hashlib.sha256(p.read_bytes()).hexdigest()
    prov = {
        "file": p.name, "sha256": digest, "rows": len(bars), "first": iso(bars[0].ts), "last": iso(bars[-1].ts),
        "symbol": symbol, "source": source or "not stated", "bar_time": "open, UTC",
        "zone_assumed_utc": assumed, "contracts": contracts, "rolls": [iso(t) for t in rolls],
        "roll_method": roll_method or ("contract column in the file" if rolls else "single series, not stated"),
        "price_adjustment": "none: each contract's own prices; levels are rebuilt at every roll",
        "gaps_over_5_min_in_session": sum(1 for s in steps if 300 < s < 3600),
    }
    return Dataset(symbol, bars, rolls, prov)


def write_csv(path: str | Path, rows: list[tuple[str, Bar]]) -> None:
    """(contract, bar) rows -> the CSV this module reads back."""
    with Path(path).open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["ts", "open", "high", "low", "close", "volume", "ticker"])
        for ticker, b in rows:
            w.writerow([iso(b.ts), b.open, b.high, b.low, b.close, int(b.volume), ticker])
