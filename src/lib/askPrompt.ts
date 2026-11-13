import type { Receipt, WannCall } from "./types";

/** The close question is waiting for this receipt. */
export const questionPending = (r: Receipt) => !!r.question_sent_at && !r.answered_at && (r.status === "likely_taken" || r.status === "opened");

/** Prompt once per receipt: when the question is pending or the route carries ?ask=1, never again after it was answered or dismissed in this view. */
export const shouldPrompt = (r: Receipt | null, asked: boolean, promptedId: string | null) => !!r && promptedId !== r.id && (asked || questionPending(r));

/** A Wann call the member took has won and we do not know what it paid: ask once. The server remembers that it asked. */
export const payoutPending = (r: Receipt | null, c: Pick<WannCall, "status" | "outcome"> | null) =>
  !!r && !!c && r.kind === "wann" && r.status === "taken" && c.status === "finished" && c.outcome === "won" && r.payout_usd == null && !r.payout_asked_at;
