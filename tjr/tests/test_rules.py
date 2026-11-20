"""The building blocks: clock, bars, pivots, gaps, liquidity. Each test states the rule it protects."""
from datetime import date

import pytest

from jtjr.clock import Clock, to_ts
from jtjr.config import Config
from jtjr.instruments import INSTRUMENTS, instrument
from jtjr.market import Aggregator, Gaps, Liquidity, Pivots
from jtjr.types import Bar

from .tape import D0, D1, Tape, sweep_long


def b(ts, o, h, l, c, span=300):
    return Bar(ts, o, h, l, c, 0, span)


# ---------------------------------------------------------------- clock
def test_trading_day_starts_at_six_in_the_evening():
    clock = Clock()
    assert clock.at(to_ts(date(2026, 3, 3), 17 * 60 + 59)).trading_day == date(2026, 3, 3)
    assert clock.at(to_ts(date(2026, 3, 3), 18 * 60)).trading_day == date(2026, 3, 4)
    assert clock.at(to_ts(date(2026, 3, 1), 18 * 60)).trading_day == date(2026, 3, 2)      # Sunday evening is Monday's day


def test_new_york_time_follows_daylight_saving():
    clock = Clock()
    winter, summer = to_ts(date(2026, 3, 6), 9 * 60 + 30), to_ts(date(2026, 3, 9), 9 * 60 + 30)   # clocks change on 8 March 2026
    assert clock.at(winter).minutes == clock.at(summer).minutes == 570
    assert (winter % 86400) // 3600 == 14 and (summer % 86400) // 3600 == 13                # 14:30 UTC, then 13:30 UTC


# ---------------------------------------------------------------- contracts
def test_contract_money():
    assert (INSTRUMENTS["NQ"].point_value, INSTRUMENTS["NQ"].tick_value) == (20, 5)
    assert (INSTRUMENTS["MNQ"].point_value, INSTRUMENTS["MNQ"].tick_value) == (2, 0.5)
    assert (INSTRUMENTS["ES"].point_value, INSTRUMENTS["ES"].tick_value) == (50, 12.5)
    assert (INSTRUMENTS["MES"].point_value, INSTRUMENTS["MES"].tick_value) == (5, 1.25)
    assert instrument("MNQZ6").symbol == "MNQ" and instrument("ESH7").symbol == "ES" and instrument("NQ.v.0").symbol == "NQ"
    assert INSTRUMENTS["NQ"].round(20000.13) == 20000.25


# ---------------------------------------------------------------- bars
def test_five_minute_bar_is_only_released_when_its_last_minute_has_closed():
    clock, agg = Clock(), Aggregator(5)
    t0 = to_ts(D1, 9 * 60 + 30)
    out = []
    for i in range(5):
        bar = Bar(t0 + i * 60, 100 + i, 101 + i, 99 + i, 100.5 + i)
        done = agg.add(bar, clock.at(bar.ts))
        assert (len(done) == 1) == (i == 4)
        out += done
    assert (out[0].ts, out[0].open, out[0].high, out[0].low, out[0].close, out[0].end) == (t0, 100, 105, 99, 104.5, t0 + 300)


def test_bucket_with_a_missing_last_minute_closes_on_time_not_early():
    clock, agg = Clock(), Aggregator(5)
    t0 = to_ts(D1, 9 * 60 + 30)
    for i in range(3):
        assert agg.add(Bar(t0 + i * 60, 1, 2, 0.5, 1), clock.at(t0 + i * 60)) == []
    assert agg.flush(t0 + 240) is None                       # 09:34: not over yet
    assert agg.flush(t0 + 300).end == t0 + 300               # 09:35: complete


def test_four_hour_bars_start_at_the_evening_open():
    clock, agg = Clock(), Aggregator(240, anchor=18 * 60)
    t = Tape().flat(D0, "18:00", "06:00", 100)
    starts = [x.ts for bar in t.list() for x in agg.add(bar, clock.at(bar.ts))]
    assert starts == [to_ts(D0, 18 * 60), to_ts(D0, 22 * 60), to_ts(D1, 2 * 60)]


# ---------------------------------------------------------------- pivots
def test_pivot_appears_only_after_its_confirming_bars_and_is_stamped_with_that_time():
    p = Pivots(2, 2)
    highs = [10, 11, 15, 12, 11, 13]
    seen = []
    for i, h in enumerate(highs):
        got = [x for x in p.add(b(i * 300, h - 1, h, h - 2, h - 1)) if x.edge == "high"]
        seen.append([(x.price, x.ts, x.confirmed_at, x.index) for x in got])
    assert seen[:4] == [[], [], [], []]                       # the bar at 15 is not a pivot on its own candle, nor one bar later
    assert seen[4] == [(15, 600, 1500, 2)]                    # known at the close of the second bar after it


def test_equal_highs_give_one_pivot_the_earlier_one():
    p = Pivots(1, 1)
    out = [x for h in [5, 9, 9, 6] for x in p.add(b(0, h - 1, h, h - 2, h - 1)) if x.edge == "high"]
    assert [x.index for x in out] == [1]


# ---------------------------------------------------------------- gaps
def test_fair_value_gap_inversion_and_void():
    g = Gaps(5, 0.25)
    g.add(b(0, 100, 101, 99, 100))
    g.add(b(300, 100, 100.5, 95, 95.5))
    ev = g.add(b(600, 95.5, 97, 94, 96))                      # candle 3 high 97 < candle 1 low 99: a bearish gap 97..99
    assert [(k, x.side, x.bottom, x.top, x.known_at) for k, x in ev] == [("new", "short", 97, 99, 900)]
    assert g.add(b(900, 96, 98.5, 95.5, 98)) == []            # trades into it, no close through
    ev = g.add(b(1200, 98, 100, 96.5, 99.5))                  # closes above its top: inversed (now counts for longs)
    assert [(k, x.inverted_at) for k, x in ev] == [("inverted", 1500)]
    ev = g.add(b(1500, 99.5, 99.75, 96, 96.5))                # closes back below its bottom: void
    assert [(k, x.void_at) for k, x in ev] == [("void", 1800)]


def test_gap_smaller_than_the_minimum_is_ignored():
    g = Gaps(5, 1.0)
    for bar in (b(0, 100, 101, 99, 100), b(300, 100, 100, 97, 98), b(600, 98, 98.5, 96, 97)):   # 0.5 gap
        ev = g.add(bar)
    assert ev == []


# ---------------------------------------------------------------- liquidity
def _liq(tape, cfg=None):
    cfg = cfg or Config()
    clock, liq = Clock(), Liquidity(cfg, instrument("NQ"))
    known = {}
    for bar in tape.list():
        liq.on_minute(bar, clock.at(bar.ts))
        for lv in liq.created:
            known[(lv.kind, lv.edge, lv.key)] = lv
        liq.created.clear()
    return liq, known


def test_session_and_previous_day_levels_exist_only_once_the_period_is_over():
    t = sweep_long()
    _, known = _liq(t)
    asia = known[("session:asia", "low", f"{D1}:asia")]
    assert asia.price == 19988 and asia.formed_at == to_ts(D0, 20 * 60 + 2) and asia.known_at == to_ts(D1, 3 * 60)
    london = known[("session:london", "low", f"{D1}:london")]
    assert london.price == 19992 and london.known_at == to_ts(D1, 8 * 60)
    night = known[("overnight", "low", f"{D1}:overnight")]
    assert night.price == 19988 and night.known_at == to_ts(D1, 9 * 60 + 30)
    pdh, pdl = known[("pd", "high", str(D0))], known[("pd", "low", str(D0))]
    assert (pdh.price, pdl.price) == (20100, 19900) and pdh.known_at == to_ts(D0, 18 * 60)


def test_level_is_breached_only_by_trading_through_it_by_the_minimum():
    cfg = Config(use_sessions=False, use_overnight=False, sweep_min_ticks=2)
    t = Tape().flat(D0 - (D1 - D0), "18:00", "17:00", 100).bar5(D0, "10:00", 100, 110, 99.5, 100)
    t.flat(D0, "18:00", "19:00", 100)
    t.bar1(D0, "19:00", 100, 110.25, 100, 100)               # one tick over: not enough with a 2-tick minimum
    liq, known = _liq(t, cfg)
    assert known[("pd", "high", str(D0))].state == "active"
    t.bar1(D0, "19:01", 100, 110.5, 100, 100)
    liq, known = _liq(t, cfg)
    lv = known[("pd", "high", str(D0))]
    assert lv.state == "breached" and lv.breached_at == to_ts(D0, 19 * 60 + 1) and lv.extreme == 110.5


def test_targets_are_untouched_levels_beyond_price_nearest_first():
    t = sweep_long()
    liq, _ = _liq(t)
    assert liq.targets("long", 20120, to_ts(D1, 17 * 60)) == []         # nothing untouched above after the run
    t2 = Tape()
    t2.bars = {ts: bar for ts, bar in t.bars.items() if ts < to_ts(D1, 9 * 60 + 30)}
    liq2, _ = _liq(t2)
    ups = liq2.targets("long", 20010, to_ts(D1, 9 * 60 + 30))
    assert ups and all(lv.price == 20100 for lv in ups)                 # Tuesday's high, as day and session level
    downs = liq2.targets("short", 19999, to_ts(D1, 9 * 60 + 30))
    assert [lv.price for lv in downs][:2] == [19992, 19988]             # London low first, then the Asia / overnight low


def test_equal_lows_need_to_be_switched_on():
    with pytest.raises(ValueError):
        Config(model="Z")
    assert Config().use_equal_levels is False and Config().use_ext79 is False and Config(model="E").experimental
