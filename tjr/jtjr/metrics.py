"""What a list of closed trades amounts to. Every figure here describes a HYPOTHETICAL run of fixed rules over past
data, after the costs configured for it; none of it is a forecast."""
from __future__ import annotations

import math
import random
from collections import defaultdict

from .clock import ny
from .types import Trade


def _streaks(wins: list[bool]) -> tuple[int, int]:
    best = worst = run = 0
    last: bool | None = None
    for w in wins:
        run = run + 1 if w == last else 1
        last = w
        if w:
            best = max(best, run)
        else:
            worst = max(worst, run)
    return best, worst


def drawdown(curve: list[float], start: float) -> tuple[float, float]:
    """Largest fall from a peak, in dollars and as a share of that peak."""
    peak, dd, pct = start, 0.0, 0.0
    for v in curve:
        peak = max(peak, v)
        if peak - v > dd:
            dd, pct = peak - v, (peak - v) / peak * 100 if peak else 0.0
    return round(dd, 2), round(pct, 2)


def summarize(trades: list[Trade], start_equity: float, days_in_sample: int = 0) -> dict:
    n = len(trades)
    out: dict = {"trades": n, "start_equity": start_equity}
    if n == 0:
        return {**out, "net_usd": 0.0, "note": "no trades"}
    net = [t.net_usd for t in trades]
    rs = [t.r for t in trades]
    wins = [x > 0 for x in net]
    gp, gl = sum(x for x in net if x > 0), -sum(x for x in net if x < 0)
    eq, curve = start_equity, []
    for x in net:
        eq += x
        curve.append(eq)
    dd, dd_pct = drawdown(curve, start_equity)
    best, worst = _streaks(wins)
    by_day: dict[str, float] = defaultdict(float)
    by_month: dict[str, dict] = defaultdict(lambda: {"trades": 0, "net_usd": 0.0, "r": 0.0, "wins": 0})
    by_hour: dict[str, dict] = defaultdict(lambda: {"trades": 0, "net_usd": 0.0, "r": 0.0, "wins": 0})
    by_side: dict[str, dict] = defaultdict(lambda: {"trades": 0, "net_usd": 0.0, "r": 0.0, "wins": 0})
    by_exit: dict[str, int] = defaultdict(int)
    for t in trades:
        d = ny(t.entry_ts)
        by_day[d.strftime("%Y-%m-%d")] += t.net_usd
        for bucket, key in ((by_month, d.strftime("%Y-%m")), (by_hour, d.strftime("%H:00")), (by_side, t.side)):
            b = bucket[key]
            b["trades"] += 1
            b["net_usd"] = round(b["net_usd"] + t.net_usd, 2)
            b["r"] = round(b["r"] + t.r, 3)
            b["wins"] += 1 if t.net_usd > 0 else 0
        by_exit[t.exit_reason] += 1
    # Sharpe on DAILY results over the days that had a trade plus flat days in the sample, as a share of starting
    # equity, annualised with 252 days and a zero risk-free rate. With few trades this number means little.
    daily = list(by_day.values()) + [0.0] * max(0, days_in_sample - len(by_day))
    rets = [x / start_equity for x in daily]
    mean = sum(rets) / len(rets)
    var = sum((x - mean) ** 2 for x in rets) / (len(rets) - 1) if len(rets) > 1 else 0.0
    sharpe = mean / math.sqrt(var) * math.sqrt(252) if var > 0 else 0.0
    mean_r = sum(rs) / n
    sd_r = math.sqrt(sum((x - mean_r) ** 2 for x in rs) / (n - 1)) if n > 1 else 0.0
    out.update({
        "net_usd": round(sum(net), 2),
        "gross_usd": round(sum(t.gross_usd for t in trades), 2),
        "costs_usd": round(sum(t.costs_usd for t in trades), 2),
        "end_equity": round(start_equity + sum(net), 2),
        "return_pct": round(sum(net) / start_equity * 100, 2),
        "win_rate": round(sum(wins) / n * 100, 1),
        "expectancy_r": round(mean_r, 3),
        "expectancy_r_stderr": round(sd_r / math.sqrt(n), 3) if n > 1 else None,   # how far off the average R could be
        "total_r": round(sum(rs), 2),
        "avg_win_usd": round(gp / sum(wins), 2) if any(wins) else 0.0,
        "avg_loss_usd": round(-gl / (n - sum(wins)), 2) if n - sum(wins) else 0.0,
        "profit_factor": round(gp / gl, 2) if gl > 0 else None,
        "max_drawdown_usd": dd,
        "max_drawdown_pct": dd_pct,
        "longest_win_streak": best,
        "longest_loss_streak": worst,
        "sharpe_daily_252": round(sharpe, 2),
        "sharpe_note": "daily results / starting equity, flat days counted as 0, x sqrt(252), risk-free 0",
        "avg_hold_minutes": round(sum(t.exit_ts - t.entry_ts for t in trades) / n / 60, 1),
        "avg_mae_points": round(sum(t.mae for t in trades) / n, 2),
        "avg_mfe_points": round(sum(t.mfe for t in trades) / n, 2),
        "contracts": sum(t.qty for t in trades),
        "by_month": dict(sorted(by_month.items())),
        "by_hour": dict(sorted(by_hour.items())),
        "by_side": dict(by_side),
        "by_exit": dict(by_exit),
        "trading_days": len(by_day),
        "small_sample": n < 100,
    })
    return out


def monte_carlo(trades: list[Trade], start_equity: float, runs: int = 2000, seed: int = 7) -> dict:
    """Shuffle-with-replacement of the trade results: how different the path could have looked with the same trades
    in another order. A supplement, not evidence that the results will repeat."""
    net = [t.net_usd for t in trades]
    if len(net) < 10:
        return {"runs": 0, "note": "too few trades to resample"}
    rng = random.Random(seed)
    finals, dds = [], []
    for _ in range(runs):
        eq, peak, dd = start_equity, start_equity, 0.0
        for _ in net:
            eq += rng.choice(net)
            peak = max(peak, eq)
            dd = max(dd, peak - eq)
        finals.append(eq - start_equity)
        dds.append(dd)
    finals.sort()
    dds.sort()
    q = lambda xs, p: round(xs[min(len(xs) - 1, int(p * len(xs)))], 2)  # noqa: E731
    return {"runs": runs, "net_p05": q(finals, 0.05), "net_p50": q(finals, 0.5), "net_p95": q(finals, 0.95),
            "drawdown_p50": q(dds, 0.5), "drawdown_p95": q(dds, 0.95), "share_losing": round(sum(1 for x in finals if x < 0) / runs * 100, 1)}
