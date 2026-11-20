"""Runs the strategy over history, one 1-minute bar at a time, exactly as it would have met those bars live: the book
fills and manages orders on a bar first, then the strategy sees the bar close. Nothing reads a bar early."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field

from .clock import Clock, iso
from .config import RULES_VERSION, Config
from .execution import Book
from .instruments import instrument
from .metrics import monte_carlo, summarize
from .strategy import Strategy
from .types import Bar, Rejection, Trade


@dataclass
class Result:
    config: Config
    trades: list[Trade]
    rejections: list[Rejection]
    events: list[dict]
    curve: list[tuple[int, float]]
    metrics: dict
    span: tuple[int, int]
    bars5: list[Bar] = field(default_factory=list)
    provenance: dict = field(default_factory=dict)

    def context(self, t: Trade, before: int = 42, after: int = 12) -> list[Bar]:
        """The 5-minute candles around a trade, for its chart."""
        first = min([c.ts for c in t.confirmations] + [t.signal_ts]) - before * 300
        last = t.exit_ts + after * 300
        return [b for b in self.bars5 if first <= b.ts <= last]

    def rejected_by_reason(self) -> dict[str, int]:
        out: dict[str, int] = {}
        for r in self.rejections:
            key = f"{r.stage}: {r.reason.split(':')[0] if r.stage == 'confirmation' else r.reason}"
            key = "".join(ch for ch in key if not ch.isdigit()).replace("  ", " ") if r.stage in ("target", "risk") else key
            out[key] = out.get(key, 0) + 1
        return dict(sorted(out.items(), key=lambda kv: -kv[1]))

    def to_json(self, with_bars: bool = True) -> dict:
        def trade(t: Trade) -> dict:
            d = asdict(t)
            for k in ("signal_ts", "entry_ts", "exit_ts"):
                d[k] = iso(d[k])
            for c in d["confirmations"]:
                c["ts"] = iso(c["ts"])
                c["expires_at"] = iso(c["expires_at"]) if c["expires_at"] else None
                if "since" in c["extra"]:
                    c["extra"]["since"] = iso(c["extra"]["since"])
            for m in d["marks"]:
                m["formed_at"] = iso(m["formed_at"])
            for p in d["partials"]:
                p["ts"] = iso(p["ts"])
            if with_bars:
                d["bars"] = [[b.ts, b.open, b.high, b.low, b.close, b.volume] for b in self.context(t)]
            return d
        return {
            "rules_version": RULES_VERSION,
            "config": self.config.to_dict(),
            "config_id": self.config.fingerprint(),
            "experimental": self.config.experimental,
            "from": iso(self.span[0]), "to": iso(self.span[1]),
            "provenance": self.provenance,
            "metrics": self.metrics,
            "rejected": self.rejected_by_reason(),
            "curve": [[iso(ts), eq] for ts, eq in self.curve],
            "trades": [trade(t) for t in self.trades],
        }


def run(cfg: Config, bars: dict[str, list[Bar]], *, rolls: list[int] | None = None, start: int | None = None, end: int | None = None,
        keep_events: bool = True, provenance: dict | None = None, warmup_days: int = 12) -> Result:
    """`bars` maps a symbol to its 1-minute bars in time order: the signal symbol, and the SMT symbol when the model
    uses it. Trading is only allowed inside [start, end); bars before `start` are still read, to build levels
    (`warmup_days` of them are kept). `rolls` are the moments the series switches to the next contract: levels and
    structure are rebuilt from scratch there, since the old contract's prices do not carry over."""
    clock = Clock()
    primary = bars[cfg.symbol]
    if not primary:
        raise ValueError(f"no bars for {cfg.symbol}")
    lo = start if start is not None else primary[0].ts
    hi = end if end is not None else primary[-1].end
    first = lo - warmup_days * 86400
    strat = Strategy(cfg, clock)
    other = bars.get(cfg.smt_symbol, []) if strat.other is not None else []
    if strat.other is not None and not other:
        raise ValueError(f"model {cfg.model} needs {cfg.smt_symbol} bars for SMT")
    book = Book(cfg, instrument(cfg.trade_symbol))
    rolls = sorted(rolls or [])
    ri = oi = 0
    rejections: list[Rejection] = []
    events: list[dict] = []
    bars5: list[Bar] = []
    last: Bar | None = None
    for bar in primary:
        if bar.ts < first:
            continue
        if bar.ts >= hi:
            break
        while ri < len(rolls) and rolls[ri] <= bar.ts:          # a new contract: forget the old one's prices
            if rolls[ri] > first:
                if last is not None:
                    book.close_all(last.close, last.end, "contract roll")
                strat = Strategy(cfg, clock)
                events.append({"ts": rolls[ri], "type": "roll", "note": "contract roll: levels and structure rebuilt"})
            ri += 1
        tick = clock.at(bar.ts)
        live = bar.ts >= lo
        if live:
            book.on_bar(bar, tick)
        while oi < len(other) and other[oi].ts <= bar.ts:
            if other[oi].ts >= first:
                strat.on_other(other[oi])
            oi += 1
        strat.on_bar(bar)
        last = bar
        if live:
            bars5.extend(strat.closed5)
            rejections.extend(strat.rejections)
            for sig in strat.signals:
                book.submit(sig, tick)
            if strat.m.new_micro and strat.closed5:
                book.on_pivots(strat.m.new_micro)
            if keep_events and strat.events:
                events.extend(e for e in strat.events if e["ts"] >= lo)
        strat.events.clear()
    if last is not None:
        book.close_all(last.close, last.end, "end_of_data")
    rejections.extend(book.rejections)
    events.extend(book.events)
    events.sort(key=lambda e: e["ts"])
    days = len({str(clock.at(b.ts).day) for b in bars5 if clock.at(b.ts).weekday < 5})
    metrics = summarize(book.trades, cfg.risk.start_equity, days)
    metrics["monte_carlo"] = monte_carlo(book.trades, cfg.risk.start_equity)
    metrics["signals"] = sum(1 for e in events if e["type"] == "signal")
    metrics["sweeps"] = sum(1 for e in events if e["type"] == "sweep")
    return Result(cfg, book.trades, rejections, events if keep_events else [], book.curve, metrics, (lo, hi), bars5, provenance or {})
