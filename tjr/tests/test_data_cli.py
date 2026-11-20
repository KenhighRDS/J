"""Reading real-data files, the Massive contract calendar, the statistics, and the command line end to end (on a drawn
tape written to a file: the point is that the plumbing works, not what the numbers are)."""
import json
from datetime import date

import pytest

from jtjr import cli, walkforward
from jtjr.clock import iso, to_ts
from jtjr.config import Config
from jtjr.data import load, write_csv
from jtjr.metrics import drawdown, summarize
from jtjr.providers import massive
from jtjr.types import Trade

from .tape import mixed, other_index, sweep_long


def _csv(tmp_path, name, rows):
    p = tmp_path / name
    p.write_text("\n".join(rows) + "\n")
    return p


def test_csv_times_in_text_or_nanoseconds_mean_the_same_bar(tmp_path):
    t0 = to_ts(date(2026, 3, 4), 9 * 60 + 30)
    a = _csv(tmp_path, "a.csv", ["ts,open,high,low,close,volume", f"{iso(t0)},1,2,0.5,1.5,10", f"{iso(t0 + 60)},1.5,2,1,1.75,4"])
    b = _csv(tmp_path, "b.csv", ["window_start,Open,High,Low,Close", f"{t0 * 10**9},1,2,0.5,1.5", f"{(t0 + 60) * 10**9},1.5,2,1,1.75"])
    da, db = load(a, "NQ", source="test"), load(b, "NQ")
    assert [(x.ts, x.open, x.high, x.low, x.close) for x in da.bars] == [(x.ts, x.open, x.high, x.low, x.close) for x in db.bars]
    assert da.provenance["rows"] == 2 and da.provenance["source"] == "test" and len(da.provenance["sha256"]) == 64
    assert db.provenance["source"] == "not stated"


def test_change_of_contract_in_the_file_is_a_roll(tmp_path):
    t0 = to_ts(date(2026, 3, 9), 18 * 60)
    p = _csv(tmp_path, "r.csv", ["ts,open,high,low,close,volume,ticker", f"{iso(t0 - 60)},10,11,9,10,1,NQH6", f"{iso(t0)},60,61,59,60,1,NQM6", f"{iso(t0 + 60)},60,61,59,60,1,NQM6"])
    d = load(p, "NQ")
    assert d.rolls == [t0] and d.provenance["contracts"] == ["NQH6", "NQM6"]


def test_bad_files_are_refused(tmp_path):
    t0 = to_ts(date(2026, 3, 4), 9 * 60 + 30)
    with pytest.raises(ValueError, match="impossible bar"):
        load(_csv(tmp_path, "x.csv", ["ts,open,high,low,close", f"{iso(t0)},5,4,3,5"]), "NQ")
    with pytest.raises(ValueError, match="out of order"):
        load(_csv(tmp_path, "y.csv", ["ts,open,high,low,close", f"{iso(t0)},1,2,1,1", f"{iso(t0)},1,2,1,1"]), "NQ")
    with pytest.raises(ValueError, match="not 1-minute"):
        load(_csv(tmp_path, "z.csv", ["ts,open,high,low,close"] + [f"{iso(t0 + i * 300)},1,2,1,1" for i in range(4)]), "NQ")
    with pytest.raises(ValueError, match="need a time column"):
        load(_csv(tmp_path, "w.csv", ["when,o,h,l,c", "1,1,1,1,1"]), "NQ")


def test_front_contract_calendar():
    assert massive.third_friday(2026, 12) == date(2026, 12, 18) and massive.third_friday(2026, 3) == date(2026, 3, 20)
    # December 2026 stops being the front contract at 18:00 New York on Sunday 13 December (the trading day of Monday 14)
    assert massive.roll_moment(2026, 12) == to_ts(date(2026, 12, 13), 18 * 60)
    lo, hi = to_ts(date(2026, 1, 1), 0), to_ts(date(2026, 11, 1), 0)
    cs = massive.front_contracts("NQ", lo, hi)
    assert [c[0] for c in cs] == ["NQH6", "NQM6", "NQU6", "NQZ6"]
    assert cs[0][1] == lo and cs[-1][2] == hi and all(a[2] == b[1] for a, b in zip(cs, cs[1:]))
    assert cs[0][2] == to_ts(date(2026, 3, 15), 18 * 60)


def _trade(i, net, risk=100.0, day=4):
    ts = to_ts(date(2026, 3, day), 10 * 60)
    return Trade(i, "MNQ", "A", "long", 1, ts, ts, 100, 99, 102, "x", exit_ts=ts + 600, exit=101, exit_reason="target", risk_usd=risk, gross_usd=net + 2, costs_usd=2, net_usd=net, r=net / risk)


def test_statistics_on_a_known_list():
    m = summarize([_trade(1, 200), _trade(2, -100, day=5), _trade(3, -100, day=6), _trade(4, 300, day=9)], 10_000, days_in_sample=4)
    assert (m["trades"], m["net_usd"], m["win_rate"], m["profit_factor"], m["expectancy_r"]) == (4, 300.0, 50.0, 2.5, 0.75)
    assert (m["max_drawdown_usd"], m["longest_win_streak"], m["longest_loss_streak"]) == (200.0, 1, 2)
    assert m["costs_usd"] == 8 and m["small_sample"] is True and m["avg_hold_minutes"] == 10.0
    assert drawdown([110, 90, 95, 80, 120], 100) == (30, 27.27)
    assert summarize([], 10_000)["trades"] == 0


def test_command_line_backtest_compare_and_walkforward_write_their_files(tmp_path, capsys):
    nq, es = tmp_path / "NQ.csv", tmp_path / "ES.csv"
    write_csv(nq, [("NQH6", b) for b in mixed(days=14)])
    write_csv(es, [("ESH6", b) for b in other_index().list()])
    big = ["--set", "risk.start_equity=50000"]
    assert cli.main(["backtest", "--data", f"NQ={nq}", "--source", "drawn test tape, not market data", "--out", str(tmp_path / "run"), *big]) == 0
    res = json.loads((tmp_path / "run" / "result.json").read_text())
    assert res["metrics"]["trades"] >= 1 and res["provenance"]["NQ"]["source"].startswith("drawn test tape")
    assert res["trades"][0]["bars"] and res["trades"][0]["marks"] and res["experimental"] is False
    assert "Hypothetical backtest" in (tmp_path / "run" / "report.html").read_text()
    assert (tmp_path / "run" / "trades.csv").read_text().count("\n") == res["metrics"]["trades"] + 1
    assert cli.main(["compare", "--data", f"NQ={nq}", f"ES={es}", "--models", "A", "B", "C", "--out", str(tmp_path / "cmp"), *big]) == 0
    table = json.loads((tmp_path / "cmp" / "compare.json").read_text())
    assert set(table) == {"A", "B", "C"} and table["B"]["metrics"]["trades"] <= table["A"]["metrics"]["trades"]
    grid = tmp_path / "grid.json"
    grid.write_text(json.dumps({"bos_window_bars": [4, 6], "exits.min_rr": [1.5, 2.0]}))
    assert cli.main(["walkforward", "--data", f"NQ={nq}", "--grid", str(grid), "--min-trades", "1", "--out", str(tmp_path / "wf"), *big]) == 0
    wf = json.loads((tmp_path / "wf" / "walkforward.json").read_text())
    assert wf["test_is_out_of_sample"] is True and len(wf["grid"]) == 4 and wf["frozen"]["protocol"]
    assert wf["spans"]["train"][1] == wf["spans"]["validation"][0] and wf["spans"]["validation"][1] == wf["spans"]["test"][0]


def test_second_look_at_a_test_stretch_is_counted(tmp_path):
    bars = {"NQ": sweep_long().list()}
    led = tmp_path / "ledger.json"
    a = walkforward.run(Config(), bars, {"bos_window_bars": [6]}, min_trades=1, ledger=led, data_id="d", log=lambda *_: None)
    b = walkforward.run(Config(), bars, {"bos_window_bars": [4]}, min_trades=1, ledger=led, data_id="d", log=lambda *_: None)
    again = walkforward.run(Config(), bars, {"bos_window_bars": [6]}, min_trades=1, ledger=led, data_id="d", log=lambda *_: None)
    assert (a["test_stretch_used_times"], b["test_stretch_used_times"], again["test_stretch_used_times"]) == (1, 2, 2)
    assert a["test_is_out_of_sample"] and not b["test_is_out_of_sample"]


def test_massive_client_only_ever_talks_to_its_own_api(monkeypatch):
    monkeypatch.setenv("MASSIVE_API_KEY", "test")
    c = massive.Massive(calls_per_minute=6000)
    with pytest.raises(RuntimeError, match="outside the futures API"):
        c._get("/etc/passwd")
    with pytest.raises(ValueError, match="not a contract ticker"):
        c.minute_bars("../x", 0, 60)
    pages = [{"results": [{"window_start": 120 * 10**9, "open": 1, "high": 2, "low": 1, "close": 2, "volume": 3}], "next_url": "file:///futures/v1/aggs/NQZ6?cursor=abc"},
             {"results": [{"window_start": 60 * 10**9, "open": 1, "high": 1, "low": 1, "close": 1}]}]
    asked = []
    monkeypatch.setattr(c, "_get", lambda path: (asked.append(path), pages[len(asked) - 1])[1])
    bars = c.minute_bars("NQZ6", 0, 600)
    assert [b.ts for b in bars] == [60, 120]
    assert asked[1] == "/futures/v1/aggs/NQZ6?cursor=abc"          # only the path of next_url is followed, on the fixed host
    monkeypatch.delenv("MASSIVE_API_KEY")
    with pytest.raises(RuntimeError, match="MASSIVE_API_KEY is not set"):
        massive.Massive()


def test_grid_variants_are_bundles_tried_as_one_choice_and_parallel_equals_serial():
    space = {"variants": [{"exits.target": "r", "exits.target_r": 1.5}, {"exits.target": "liquidity", "exits.target_rule": "first_with_min_rr"}], "bos_window_bars": [4, 6]}
    pts = walkforward.grid(Config(), space)
    assert len(pts) == 4 and pts[0][0] == {"exits.target": "r", "exits.target_r": 1.5, "bos_window_bars": 4}
    assert pts[0][1].exits.target_r == 1.5 and pts[3][1].exits.target_rule == "first_with_min_rr" and pts[3][1].bos_window_bars == 6
    bars = {"NQ": mixed(days=14)}
    one = walkforward.run(Config().with_(**{"risk.start_equity": 50000.0}), bars, space, min_trades=1, log=lambda *_: None)
    four = walkforward.run(Config().with_(**{"risk.start_equity": 50000.0}), bars, space, min_trades=1, log=lambda *_: None, jobs=2)
    assert one["grid"] == four["grid"] and one["frozen"] == four["frozen"] and one["test"] == four["test"]
