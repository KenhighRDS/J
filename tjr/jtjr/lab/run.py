"""Runs the seven tests of docs/tjr/edge-protocol.md on both markets and applies the pass mark fixed there."""
from __future__ import annotations

from ..data import Dataset
from ..instruments import INSTRUMENTS
from .score import CostModel, daily_returns, summary, verdict
from .sessions import days
from .strategies import TESTS, tradable

#: signals are computed on the big contract's prices; the trade is costed as the micro of the same index
MICRO = {"ES": "MES", "NQ": "MNQ"}


def run_all(data: dict[str, Dataset], cost: CostModel | None = None) -> dict:
    cost = cost or CostModel()
    double = CostModel(cost.slippage_ticks * 2, cost.fee_per_side)
    sessions = {sym: days(d) for sym, d in data.items()}
    out: dict = {"cost": {"slippage_ticks_each_way": cost.slippage_ticks, "fee_per_side_usd": cost.fee_per_side}, "markets": {}, "tests": []}
    for sym, ds in sessions.items():
        cal = tradable(ds)
        out["markets"][sym] = {"sessions": len(ds), "full_sessions": len([d for d in ds if d.full]), "days_tested": len(cal), "first": str(cal[0].day), "last": str(cal[-1].day),
                               "buy_and_hold_pct": round((cal[-1].close / cal[0].open - 1) * 100, 1)}
    for name, primary, fn, has_sizing in TESTS:
        row: dict = {"test": name, "paper_market": primary, "markets": {}}
        for sym, ds in sessions.items():
            inst = INSTRUMENTS[MICRO[sym]]
            dates = [d.day for d in tradable(ds)]
            trades = fn(ds)
            base = summary(daily_returns(trades, dates, inst, cost), dates, trades)
            base["with_double_slippage"] = {k: v for k, v in summary(daily_returns(trades, dates, inst, double), dates).items() if k in ("t_stat", "total_return_pct", "sharpe_annual")}
            base["before_costs"] = {k: v for k, v in summary(daily_returns(trades, dates, inst, CostModel(0, 0)), dates).items() if k in ("t_stat", "total_return_pct", "sharpe_annual", "mean_bp_per_day")}
            base["cost_points_round_trip"] = round(cost.points(inst), 3)
            if has_sizing:
                base["with_paper_sizing"] = {k: v for k, v in summary(daily_returns(trades, dates, inst, cost, sized=True), dates).items() if k in ("t_stat", "total_return_pct", "sharpe_annual", "max_drawdown_pct", "annual_return_pct")}
            row["markets"][sym] = base
        main = row["markets"].get(primary) or next(iter(row["markets"].values()))
        yrs = main.get("by_year", {})
        both_years = all(yrs.get(y, {}).get("total_pct", -1) > 0 for y in ("2025", "2026"))
        both_markets = all(m.get("total_return_pct", -1) > 0 for m in row["markets"].values())
        row["t_stat"] = main.get("t_stat", 0.0)
        row["both_years_positive"], row["both_markets_positive"] = both_years, both_markets
        row["survives_double_slippage"] = main["with_double_slippage"]["total_return_pct"] > 0
        row["verdict"] = verdict(row["t_stat"], both_years, both_markets, row["survives_double_slippage"])
        out["tests"].append(row)
    return out


def table(res: dict) -> str:
    lines = [f"{'test':28} {'mkt':3} {'trades':>6} {'gross%':>8} {'net%':>8} {'t':>6} {'Sharpe':>7} {'2025%':>7} {'2026%':>7} {'2x slip%':>9}"]
    for row in res["tests"]:
        for sym, m in row["markets"].items():
            y = m.get("by_year", {})
            lines.append(f"{row['test']:28} {sym:3} {m.get('trades', 0):>6} {m['before_costs']['total_return_pct']:>8} {m['total_return_pct']:>8} {m['t_stat']:>6} {m['sharpe_annual']:>7} "
                         f"{y.get('2025', {}).get('total_pct', 0):>7} {y.get('2026', {}).get('total_pct', 0):>7} {m['with_double_slippage']['total_return_pct']:>9}")
        lines.append(f"{'':28} -> {row['verdict']}")
    return "\n".join(lines)
