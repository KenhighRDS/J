import { test } from "node:test";
import assert from "node:assert/strict";
import { payoutPending, questionPending, shouldPrompt } from "../src/lib/askPrompt.ts";
import type { Receipt } from "../src/lib/types.ts";

const receipt = (over: Partial<Receipt> = {}): Receipt => ({
  id: "r1", signal_id: "s1", wann_call_id: null, user_id: "u1", kind: "ea", delivered_at: null, opened_at: "2026-11-07T19:39:24Z", copied: {},
  status: "opened", status_source: "open", user_lot: null, ring_count: 0, question_sent_at: "2026-11-07T22:00:17Z", answered_at: null,
  user_entry: null, user_close: null, user_pips: null, ...over,
});

test("prompts while the question is pending and nothing was prompted yet", () => {
  assert.equal(questionPending(receipt()), true);
  assert.equal(shouldPrompt(receipt(), false, null), true);
  assert.equal(shouldPrompt(receipt({ status: "likely_taken" }), false, null), true);
});

test("does not prompt once answered, even with ?ask=1 still in the URL (the Yes/No loop)", () => {
  const answered = receipt({ status: "taken", status_source: "close_answer", answered_at: "2026-11-07T22:00:55Z" });
  assert.equal(questionPending(answered), false);
  assert.equal(shouldPrompt(answered, true, "r1"), false);
  assert.equal(shouldPrompt(receipt(), true, "r1"), false);      // answer not yet persisted: still only once per receipt
});

test("a deep link opens the sheet once for a receipt that is not pending", () => {
  const answered = receipt({ status: "taken", answered_at: "2026-11-07T22:00:55Z" });
  assert.equal(shouldPrompt(answered, true, null), true);
  assert.equal(shouldPrompt(answered, true, "r1"), false);
});

test("a different receipt can prompt again", () => {
  assert.equal(shouldPrompt(receipt({ id: "r2" }), false, "r1"), true);
  assert.equal(shouldPrompt(null, true, null), false);
});

test("payout question: once, only for a taken call that won and has no payout yet", () => {
  const base = { id: "r", kind: "wann", status: "taken", payout_usd: null, payout_asked_at: null } as unknown as Receipt;
  const won = { status: "finished", outcome: "won" } as const;
  assert.equal(payoutPending(base, won), true);
  assert.equal(payoutPending({ ...base, payout_asked_at: "2026-11-14T10:00:00Z" }, won), false);        // already asked (answered or skipped)
  assert.equal(payoutPending({ ...base, payout_usd: 112 }, won), false);                                // already known
  assert.equal(payoutPending({ ...base, status: "skipped" }, won), false);                              // they did not take it
  assert.equal(payoutPending(base, { status: "finished", outcome: "lost" }), false);
  assert.equal(payoutPending(base, { status: "live", outcome: null }), false);
  assert.equal(payoutPending({ ...base, kind: "ea" }, won), false);
  assert.equal(payoutPending(null, won), false);
});
