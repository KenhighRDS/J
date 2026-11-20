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


# ---------------------------------------------------------------- the seven strategies, on drawn days
from jtjr.lab import strategies as S  # noqa: E402


def flat_day(day: date, price: float, vol: float = 10) -> list[Bar]:
    return [Bar(to_ts(day, m), price, price + 0.25, price - 0.25, price, vol) for m in range(570, 960)]


def shaped(day: date, path) -> list[Bar]:
    """path(minute) -> close of that minute's bar; opens are the previous close."""
    out, prev = [], path(569)
    for m in range(570, 960):
        c = path(m)
        out.append(Bar(to_ts(day, m), prev, max(prev, c), min(prev, c), c, 10))
        prev = c
    return out


def weekdays(n: int, start: date = MON) -> list[date]:
    out, d = [], start
    while len(out) < n:
        if d.weekday() < 5:
            out.append(d)
        d += timedelta(days=1)
    return out


def test_opening_range_breakout_long_to_target_short_to_stop_and_doji():
    d1, d2, d3 = weekdays(3)
    up = shaped(d1, lambda m: 100 + min(m - 569, 5) * 0.2 + max(0, m - 580) * 0.5)              # first 5 minutes up 1.0, then runs
    down = shaped(d2, lambda m: 200 - min(m - 569, 5) * 0.2 + (3.0 if m >= 600 else 0))         # first 5 minutes down, later back above the range
    doji = flat_day(d3, 300)
    ts = S.opening_range_breakout(days(Dataset("NQ", up + down + doji)), warmup=0)
    assert len(ts) == 2
    a, b = ts
    assert (a.day, a.side, a.entry_minute, a.entry, a.why) == (d1, 1, 575, 101.0, "target")      # bought at the 09:35 open
    assert abs(a.exit - (101.0 + 10 * (101.0 - 100.0))) < 1e-9                                   # stop at the range low 100: R = 1, target 111
    assert (b.side, b.entry, b.why, b.exit) == (-1, 199.0, "stop", 200.0)                        # sold 199, stopped at the range high 200
    assert abs(a.size - min(4, 0.01 / (1.0 / 101.0))) < 1e-9 and b.size == min(4, 0.01 / (1.0 / 199.0))


def test_last_half_hour_follows_the_sign_of_the_earlier_return_and_skips_small_days():
    d1, d2, d3 = weekdays(3)
    bars = flat_day(d1, 100) + shaped(d2, lambda m: 102 if m >= 575 else 100) + shaped(d3, lambda m: 101.5 if m < 900 else 100.0)
    ds = days(Dataset("ES", bars))
    gao = S.last_half_hour(ds, 600, warmup=0)
    assert [(t.day, t.side, t.entry_minute, t.entry) for t in gao] == [(d2, 1, 930, 102), (d3, -1, 930, 100.0)]   # d3 opens under d2's close of 102
    rest = S.last_half_hour(ds, 930, warmup=0)
    assert [t.side for t in rest] == [1, -1]
    big = S.last_half_hour(ds, 930, 0.01, warmup=0)
    assert [(t.day, t.side) for t in big] == [(d2, 1), (d3, -1)] and S.last_half_hour(ds, 930, 0.03, warmup=0) == []


def test_vwap_trend_stays_long_in_a_rising_session_and_reverses_on_a_close_across():
    d1, d2 = weekdays(2)
    rising = shaped(d1, lambda m: 100 + (m - 569) * 0.1)
    vee = shaped(d2, lambda m: 100 + (m - 569) * 0.1 if m < 700 else 113.1 - (m - 699) * 0.3)
    ts = S.vwap_trend(days(Dataset("NQ", rising + vee)), warmup=0)
    one = [t for t in ts if t.day == d1]
    assert len(one) == 1 and (one[0].side, one[0].entry_minute, one[0].why) == (1, 571, "close")   # decided at 09:31, filled at the next open
    two = [t for t in ts if t.day == d2]
    assert [t.side for t in two] == [1, -1] and two[0].why == "cross" and two[1].why == "close"
    assert two[0].exit == two[1].entry and two[0].exit_minute == two[1].entry_minute                # one price for the reversal


def test_noise_momentum_waits_for_a_move_beyond_the_usual_and_sizes_by_recent_volatility():
    ds_ = weekdays(16)
    quiet = []
    for i, d in enumerate(ds_[:14]):                                                            # 14 days that wander 0.2% from the open
        quiet += shaped(d, lambda m, i=i: 100 * (1 + 0.002 * ((-1) ** i) * min(1, (m - 569) / 60)))
    breakout = shaped(ds_[14], lambda m: 100.2 * (1 + 0.01 * min(1, max(0, m - 585) / 30)))     # +1% by 10:15, held
    inside = shaped(ds_[15], lambda m: 101.2 * (1 + 0.001 * min(1, (m - 569) / 60)))            # stays inside the noise area
    ts = S.noise_momentum(days(Dataset("ES", quiet + breakout + inside)))
    assert [t.day for t in ts] == [ds_[14]]
    t = ts[0]
    # at 10:00 the day is already +0.47% from its open against a usual 0.1% at that time: above the area and above VWAP
    assert (t.side, t.entry_minute, t.exit_minute, t.why) == (1, 600, 960, "close")
    assert t.entry == 100.2 * (1 + 0.01 * (599 - 585) / 30)                                     # filled at the 10:00 bar's open, the price just seen
    assert 1.0 < t.size <= 4.0


def test_overnight_drift_is_the_two_to_three_window_of_the_night_before():
    d1, d2 = weekdays(2)
    night = [Bar(to_ts(d2, m), 500 + (m - 120) * 0.25, 500 + (m - 119) * 0.25, 500 + (m - 120) * 0.25, 500 + (m - 119) * 0.25, 5) for m in range(60, 240)]
    ts = S.overnight_drift(days(Dataset("ES", flat_day(d1, 100) + night + flat_day(d2, 100))), warmup=0)
    assert [(t.day, t.side, t.entry_minute, t.entry, t.exit_minute, t.exit) for t in ts] == [(d2, 1, 120, 500.0, 180, 515.0)]


def test_runner_scores_every_test_on_both_markets_and_applies_the_pass_mark():
    from jtjr.lab.run import run_all, table
    ds_ = weekdays(40)
    es = [b for i, d in enumerate(ds_) for b in shaped(d, lambda m, i=i: 5000 * (1 + 0.003 * ((-1) ** i) * min(1, (m - 569) / 120)))]
    nq = [Bar(b.ts, b.open * 4, b.high * 4, b.low * 4, b.close * 4, b.volume) for b in es]
    res = run_all({"ES": Dataset("ES", es), "NQ": Dataset("NQ", nq)})
    assert [r["test"][0] for r in res["tests"]] == list("1234567") and res["markets"]["ES"]["days_tested"] == 26
    for r in res["tests"]:
        assert set(r["markets"]) == {"ES", "NQ"} and r["verdict"] in ("evidence of an edge", "promising, not proven", "not shown")
        for m in r["markets"].values():
            assert m["before_costs"]["total_return_pct"] >= m["total_return_pct"] >= m["with_double_slippage"]["total_return_pct"]   # costs only ever subtract
    assert "Noise-area" in table(res)
