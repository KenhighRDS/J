"""The link to J, against a stand-in for the tjr-worker function: what gets sent, in what order, and that a failing job
is reported instead of lost."""
import pytest

from jtjr import backtest
from jtjr.config import Config
from jtjr.data import Dataset
from jtjr.worker import Link, Worker, journal_rows, publish, run_row, trade_rows

from .tape import other_index, sweep_long

BIG = {"risk.start_equity": 50_000.0}


class FakeJ:
    def __init__(self, jobs=None):
        self.calls, self.jobs, self.n = [], list(jobs or []), 0

    def __call__(self, body):
        self.calls.append(body)
        a = body["action"]
        if a == "state":
            return {"mode": "off", "kill": False, "live_unlocked": False, "version": None}
        if a == "claim":
            return {"job": self.jobs.pop(0) if self.jobs else None}
        if a == "run":
            self.n += 1
            return {"run_id": f"00000000-0000-0000-0000-{self.n:012d}"}
        return {"ok": True}


def _data():
    prov = lambda s: {"source": "drawn test tape", "sha256": s * 64, "first": "2026-03-02T23:00:00Z", "last": "2026-03-04T21:59:00Z", "rows": 1, "roll_method": "none"}  # noqa: E731
    return {"NQ": Dataset("NQ", sweep_long().list(), [], prov("a")), "ES": Dataset("ES", other_index().list(), [], prov("b"))}


def test_link_needs_an_https_address_and_a_key(monkeypatch):
    monkeypatch.delenv("J_TJR_URL", raising=False)
    monkeypatch.delenv("J_TJR_KEY", raising=False)
    with pytest.raises(RuntimeError, match="J_TJR_URL"):
        Link()
    with pytest.raises(RuntimeError):
        Link(url="http://plain.example/x", key="jt_x")


def test_publish_sends_the_record_then_trades_then_journal_then_marks_it_done():
    res = backtest.run(Config().with_(**BIG), {"NQ": sweep_long().list()}, provenance={"NQ": {"source": "drawn test tape"}})
    j = FakeJ()
    rid = publish(Link(post=j), res, label="check")
    assert [c["action"] for c in j.calls] == ["run", "trades", "events", "patch"] and rid.endswith("1")
    run = j.calls[0]["run"]
    assert (run["kind"], run["status"], run["model"], run["label"], run["experimental"]) == ("backtest", "running", "A", "check", False)
    assert run["metrics"]["trades"] == 1 and run["provenance"]["NQ"]["source"] == "drawn test tape" and run["config_id"] == res.config.fingerprint()
    t = j.calls[1]["trades"][0]
    assert (t["seq"], t["side"], t["entry"], t["stop"], t["exit_reason"]) == (1, "long", 20014.25, 19979.75, "target")
    assert t["signal_at"].endswith("Z") and t["bars"] and t["marks"][0]["role"] == "swept" and [c["kind"] for c in t["confirmations"]][:2] == ["sweep", "bos"]
    types = {e["type"] for e in j.calls[2]["events"]}
    assert {"signal", "order", "fill"} <= types and "level" not in types
    assert j.calls[3] == {"action": "patch", "run_id": rid, "patch": {"status": "done"}}


def test_journal_keeps_the_reason_a_setup_was_refused():
    res = backtest.run(Config(model="B").with_(**BIG), {"NQ": sweep_long(gap=False).list()})
    rows = journal_rows(res)
    assert any(r["type"] == "rejected" and "no inverse FVG" in r["data"]["reason"] for r in rows)
    assert trade_rows(res) == [] and run_row(res)["metrics"]["trades"] == 0


def test_worker_runs_a_compare_job_and_reports_it():
    job = {"id": "11111111-1111-1111-1111-111111111111", "kind": "compare", "params": {"models": ["A", "C"], "label": "two"}, "version": {"id": "22222222-2222-2222-2222-222222222222", "config": {"risk": {"start_equity": 50000.0}}}}
    j = FakeJ([job])
    state = Worker(Link(post=j), _data(), log=lambda *_: None).once()
    assert state["mode"] == "off"
    runs = [c["run"] for c in j.calls if c["action"] == "run"]
    assert [r["model"] for r in runs] == ["A", "C"] and runs[0]["group_id"] == runs[1]["group_id"] and runs[0]["version_id"] == job["version"]["id"]
    done = j.calls[-1]
    assert (done["action"], done["status"], len(done["run_ids"])) == ("job_done", "done", 2) and "A: 1 trades" in done["note"]


def test_a_job_that_cannot_run_is_reported_as_failed_with_the_reason():
    j = FakeJ([{"id": "33333333-3333-3333-3333-333333333333", "kind": "backtest", "params": {"model": "C"}, "version": None}])
    data = _data()
    del data["ES"]
    Worker(Link(post=j), data, log=lambda *_: None).once()
    done = j.calls[-1]
    assert (done["action"], done["status"], done["run_ids"]) == ("job_done", "failed", []) and "needs a data file for ES" in done["note"]


def test_worker_tells_j_what_it_can_and_cannot_do():
    w = Worker(Link(post=FakeJ()), _data(), log=lambda *_: None)
    assert w.info()["live_capable"] is False and w.info()["datasets"] == ["ES", "NQ"]
    w.report_datasets()
    sent = w.link._post.calls[-1]
    assert sent["action"] == "datasets" and {d["symbol"] for d in sent["datasets"]} == {"NQ", "ES"}
