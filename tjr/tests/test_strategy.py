"""The setup state machine and the backtest around it, on tapes whose right answer is known by construction."""
from jtjr import backtest
from jtjr.clock import to_ts
from jtjr.config import Config
from jtjr.strategy import Strategy

from .tape import D1, Tape, mixed, other_index, random_walk, sweep_long

BIG = {"risk.start_equity": 50_000.0}                     # enough for a few micro contracts at 0.5% risk


def at(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return to_ts(D1, int(h) * 60 + int(m))


def run(cfg, nq, es=None):
    bars = {"NQ": nq.list() if isinstance(nq, Tape) else nq}
    if es is not None:
        bars["ES"] = es.list()
    return backtest.run(cfg, bars)


# ---------------------------------------------------------------- model A, long
def test_baseline_long_walks_sweep_bos_higher_low_trigger_and_hits_the_target():
    res = run(Config().with_(**BIG), sweep_long())
    assert len(res.trades) == 1
    t = res.trades[0]
    kinds = [(c.kind, c.ts) for c in t.confirmations]
    assert kinds == [("sweep", at("09:45")), ("bos", at("09:55")), ("higher_low", at("10:10")), ("candle_break", at("10:10"))]
    assert (t.side, t.signal_ts, t.entry_ts) == ("long", at("10:10"), at("10:10"))
    assert t.entry == 20014.25                                         # next bar's open 20014 plus one tick of slippage
    assert t.stop == 19979.75                                          # one tick under the sweep low 19980
    assert (t.target, t.exit, t.exit_reason) == (20100, 20100, "target")
    assert {"overnight low", "session:asia low", "session:london low"} <= set(t.levels)    # London low joined one bar later
    # sizing: (34.25 points + 2 ticks of slippage) x $2 + 2 x $0.61 = $70.72 a contract; $250 budget -> 3 contracts
    assert t.qty == 3 and round(t.risk_usd, 2) == 212.16
    assert t.net_usd == round((20100 - 20014.25) * 2 * 3 - 0.61 * 3 * 2, 2) == 510.84
    assert t.r == round(510.84 / 212.16, 3)
    assert res.metrics["trades"] == 1 and res.metrics["small_sample"] is True


def test_short_is_the_mirror_image_of_long():
    res = run(Config().with_(**BIG), sweep_long().mirror(20000))
    assert len(res.trades) == 1
    t = res.trades[0]
    assert (t.side, t.entry, t.stop, t.target, t.exit_reason) == ("short", 19985.75, 20020.25, 19900, "target")
    assert [c.kind for c in t.confirmations] == ["sweep", "bos", "lower_high", "candle_break"]
    assert t.net_usd == 510.84


def test_a_signal_is_never_filled_on_the_bar_that_made_it():
    res = run(Config().with_(**BIG), sweep_long())
    sig = next(e for e in res.events if e["type"] == "signal")
    fill = next(e for e in res.events if e["type"] == "fill" and e["kind"] == "entry")
    assert sig["ts"] == at("10:10") and fill["ts"] == at("10:10")      # signal at the 10:05 bar's CLOSE, fill at the 10:10 open
    assert sig["price"] == 20014 and fill["price"] == 20014.25


# ---------------------------------------------------------------- what kills a setup
def test_no_reclaim_within_the_timeout_is_a_break_not_a_sweep():
    t = sweep_long()
    for hhmm in ("09:40", "09:45", "09:50"):                           # stays under the London low for three closes
        t.bar5(D1, hhmm, 19986, 19987.5, 19980, 19985)
    t.flat(D1, "09:55", "17:00", 19985)
    res = run(Config().with_(**BIG), t)
    assert res.trades == []
    assert any(r.stage == "sweep" and r.reason == "level broken, not reclaimed" for r in res.rejections)


def test_no_break_of_structure_within_six_bars_ends_the_setup():
    t = sweep_long()
    for i in range(14):                                                # drifts sideways under the swing high
        t.bar5(D1, f"{9 + (50 + i * 5) // 60:02d}:{(50 + i * 5) % 60:02d}", 19997, 19999, 19995, 19997)
    t.flat(D1, "11:00", "17:00", 19997)
    res = run(Config().with_(**BIG), t)
    assert res.trades == []
    assert [r.reason for r in res.rejections if r.stage == "bos"] == ["no break of structure within 6 bars"]


def test_setup_dies_when_price_goes_back_under_the_sweep_low():
    t = sweep_long()
    t.bar5(D1, "09:55", 20010, 20011, 19978, 19981)                    # after the BOS, straight back through 19980
    t.flat(D1, "10:00", "17:00", 19981)
    res = run(Config().with_(**BIG), t)
    assert res.trades == []
    assert any(r.reason == "price went back beyond the sweep extreme" for r in res.rejections)


def test_setup_expires_after_twelve_bars_without_a_trigger():
    t = sweep_long()
    for i in range(16):                                                # BOS done, then a slow drift with no pullback pivot break
        hh, mm = divmod(9 * 60 + 55 + i * 5, 60)
        t.bar5(D1, f"{hh:02d}:{mm:02d}", 20010 - i * 0.25, 20010.5 - i * 0.25, 20009.5 - i * 0.25, 20009.75 - i * 0.25)
    t.flat(D1, "11:15", "17:00", 20006)
    res = run(Config().with_(**BIG), t)
    assert res.trades == []
    assert any(r.stage == "timing" and "expired after 12 bars" in r.reason for r in res.rejections)


def test_sweep_before_the_session_is_not_traded():
    cfg = Config(session_start="10:00").with_(**BIG)                   # the sweep closes at 09:45: too early
    res = run(cfg, sweep_long())
    assert res.trades == []
    assert any(r.stage == "session" and r.reason == "sweep outside the trading session" for r in res.rejections)


def test_target_too_close_is_refused_and_the_other_rule_looks_further():
    t = sweep_long()
    t.bar5(D1, "07:00", 20000, 20030, 19999.5, 20000)                  # a London-session high only 16 above the entry
    res = run(Config().with_(**BIG), t)
    assert res.trades == []
    assert any(r.stage == "target" and "under the 2R minimum" in r.reason for r in res.rejections)
    far = run(Config().with_(**{**BIG, "exits.target_rule": "first_with_min_rr"}), t)
    assert [x.target for x in far.trades] == [20100]


def test_fixed_r_target():
    res = run(Config().with_(**{**BIG, "exits.target": "r", "exits.target_r": 1.5}), sweep_long())
    t = res.trades[0]
    assert t.target == 20014 + 1.5 * (20014 - 19979.75) == 20065.375 or t.target == 20065.5
    assert t.exit_reason == "target" and t.target_label == "1.5R"


# ---------------------------------------------------------------- models B, C, D
def test_model_b_needs_an_inverse_gap():
    with_gap = run(Config(model="B").with_(**BIG), sweep_long(gap=True))
    assert len(with_gap.trades) == 1
    c = next(c for c in with_gap.trades[0].confirmations if c.kind == "ifvg")
    assert (c.extra["bottom"], c.extra["top"], c.ts) == (19993, 19994, at("09:50"))
    without = run(Config(model="B").with_(**BIG), sweep_long(gap=False))
    assert without.trades == []
    assert any("no inverse FVG" in r.reason for r in without.rejections)
    assert len(run(Config(model="A").with_(**BIG), sweep_long(gap=False)).trades) == 1      # A does not care


def test_model_c_needs_the_other_index_to_hold_its_low():
    diverging = run(Config(model="C").with_(**BIG), sweep_long(), other_index(takes_low=False))
    assert len(diverging.trades) == 1
    smt = next(c for c in diverging.trades[0].confirmations if c.kind == "smt")
    assert "ES held its own" in smt.reason
    together = run(Config(model="C").with_(**BIG), sweep_long(), other_index(takes_low=True))
    assert together.trades == []
    assert any("no SMT divergence" in r.reason for r in together.rejections)


def test_model_d_needs_both():
    assert len(run(Config(model="D").with_(**BIG), sweep_long(), other_index()).trades) == 1
    assert run(Config(model="D").with_(**BIG), sweep_long(gap=False), other_index()).trades == []
    assert run(Config(model="D").with_(**BIG), sweep_long(), other_index(takes_low=True)).trades == []


def test_models_b_c_d_only_ever_filter_model_a():
    walk = random_walk(days=9, seed=11)
    es = [type(x)(x.ts, x.open / 4, x.high / 4, x.low / 4, x.close / 4) for x in random_walk(days=9, seed=12)]
    base = {s.ts for s in _signals("A", walk, es)}
    for m in ("B", "C", "D"):
        assert {s.ts for s in _signals(m, walk, es)} <= base


def _signals(model, nq, es):
    s, out, j = Strategy(Config(model=model)), [], 0
    for bar in nq:
        while j < len(es) and es[j].ts <= bar.ts:
            s.on_other(es[j])
            j += 1
        s.on_bar(bar)
        out += s.signals
    return out


# ---------------------------------------------------------------- model E (experimental)
def test_model_e_is_marked_experimental_and_enters_on_a_one_minute_confirmation():
    res = run(Config(model="E", e_confirmations=("bos", "ifvg")).with_(**BIG), sweep_long())
    assert res.to_json()["experimental"] is True
    assert len(res.trades) == 1
    t = res.trades[0]
    kinds = [c.kind for c in t.confirmations]
    assert kinds[0] == "sweep" and kinds[1] in ("bos", "ifvg") and kinds[2] in ("equilibrium", "fvg_retest") and kinds[3] in ("bos_1m", "ifvg_1m")
    assert [c.timeframe for c in t.confirmations] == [5, 5, 5, 1]
    assert t.experimental is True and t.stop == 19979.75


# ---------------------------------------------------------------- no look-ahead
def test_cutting_the_tape_anywhere_never_changes_what_was_already_decided():
    """If any rule peeked at a later bar, a shorter tape would give different early signals."""
    walk = mixed()
    for model in ("A", "B", "E"):
        cfg = Config(model=model, smt_symbol="", e_confirmations=("bos", "ifvg"))
        full = Strategy(cfg)
        seen = []
        for bar in walk:
            full.on_bar(bar)
            seen += [(e["ts"], e["type"], e.get("kind"), e.get("price"), e.get("value")) for e in full.events]
            full.events.clear()
        assert any(e[1] == "signal" for e in seen), "the walk should produce at least one signal, or this test proves nothing"
        scene = next(i for i, bar in enumerate(walk) if bar.ts >= at("09:52"))          # mid-setup: after the BOS, before the trigger
        for cut in (scene, len(walk) // 3, len(walk) // 2, len(walk) * 4 // 5):
            part = Strategy(cfg)
            got = []
            for bar in walk[:cut]:
                part.on_bar(bar)
                got += [(e["ts"], e["type"], e.get("kind"), e.get("price"), e.get("value")) for e in part.events]
                part.events.clear()
            limit = walk[cut - 1].end
            assert got == [e for e in seen if e[0] <= limit][: len(got)] and len(got) == len([e for e in seen if e[0] <= limit])


def test_same_input_same_output():
    a = run(Config().with_(**BIG), mixed()).to_json()
    b = run(Config().with_(**BIG), mixed()).to_json()
    assert a == b and a["config_id"] == Config().with_(**BIG).fingerprint()
