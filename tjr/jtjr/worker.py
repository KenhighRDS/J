"""The link to J. The worker never holds J's database keys: it speaks only to the `tjr-worker` function, with the worker
key an admin made in Admin > TJR. It PULLS: it asks J what mode is on and whether there is a job, and sends results
back. J never has to reach this machine.

  J_TJR_URL   https://<project>.supabase.co/functions/v1/tjr-worker
  J_TJR_KEY   the worker key (jt_...). Keep it out of files that get committed.
"""
from __future__ import annotations

import os
import time
import uuid
from datetime import date
from pathlib import Path
from typing import Any, Callable

from . import backtest, walkforward
from .backtest import Result
from .clock import iso, to_ts
from .config import MODELS, RULES_VERSION, Config
from .data import Dataset, load
from .instruments import SMT_PAIR, instrument


def needs_smt(cfg: Config) -> bool:
    return cfg.model in ("C", "D") or (cfg.model == "E" and "smt" in cfg.e_confirmations)

JOURNAL_TYPES = {"signal", "order", "fill", "cancel", "risk", "roll", "rejected"}       # what a backtest keeps in J's journal
BATCH = 40


class Link:
    """One POST per call to the tjr-worker function."""

    def __init__(self, url: str | None = None, key: str | None = None, post: Callable[[dict], dict] | None = None) -> None:
        self.url = url or os.environ.get("J_TJR_URL") or ""
        self.key = key or os.environ.get("J_TJR_KEY") or ""
        self._post = post
        if post is None and not (self.url.startswith("https://") and self.key):
            raise RuntimeError("set J_TJR_URL (https://...) and J_TJR_KEY first: Admin > TJR > Setup in the J app shows both")

    def call(self, action: str, **body: Any) -> dict:
        payload = {"action": action, **body}
        if self._post is not None:
            return self._post(payload)
        import requests
        r = requests.post(self.url, json=payload, headers={"X-J-Key": self.key}, timeout=60, allow_redirects=False)
        if r.status_code != 200:
            raise RuntimeError(f"J answered {r.status_code} to {action}: {r.text[:300]}")
        return r.json()


def run_row(res: Result, kind: str = "backtest", label: str = "", group_id: str | None = None, version_id: str | None = None, extra: dict | None = None, status: str = "done") -> dict:
    cfg = res.config
    return {"kind": kind, "status": status, "label": label, "group_id": group_id, "version_id": version_id, "model": cfg.model, "experimental": cfg.experimental,
            "symbol": cfg.symbol, "trade_symbol": cfg.trade_symbol, "config": cfg.to_dict(), "config_id": cfg.fingerprint(), "rules_version": RULES_VERSION,
            "period_from": iso(res.span[0]), "period_to": iso(res.span[1]), "metrics": res.metrics, "rejected": res.rejected_by_reason(),
            "curve": [[iso(ts), eq] for ts, eq in res.curve], "provenance": res.provenance, "extra": extra or {}}


def trade_rows(res: Result) -> list[dict]:
    out = []
    for t in res.to_json()["trades"]:
        out.append({"seq": t["id"], "model": t["model"], "symbol": t["symbol"], "side": t["side"], "qty": t["qty"], "signal_at": t["signal_ts"], "entry_at": t["entry_ts"],
                    "entry": t["entry"], "stop": t["stop"], "target": t["target"], "target_label": t["target_label"], "exit_at": t["exit_ts"], "exit": t["exit"],
                    "exit_reason": t["exit_reason"], "risk_usd": round(t["risk_usd"], 2), "gross_usd": t["gross_usd"], "costs_usd": t["costs_usd"], "net_usd": t["net_usd"],
                    "r": t["r"], "mae": round(t["mae"], 2), "mfe": round(t["mfe"], 2), "levels": t["levels"], "confirmations": t["confirmations"], "marks": t["marks"],
                    "partials": t["partials"], "bars": t["bars"], "experimental": t["experimental"]})
    return out


def journal_rows(res: Result, everything: bool = False) -> list[dict]:
    rows = [{"ts": iso(e["ts"]), "type": e["type"], "data": {k: v for k, v in e.items() if k not in ("ts", "type")}} for e in res.events if everything or e["type"] in JOURNAL_TYPES]
    rows += [{"ts": iso(r.ts), "type": "rejected", "data": {"side": r.side, "stage": r.stage, "reason": r.reason, "setup": r.setup_id, **r.detail}} for r in res.rejections if everything or r.stage not in ("sweep", "session")]
    return sorted(rows, key=lambda r: r["ts"])


def publish(link: Link, res: Result, kind: str = "backtest", label: str = "", group_id: str | None = None, version_id: str | None = None, extra: dict | None = None) -> str:
    """Store a finished run in J: the record, its trades with their candles, and its journal."""
    run_id = link.call("run", run=run_row(res, kind, label, group_id, version_id, extra, status="running"))["run_id"]
    trades, journal = trade_rows(res), journal_rows(res)
    for i in range(0, len(trades), BATCH):
        link.call("trades", run_id=run_id, trades=trades[i:i + BATCH])
    for i in range(0, len(journal), 400):
        link.call("events", run_id=run_id, events=journal[i:i + 400])
    link.call("patch", run_id=run_id, patch={"status": "done"})
    return run_id


class Worker:
    def __init__(self, link: Link, data: dict[str, Dataset], log: Callable[[str], None] = print) -> None:
        self.link, self.data, self.log = link, data, log

    def info(self) -> dict:
        return {"rules_version": RULES_VERSION, "datasets": sorted(self.data), "feed": "price files only, no live feed", "broker": "none (simulated book)", "live_capable": False}

    def report_datasets(self) -> None:
        rows = [{"symbol": s, "source": d.provenance.get("source", ""), "first_at": d.provenance.get("first"), "last_at": d.provenance.get("last"), "rows": d.provenance.get("rows", 0),
                 "sha256": d.provenance.get("sha256", ""), "roll_method": d.provenance.get("roll_method", "")} for s, d in self.data.items()]
        if rows:
            self.link.call("datasets", datasets=rows)

    def _bars(self, cfg: Config) -> tuple[dict, list[int], dict]:
        fam = instrument(cfg.symbol).family
        pick = lambda want: next((d for s, d in self.data.items() if instrument(s).family == want), None)  # noqa: E731
        main = self.data.get(cfg.symbol) or pick(fam)
        if main is None:
            raise RuntimeError(f"this worker has no data file for {cfg.symbol}")
        bars, prov, rolls = {cfg.symbol: main.bars}, {cfg.symbol: main.provenance}, list(main.rolls)
        if needs_smt(cfg):
            other = self.data.get(cfg.smt_symbol) or pick(SMT_PAIR[fam])
            if other is None:
                raise RuntimeError(f"model {cfg.model} needs a data file for {cfg.smt_symbol} too")
            bars[cfg.smt_symbol], prov[cfg.smt_symbol] = other.bars, other.provenance
            rolls = sorted(set(rolls) | set(other.rolls))
        return bars, rolls, prov

    def do(self, job: dict) -> tuple[list[str], str]:
        """Run one job from the app. -> (run ids, one line for the job list)."""
        p, kind = job.get("params") or {}, job["kind"]
        base = dict((job.get("version") or {}).get("config") or p.get("config") or {})
        version_id = (job.get("version") or {}).get("id")
        lo = to_ts(date.fromisoformat(p["from"]), 0) if p.get("from") else None
        hi = to_ts(date.fromisoformat(p["to"]), 0) if p.get("to") else None
        label = str(p.get("label") or "")
        if kind == "walkforward":
            cfg = Config.from_dict({**base, "model": p.get("model") or base.get("model", "A")})
            bars, rolls, prov = self._bars(cfg)
            data_id = "+".join(x["sha256"][:12] for x in prov.values())
            wf = walkforward.run(cfg, bars, p.get("grid") or {"bos_window_bars": [4, 6, 8], "exits.min_rr": [1.5, 2.0]}, rolls=rolls, min_trades=int(p.get("min_trades", 20)),
                                 ledger=Path("reports") / "test-ledger.json", data_id=data_id, log=self.log)
            res = wf.pop("result")
            res.provenance = prov
            rid = publish(self.link, res, "walkforward", label or f"Walk-forward, model {cfg.model}", None, version_id, extra=wf)
            return [rid], f"test stretch: {wf['test'].get('trades', 0)} trades, {wf['test'].get('expectancy_r', 0)} R a trade"
        models = p.get("models") or [p.get("model") or base.get("model", "A")]
        group = str(uuid.uuid4()) if len(models) > 1 else None
        ids, lines = [], []
        for m in models:
            if m not in MODELS:
                raise RuntimeError(f"unknown model {m}")
            cfg = Config.from_dict({**base, "model": m})
            bars, rolls, prov = self._bars(cfg)
            res = backtest.run(cfg, bars, rolls=rolls, start=lo, end=hi, provenance=prov)
            ids.append(publish(self.link, res, "backtest", label or f"Model {m}", group, version_id))
            lines.append(f"{m}: {res.metrics['trades']} trades, {res.metrics.get('expectancy_r', 0)} R")
        return ids, "; ".join(lines)

    def once(self) -> dict:
        """Report in, then do at most one waiting job."""
        state = self.link.call("state", info=self.info())
        job = self.link.call("claim").get("job")
        if job:
            self.log(f"job {job['id']}: {job['kind']}")
            try:
                ids, note = self.do(job)
                self.link.call("job_done", job_id=job["id"], status="done", note=note, run_ids=ids)
            except Exception as e:                         # the job list in the app shows why
                self.link.call("job_done", job_id=job["id"], status="failed", note=f"{type(e).__name__}: {e}", run_ids=[])
        return state

    def forever(self, every: float = 20.0) -> None:
        self.report_datasets()
        while True:
            try:
                self.once()
            except Exception as e:
                self.log(f"could not reach J: {e}")
            time.sleep(every)


def load_data(items: list[str], source: str = "", roll_method: str = "") -> dict[str, Dataset]:
    out = {}
    for item in items:
        sym, path = item.split("=", 1)
        out[sym] = load(path, sym, source=source, roll_method=roll_method)
    return out
