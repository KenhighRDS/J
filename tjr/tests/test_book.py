"""Risk checks, sizing and simulated fills: the pessimistic choices are deliberate and each has a test."""
from jtjr.clock import Clock, to_ts
from jtjr.config import Config
from jtjr.execution import Book
from jtjr.instruments import instrument
from jtjr.types import Bar, Signal

from .tape import D1

CLOCK = Clock()


def ts(hhmm: str, day=D1) -> int:
    h, m = hhmm.split(":")
    return to_ts(day, int(h) * 60 + int(m))


def book(**changes) -> Book:
    return Book(Config().with_(**{"risk.start_equity": 50_000.0, **changes}), instrument("MNQ"))


def sig(at="10:00", side="long", ref=20000.0, stop=19980.0, target=20040.0, n=1) -> Signal:
    return Signal(n, "NQ", "A", side, ts(at), ref, stop, target, "test level")  # type: ignore[arg-type]


def feed(bk: Book, at: str, o, h, l, c, day=D1):
    bar = Bar(ts(at, day), o, h, l, c)
    bk.on_bar(bar, CLOCK.at(bar.ts))


def test_size_comes_from_the_stop_distance_real_tick_value_and_costs():
    bk = book()
    assert bk.submit(sig(), CLOCK.at(ts("10:00"))) is None
    # risk a contract = (20 points + 1 tick in + 1 tick out) x $2 + 2 x $0.61 = $42.22 ; budget 0.5% of $50,000 = $250
    s, qty, risk = bk.pending
    assert qty == 5 and round(risk, 2) == 211.10


def test_trade_is_refused_when_one_contract_is_more_than_the_budget():
    bk = Book(Config(), instrument("MNQ"))                      # $10,000 x 0.5% = $50, one MNQ here risks $42.22: still fits
    assert bk.submit(sig(), CLOCK.at(ts("10:00"))) is None
    nq = Book(Config(trade_symbol="NQ"), instrument("NQ"))      # one NQ risks $411.22
    rej = nq.submit(sig(), CLOCK.at(ts("10:00")))
    assert rej is not None and "one contract risks $411.22, more than the $50.00 budget" == rej.reason


def test_entry_is_the_next_open_plus_slippage_and_stop_fills_worse_than_its_price():
    bk = book()
    bk.submit(sig(), CLOCK.at(ts("10:00")))
    feed(bk, "10:00", 20001, 20005, 19999, 20004)
    assert bk.position.trade.entry == 20001.25
    feed(bk, "10:01", 20004, 20006, 19979, 19981)               # trades through the stop
    t = bk.trades[0]
    assert (t.exit, t.exit_reason) == (19979.75, "stop")        # 19980 minus a tick
    # five contracts: 21.5 points lost x $2 x 5 = $215, plus 10 x $0.61 commission
    assert t.net_usd == -221.10 and t.r == round(-221.10 / 211.10, 3)
    assert bk.equity == 50_000 - 221.10


def test_gap_through_the_stop_fills_at_the_open_not_at_the_stop():
    bk = book()
    bk.submit(sig(), CLOCK.at(ts("10:00")))
    feed(bk, "10:00", 20001, 20002, 20000, 20001)
    feed(bk, "10:01", 19970, 19972, 19965, 19968)               # opens ten points under the stop
    assert bk.trades[0].exit == 19969.75


def test_when_one_bar_touches_stop_and_target_the_stop_is_assumed_first():
    bk = book()
    bk.submit(sig(), CLOCK.at(ts("10:00")))
    feed(bk, "10:00", 20001, 20002, 20000, 20001)
    feed(bk, "10:01", 20001, 20045, 19979, 20040)
    assert bk.trades[0].exit_reason == "stop"


def test_target_needs_price_to_trade_through_it():
    bk = book()
    bk.submit(sig(), CLOCK.at(ts("10:00")))
    feed(bk, "10:00", 20001, 20002, 20000, 20001)
    feed(bk, "10:01", 20001, 20040, 20000, 20039)               # touches 20040 exactly: a resting limit is not assumed filled
    assert bk.position is not None
    feed(bk, "10:02", 20039, 20040.25, 20038, 20040)            # one tick through
    t = bk.trades[0]
    assert (t.exit, t.exit_reason) == (20040, "target")
    assert t.net_usd == round((20040 - 20001.25) * 2 * 5 - 10 * 0.61, 2)


def test_order_is_dropped_if_the_market_opens_beyond_stop_or_target():
    bk = book()
    bk.submit(sig(), CLOCK.at(ts("10:00")))
    feed(bk, "10:00", 19979, 19981, 19975, 19980)
    assert bk.position is None and bk.pending is None and bk.rejections[-1].reason == "opened beyond the stop"
    bk.submit(sig(at="10:05", n=2), CLOCK.at(ts("10:05")))
    feed(bk, "10:05", 20041, 20042, 20040, 20041)
    assert bk.position is None and bk.rejections[-1].reason == "opened beyond the target"


def test_everything_is_flat_at_the_flatten_time():
    bk = book()
    bk.submit(sig(at="11:00"), CLOCK.at(ts("11:00")))
    feed(bk, "11:00", 20001, 20003, 20000, 20002)
    feed(bk, "11:29", 20002, 20004, 20001, 20003)
    assert bk.position is not None
    feed(bk, "11:30", 20006, 20008, 20005, 20007)
    t = bk.trades[0]
    assert (t.exit, t.exit_reason) == (20005.75, "flatten")     # the 11:30 open minus a tick
    bk.submit(sig(at="11:30", n=2), CLOCK.at(ts("11:30")))
    feed(bk, "11:31", 20007, 20008, 20006, 20007)
    assert bk.position is None and bk.rejections[-1].reason == "next bar is past the flatten time"


def test_two_trades_a_day_then_no_more():
    bk = book()
    for i, hhmm in enumerate(("09:40", "10:00", "10:20")):
        rej = bk.submit(sig(at=hhmm, n=i + 1), CLOCK.at(ts(hhmm)))
        if i < 2:
            assert rej is None
            feed(bk, hhmm, 20001, 20002, 20000, 20001)
            h, m = hhmm.split(":")
            feed(bk, f"{h}:{int(m) + 1:02d}", 20001, 20041, 20000, 20040)      # target
            feed(bk, f"{h}:{int(m) + 2:02d}", 20040, 20041, 20039, 20040)
        else:
            assert rej is not None and rej.reason == "daily limit of 2 trades reached"
    assert len(bk.trades) == 2


def test_day_is_over_after_two_full_losses_and_starts_fresh_tomorrow():
    bk = book(**{"risk.max_trades_per_day": 5})
    for i, hhmm in enumerate(("09:40", "10:00")):
        assert bk.submit(sig(at=hhmm, n=i + 1), CLOCK.at(ts(hhmm))) is None
        feed(bk, hhmm, 20001, 20002, 20000, 20001)
        h, m = hhmm.split(":")
        feed(bk, f"{h}:{int(m) + 1:02d}", 20001, 20002, 19979, 19980)          # stopped
    rej = bk.submit(sig(at="10:20", n=3), CLOCK.at(ts("10:20")))
    assert rej is not None and rej.reason == "stopped for the day after 2 full losses"
    nxt = D1.replace(day=D1.day + 1)
    assert bk.submit(Signal(4, "NQ", "A", "long", ts("09:40", nxt), 20000, 19980, 20040, "x"), CLOCK.at(ts("09:40", nxt))) is None


def test_one_trade_at_a_time():
    bk = book()
    bk.submit(sig(), CLOCK.at(ts("10:00")))
    feed(bk, "10:00", 20001, 20002, 20000, 20001)
    rej = bk.submit(sig(at="10:05", n=2), CLOCK.at(ts("10:05")))
    assert rej is not None and rej.reason == "already in a trade"


def test_breakeven_and_partial_exit():
    bk = book(**{"exits.breakeven_at_r": 1.0, "exits.partial_at_r": 1.0, "exits.partial_fraction": 0.4})
    bk.submit(sig(target=20080.0), CLOCK.at(ts("10:00")))
    feed(bk, "10:00", 20001, 20002, 20000, 20001)               # in at 20001.25, stop 19980: R = 21.25 points
    feed(bk, "10:01", 20001, 20025, 20000, 20024)               # past 1R (20022.5) by more than a tick
    pos = bk.position
    assert pos.qty == 3 and pos.trade.partials == [{"ts": ts("10:01"), "qty": 2, "price": 20022.5, "reason": "partial"}]
    assert (pos.stop, pos.stop_kind) == (20001.25, "breakeven")
    feed(bk, "10:02", 20024, 20025, 20001, 20002)               # back to the entry
    t = bk.trades[0]
    assert (t.exit_reason, t.exit) == ("breakeven", 20001.0)    # stop at entry, filled a tick worse
    assert t.net_usd == round((20022.5 - 20001.25) * 2 * 2 + (20001.0 - 20001.25) * 2 * 3 - 10 * 0.61, 2)


def test_kill_switch_closes_the_trade_and_refuses_new_ones():
    bk = book()
    bk.submit(sig(), CLOCK.at(ts("10:00")))
    feed(bk, "10:00", 20001, 20002, 20000, 20001)
    bk.kill(20001.5, ts("10:01"))
    assert bk.position is None and bk.trades[0].exit_reason == "kill"
    rej = bk.submit(sig(at="10:05", n=2), CLOCK.at(ts("10:05")))
    assert rej is not None and rej.reason == "kill switch is on"


def test_short_side_mirrors_the_money():
    bk = book()
    bk.submit(sig(side="short", ref=20000, stop=20020, target=19960), CLOCK.at(ts("10:00")))
    feed(bk, "10:00", 19999, 20000, 19998, 19999)
    assert bk.position.trade.entry == 19998.75
    feed(bk, "10:01", 19999, 20000, 19959.75, 19961)
    t = bk.trades[0]
    assert (t.exit, t.exit_reason) == (19960, "target") and t.net_usd == round((19998.75 - 19960) * 2 * 5 - 6.10, 2)
