"""Files a run leaves behind: result.json (everything, also what J shows), trades.csv and a self-contained report.html.
Every report says on its face that it is a hypothetical backtest and what it assumed."""
from __future__ import annotations

import csv
import html
import json
from pathlib import Path

from .backtest import Result
from .clock import iso, ny
from .config import MODELS

CAVEAT = ("Hypothetical backtest of fixed rules on past data, after the costs listed below. No trade here was placed in a real or "
          "a paper account. Past results, real or simulated, do not predict future results; futures can lose more than the amount risked.")


def write_trades_csv(res: Result, path: Path) -> None:
    cols = ["id", "model", "symbol", "side", "qty", "signal_time_utc", "entry_time_utc", "entry_time_ny", "entry", "stop", "target", "target_label",
            "exit_time_utc", "exit", "exit_reason", "risk_usd", "gross_usd", "costs_usd", "net_usd", "r", "mae_points", "mfe_points", "levels", "confirmations"]
    with path.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(cols)
        for t in res.trades:
            w.writerow([t.id, t.model, t.symbol, t.side, t.qty, iso(t.signal_ts), iso(t.entry_ts), ny(t.entry_ts).strftime("%Y-%m-%d %H:%M"), t.entry, t.stop, t.target, t.target_label,
                        iso(t.exit_ts), t.exit, t.exit_reason, round(t.risk_usd, 2), t.gross_usd, t.costs_usd, t.net_usd, t.r, round(t.mae, 2), round(t.mfe, 2),
                        " | ".join(t.levels), " | ".join(f"{c.kind}@{ny(c.ts).strftime('%H:%M')}" for c in t.confirmations)])


def _curve_svg(res: Result, w: int = 860, h: int = 220) -> str:
    start = res.config.risk.start_equity
    pts = [start] + [eq for _, eq in res.curve]
    if len(pts) < 2:
        return "<p class='muted'>No closed trades, so no equity curve.</p>"
    lo, hi = min(pts), max(pts)
    span = (hi - lo) or 1.0
    xy = " ".join(f"{i / (len(pts) - 1) * (w - 20) + 10:.1f},{h - 14 - (p - lo) / span * (h - 28):.1f}" for i, p in enumerate(pts))
    base = h - 14 - (start - lo) / span * (h - 28)
    return (f"<svg viewBox='0 0 {w} {h}' role='img' aria-label='Equity after each trade'><line x1='10' x2='{w - 10}' y1='{base:.1f}' y2='{base:.1f}' stroke='#999' stroke-dasharray='4 4'/>"
            f"<polyline points='{xy}' fill='none' stroke='#1f6feb' stroke-width='2'/></svg>")


def _table(rows: list[list], head: list[str]) -> str:
    th = "".join(f"<th>{html.escape(str(x))}</th>" for x in head)
    body = "".join("<tr>" + "".join(f"<td>{html.escape(str(c))}</td>" for c in r) + "</tr>" for r in rows)
    return f"<table><thead><tr>{th}</tr></thead><tbody>{body}</tbody></table>"


def write_html(res: Result, path: Path, title: str = "") -> None:
    m, cfg = res.metrics, res.config
    money = lambda x: f"{'-' if x < 0 else ''}${abs(x):,.2f}"  # noqa: E731
    head = [["Model", f"{cfg.model}: {MODELS[cfg.model]}" + ("  (EXPERIMENTAL reconstruction, not 'exact TJR')" if cfg.experimental else "")],
            ["Period", f"{iso(res.span[0])[:10]} to {iso(res.span[1])[:10]}"],
            ["Signals from / traded as", f"{cfg.symbol} / {cfg.trade_symbol}" + (f", SMT against {cfg.smt_symbol}" if cfg.model in ('C', 'D', 'E') else "")],
            ["Session (New York)", f"{cfg.session_start} to {cfg.session_end}, flat by {cfg.flatten_at}"],
            ["Rules / settings id", f"{json.dumps(res.to_json(with_bars=False)['rules_version'])} / {cfg.fingerprint()}"]]
    if m["trades"]:
        stats = [["Trades", m["trades"]], ["Net result", money(m["net_usd"])], ["Costs included", money(m["costs_usd"])], ["Win rate", f"{m['win_rate']}%"],
                 ["Expectancy", f"{m['expectancy_r']} R a trade (standard error {m['expectancy_r_stderr']})"], ["Profit factor", m["profit_factor"]],
                 ["Largest drawdown", f"{money(m['max_drawdown_usd'])} ({m['max_drawdown_pct']}%)"], ["Longest winning / losing run", f"{m['longest_win_streak']} / {m['longest_loss_streak']}"],
                 ["Sharpe", f"{m['sharpe_daily_252']} ({m['sharpe_note']})"], ["Average time in a trade", f"{m['avg_hold_minutes']} minutes"]]
    else:
        stats = [["Trades", 0]]
    warn = "<p class='warn'>Fewer than 100 trades: these figures are uncertain. Extend the sample before drawing a conclusion.</p>" if m.get("small_sample", True) else ""
    prov = [[k, json.dumps(v) if isinstance(v, (dict, list)) else v] for src in res.provenance.values() for k, v in src.items()] if res.provenance else [["data", "not recorded"]]
    costs = [["Commission and fees, per contract per side", money(cfg.costs.commission_per_side)], ["Slippage: entry / stop / market exit (ticks)", f"{cfg.costs.slippage_ticks_entry} / {cfg.costs.slippage_ticks_stop} / {cfg.costs.slippage_ticks_market_exit}"],
             ["A target fills only if price trades through it by (ticks)", cfg.costs.limit_through_ticks], ["Stop and target in the same 1-minute bar", "counted as the stop"],
             ["Risk a trade", f"{cfg.risk.risk_pct}% of equity (start {money(cfg.risk.start_equity)})"], ["Daily limits", f"{cfg.risk.max_trades_per_day} trades, stop after {cfg.risk.max_full_losses_per_day} full losses"]]
    months = [[k, v["trades"], v["wins"], money(v["net_usd"]), v["r"]] for k, v in (m.get("by_month") or {}).items()]
    hours = [[k, v["trades"], v["wins"], money(v["net_usd"]), v["r"]] for k, v in (m.get("by_hour") or {}).items()]
    sides = [[k, v["trades"], v["wins"], money(v["net_usd"]), v["r"]] for k, v in (m.get("by_side") or {}).items()]
    rej = [[k, v] for k, v in res.rejected_by_reason().items()][:20]
    trades = [[t.id, ny(t.entry_ts).strftime("%Y-%m-%d %H:%M"), t.side, t.qty, t.entry, t.stop, t.target, t.exit, t.exit_reason, money(t.net_usd), t.r] for t in res.trades]
    mc = m.get("monte_carlo") or {}
    mc_rows = [[k, v] for k, v in mc.items()]
    doc = f"""<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title or f'J TJR backtest, model {cfg.model}')}</title>
<style>body{{font:15px/1.5 system-ui,sans-serif;margin:24px auto;max-width:920px;padding:0 16px;color:#111}}h1{{font-size:22px}}h2{{font-size:16px;margin-top:28px}}
table{{border-collapse:collapse;width:100%;font-size:14px}}td,th{{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}}th{{color:#555;font-weight:600}}
.warn{{background:#fff4d6;border:1px solid #e3c35a;padding:10px 12px;border-radius:8px}}.cav{{background:#f3f4f6;padding:10px 12px;border-radius:8px}}.muted{{color:#666}}svg{{width:100%;height:auto}}</style>
<h1>{html.escape(title or f'TJR liquidity sweep, model {cfg.model}')}</h1>
<p class="cav">{html.escape(CAVEAT)}</p>{warn}
{_table(head, ['', ''])}
<h2>Result</h2>{_table(stats, ['', ''])}
<h2>Equity after each trade</h2>{_curve_svg(res)}
<h2>By month</h2>{_table(months, ['Month', 'Trades', 'Wins', 'Net', 'R'])}
<h2>By entry hour (New York)</h2>{_table(hours, ['Hour', 'Trades', 'Wins', 'Net', 'R'])}
<h2>Long and short</h2>{_table(sides, ['Side', 'Trades', 'Wins', 'Net', 'R'])}
<h2>Setups that did not become trades</h2>{_table(rej, ['Why', 'Count'])}
<h2>Same trades in another order (resampling)</h2><p class="muted">A supplement only: it shows how much the path depends on the order of these trades, not whether they will repeat.</p>{_table(mc_rows, ['', ''])}
<h2>Assumptions</h2>{_table(costs, ['', ''])}
<h2>Data</h2>{_table(prov, ['', ''])}
<h2>Trades</h2>{_table(trades, ['#', 'Entry (NY)', 'Side', 'Qty', 'Entry', 'Stop', 'Target', 'Exit', 'Why', 'Net', 'R'])}
</html>"""
    path.write_text(doc)


def write_all(res: Result, out_dir: str | Path, title: str = "") -> Path:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    (out / "result.json").write_text(json.dumps(res.to_json(), separators=(",", ":")))
    write_trades_csv(res, out / "trades.csv")
    write_html(res, out / "report.html", title)
    return out
