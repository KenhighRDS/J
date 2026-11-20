"""What is known about one instrument at each minute, built only from bars that have already closed: higher-timeframe
bars, confirmed swing pivots, fair value gaps, and the liquidity map. Nothing in here looks ahead: a pivot exists from
the close of the last bar that confirms it, a session high from the moment the session is over."""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass

from .clock import Clock, Tick, hm, in_window
from .config import Config, Session
from .instruments import Instrument, instrument
from .types import Bar, Fvg, Level, Pivot


class Aggregator:
    """Builds bars of `minutes` from 1-minute bars. Buckets are cut on the New York clock; 4-hour bars are anchored at
    the 18:00 open, as on a futures chart."""

    def __init__(self, minutes: int, anchor: int = 0) -> None:
        self.minutes, self.anchor, self.span = minutes, anchor, minutes * 60
        self.start: int | None = None
        self.o = self.h = self.l = self.c = self.v = 0.0

    def _emit(self) -> Bar:
        bar = Bar(self.start or 0, self.o, self.h, self.l, self.c, self.v, self.span)
        self.start = None
        return bar

    def flush(self, now: int) -> Bar | None:
        """A bucket whose time is up is complete even if its last minutes never printed."""
        if self.start is not None and now >= self.start + self.span:
            return self._emit()
        return None

    def add(self, bar: Bar, tick: Tick) -> list[Bar]:
        done: list[Bar] = []
        start = bar.ts - ((tick.minutes - self.anchor) % self.minutes) * 60
        if self.start is not None and start != self.start:
            done.append(self._emit())
        if self.start is None:
            self.start, self.o, self.h, self.l, self.v = start, bar.open, bar.high, bar.low, 0.0
        self.h, self.l, self.c, self.v = max(self.h, bar.high), min(self.l, bar.low), bar.close, self.v + bar.volume
        if bar.end >= start + self.span:
            done.append(self._emit())
        return done


class Pivots:
    """Swing highs and lows with `left` bars before and `right` bars after. A pivot is reported when its last
    confirming bar closes, stamped with that time; it never appears on its own candle. Ties go to the earlier bar."""

    def __init__(self, left: int, right: int) -> None:
        self.left, self.right = left, right
        self.window: deque[Bar] = deque(maxlen=left + right + 1)
        self.count = 0

    def add(self, bar: Bar) -> list[Pivot]:
        self.window.append(bar)
        self.count += 1
        if len(self.window) < self.left + self.right + 1:
            return []
        bars = list(self.window)
        cand, before, after = bars[self.left], bars[: self.left], bars[self.left + 1:]
        index = self.count - 1 - self.right
        out: list[Pivot] = []
        if all(cand.high > b.high for b in before) and all(cand.high >= b.high for b in after):
            out.append(Pivot("high", cand.high, cand.ts, bar.end, index))
        if all(cand.low < b.low for b in before) and all(cand.low <= b.low for b in after):
            out.append(Pivot("low", cand.low, cand.ts, bar.end, index))
        return out


class Gaps:
    """Fair value gaps on one timeframe: the space between candle 1 and candle 3 that candle 2 jumped over. A gap is
    'inversed' when a candle closes right through it; an inversed gap is void when a candle closes back through."""

    def __init__(self, timeframe: int, min_size: float, keep: int = 80) -> None:
        self.timeframe, self.min_size = timeframe, min_size
        self.last: deque[Bar] = deque(maxlen=3)
        self.gaps: deque[Fvg] = deque(maxlen=keep)

    def add(self, bar: Bar) -> list[tuple[str, Fvg]]:
        events: list[tuple[str, Fvg]] = []
        for g in self.gaps:                                  # gaps known before this bar react to its close
            if g.void_at is not None:
                continue
            if g.inverted_at is None:
                if (g.side == "short" and bar.close > g.top) or (g.side == "long" and bar.close < g.bottom):
                    g.inverted_at = bar.end
                    events.append(("inverted", g))
            elif (g.side == "short" and bar.close < g.bottom) or (g.side == "long" and bar.close > g.top):
                g.void_at = bar.end
                events.append(("void", g))
        self.last.append(bar)
        if len(self.last) == 3:
            a, _, c = self.last
            if c.low - a.high >= self.min_size:
                g = Fvg("long", c.low, a.high, c.ts, c.end, self.timeframe)
                self.gaps.append(g)
                events.append(("new", g))
            elif a.low - c.high >= self.min_size:
                g = Fvg("short", a.low, c.high, c.ts, c.end, self.timeframe)
                self.gaps.append(g)
                events.append(("new", g))
        return events


@dataclass(slots=True)
class _Range:
    """High and low of something still running (a trading day, a session)."""
    key: str = ""
    hi: float = float("-inf")
    lo: float = float("inf")
    hi_ts: int = 0
    lo_ts: int = 0
    live: bool = False

    def add(self, bar: Bar) -> None:
        if bar.high > self.hi:
            self.hi, self.hi_ts = bar.high, bar.ts
        if bar.low < self.lo:
            self.lo, self.lo_ts = bar.low, bar.ts


class Liquidity:
    """The liquidity map: previous-day, overnight and session highs and lows, confirmed 1H and 4H swings and (if on)
    equal highs / lows. A level becomes usable at `known_at`. The first 1-minute bar to trade through it marks it
    'breached'; the strategy then decides, on 5-minute closes, whether that was a sweep (reclaimed) or a break."""

    def __init__(self, cfg: Config, inst: Instrument) -> None:
        self.cfg, self.inst = cfg, inst
        self.levels: list[Level] = []
        self._next = 1
        self._day = _Range()
        self._sessions: list[tuple[Session, str, _Range]] = []
        if cfg.use_sessions:
            self._sessions += [(s, f"session:{s.name}", _Range()) for s in cfg.sessions]
        if cfg.use_overnight:
            self._sessions.append((cfg.overnight, "overnight", _Range()))
        self._equal: dict[str, list[Pivot]] = {"high": [], "low": []}
        self._hi = float("inf")                 # lowest untouched high / highest untouched low: nothing can be breached inside them
        self._lo = float("-inf")
        self._waiting = False                   # some level is breached and not yet resolved
        self.created: list[Level] = []          # levels added since the caller last looked (for the journal)

    def _add(self, kind: str, edge: str, price: float, formed_at: int, known_at: int, key: str) -> Level:
        lv = Level(self._next, kind, edge, price, formed_at, known_at, key)  # type: ignore[arg-type]
        self._next += 1
        self.levels.append(lv)
        self.created.append(lv)
        self.touch()
        return lv

    def touch(self) -> None:
        """Levels changed (added, resolved, dropped): refresh the quick bounds."""
        act = [lv for lv in self.levels if lv.state == "active"]
        self._hi = min((lv.price for lv in act if lv.edge == "high"), default=float("inf"))
        self._lo = max((lv.price for lv in act if lv.edge == "low"), default=float("-inf"))
        self._waiting = any(lv.state == "breached" for lv in self.levels)

    def _close_range(self, kind: str, r: _Range, now: int) -> None:
        if r.live and r.hi > float("-inf"):
            self._add(kind, "high", r.hi, r.hi_ts, now, r.key)
            self._add(kind, "low", r.lo, r.lo_ts, now, r.key)

    def on_minute(self, bar: Bar, tick: Tick) -> None:
        cfg, day = self.cfg, str(tick.trading_day)
        # 1. things that ended before this bar opened become levels now
        if self._day.live and self._day.key != day:
            if cfg.use_previous_day:
                self._close_range("pd", self._day, bar.ts)
            self._day = _Range()
            horizon = bar.ts - cfg.level_max_age_days * 86400
            self.levels = [lv for lv in self.levels if lv.formed_at >= horizon and lv.state in ("active", "breached")]
            self.touch()
        for i, (s, kind, r) in enumerate(self._sessions):
            inside = in_window(tick.minutes, hm(s.start), hm(s.end))
            key = f"{day}:{s.name}"
            if r.live and (not inside or r.key != key):
                self._close_range(kind, r, bar.ts)
                r = _Range()
                self._sessions[i] = (s, kind, r)
            if inside:
                r.live, r.key = True, key
        # 2. does this bar trade through a level that already existed when it opened?
        step = cfg.sweep_min_ticks * self.inst.tick
        hit = self._waiting or bar.high >= self._hi + step or bar.low <= self._lo - step
        for lv in self.levels if hit else ():
            if lv.known_at > bar.ts:
                continue
            if lv.state == "active":
                if lv.edge == "high" and bar.high >= lv.price + step:
                    lv.state, lv.breached_at, lv.extreme = "breached", bar.ts, bar.high
                elif lv.edge == "low" and bar.low <= lv.price - step:
                    lv.state, lv.breached_at, lv.extreme = "breached", bar.ts, bar.low
            elif lv.state == "breached" and lv.extreme is not None:
                lv.extreme = max(lv.extreme, bar.high) if lv.edge == "high" else min(lv.extreme, bar.low)
        if hit:
            self.touch()
        # 3. this bar joins whatever is still running
        self._day.live, self._day.key = True, day
        self._day.add(bar)
        for _, _, r in self._sessions:
            if r.live:
                r.add(bar)

    def on_swing(self, timeframe: int, p: Pivot) -> None:
        self._add(f"swing:{timeframe}", p.edge, p.price, p.ts, p.confirmed_at, str(p.ts))

    def on_equal(self, timeframe: int, p: Pivot) -> None:
        """Two confirmed pivots within a few ticks of each other: stops rest just beyond the pair."""
        tol = self.cfg.equal_tolerance_ticks * self.inst.tick
        seen = self._equal[p.edge]
        for q in seen[-20:]:
            if abs(q.price - p.price) <= tol and p.ts - q.ts <= 2 * 86400:
                price = max(p.price, q.price) if p.edge == "high" else min(p.price, q.price)
                self._add(f"equal:{timeframe}", p.edge, price, p.ts, p.confirmed_at, str(q.ts))
                break
        seen.append(p)
        del seen[:-40]

    def pending(self) -> list[Level]:
        return [lv for lv in self.levels if lv.state == "breached"]

    def targets(self, side: str, price: float, now: int) -> list[Level]:
        """Untouched levels on the far side of `price`, nearest first: where a move in this direction is drawn to."""
        if side == "long":
            out = [lv for lv in self.levels if lv.edge == "high" and lv.state == "active" and lv.known_at <= now and lv.price > price]
            return sorted(out, key=lambda lv: lv.price)
        out = [lv for lv in self.levels if lv.edge == "low" and lv.state == "active" and lv.known_at <= now and lv.price < price]
        return sorted(out, key=lambda lv: -lv.price)

    def match(self, other: Level, window: int) -> Level | None:
        """The level on THIS instrument that corresponds to `other` on the other index: the same day or session, or a
        swing of the same timeframe made at about the same time."""
        same = [lv for lv in self.levels if lv.kind == other.kind and lv.edge == other.edge]
        if other.kind.startswith(("swing", "equal")):
            near = [lv for lv in same if abs(lv.formed_at - other.formed_at) <= window]
            return min(near, key=lambda lv: abs(lv.formed_at - other.formed_at)) if near else None
        for lv in same:
            if lv.key == other.key:
                return lv
        return None


class Market:
    """Everything derived for one instrument. Feed it 1-minute bars in order; it hands back the 5-minute bars that
    just closed."""

    KEEP_5M = 4500          # about three weeks, for the SMT look-back

    def __init__(self, symbol: str, cfg: Config, clock: Clock) -> None:
        self.symbol, self.cfg, self.clock = symbol, cfg, clock
        self.inst = instrument(symbol)
        self.liq = Liquidity(cfg, self.inst)
        self.agg5, self.agg15 = Aggregator(5), Aggregator(15)
        self.agg60, self.agg240 = Aggregator(60), Aggregator(240, anchor=18 * 60)
        self.piv5 = Pivots(cfg.bos_pivot, cfg.bos_pivot)
        self.piv5c = Pivots(cfg.cont_pivot, cfg.cont_pivot)
        self.piv15 = Pivots(2, 2)
        self.piv60, self.piv240 = Pivots(cfg.htf_pivot, cfg.htf_pivot), Pivots(cfg.htf_pivot, cfg.htf_pivot)
        self.piv1 = Pivots(2, 2)
        min_gap = cfg.fvg_min_ticks * self.inst.tick
        self.gaps5, self.gaps1 = Gaps(5, min_gap), Gaps(1, min_gap, keep=120)
        self.bars5: deque[Bar] = deque(maxlen=self.KEEP_5M)
        self.n5 = 0                                   # how many 5m bars have closed: index of the next one
        self.swings5: deque[Pivot] = deque(maxlen=120)     # structure pivots (BOS)
        self.micro5: deque[Pivot] = deque(maxlen=120)      # small pivots (higher low / lower high)
        self.swings1: deque[Pivot] = deque(maxlen=200)
        self.last: Bar | None = None
        self.track_1m = cfg.model == "E"             # 1-minute structure is only needed by the experimental model
        self.atr5 = 0.0
        self._prev5: Bar | None = None
        self.new_micro: list[Pivot] = []              # micro pivots confirmed by the latest 5m bar

    def bar5(self, index: int) -> Bar | None:
        back = self.n5 - 1 - index
        return self.bars5[-1 - back] if 0 <= back < len(self.bars5) else None

    def _on5(self, b: Bar) -> None:
        if self._prev5 is not None:
            tr = max(b.high - b.low, abs(b.high - self._prev5.close), abs(b.low - self._prev5.close))
            self.atr5 = tr if self.atr5 == 0 else (self.atr5 * 13 + tr) / 14
        self._prev5 = b
        self.bars5.append(b)
        self.n5 += 1
        self.swings5.extend(self.piv5.add(b))
        self.new_micro = self.piv5c.add(b)
        self.micro5.extend(self.new_micro)
        self.gaps5.add(b)

    def _higher(self, now: int, bar: Bar | None, tick: Tick | None) -> None:
        for agg, piv, tf in ((self.agg60, self.piv60, 60), (self.agg240, self.piv240, 240), (self.agg15, self.piv15, 15)):
            done = agg.add(bar, tick) if bar is not None and tick is not None else [x for x in [agg.flush(now)] if x]
            for b in done:
                for p in piv.add(b):
                    if tf == 15:
                        if self.cfg.use_equal_levels:
                            self.liq.on_equal(15, p)
                    elif (tf == 60 and self.cfg.use_swings_1h) or (tf == 240 and self.cfg.use_swings_4h):
                        self.liq.on_swing(tf, p)

    def advance(self, now: int) -> list[Bar]:
        """Time has reached `now` without a new bar for this instrument: close any bucket whose time is up."""
        self._higher(now, None, None)
        done = [x for x in [self.agg5.flush(now)] if x]
        for b in done:
            self._on5(b)
        return done

    def on_minute(self, bar: Bar, tick: Tick) -> list[Bar]:
        self.last = bar
        self.liq.on_minute(bar, tick)
        if self.track_1m:
            self.swings1.extend(self.piv1.add(bar))
            self.gaps1.add(bar)
        self._higher(bar.end, bar, tick)
        done = self.agg5.add(bar, tick)
        for b in done:
            self._on5(b)
        return done
