"""The setup state machine: liquidity sweep -> reclaim -> confirmations -> entry signal. One instance watches one
instrument (plus the other index for SMT) and is fed 1-minute bars in time order; the backtest and the live service
drive the very same object, so a signal cannot exist in one and not in the other.

Every decision is taken at a bar CLOSE from bars that are already complete. A signal is an intention to enter; the
earliest fill is the next bar's open, and the execution side (sizing, daily limits) can still refuse it.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .clock import Clock, Tick, hm, in_window, window_minutes
from .config import Config
from .market import Market
from .types import Bar, Confirmation, Fvg, Level, Pivot, Rejection, Signal

LONG, SHORT = "long", "short"
#: which level matters most when one move sweeps several (used for the label only)
RANK = {"swing:240": 0, "swing:60": 1, "pd": 2, "overnight": 3, "session": 4, "equal": 5}


def _rank(lv: Level) -> int:
    return RANK.get(lv.kind.split(":")[0] if lv.kind.startswith(("session", "equal")) else lv.kind, 9)


@dataclass(slots=True)
class Setup:
    id: int
    side: str
    levels: list[Level]
    breach_ts: int           # first trade through the first of the levels
    sweep_ts: int            # close of the 5m bar that reclaimed
    sweep_index: int         # that bar's index in the 5m series
    extreme: float           # furthest price of the sweep: the line the idea is wrong beyond
    stage: str = "swept"     # swept -> bos -> cont (models A-D) ; swept -> conf5 -> cont5 (model E)
    bos_ref: Pivot | None = None
    bos_index: int = -1
    cont: Pivot | None = None          # the higher low / lower high
    cont_bar: Bar | None = None        # its candle: the "continuation candle"
    leg: float = 0.0                   # model E: furthest price in our direction since the sweep
    cont_ts: int = 0
    confirmations: list[Confirmation] = field(default_factory=list)
    dead: str = ""


class Strategy:
    def __init__(self, cfg: Config, clock: Clock | None = None) -> None:
        self.cfg = cfg
        self.clock = clock or Clock()
        self.m = Market(cfg.symbol, cfg, self.clock)
        needs_smt = cfg.model in ("C", "D") or (cfg.model == "E" and "smt" in cfg.e_confirmations)
        self.other: Market | None = Market(cfg.smt_symbol, cfg, self.clock) if needs_smt and cfg.smt_symbol else None
        self.setups: list[Setup] = []
        self.signals: list[Signal] = []          # produced by the bar just processed; the caller drains it
        self.rejections: list[Rejection] = []
        self.events: list[dict] = []             # journal lines (levels, sweeps, confirmations)
        self._pending: dict[int, int] = {}       # level id -> 5m closes seen since its breach
        self._ids = 0
        self.closed5: list[Bar] = []             # 5m bars closed by the bar just processed
        self.now = 0
        self._start, self._end, self._flat = hm(cfg.session_start), hm(cfg.session_end), hm(cfg.flatten_at)
        self.tick: Tick | None = None

    # ------------------------------------------------------------------ feeding
    def on_other(self, bar: Bar) -> None:
        """A 1-minute bar of the other index. Call it before `on_bar` for the same minute."""
        if self.other is not None:
            self.other.on_minute(bar, self.clock.at(bar.ts))

    def on_bar(self, bar: Bar) -> None:
        """A 1-minute bar of the traded index."""
        self.signals, self.rejections, self.closed5 = [], [], []
        self.now = bar.end                       # nothing below may know anything later than this
        self.tick = tick = self.clock.at(bar.ts)
        if self.other is not None:
            self.other.advance(bar.end)
        closed = self.m.on_minute(bar, tick)
        for lv in self.m.liq.created:
            self.events.append({"ts": self.now, "type": "level", "id": lv.id, "kind": lv.kind, "edge": lv.edge, "price": lv.price, "formed_at": lv.formed_at, "known_at": lv.known_at})
        self.m.liq.created.clear()
        self.closed5 = closed
        for b in closed:
            self._on5(b)
        if self.cfg.model == "E":
            self._e_minute(bar)

    # ------------------------------------------------------------------ helpers
    def _reject(self, s: Setup | None, stage: str, reason: str, ts: int, side: str | None = None, **detail: object) -> None:
        if s is not None:
            s.dead = reason
        self.rejections.append(Rejection(ts, self.cfg.symbol, (s.side if s else side), stage, reason, s.id if s else 0, dict(detail)))  # type: ignore[arg-type]

    def _confirm(self, s: Setup, kind: str, ts: int, value: float, tf: int, reason: str, **extra: object) -> None:
        expires = s.sweep_ts + self.cfg.setup_expiry_bars * 300
        c = Confirmation(kind, s.side, ts, value, tf, reason, expires, dict(extra))  # type: ignore[arg-type]
        s.confirmations.append(c)
        # journal lines carry the moment they were written; `at` is when the thing itself became true (it can be earlier)
        self.events.append({"ts": self.now, "type": "confirmation", "setup": s.id, "kind": kind, "side": s.side, "value": value, "timeframe": tf, "reason": reason, "at": ts})

    def _in_session(self, ts: int) -> bool:
        return in_window(self.clock.at(ts).minutes, self._start, self._end)

    def _minutes_left(self, ts: int) -> int:
        return (self._flat - self.clock.at(ts).minutes) % 1440 if window_minutes(self._start, self._flat) else 0

    def _structure(self, side: str, before_ts: int, upto_index: int) -> Pivot | None:
        """The swing a break of structure has to close beyond: the latest confirmed swing high (for a long) made
        before the sweep began and not already closed above since."""
        want = "high" if side == LONG else "low"
        for p in reversed(self.m.swings5):
            if p.edge != want or p.ts >= before_ts:
                continue
            broken = False
            for i in range(p.index + 1, upto_index):
                b = self.m.bar5(i)
                if b is None:
                    break
                if (side == LONG and b.close > p.price) or (side == SHORT and b.close < p.price):
                    broken = True
                    break
            if not broken:
                return p
        return None

    def _ifvg(self, s: Setup, now: int, gaps: object = None, since: int | None = None, formed_after: int | None = None) -> Fvg | None:
        """An opposing gap that price has since closed straight through: it now counts for our side."""
        src = self.m.gaps5 if gaps is None else gaps
        opposing = SHORT if s.side == LONG else LONG
        earliest = s.sweep_ts - (self.cfg.ifvg_lookback_bars + 1) * 300 if formed_after is None else formed_after
        start = s.breach_ts if since is None else since
        for g in reversed(src.gaps):  # type: ignore[attr-defined]
            if g.side == opposing and g.void_at is None and g.inverted_at is not None and start <= g.inverted_at <= now and g.ts >= earliest:
                return g
        return None

    def smt(self, s: Setup, now: int) -> tuple[bool, str]:
        """SMT divergence: the traded index took out a level and the other index has NOT taken out the same level of
        its own. Decided with what is known at `now`."""
        o = self.other
        if o is None:
            return False, "no second index loaded"
        for lv in sorted(s.levels, key=_rank):
            tf = int(lv.kind.split(":")[1]) * 60 if lv.kind.startswith(("swing", "equal")) else 0
            twin = o.liq.match(lv, tf)
            if twin is not None and twin.known_at <= now:
                if twin.state == "active":
                    return True, f"{self.cfg.symbol} swept its {lv.label}; {o.symbol} held its own ({twin.price:g})"
                continue
            # no twin level: compare the other index's own extreme around the time ours was made
            w = self.cfg.smt_window_bars * 300
            ref = [b for b in o.bars5 if lv.formed_at - w <= b.ts <= lv.formed_at + w]
            after = [b for b in o.bars5 if b.ts > lv.formed_at + w and b.end <= now]
            if not ref or not after:
                continue
            if lv.edge == "low" and min(b.low for b in after) > min(b.low for b in ref):
                return True, f"{self.cfg.symbol} swept its {lv.label}; {o.symbol} stayed above its low of that time"
            if lv.edge == "high" and max(b.high for b in after) < max(b.high for b in ref):
                return True, f"{self.cfg.symbol} swept its {lv.label}; {o.symbol} stayed below its high of that time"
        return False, f"{o.symbol} took out its level too"

    # ------------------------------------------------------------------ 5-minute close
    def _on5(self, b: Bar) -> None:
        cfg, idx = self.cfg, self.m.n5 - 1
        # 1. levels traded through: reclaimed by this close (a sweep), or given up on (a break)
        swept: dict[str, list[Level]] = {LONG: [], SHORT: []}
        for lv in self.m.liq.pending():
            if lv.breached_at is None or lv.breached_at >= b.end:
                continue
            n = self._pending.get(lv.id, 0) + 1
            self._pending[lv.id] = n
            back = b.close > lv.price if lv.edge == "low" else b.close < lv.price
            if back:
                lv.state = "swept"
                swept[LONG if lv.edge == "low" else SHORT].append(lv)
                self._pending.pop(lv.id, None)
                self.m.liq.touch()
            elif n >= cfg.reclaim_timeout_bars:
                lv.state = "broken"
                self._pending.pop(lv.id, None)
                self.m.liq.touch()
                self.rejections.append(Rejection(b.end, cfg.symbol, LONG if lv.edge == "low" else SHORT, "sweep", "level broken, not reclaimed", 0, {"level": lv.label, "price": lv.price}))
        for side, levels in swept.items():
            if levels:
                self._sweep(side, levels, b, idx)
        # 2. walk every live setup one step
        for s in self.setups:
            if s.dead:
                continue
            if idx > s.sweep_index:
                if (s.side == LONG and b.low < s.extreme) or (s.side == SHORT and b.high > s.extreme):
                    self._reject(s, "structure", "price went back beyond the sweep extreme", b.end)
                    continue
                if idx - s.sweep_index > cfg.setup_expiry_bars:
                    self._reject(s, "timing", f"setup expired after {cfg.setup_expiry_bars} bars", b.end)
                    continue
            if cfg.model == "E":
                self._e_step(s, b, idx)
            else:
                self._step(s, b, idx)
        self.setups = [s for s in self.setups if not s.dead]

    def _sweep(self, side: str, levels: list[Level], b: Bar, idx: int) -> None:
        cfg = self.cfg
        extreme = min(lv.extreme or lv.price for lv in levels) if side == LONG else max(lv.extreme or lv.price for lv in levels)
        breach = min(lv.breached_at or b.ts for lv in levels)
        names = [lv.label for lv in sorted(levels, key=_rank)]
        self.events.append({"ts": b.end, "type": "sweep", "side": side, "levels": names, "prices": [lv.price for lv in levels], "extreme": extreme})
        live = next((s for s in self.setups if s.side == side and not s.dead), None)
        if live is not None:                       # the same move took another level: one setup, more reasons
            live.levels += levels
            live.extreme = min(live.extreme, extreme) if side == LONG else max(live.extreme, extreme)
            return
        if side not in cfg.sides:
            return self._reject(None, "sweep", f"{side} trades are switched off", b.end, side)
        if cfg.sweep_in_session_only and not self._in_session(b.ts):
            return self._reject(None, "session", "sweep outside the trading session", b.end, side, levels=names)
        self._ids += 1
        s = Setup(self._ids, side, list(levels), breach, b.end, idx, extreme, leg=b.high if side == LONG else b.low)
        self._confirm(s, "sweep", b.end, extreme, 5, f"took {', '.join(names)} and closed back {'above' if side == LONG else 'below'}")
        s.bos_ref = self._structure(side, breach, idx)
        if s.bos_ref is None and cfg.model != "E":
            return self._reject(s, "structure", "no confirmed swing to break", b.end)
        self.setups.append(s)

    def _step(self, s: Setup, b: Bar, idx: int) -> None:
        """Models A to D: break of structure, then a higher low (lower high), then a close beyond that candle."""
        cfg, long = self.cfg, s.side == LONG
        if s.stage == "swept":
            ref = s.bos_ref
            assert ref is not None
            if (long and b.close > ref.price) or (not long and b.close < ref.price):
                s.stage, s.bos_index = "bos", idx
                self._confirm(s, "bos", b.end, ref.price, 5, f"5m close {'above' if long else 'below'} the swing at {ref.price:g}")
            elif idx - s.sweep_index >= cfg.bos_window_bars:
                self._reject(s, "bos", f"no break of structure within {cfg.bos_window_bars} bars", b.end)
            return
        want = "low" if long else "high"
        for p in self.m.new_micro:                 # the pullback: a small swing that stays inside the sweep extreme
            if p.edge == want and p.index > s.bos_index and ((long and p.price > s.extreme) or (not long and p.price < s.extreme)):
                bar = self.m.bar5(p.index)
                if bar is None:
                    continue
                first = s.cont is None
                s.cont, s.cont_bar, s.stage = p, bar, "cont"
                if first:
                    self._confirm(s, "higher_low" if long else "lower_high", p.confirmed_at, p.price, 5, f"pullback held at {p.price:g}, inside the sweep extreme {s.extreme:g}")
        if s.stage != "cont" or s.cont_bar is None or s.cont is None or idx <= s.cont.index:
            return
        if not ((long and b.close > s.cont_bar.high) or (not long and b.close < s.cont_bar.low)):
            return
        edge = s.cont_bar.high if long else s.cont_bar.low
        self._confirm(s, "candle_break", b.end, edge, 5, f"5m close {'above' if long else 'below'} the continuation candle ({edge:g})")
        if cfg.model in ("B", "D"):
            g = self._ifvg(s, b.end)
            if g is None:
                return self._reject(s, "confirmation", "no inverse FVG by the time of the entry trigger", b.end)
            self._confirm(s, "ifvg", g.inverted_at or b.end, g.top if long else g.bottom, 5, f"closed through the opposing gap {g.bottom:g}-{g.top:g}", top=g.top, bottom=g.bottom, since=g.ts)
        if cfg.model in ("C", "D"):
            ok, why = self.smt(s, b.end)
            if not ok:
                return self._reject(s, "confirmation", f"no SMT divergence: {why}", b.end)
            self._confirm(s, "smt", b.end, s.extreme, 5, why)
        self._signal(s, b.end, b.close)

    # ------------------------------------------------------------------ model E (experimental)
    def _e_step(self, s: Setup, b: Bar, idx: int) -> None:
        """Step 2 (a 5-minute confirmation) and step 3 (a 5-minute continuation) of the source, read as timeframes."""
        cfg, long = self.cfg, s.side == LONG
        if s.stage == "swept":
            ref, hit = s.bos_ref, ""
            if "bos" in cfg.e_confirmations and ref is not None and ((long and b.close > ref.price) or (not long and b.close < ref.price)):
                hit = "bos"
                self._confirm(s, "bos", b.end, ref.price, 5, f"5m close beyond the swing at {ref.price:g}")
            if not hit and "ifvg" in cfg.e_confirmations and (g := self._ifvg(s, b.end)) is not None:
                hit = "ifvg"
                self._confirm(s, "ifvg", g.inverted_at or b.end, g.top if long else g.bottom, 5, f"closed through the opposing gap {g.bottom:g}-{g.top:g}")
            if not hit and "smt" in cfg.e_confirmations:
                ok, why = self.smt(s, b.end)
                if ok:
                    hit = "smt"
                    self._confirm(s, "smt", b.end, s.extreme, 5, why)
            if not hit and cfg.use_ext79 and ref is not None:
                line = s.extreme + (ref.price - s.extreme) * cfg.ext79_level
                if (long and b.close >= line) or (not long and b.close <= line):
                    hit = "ext79"
                    self._confirm(s, "ext79", b.end, line, 5, f"5m close past {cfg.ext79_level:.0%} of the leg into the sweep ({line:g}); anchors are a hypothesis")
            if hit:
                s.stage, s.bos_index = "conf5", idx
                s.leg = b.high if long else b.low
            elif idx - s.sweep_index >= cfg.bos_window_bars:
                self._reject(s, "confirmation", f"no 5m confirmation within {cfg.bos_window_bars} bars", b.end)
            return
        if s.stage == "conf5" and idx > s.bos_index:
            eq = s.extreme + (s.leg - s.extreme) * cfg.e_equilibrium
            gap = next((g for g in reversed(self.m.gaps5.gaps) if g.side == s.side and g.inverted_at is None and s.breach_ts <= g.ts and g.known_at <= b.ts), None)
            if (long and b.low <= eq) or (not long and b.high >= eq):
                s.stage, s.cont_ts = "cont5", b.end
                self._confirm(s, "equilibrium", b.end, eq, 5, f"pulled back to the middle of the leg ({eq:g})")
            elif gap is not None and ((long and b.low <= gap.top and b.close >= gap.bottom) or (not long and b.high >= gap.bottom and b.close <= gap.top)):
                s.stage, s.cont_ts = "cont5", b.end
                self._confirm(s, "fvg_retest", b.end, gap.top if long else gap.bottom, 5, f"came back into the gap {gap.bottom:g}-{gap.top:g} and held")
            else:
                s.leg = max(s.leg, b.high) if long else min(s.leg, b.low)

    def _e_minute(self, bar: Bar) -> None:
        """Step 4 of the source: a 1-minute confirmation after the continuation."""
        cfg = self.cfg
        for s in self.setups:
            if s.dead or s.stage != "cont5" or bar.end <= s.cont_ts:
                continue
            long = s.side == LONG
            if (long and bar.low < s.extreme) or (not long and bar.high > s.extreme):
                self._reject(s, "structure", "price went back beyond the sweep extreme", bar.end)
                continue
            want = "high" if long else "low"
            ref = next((p for p in reversed(self.m.swings1) if p.edge == want and p.confirmed_at <= bar.ts), None)
            if "bos" in cfg.e_confirmations and ref is not None and ref.ts >= s.sweep_ts and ((long and bar.close > ref.price) or (not long and bar.close < ref.price)):
                self._confirm(s, "bos_1m", bar.end, ref.price, 1, f"1m close beyond the 1m swing at {ref.price:g}")
                self._signal(s, bar.end, bar.close)
            elif "ifvg" in cfg.e_confirmations and (g := self._ifvg(s, bar.end, self.m.gaps1, since=s.cont_ts - 300, formed_after=s.sweep_ts)) is not None:
                self._confirm(s, "ifvg_1m", bar.end, g.top if long else g.bottom, 1, f"1m close through the opposing 1m gap {g.bottom:g}-{g.top:g}")
                self._signal(s, bar.end, bar.close)
        self.setups = [s for s in self.setups if not s.dead]

    # ------------------------------------------------------------------ the signal
    def _signal(self, s: Setup, ts: int, price: float) -> None:
        cfg, ex, inst, long = self.cfg, self.cfg.exits, self.m.inst, s.side == LONG
        if not self._in_session(ts - 1):
            return self._reject(s, "session", "entry trigger outside the trading session", ts)
        if self._minutes_left(ts) < cfg.min_minutes_left:
            return self._reject(s, "session", f"less than {cfg.min_minutes_left} minutes before the flatten time", ts)
        sign = 1 if long else -1
        if ex.stop == "structure" and s.cont is not None:
            stop = s.cont.price - sign * ex.stop_ticks_beyond * inst.tick
        elif ex.stop == "atr" and self.m.atr5 > 0:
            stop = price - sign * ex.atr_mult * self.m.atr5
        else:
            stop = s.extreme - sign * ex.stop_ticks_beyond * inst.tick
        stop = inst.round(stop)
        risk = (price - stop) * sign
        if risk <= 0:
            return self._reject(s, "risk", "stop is not on the losing side of the entry", ts)
        target, label = None, ""
        if ex.target == "r":
            target, label = inst.round(price + sign * ex.target_r * risk), f"{ex.target_r:g}R"
        else:
            draws = self.m.liq.targets(s.side, price, ts)
            if not draws:
                return self._reject(s, "target", "no untouched liquidity in the trade direction", ts)
            pick = draws[0] if ex.target_rule == "nearest" else next((d for d in draws if (d.price - price) * sign >= ex.min_rr * risk), None)
            if pick is None or (pick.price - price) * sign < ex.min_rr * risk:
                near = draws[0]
                return self._reject(s, "target", f"nearest liquidity is {((near.price - price) * sign / risk):.2f}R away, under the {ex.min_rr:g}R minimum", ts, level=near.label, price=near.price)
            target, label = pick.price, pick.label
        self._ids += 1
        marks = [{"role": "swept", "label": lv.label, "price": lv.price, "formed_at": lv.formed_at} for lv in sorted(s.levels, key=_rank)]
        if target is not None:
            marks.append({"role": "target", "label": label, "price": target, "formed_at": ts})
        sig = Signal(self._ids, cfg.symbol, cfg.model, s.side, ts, price, stop, target, label, list(s.confirmations), [lv.label for lv in sorted(s.levels, key=_rank)], s.id, cfg.experimental, marks)  # type: ignore[arg-type]
        self.signals.append(sig)
        self.events.append({"ts": ts, "type": "signal", "setup": s.id, "id": sig.id, "side": s.side, "model": cfg.model, "price": price, "stop": stop, "target": target, "target_label": label})
        s.dead = "signalled"
