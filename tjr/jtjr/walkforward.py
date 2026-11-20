"""Choosing settings without fooling ourselves. The history is cut in three, in time order:

  train       try every setting in the grid
  validation  the best few from train are judged again on bars they have not seen; the best one here is chosen
  test        the chosen setting is run ONCE on the last stretch, which nothing before has looked at

The choice is written down (frozen) before the test stretch is opened, and a ledger counts how many times a test
stretch has been used: a second look at the same stretch with other settings is flagged in the report, because by then
it is no longer out of sample.
"""
from __future__ import annotations

import hashlib
import itertools
import json
from pathlib import Path

from . import backtest
from .clock import iso
from .config import Config
from .types import Bar


def spans(lo: int, hi: int, train: float = 0.5, valid: float = 0.25) -> dict[str, tuple[int, int]]:
    a = lo + int((hi - lo) * train)
    b = lo + int((hi - lo) * (train + valid))
    a, b = a - a % 86400, b - b % 86400
    return {"train": (lo, a), "validation": (a, b), "test": (b, hi)}


def grid(base: Config, space: dict[str, list]) -> list[tuple[dict, Config]]:
    keys = list(space)
    return [(dict(zip(keys, combo)), base.with_(**dict(zip(keys, combo)))) for combo in itertools.product(*(space[k] for k in keys))]


def _score(m: dict, min_trades: int) -> float:
    """Average R a trade; a setting with too few trades cannot win."""
    return m.get("expectancy_r", -9.0) if m.get("trades", 0) >= min_trades else -9.0


def _brief(m: dict) -> dict:
    keys = ("trades", "net_usd", "win_rate", "expectancy_r", "expectancy_r_stderr", "profit_factor", "max_drawdown_usd", "total_r")
    return {k: m.get(k) for k in keys}


def run(base: Config, bars: dict[str, list[Bar]], space: dict[str, list], *, rolls: list[int] | None = None, min_trades: int = 20, top: int = 5,
        ledger: str | Path | None = None, data_id: str = "", log=print) -> dict:
    primary = bars[base.symbol]
    cut = spans(primary[0].ts + 12 * 86400, primary[-1].end)
    points = grid(base, space)
    log(f"train {iso(cut['train'][0])[:10]}..{iso(cut['train'][1])[:10]}  validation ..{iso(cut['validation'][1])[:10]}  test ..{iso(cut['test'][1])[:10]}  ({len(points)} settings)")
    rows = []
    for params, cfg in points:
        m = backtest.run(cfg, bars, rolls=rolls, start=cut["train"][0], end=cut["train"][1], keep_events=False).metrics
        rows.append({"params": params, "train": _brief(m), "cfg": cfg})
        log(f"  train {params}: {m['trades']} trades, {m.get('expectancy_r', 0)} R")
    rows.sort(key=lambda r: -_score(r["train"], min_trades))
    finalists = rows[:top]
    for r in finalists:
        m = backtest.run(r["cfg"], bars, rolls=rolls, start=cut["validation"][0], end=cut["validation"][1], keep_events=False).metrics
        r["validation"] = _brief(m)
        log(f"  validation {r['params']}: {m['trades']} trades, {m.get('expectancy_r', 0)} R")
    chosen = max(finalists, key=lambda r: _score(r["validation"], max(5, min_trades // 2)))
    frozen = {"params": chosen["params"], "config_id": chosen["cfg"].fingerprint(), "test_from": iso(cut["test"][0]), "test_to": iso(cut["test"][1]), "data": data_id}
    frozen["protocol"] = hashlib.sha256(json.dumps(frozen, sort_keys=True).encode()).hexdigest()[:16]
    uses = 1
    if ledger is not None:
        path = Path(ledger)
        book = json.loads(path.read_text()) if path.exists() else {}
        key = f"{data_id}|{frozen['test_from']}|{frozen['test_to']}"
        seen = book.setdefault(key, [])
        if frozen["protocol"] not in seen:
            seen.append(frozen["protocol"])
        uses = len(seen)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(book, indent=1))
    test = backtest.run(chosen["cfg"], bars, rolls=rolls, start=cut["test"][0], end=cut["test"][1], keep_events=False)
    exp = [r["train"].get("expectancy_r") for r in rows if r["train"].get("trades", 0) >= min_trades and r["train"].get("expectancy_r") is not None]
    return {
        "spans": {k: [iso(a), iso(b)] for k, (a, b) in cut.items()},
        "grid": [{"params": r["params"], "train": r["train"], "validation": r.get("validation")} for r in rows],
        "sensitivity": {"settings": len(rows), "with_enough_trades": len(exp), "train_expectancy_min": min(exp) if exp else None,
                        "train_expectancy_median": sorted(exp)[len(exp) // 2] if exp else None, "train_expectancy_max": max(exp) if exp else None,
                        "share_positive": round(sum(1 for x in exp if x > 0) / len(exp) * 100, 1) if exp else None},
        "frozen": frozen,
        "test_stretch_used_times": uses,
        "test_is_out_of_sample": uses == 1,
        "test": test.metrics,
        "result": test,
    }
