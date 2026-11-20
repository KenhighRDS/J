"""The plain records the engine passes around. Times are whole seconds since the epoch, UTC. A bar's `ts` is the moment
it OPENED; nothing may act on a bar before `end`."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

Side = Literal["long", "short"]
Edge = Literal["high", "low"]
LEVEL_NAMES = {"pd": "previous day", "overnight": "overnight", "swing:60": "1-hour swing", "swing:240": "4-hour swing", "equal:15": "equal", "session:asia": "Asia",
               "session:london": "London", "session:premarket": "premarket", "session:ny_am": "New York morning", "session:ny_pm": "New York afternoon"}


def money(x: float) -> str:
    """A price as people write it: 21,966.00"""
    return f"{x:,.2f}"


@dataclass(frozen=True, slots=True)
class Bar:
    ts: int          # open time
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0
    span: int = 60   # seconds covered

    @property
    def end(self) -> int:
        return self.ts + self.span


@dataclass(slots=True)
class Pivot:
    edge: Edge
    price: float
    ts: int              # open time of the bar that made it
    confirmed_at: int    # close time of the last bar needed to confirm it: unusable before this
    index: int           # position of the pivot bar in its own series


@dataclass(slots=True)
class Level:
    """A price where stops are assumed to rest. Usable only from `known_at` on, and only until price trades through it."""
    id: int
    kind: str            # pd, overnight, session:<name>, swing:60, swing:240, equal:<tf>
    edge: Edge
    price: float
    formed_at: int       # when the extreme itself was made
    known_at: int        # when the level became knowable (day/session over, pivot confirmed)
    key: str = ""        # what makes it "the same level" on another instrument, e.g. "2026-03-04"
    breached_at: int | None = None   # first 1-minute bar that traded through it
    extreme: float | None = None     # furthest price since the breach, while a reclaim is still possible
    state: str = "active"            # active -> breached -> swept | broken ; or expired

    @property
    def label(self) -> str:
        """Machine name, stable: the app maps it to its own wording."""
        return f"{self.kind} {self.edge}"

    @property
    def name(self) -> str:
        """The same level in words, for the reasons written into the journal."""
        return f"{LEVEL_NAMES.get(self.kind, self.kind)} {self.edge}"


@dataclass(slots=True)
class Confirmation:
    kind: str            # sweep, bos, ifvg, smt, ext79, higher_low, lower_high, candle_break, equilibrium, fvg_retest, bos_1m, ifvg_1m
    side: Side
    ts: int              # when it became true (a bar close)
    value: float         # the price that matters for it
    timeframe: int       # minutes
    reason: str
    expires_at: int | None = None
    extra: dict = field(default_factory=dict)   # what a chart needs to draw it (a gap's edges, a level's price)


@dataclass(slots=True)
class Fvg:
    """Three-candle gap. `top` > `bottom` always. A bullish gap is support until a close below `bottom`; then it is
    'inversed' and counts for the other side."""
    side: Side           # long = bullish gap (left behind by a move up)
    top: float
    bottom: float
    ts: int              # open of the third candle
    known_at: int        # close of the third candle
    timeframe: int
    inverted_at: int | None = None
    void_at: int | None = None       # an inversed gap closed through again: no longer counts


@dataclass(slots=True)
class Signal:
    """An order the strategy wants. Created at a bar close; the earliest fill is the next bar's open."""
    id: int
    symbol: str
    model: str
    side: Side
    ts: int
    ref_price: float     # close of the bar that triggered it
    stop: float
    target: float | None
    target_label: str
    confirmations: list[Confirmation] = field(default_factory=list)
    levels: list[str] = field(default_factory=list)
    setup_id: int = 0
    experimental: bool = False
    marks: list[dict] = field(default_factory=list)   # the swept levels and the target, with prices and times, for the chart


@dataclass(slots=True)
class Rejection:
    ts: int
    symbol: str
    side: Side | None
    stage: str           # sweep, bos, continuation, trigger, risk, session, data
    reason: str
    setup_id: int = 0
    detail: dict = field(default_factory=dict)


@dataclass(slots=True)
class Trade:
    id: int
    symbol: str
    model: str
    side: Side
    qty: int
    signal_ts: int
    entry_ts: int
    entry: float
    stop: float                 # the stop at entry: defines R
    target: float | None
    target_label: str
    exit_ts: int = 0
    exit: float = 0.0
    exit_reason: str = ""       # target, stop, flatten, breakeven, trail, end_of_data
    risk_usd: float = 0.0       # planned loss at the stop, costs included
    gross_usd: float = 0.0
    costs_usd: float = 0.0
    net_usd: float = 0.0
    r: float = 0.0              # net result in units of planned risk
    mae: float = 0.0            # worst excursion against, in points
    mfe: float = 0.0            # best excursion in favour, in points
    partials: list[dict] = field(default_factory=list)
    confirmations: list[Confirmation] = field(default_factory=list)
    levels: list[str] = field(default_factory=list)
    setup_id: int = 0
    marks: list[dict] = field(default_factory=list)
    experimental: bool = False
