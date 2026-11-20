"""Command line: python -m jtjr <command>

  fetch-massive   download real 1-minute bars (needs MASSIVE_API_KEY)
  backtest        one model over a period, with report files
  compare         models A to E on the same data and assumptions
  walkforward     train / validation / test, with the test stretch opened once
  worker          stay connected to J: run the jobs asked for in the app and store the results

Add --publish to backtest, compare or walkforward to store the run in J (needs J_TJR_URL and J_TJR_KEY).
"""
from __future__ import annotations

import argparse
import json
import sys
import uuid
from datetime import date
from pathlib import Path

from . import backtest, report, walkforward
from .clock import to_ts
from .config import MODELS, Config
from .data import Dataset, load
from .instruments import SMT_PAIR, instrument

DEFAULT_GRID = {"bos_pivot": [1, 2, 3], "bos_window_bars": [4, 6, 8], "setup_expiry_bars": [9, 12, 18], "exits.min_rr": [1.5, 2.0]}


def _value(text: str):
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return text


def _config(args: argparse.Namespace, model: str | None = None) -> Config:
    base: dict = json.loads(Path(args.config).read_text()) if getattr(args, "config", None) else {}
    cfg = Config.from_dict({**base, "model": model or getattr(args, "model", None) or base.get("model", "A")})
    sets = dict(s.split("=", 1) for s in (getattr(args, "set", None) or []))
    return cfg.with_(**{k: _value(v) for k, v in sets.items()}) if sets else cfg


def _data(args: argparse.Namespace) -> dict[str, Dataset]:
    out: dict[str, Dataset] = {}
    for item in args.data:
        sym, path = item.split("=", 1)
        out[sym] = load(path, sym, source=args.source or "", roll_method=args.roll_method or "")
    return out


def needs_smt(cfg: Config) -> bool:
    """Does this model read the other index?"""
    return cfg.model in ("C", "D") or (cfg.model == "E" and "smt" in cfg.e_confirmations)


def _bars(cfg: Config, data: dict[str, Dataset], need_smt: bool) -> tuple[dict, list[int], dict]:
    fam = instrument(cfg.symbol).family
    pick = lambda want: next((d for s, d in data.items() if instrument(s).family == want), None)  # noqa: E731
    main = data.get(cfg.symbol) or pick(fam)
    if main is None:
        raise SystemExit(f"no data given for {cfg.symbol}")
    bars, prov, rolls = {cfg.symbol: main.bars}, {cfg.symbol: main.provenance}, list(main.rolls)
    if need_smt:
        other = data.get(cfg.smt_symbol) or pick(SMT_PAIR[fam])
        if other is None:
            raise SystemExit(f"model {cfg.model} needs data for the other index ({cfg.smt_symbol}) as well")
        bars[cfg.smt_symbol], prov[cfg.smt_symbol] = other.bars, other.provenance
        rolls = sorted(set(rolls) | set(other.rolls))
    return bars, rolls, prov


def _span(args: argparse.Namespace) -> tuple[int | None, int | None]:
    f = to_ts(date.fromisoformat(args.start), 0) if args.start else None
    t = to_ts(date.fromisoformat(args.end), 0) if args.end else None
    return f, t


def _line(model: str, m: dict) -> str:
    if not m.get("trades"):
        return f"  {model}: no trades"
    return (f"  {model}: {m['trades']:>4} trades   net ${m['net_usd']:>10,.2f}   win {m['win_rate']:>5}%   {m['expectancy_r']:>6} R/trade (+/- {m['expectancy_r_stderr']})   "
            f"PF {m['profit_factor']}   max DD ${m['max_drawdown_usd']:,.2f}   costs ${m['costs_usd']:,.2f}")


def cmd_fetch(args: argparse.Namespace) -> int:
    from .providers import massive
    client = massive.Massive(calls_per_minute=args.calls_per_minute)
    for root in args.symbols:
        print(f"{root}:")
        path = massive.download(root, date.fromisoformat(args.start), date.fromisoformat(args.end), args.out, args.roll_days, client)
        print(f"  saved {path}  ({client.calls} calls so far)")
    print(f"source: {massive.SOURCE}\nroll: {massive.roll_note(args.roll_days)}")
    return 0


def cmd_backtest(args: argparse.Namespace) -> int:
    cfg, data = _config(args), _data(args)
    bars, rolls, prov = _bars(cfg, data, needs_smt(cfg))
    lo, hi = _span(args)
    res = backtest.run(cfg, bars, rolls=rolls, start=lo, end=hi, provenance=prov)
    out = report.write_all(res, args.out)
    print(_line(cfg.model, res.metrics))
    print(f"  setups that did not trade: {sum(res.rejected_by_reason().values())}   files: {out}/result.json, trades.csv, report.html")
    if args.publish:
        from .worker import Link, publish
        print(f"  stored in J as run {publish(Link(), res, 'backtest', args.label or f'Model {cfg.model}')}")
    return 0


def cmd_compare(args: argparse.Namespace) -> int:
    data = _data(args)
    lo, hi = _span(args)
    table = {}
    group = str(uuid.uuid4())
    for model in args.models:
        cfg = _config(args, model)
        bars, rolls, prov = _bars(cfg, data, needs_smt(cfg))
        res = backtest.run(cfg, bars, rolls=rolls, start=lo, end=hi, provenance=prov)
        report.write_all(res, Path(args.out) / f"model-{model}")
        table[model] = {"name": MODELS[model], "experimental": cfg.experimental, "config_id": cfg.fingerprint(), "metrics": res.metrics, "rejected": res.rejected_by_reason()}
        print(_line(model, res.metrics))
        if args.publish:
            from .worker import Link, publish
            publish(Link(), res, "backtest", f"{args.label + ': ' if args.label else ''}model {model}", group)
    Path(args.out, "compare.json").write_text(json.dumps(table, indent=1))
    print(f"  files: {args.out}/compare.json and one folder per model")
    return 0


def cmd_walkforward(args: argparse.Namespace) -> int:
    cfg, data = _config(args), _data(args)
    bars, rolls, prov = _bars(cfg, data, needs_smt(cfg))
    space = json.loads(Path(args.grid).read_text()) if args.grid else DEFAULT_GRID
    data_id = "+".join(p["sha256"][:12] for p in prov.values())
    wf = walkforward.run(cfg, bars, space, rolls=rolls, min_trades=args.min_trades, ledger=Path(args.ledger or Path(args.out) / "test-ledger.json"), data_id=data_id, jobs=args.jobs)
    res = wf.pop("result")
    res.provenance = prov
    report.write_all(res, Path(args.out) / "test", title=f"TJR model {cfg.model}: out-of-sample test")
    Path(args.out, "walkforward.json").write_text(json.dumps(wf, indent=1))
    if args.publish:
        from .worker import Link, publish
        publish(Link(), res, "walkforward", args.label or f"Walk-forward, model {cfg.model}", extra=wf)
    print(f"chosen on validation: {wf['frozen']['params']}   protocol {wf['frozen']['protocol']}")
    if not wf["test_is_out_of_sample"]:
        print(f"  WARNING: this test stretch has now been used {wf['test_stretch_used_times']} times with different settings. It is no longer out of sample.")
    print("test:" + _line(cfg.model, wf["test"]))
    return 0


def cmd_worker(args: argparse.Namespace) -> int:
    from .worker import Link, Worker, load_data
    w = Worker(Link(), load_data(args.data, args.source, args.roll_method))
    if args.once:
        w.report_datasets()
        state = w.once()
        print(f"J says: mode {state.get('mode')}, emergency stop {'ON' if state.get('kill') else 'off'}")
        return 0
    w.forever(args.every)
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="jtjr", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    f = sub.add_parser("fetch-massive", help="download 1-minute bars from Massive")
    f.add_argument("--symbols", nargs="+", default=["NQ", "ES"])
    f.add_argument("--start", required=True)
    f.add_argument("--end", required=True)
    f.add_argument("--out", default="data")
    f.add_argument("--roll-days", type=int, default=4)
    f.add_argument("--calls-per-minute", type=float, default=5.0)
    f.set_defaults(fn=cmd_fetch)

    def common(q: argparse.ArgumentParser) -> None:
        q.add_argument("--data", nargs="+", required=True, metavar="SYMBOL=FILE", help="1-minute bars, e.g. NQ=data/NQ.csv ES=data/ES.csv")
        q.add_argument("--source", default="", help="where the data came from (kept in the report)")
        q.add_argument("--roll-method", default="")
        q.add_argument("--config", help="JSON file of settings")
        q.add_argument("--set", nargs="*", metavar="KEY=VALUE", help="override a setting, e.g. exits.min_rr=1.5")
        q.add_argument("--start", help="first day traded, YYYY-MM-DD (New York)")
        q.add_argument("--end", help="day after the last one traded")
        q.add_argument("--out", default="reports/run")
        q.add_argument("--publish", action="store_true", help="also store the run in J")
        q.add_argument("--label", default="", help="name shown in J")

    b = sub.add_parser("backtest", help="one model")
    common(b)
    b.add_argument("--model", default=None, choices=sorted(MODELS))
    b.set_defaults(fn=cmd_backtest)

    c = sub.add_parser("compare", help="several models on identical data and assumptions")
    common(c)
    c.add_argument("--models", nargs="+", default=["A", "B", "C", "D", "E"], choices=sorted(MODELS))
    c.set_defaults(fn=cmd_compare)

    w = sub.add_parser("walkforward", help="train / validation / test")
    common(w)
    w.add_argument("--model", default="A", choices=sorted(MODELS))
    w.add_argument("--grid", help="JSON file: setting -> list of values")
    w.add_argument("--min-trades", type=int, default=20)
    w.add_argument("--jobs", type=int, default=1, help="processes for the train stretch")
    w.add_argument("--ledger", help="file that counts how often each test stretch was used (default: inside --out)")
    w.set_defaults(fn=cmd_walkforward)

    k = sub.add_parser("worker", help="run the jobs asked for in the J app")
    k.add_argument("--data", nargs="+", required=True, metavar="SYMBOL=FILE")
    k.add_argument("--source", default="")
    k.add_argument("--roll-method", default="")
    k.add_argument("--every", type=float, default=20.0, help="seconds between check-ins")
    k.add_argument("--once", action="store_true", help="check in once, do at most one job, and exit")
    k.set_defaults(fn=cmd_worker)

    args = p.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":                       # pragma: no cover
    sys.exit(main())
