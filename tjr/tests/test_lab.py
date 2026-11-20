"""The lab's plumbing: cutting bars into New York sessions and scoring a list of trades. Drawn bars, known answers."""
from datetime import date, timedelta

from jtjr.clock import to_ts
from jtjr.data import Dataset
from jtjr.instruments import INSTRUMENTS
from jtjr.lab.score import CostModel, LabTrade, daily_returns, summary, trade_return, verdict
from jtjr.lab.sessions import days
from jtjr.types import Bar

MON = date(2026, 3, 2)


def session(day: date, start: float, step: float = 0.25, first: int = 570, last: int = 960, skip=()) -> list[Bar]:
    """Minute bars that climb `step` a minute from `start`: bar k opens at start + k*step and closes one step higher."""
    out = []
    for m in range(first, last):
        if m in skip:
            continue
        k = m - 570
        o = start + k * step
        out.append(Bar(to_ts(day, m), o, o + step, o, o + step, 10))
    return out


def test_sessions_are_new_york_days_with_the_night_before_and_the_previous_close():
    night = [Bar(to_ts(MON, 18 * 60 + i), 99, 99.5, 98.5, 99, 1) for i in range(5)]
    bars = session(MON, 100) + night + session(MON + timedelta(days=1), 200)
    ds = days(Dataset("ES", bars))
    assert [d.day for d in ds] == [MON, MON + timedelta(days=1)]
    a, b = ds
    assert (a.open, a.close, len(a.bars), a.full, a.prev_close) == (100, 100 + 390 * 0.25, 390, True, None)
    assert b.prev_close == a.close and len(b.night) == 5 and not b.rolled
    assert a.price_at(570) == 100 and a.price_at(600) == 100 + 30 * 0.25            # at 10:00 the 09:59 bar has just closed
    assert a.next_open(600) == (600, 100 + 30 * 0.25) and a.next_open(960) is None


def test_a_missing_minute_never_lets_a_later_price_stand_in_for_an_earlier_one():
    d = days(Dataset("ES", session(MON, 100, skip={599, 600, 601})))[0]
    assert d.price_at(600) == 100 + 29 * 0.25           # the 09:58 bar's close is the last thing known at 10:00
    assert d.next_open(600) == (602, 100 + 32 * 0.25)   # and an order sent at 10:00 trades at the next bar that exists


def test_roll_days_and_half_days_are_marked():
    tue = MON + timedelta(days=1)
    bars = session(MON, 100) + session(tue, 300) + session(tue + timedelta(days=1), 300, last=780)
    ds = days(Dataset("ES", bars, rolls=[to_ts(MON, 18 * 60)]))
    assert ds[1].rolled and ds[1].prev_close is None    # a new contract: yesterday's close is another instrument's price
    assert ds[2].prev_close == ds[1].close and not ds[2].full and len(ds[2].bars) == 210


def test_cost_and_return_of_one_trade():
    mes, cost = INSTRUMENTS["MES"], CostModel()
    assert cost.points(mes) == 2 * (0.25 + 0.61 / 5)                        # 0.744 points in and out
    t = LabTrade(MON, +1, 600, 6000.0, 959, 6012.0, "time")
    assert abs(trade_return(t, mes, cost) - (12 - 0.744) / 6000) < 1e-12
    short = LabTrade(MON, -1, 600, 6000.0, 959, 6012.0, "time")
    assert abs(trade_return(short, mes, cost) - (-12 - 0.744) / 6000) < 1e-12
    assert daily_returns([t, short], [MON, MON + timedelta(days=1)], mes, cost) == [trade_return(t, mes, cost) + trade_return(short, mes, cost), 0.0]


def test_summary_and_the_pass_mark():
    dates = [MON + timedelta(days=i) for i in range(6)]
    s = summary([0.01, -0.005, 0.0, 0.01, -0.005, 0.01], dates)
    assert (s["days"], s["days_traded"], s["total_return_pct"], s["hit_rate_pct"]) == (6, 5, 2.0, 60.0)
    assert s["max_drawdown_pct"] == 0.5 and s["first_half_pct"] == 0.5 and s["second_half_pct"] == 1.5
    assert verdict(3.0, True, True, True) == "evidence of an edge"
    assert verdict(3.0, False, True, True) == "promising, not proven"      # one bad year: not enough
    assert verdict(2.2, True, True, True) == "promising, not proven"
    assert verdict(1.9, True, True, True) == "not shown" and verdict(2.4, True, False, True) == "not shown"
