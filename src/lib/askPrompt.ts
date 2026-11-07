import type { Receipt } from "./types";

/** The close question is waiting for this receipt. */
export const questionPending = (r: Receipt) => !!r.question_sent_at && !r.answered_at && (r.status === "likely_taken" || r.status === "opened");

/** Prompt once per receipt: when the question is pending or the route carries ?ask=1, never again after it was answered or dismissed in this view. */
export const shouldPrompt = (r: Receipt | null, asked: boolean, promptedId: string | null) => !!r && promptedId !== r.id && (asked || questionPending(r));
