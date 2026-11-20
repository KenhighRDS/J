"""AFTER-THE-FACT look, not a test: the opposite of test 5 (fade the day's move in the last half hour) on the same data
that suggested it. Printed so its size can be judged; it cannot count as evidence."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from jtjr.data import load
from jtjr.instruments import INSTRUMENTS
from jtjr.lab.score import CostModel, LabTrade, daily_returns, summary
from jtjr.lab.sessions import days
from jtjr.lab.strategies import last_half_hour, tradable
out = {}
for sym, micro in (("ES", "MES"), ("NQ", "MNQ")):
    ds = days(load(ROOT / 'data' / f'{sym}_1m_2024-11-25_2026-11-20_massive.csv', sym))
    dates = [d.day for d in tradable(ds)]
    inst = INSTRUMENTS[micro]
    for name, mm in (("all days", 0.0), ("moves of 0.5% or more", 0.005), ("moves under 0.5%", -1)):
        mom = last_half_hour(ds, 930, max(mm, 0.0))
        if mm == -1:
            big = {t.day for t in last_half_hour(ds, 930, 0.005)}
            mom = [t for t in last_half_hour(ds, 930) if t.day not in big]
        fade = [LabTrade(t.day, -t.side, t.entry_minute, t.entry, t.exit_minute, t.exit, t.why) for t in mom]
        g = summary(daily_returns(fade, dates, inst, CostModel(0, 0)), dates)
        n = summary(daily_returns(fade, dates, inst, CostModel()), dates, fade)
        n2 = summary(daily_returns(fade, dates, inst, CostModel(2)), dates)
        out[f"{sym} {name}"] = {"trades": len(fade), "gross_pct": g["total_return_pct"], "gross_t": g["t_stat"], "net_pct": n["total_return_pct"], "net_t": n["t_stat"], "net_sharpe": n["sharpe_annual"],
                                "net_bp_per_trade": round(n["total_return_pct"] * 100 / max(1, len(fade)), 2), "hit": n["hit_rate_pct"], "mdd": n["max_drawdown_pct"], "by_year": {y: v["total_pct"] for y, v in n["by_year"].items()},
                                "halves": (n["first_half_pct"], n["second_half_pct"]), "net_2x_slip_pct": n2["total_return_pct"], "usd_per_trade_1_micro": round(n["total_return_pct"] / 100 / max(1, len(fade)) * (6000 * 5 if sym == "ES" else 25000 * 2), 2)}
        print(sym, name.ljust(22), out[f"{sym} {name}"])
(ROOT / 'reports' / 'edge').mkdir(parents=True, exist_ok=True)
json.dump(out, open(ROOT / 'reports' / 'edge' / 'fade-look.json', 'w'), indent=1)
