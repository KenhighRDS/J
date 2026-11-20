"""Risk checks, sizing and simulated fills. The same book runs a backtest and automatic paper trading: both feed it
1-minute bars and signals, and it decides what was filled and at what price. Deliberately pessimistic:

- a market entry fills at the NEXT bar's open, plus slippage;
- a stop fills at its price or worse (at the open if the bar gapped through it), plus slippage;
- a target (limit) fills only if price trades THROUGH it by `limit_through_ticks`;
- when one 1-minute bar touches both stop and target, the stop is assumed to have come first.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .clock import Tick, hm
from .config import Config
from .instruments import Instrument
from .types import Bar, Pivot, Rejection, Signal, Trade


@dataclass(slots=True)
class Position:
    trade: Trade
    qty: int                 # contracts still open
    stop: float              # current stop (may have moved)
    r_points: float          # entry to the original stop, in points
    entry_bar_ts: int
    stop_kind: str = "stop"  # what an exit at the stop is called once it has been moved: breakeven, trail
    partial_done: bool = False
    best: float = 0.0        # furthest favourable price


@dataclass(slots=True)
class DayState:
    day: str = ""
    start_equity: float = 0.0
    trades: int = 0
    full_losses: int = 0
    locked: str = ""


@dataclass
class Book:
    cfg: Config
    inst: Instrument
    equity: float = 0.0
    trades: list[Trade] = field(default_factory=list)
    rejections: list[Rejection] = field(default_factory=list)
    events: list[dict] = field(default_factory=list)
    curve: list[tuple[int, float]] = field(default_factory=list)
    killed: bool = False
    position: Position | None = None
    pending: tuple[Signal, int, float] | None = None      # signal, contracts, planned risk in dollars
    day: DayState = field(default_factory=DayState)
    _ids: int = 0

    def __post_init__(self) -> None:
        self.equity = self.equity or self.cfg.risk.start_equity
        self._flat = hm(self.cfg.flatten_at)
        self._start = hm(self.cfg.session_start)

    # ------------------------------------------------------------------ risk
    def _roll_day(self, tick: Tick) -> None:
        d = str(tick.day)
        if d != self.day.day:
            self.day = DayState(d, self.equity)

    def risk_per_contract(self, sig: Signal) -> float:
        c = self.cfg.costs
        points = abs(sig.ref_price - sig.stop) + (c.slippage_ticks_entry + c.slippage_ticks_stop) * self.inst.tick
        return points * self.inst.point_value + 2 * c.commission_per_side

    def submit(self, sig: Signal, tick: Tick) -> Rejection | None:
        """A signal asks to trade. Returns why not, or None once an order is waiting for the next bar."""
        self._roll_day(tick)
        r, why = self.cfg.risk, ""
        budget = self.equity * r.risk_pct / 100
        per = self.risk_per_contract(sig)
        qty = min(int(budget // per) if per > 0 else 0, r.max_contracts)
        if self.killed:
            why = "kill switch is on"
        elif self.position is not None or self.pending is not None:
            why = "already in a trade"
        elif self.day.locked:
            why = self.day.locked
        elif self.day.trades >= r.max_trades_per_day:
            why = f"daily limit of {r.max_trades_per_day} trades reached"
        elif qty < 1:
            why = f"one contract risks ${per:,.2f}, more than the ${budget:,.2f} budget"
        if why:
            rej = Rejection(sig.ts, sig.symbol, sig.side, "risk", why, sig.setup_id, {"signal": sig.id})
            self.rejections.append(rej)
            self.events.append({"ts": sig.ts, "type": "risk", "ok": False, "signal": sig.id, "reason": why})
            return rej
        self.pending = (sig, qty, qty * per)
        self.events.append({"ts": sig.ts, "type": "order", "signal": sig.id, "side": sig.side, "qty": qty, "kind": "market", "stop": sig.stop, "target": sig.target, "risk_usd": round(qty * per, 2)})
        return None

    # ------------------------------------------------------------------ fills
    def _cancel(self, ts: int, reason: str) -> None:
        if self.pending is None:
            return
        sig = self.pending[0]
        self.pending = None
        self.rejections.append(Rejection(ts, sig.symbol, sig.side, "fill", reason, sig.setup_id, {"signal": sig.id}))
        self.events.append({"ts": ts, "type": "cancel", "signal": sig.id, "reason": reason})

    def _open(self, bar: Bar, tick: Tick) -> None:
        assert self.pending is not None
        sig, qty, risk_usd = self.pending
        c, t, sign = self.cfg.costs, self.inst.tick, (1 if sig.side == "long" else -1)
        if bar.ts - sig.ts > 300:
            return self._cancel(bar.ts, "no bar to fill on within five minutes")
        if tick.minutes >= self._flat or tick.minutes < self._start:
            return self._cancel(bar.ts, "next bar is past the flatten time")
        if (bar.open - sig.stop) * sign <= 0:
            return self._cancel(bar.ts, "opened beyond the stop")
        if sig.target is not None and (sig.target - bar.open) * sign <= 0:
            return self._cancel(bar.ts, "opened beyond the target")
        price = self.inst.round(bar.open + sign * c.slippage_ticks_entry * t)
        self.pending = None
        self._ids += 1
        tr = Trade(self._ids, self.cfg.trade_symbol, sig.model, sig.side, qty, sig.ts, bar.ts, price, sig.stop, sig.target, sig.target_label,
                   risk_usd=risk_usd, confirmations=sig.confirmations, levels=sig.levels, setup_id=sig.setup_id, marks=sig.marks, experimental=sig.experimental)
        tr.costs_usd = qty * (c.commission_per_side + c.slippage_ticks_entry * self.inst.tick_value)
        self.position = Position(tr, qty, sig.stop, abs(price - sig.stop), bar.ts, best=price)
        self.day.trades += 1
        self.events.append({"ts": bar.ts, "type": "fill", "trade": tr.id, "signal": sig.id, "side": sig.side, "qty": qty, "price": price, "kind": "entry"})

    def _close(self, qty: int, price: float, ts: int, reason: str, slip_ticks: float) -> None:
        """Close `qty` contracts at `price` (slippage already in the price; counted here as a cost for the report)."""
        pos = self.position
        assert pos is not None
        tr, sign, c = pos.trade, (1 if pos.trade.side == "long" else -1), self.cfg.costs
        gross = (price - tr.entry) * sign * self.inst.point_value * qty
        cost = qty * (c.commission_per_side + slip_ticks * self.inst.tick_value)
        tr.gross_usd += gross + (slip_ticks * self.inst.tick_value * qty)   # gross is before slippage; net below is after
        tr.costs_usd += cost
        pos.qty -= qty
        self.events.append({"ts": ts, "type": "fill", "trade": tr.id, "side": "short" if sign > 0 else "long", "qty": qty, "price": price, "kind": reason})
        if pos.qty > 0:
            tr.partials.append({"ts": ts, "qty": qty, "price": price, "reason": reason})
            return
        entry_slip = tr.qty * c.slippage_ticks_entry * self.inst.tick_value
        tr.gross_usd += entry_slip
        tr.exit_ts, tr.exit, tr.exit_reason = ts, price, reason
        tr.net_usd = round(tr.gross_usd - tr.costs_usd, 2)
        tr.gross_usd, tr.costs_usd = round(tr.gross_usd, 2), round(tr.costs_usd, 2)
        tr.r = round(tr.net_usd / tr.risk_usd, 3) if tr.risk_usd else 0.0
        self.equity = round(self.equity + tr.net_usd, 2)
        self.trades.append(tr)
        self.curve.append((ts, self.equity))
        self.position = None
        r = self.cfg.risk
        if reason == "stop" and tr.net_usd <= -0.9 * tr.risk_usd:
            self.day.full_losses += 1
            if self.day.full_losses >= r.max_full_losses_per_day:
                self.day.locked = f"stopped for the day after {self.day.full_losses} full losses"
        if r.max_daily_loss_pct > 0 and self.day.start_equity > 0 and (self.day.start_equity - self.equity) / self.day.start_equity * 100 >= r.max_daily_loss_pct:
            self.day.locked = f"daily loss limit of {r.max_daily_loss_pct:g}% reached"
        if self.day.locked:
            self.events.append({"ts": ts, "type": "risk", "ok": False, "reason": self.day.locked})

    def on_bar(self, bar: Bar, tick: Tick) -> None:
        """Called with each new 1-minute bar BEFORE the strategy sees it: fill what was waiting, then manage the trade."""
        self._roll_day(tick)
        entered = False
        if self.pending is not None:
            self._open(bar, tick)
            entered = self.position is not None
        pos = self.position
        if pos is None:
            return
        tr, c, t, ex = pos.trade, self.cfg.costs, self.inst.tick, self.cfg.exits
        sign = 1 if tr.side == "long" else -1
        if not entered and (tick.minutes >= self._flat or tick.minutes < self._start or str(tick.day) != self.day.day):
            price = self.inst.round(bar.open - sign * c.slippage_ticks_market_exit * t)
            return self._close(pos.qty, price, bar.ts, "flatten", c.slippage_ticks_market_exit)
        fav, adv = (bar.high, bar.low) if sign > 0 else (bar.low, bar.high)
        tr.mfe = max(tr.mfe, (fav - tr.entry) * sign)
        tr.mae = max(tr.mae, (tr.entry - adv) * sign)
        through = c.limit_through_ticks * t
        gapped_to_target = (not entered) and tr.target is not None and (bar.open - tr.target) * sign >= 0
        if gapped_to_target and tr.target is not None:
            return self._close(pos.qty, tr.target, bar.ts, "target", 0)
        if (pos.stop - adv) * sign >= 0:                       # stop first when in doubt
            worst = min(pos.stop, bar.open) if sign > 0 else max(pos.stop, bar.open)
            price = self.inst.round(worst - sign * c.slippage_ticks_stop * t)
            return self._close(pos.qty, price, bar.ts, pos.stop_kind, c.slippage_ticks_stop)
        if ex.partial_at_r > 0 and not pos.partial_done and pos.qty >= 2:
            part = self.inst.round(tr.entry + sign * ex.partial_at_r * pos.r_points)
            if (fav - part) * sign >= through:
                pos.partial_done = True
                self._close(max(1, int(pos.qty * ex.partial_fraction)), part, bar.ts, "partial", 0)
        if tr.target is not None and (fav - tr.target) * sign >= through:
            return self._close(pos.qty, tr.target, bar.ts, "target", 0)
        pos.best = max(pos.best, fav) if sign > 0 else min(pos.best, fav)
        if ex.breakeven_at_r > 0 and pos.stop_kind == "stop" and (pos.best - tr.entry) * sign >= ex.breakeven_at_r * pos.r_points:
            pos.stop, pos.stop_kind = tr.entry, "breakeven"   # in force from the next bar

    def on_pivots(self, pivots: list[Pivot]) -> None:
        """Structure trail: once far enough in profit, the stop follows each new confirmed 5-minute swing."""
        pos, ex = self.position, self.cfg.exits
        if pos is None or ex.trail != "structure":
            return
        tr = pos.trade
        sign = 1 if tr.side == "long" else -1
        if (pos.best - tr.entry) * sign < ex.trail_after_r * pos.r_points:
            return
        for p in pivots:
            if p.edge == ("low" if sign > 0 else "high"):
                new = self.inst.round(p.price - sign * self.inst.tick)
                if (new - pos.stop) * sign > 0:
                    pos.stop, pos.stop_kind = new, "trail"

    def close_all(self, price: float, ts: int, reason: str) -> None:
        if self.pending is not None:
            self._cancel(ts, reason)
        if self.position is not None:
            self._close(self.position.qty, price, ts, reason, 0)

    def kill(self, price: float, ts: int) -> None:
        """Emergency stop: nothing new, and whatever is open is closed now."""
        self.killed = True
        self.events.append({"ts": ts, "type": "risk", "ok": False, "reason": "kill switch pressed"})
        self.close_all(price, ts, "kill")
