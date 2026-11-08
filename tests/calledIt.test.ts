import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_LEGS, calledAt, claimable, comboHeadline, dateSpan, parseScore, sameDay } from "../src/lib/calledIt.ts";
import type { WannCall } from "../src/lib/types.ts";

const call = (over: Partial<WannCall>): WannCall => ({ id: "c", wann_game_id: 1, sport: "Football", competition: "Premier League", home: "Arsenal", away: "Chelsea", kickoff_utc: "2026-11-08T15:00:00.000Z",
  pick: "home", pick_label: "Arsenal wins", probability: 94.2, call_type: "straight", status: "finished", final_score: "2–0", outcome: "won", sent_at: null, created_at: "", ...over });

test("scores parse with en dash, hyphen or colon", () => {
  assert.deepEqual(parseScore("2–0"), [2, 0]); assert.deepEqual(parseScore("10-9"), [10, 9]); assert.deepEqual(parseScore(" 1 : 1 "), [1, 1]);
  assert.equal(parseScore("2–0 AET"), null); assert.equal(parseScore(null), null);
});

test("only finished, won calls can be claimed, earliest call first", () => {
  const rows = [call({ id: "late", prediction_time: "2026-11-08T09:00:00Z", kickoff_utc: "2026-11-08T12:00:00Z" }), call({ id: "lost", outcome: "lost" }), call({ id: "void", outcome: "void" }), call({ id: "live", status: "live", outcome: null }), call({ id: "early", prediction_time: "2026-11-07T20:00:00Z", kickoff_utc: "2026-11-08T20:00:00Z" })];
  assert.deepEqual(claimable(rows).map((c) => c.id), ["early", "late"]);
});

test("the time shown is when Wann called it, not kickoff", () => {
  assert.equal(calledAt(call({ prediction_time: "2026-11-07T13:16:11Z", sent_at: "2026-11-07T14:45:14Z" })), "2026-11-07T13:16:11Z");
  assert.equal(calledAt(call({ prediction_time: null, sent_at: "2026-11-07T14:45:14Z" })), "2026-11-07T14:45:14Z");
  assert.equal(calledAt(call({ prediction_time: null, sent_at: null, created_at: "2026-11-07T14:45:15Z" })), "2026-11-07T14:45:15Z");
});

test("combo headline and limits", () => { assert.equal(comboHeadline(4), "4 for 4."); assert.equal(MAX_LEGS, 8); });

test("date span for one day, one month, across months", () => {
  assert.equal(sameDay(["2026-11-08T12:00:00", "2026-11-08T20:00:00"]), true);
  assert.equal(dateSpan(["2026-11-08T12:00:00"], "en-GB"), "Sun 8 Nov");
  assert.equal(dateSpan(["2026-11-09T12:00:00", "2026-11-07T12:00:00"], "en-GB"), "7\u2009\u2013\u20099 Nov");
  assert.equal(dateSpan(["2026-10-30T12:00:00", "2026-11-02T12:00:00"], "en-GB"), "30 Oct\u2009\u2013\u20092 Nov");
});
