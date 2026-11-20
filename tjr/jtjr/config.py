"""Every number the strategy uses, in one versioned record. Nothing here is a claim about what TJR does: the source
screenshot gives a sequence, not numbers. Each default is a test parameter (see docs/tjr/strategy-spec.md, which
separates what the source shows from what is a hypothesis)."""
from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, field, fields, replace
from typing import Any

RULES_VERSION = "0.1.0"

#: entry models. E is the reading of the source as timeframes (5-minute confirmation, 5-minute continuation,
#: 1-minute confirmation); it is a reconstruction and stays experimental.
MODELS = {
    "A": "Baseline: sweep + reclaim + BOS + higher low / lower high + break of the continuation candle",
    "B": "Model A plus a validated inverse FVG",
    "C": "Model A plus SMT divergence against the other index",
    "D": "Model A plus inverse FVG and SMT",
    "E": "Experimental reconstruction: 5m confirmation, 5m continuation (equilibrium or FVG), 1m confirmation",
}


@dataclass(frozen=True)
class Session:
    name: str
    start: str           # New York time, "HH:MM"
    end: str


@dataclass(frozen=True)
class Costs:
    commission_per_side: float = 0.61     # dollars per contract per side, all fees in; set from the broker actually used
    slippage_ticks_entry: float = 1.0     # market entry
    slippage_ticks_stop: float = 1.0      # stop orders fill worse than their price
    slippage_ticks_market_exit: float = 1.0   # flatten at a time
    limit_through_ticks: int = 1          # a target counts as filled only if price trades this far through it


@dataclass(frozen=True)
class Risk:
    start_equity: float = 10_000.0
    risk_pct: float = 0.5                 # of equity per trade (research range 0.25 to 0.5)
    max_trades_per_day: int = 2
    max_full_losses_per_day: int = 2      # stop for the day after this many full-risk losses
    max_daily_loss_pct: float = 0.0       # 0 = off; otherwise lock out once the day's loss reaches this
    max_contracts: int = 20


@dataclass(frozen=True)
class Exits:
    stop: str = "sweep"                   # sweep (one tick beyond the sweep extreme) | structure | atr
    stop_ticks_beyond: int = 1
    atr_mult: float = 1.5                 # for stop = atr
    target: str = "liquidity"             # liquidity (nearest opposing level) | r (fixed multiple)
    target_r: float = 2.0                 # for target = r
    min_rr: float = 2.0                   # liquidity target must offer at least this at signal time
    target_rule: str = "nearest"          # nearest (skip the trade if it is too close) | first_with_min_rr
    partial_at_r: float = 0.0             # 0 = off: take `partial_fraction` off at this multiple
    partial_fraction: float = 0.5
    breakeven_at_r: float = 0.0           # 0 = off: move the stop to entry once this multiple is reached
    trail: str = "none"                   # none | structure (below each new confirmed 5m swing once in profit)
    trail_after_r: float = 1.0


@dataclass(frozen=True)
class Config:
    # ---- what and when
    model: str = "A"
    symbol: str = "NQ"                    # data used for signals
    trade_symbol: str = "MNQ"             # contract actually traded (same index, own multiplier)
    smt_symbol: str = "ES"                # the other index, for SMT
    session_start: str = "09:30"          # New York
    session_end: str = "11:30"
    flatten_at: str = "11:30"             # every position is closed here
    min_minutes_left: int = 10            # no new entry this close to the flatten time
    sides: tuple[str, ...] = ("long", "short")

    # ---- liquidity map
    sessions: tuple[Session, ...] = (
        Session("asia", "18:00", "03:00"),
        Session("london", "03:00", "08:00"),
        Session("premarket", "08:00", "09:30"),
        Session("ny_am", "09:30", "12:00"),
        Session("ny_pm", "12:00", "17:00"),
    )
    overnight: Session = Session("overnight", "18:00", "09:30")
    use_previous_day: bool = True
    use_overnight: bool = True
    use_sessions: bool = True
    use_swings_1h: bool = True
    use_swings_4h: bool = True
    use_equal_levels: bool = False        # two confirmed 15m pivots at (almost) the same price
    equal_tolerance_ticks: int = 4
    htf_pivot: int = 2                    # bars each side to confirm a 1H / 4H swing
    level_max_age_days: int = 10          # older levels are dropped
    # ---- sweep
    sweep_min_ticks: int = 1              # price must trade at least this far through the level
    reclaim_timeout_bars: int = 3         # 5m closes allowed to get back across it, the breaching bar included
    sweep_in_session_only: bool = True    # source 2b (sweep in premarket / another session) is unreadable: not modelled
    # ---- structure on the signal timeframe (5 minutes)
    bos_pivot: int = 2                    # bars each side for the swing that a BOS has to break
    bos_window_bars: int = 6              # BOS must come within this many completed 5m bars after the sweep
    setup_expiry_bars: int = 12           # the whole setup dies this many 5m bars after the sweep
    cont_pivot: int = 1                   # bars each side for the higher low / lower high
    fvg_min_ticks: int = 1                # smaller gaps are ignored
    ifvg_lookback_bars: int = 12          # an inversed gap must have formed this recently before the sweep
    smt_window_bars: int = 6              # how long before the sweep the other index is watched, in 5m bars
    # ---- experimental pieces (off unless a model needs them and they are enabled)
    use_ext79: bool = False               # "79% extension": anchors are not defined by the source
    ext79_level: float = 0.79
    e_confirmations: tuple[str, ...] = ("bos", "ifvg", "smt")   # what counts at steps 2 and 4 of model E
    e_equilibrium: float = 0.5

    costs: Costs = field(default_factory=Costs)
    risk: Risk = field(default_factory=Risk)
    exits: Exits = field(default_factory=Exits)

    def __post_init__(self) -> None:
        if self.model not in MODELS:
            raise ValueError(f"unknown model {self.model!r}; choose one of {sorted(MODELS)}")

    @property
    def experimental(self) -> bool:
        return self.model == "E" or self.use_ext79

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def fingerprint(self) -> str:
        """Same rules and numbers -> same id, whoever runs them."""
        blob = json.dumps({"rules": RULES_VERSION, **self.to_dict()}, sort_keys=True, default=str)
        return hashlib.sha256(blob.encode()).hexdigest()[:16]

    def with_(self, **changes: Any) -> "Config":
        """A copy with some values changed; 'risk.risk_pct' style keys reach into the nested records."""
        top: dict[str, Any] = {}
        nested: dict[str, dict[str, Any]] = {}
        for key, value in changes.items():
            if "." in key:
                group, name = key.split(".", 1)
                nested.setdefault(group, {})[name] = value
            else:
                top[key] = value
        for group, vals in nested.items():
            top[group] = replace(getattr(self, group), **vals)
        return replace(self, **top)

    @staticmethod
    def from_dict(d: dict[str, Any]) -> "Config":
        d = dict(d)
        known = {f.name for f in fields(Config)}
        unknown = set(d) - known
        if unknown:
            raise ValueError(f"unknown config keys: {sorted(unknown)}")
        if "sessions" in d:
            d["sessions"] = tuple(s if isinstance(s, Session) else Session(**s) for s in d["sessions"])
        if "overnight" in d and not isinstance(d["overnight"], Session):
            d["overnight"] = Session(**d["overnight"])
        for name, cls in (("costs", Costs), ("risk", Risk), ("exits", Exits)):
            if name in d and not isinstance(d[name], cls):
                d[name] = cls(**d[name])
        for name in ("sides", "e_confirmations"):
            if name in d:
                d[name] = tuple(d[name])
        return Config(**d)
