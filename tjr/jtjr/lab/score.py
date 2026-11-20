"""Scoring a daily strategy the same way whatever it is. A strategy hands back its trades; each trade is turned into a
return on the money it controlled (one contract's notional, no leverage), after costs, and the days are then judged
as a series: average, spread, t-statistic, yearly split.

Costs, per contract, charged on every trade: one tick of slippage on the way in and one on the way out, plus the
broker's all-in fee each side (Interactive Brokers, micro contracts: $0.61, see docs/tjr/providers.md).
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date

from ..instruments import Instrument


@dataclass(slots=True)
class LabTrade:
    day: date
    side: int               # +1 long, -1 short
    entry_minute: int
    entry: float            # raw price, before slippage
    exit_minute: int
    exit: float
    why: str = ""           # how it ended: time, stop, target, signal
    size: float = 1.0       # leverage chosen by the strategy's own sizing rule (1 = one unit of notional)


@dataclass(frozen=True)
class CostModel:
    slippage_ticks: float = 1.0
    fee_per_side: float = 0.61

    def points(self, inst: Instrument) -> float:
        """Round-trip cost in index points."""
        return 2 * (self.slippage_ticks * inst.tick + self.fee_per_side / inst.point_value)


def trade_return(t: LabTrade, inst: Instrument, cost: CostModel) -> float:
    """Net return of one trade as a fraction of the notional at entry (size 1)."""
    return ((t.exit - t.entry) * t.side - cost.points(inst)) / t.entry


def daily_returns(trades: list[LabTrade], all_days: list[date], inst: Instrument, cost: CostModel, sized: bool = False) -> list[float]:
    """One number a session, zero when the strategy stayed out. `sized` applies each trade's own leverage."""
    by: dict[date, float] = {}
    for t in trades:
        by[t.day] = by.get(t.day, 0.0) + trade_return(t, inst, cost) * (t.size if sized else 1.0)
    return [by.get(d, 0.0) for d in all_days]


def summary(rets: list[float], dates: list[date], trades: list[LabTrade] | None = None) -> dict:
    n = len(rets)
    if n < 2:
        return {"days": n}
    mean = sum(rets) / n
    sd = math.sqrt(sum((x - mean) ** 2 for x in rets) / (n - 1))
    t = mean / (sd / math.sqrt(n)) if sd > 0 else 0.0
    eq = peak = dd = 0.0
    for x in rets:
        eq += x
        peak = max(peak, eq)
        dd = max(dd, peak - eq)
    active = [x for x in rets if x != 0.0]
    years: dict[int, list[float]] = {}
    for d, x in zip(dates, rets):
        years.setdefault(d.year, []).append(x)
    half = n // 2
    out = {
        "days": n, "days_traded": len(active), "trades": len(trades) if trades is not None else len(active),
        "mean_bp_per_day": round(mean * 1e4, 2), "sd_bp_per_day": round(sd * 1e4, 1), "t_stat": round(t, 2),
        "sharpe_annual": round(mean / sd * math.sqrt(252), 2) if sd > 0 else 0.0,
        "total_return_pct": round(sum(rets) * 100, 2), "annual_return_pct": round(mean * 252 * 100, 2),
        "max_drawdown_pct": round(dd * 100, 2), "hit_rate_pct": round(sum(1 for x in active if x > 0) / len(active) * 100, 1) if active else None,
        "by_year": {str(y): {"days": len(v), "total_pct": round(sum(v) * 100, 2), "sharpe": round((sum(v) / len(v)) / (_sd(v) or 1e-12) * math.sqrt(252), 2) if len(v) > 1 else None} for y, v in sorted(years.items())},
        "first_half_pct": round(sum(rets[:half]) * 100, 2), "second_half_pct": round(sum(rets[half:]) * 100, 2),
    }
    if trades:
        why: dict[str, int] = {}
        for tr in trades:
            why[tr.why] = why.get(tr.why, 0) + 1
        out["exits"] = why
        out["long_share_pct"] = round(sum(1 for tr in trades if tr.side > 0) / len(trades) * 100, 1)
    return out


def _sd(v: list[float]) -> float:
    m = sum(v) / len(v)
    return math.sqrt(sum((x - m) ** 2 for x in v) / (len(v) - 1)) if len(v) > 1 else 0.0


def verdict(t_stat: float, both_years_positive: bool, both_markets_positive: bool, survives_double_cost: bool) -> str:
    """The pass mark fixed in docs/tjr/edge-protocol.md."""
    if t_stat >= 2.6 and both_years_positive and both_markets_positive and survives_double_cost:
        return "evidence of an edge"
    if t_stat >= 2.0 and both_markets_positive:
        return "promising, not proven"
    return "not shown"
