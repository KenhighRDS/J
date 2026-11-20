"""Writes the rows the J app's TJR pages show, in the shape of the database tables.

  python research/make_fixture.py drawn  ../src/routes/admin/tjr/fixture.json
      from the hand-drawn test tape (NOT market data): committed, used by the app's dev previews.
  python research/make_fixture.py real   reports/preview/real.json
      from the real experiment-1 data files: stays on this machine (licensed data), for looking at real runs locally.
"""
import json
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from jtjr import backtest  # noqa: E402
from jtjr.config import Config  # noqa: E402
from jtjr.worker import journal_rows, run_row, trade_rows  # noqa: E402


def rows(res, label, group, n, kind="backtest", extra=None):
    rid = str(uuid.UUID(int=n))
    run = {"id": rid, "created_at": "2026-11-20T01:00:00Z", "finished_at": "2026-11-20T01:00:20Z", "error": None, **run_row(res, kind, label, group, None, extra)}
    trades = [{"id": str(uuid.UUID(int=n * 1000 + t["seq"])), "run_id": rid, **t} for t in trade_rows(res)]
    events = [{"id": n * 100000 + i, "run_id": rid, **e} for i, e in enumerate(journal_rows(res))]
    return run, trades, events


def main(kind: str, out: str) -> None:
    runs, trades, events = [], [], []
    group = str(uuid.UUID(int=999))
    if kind == "drawn":
        from tests.tape import mixed, other_index
        prov = {"NQ": {"source": "drawn test tape, NOT market data", "file": "tests/tape.py", "rows": 0, "sha256": "", "roll_method": "none", "contracts": []}}
        bars = {"NQ": mixed(days=14), "ES": other_index().list()}
        for i, m in enumerate(("A", "B", "E")):
            cfg = Config(model=m, e_confirmations=("bos", "ifvg")).with_(**{"risk.start_equity": 50000.0})
            r, t, e = rows(backtest.run(cfg, bars, provenance=prov), f"Drawn tape, model {m}", group, i + 1)
            runs.append(r); trades += t; events += e
    else:
        from jtjr.data import load
        nq = load("data/NQ_1m_2024-11-25_2026-11-20_massive.csv", "NQ", source="Massive futures aggregates, 1-minute, Futures Basic plan, downloaded 2026-11-20")
        es = load("data/ES_1m_2024-11-25_2026-11-20_massive.csv", "ES", source=nq.provenance["source"])
        rolls = sorted(set(nq.rolls) | set(es.rolls))
        for i, m in enumerate(("A", "B", "C", "D", "E")):
            cfg = Config(model=m).with_(**{"risk.start_equity": 100000.0})
            res = backtest.run(cfg, {"NQ": nq.bars, "ES": es.bars}, rolls=rolls, provenance={"NQ": nq.provenance, "ES": es.provenance})
            r, t, e = rows(res, f"As specified, model {m}", group, i + 1)
            runs.append(r); trades += t; events += e
            print(m, res.metrics["trades"])
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    Path(out).write_text(json.dumps({"runs": runs, "trades": trades, "events": events}, separators=(",", ":")))
    print("wrote", out, f"{Path(out).stat().st_size // 1024} KB", len(runs), "runs", len(trades), "trades", len(events), "journal lines")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
