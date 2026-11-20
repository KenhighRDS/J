"""Contract facts. Multipliers and ticks are CME's published specifications (see docs/tjr/providers.md for the
official product pages and the date they were checked). `family` ties a micro to its big contract: same index, same
prices, a tenth of the money."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Instrument:
    symbol: str
    family: str          # NQ or ES
    point_value: float   # dollars per index point, one contract
    tick: float          # minimum price step, in index points

    @property
    def tick_value(self) -> float:
        return self.point_value * self.tick

    def round(self, price: float) -> float:
        return round(round(price / self.tick) * self.tick, 10)

    def ticks(self, points: float) -> int:
        return round(points / self.tick)


INSTRUMENTS: dict[str, Instrument] = {
    "NQ": Instrument("NQ", "NQ", 20.0, 0.25),
    "MNQ": Instrument("MNQ", "NQ", 2.0, 0.25),
    "ES": Instrument("ES", "ES", 50.0, 0.25),
    "MES": Instrument("MES", "ES", 5.0, 0.25),
}

#: the other index, for SMT: which data family to compare a family with
SMT_PAIR = {"NQ": "ES", "ES": "NQ"}


def instrument(symbol: str) -> Instrument:
    root = symbol.upper().split(".")[0]          # "NQ.v.0" and "NQZ6" style names both start with the root
    for name in sorted(INSTRUMENTS, key=len, reverse=True):
        if root.startswith(name):
            return INSTRUMENTS[name]
    raise KeyError(f"unknown futures symbol: {symbol}")
