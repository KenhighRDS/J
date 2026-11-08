// Helpers for the "J × Wann called it" share card. Only won calls ever reach it.
import type { WannCall } from "./types";

export const MAX_LEGS = 8;

/** "2–0", "2-0" or "2:0" → [2, 0]; anything else → null (the raw text is shown instead). */
export function parseScore(s: string | null): [number, number] | null {
  const m = s?.match(/^\s*(\d+)\s*[–—\-:]\s*(\d+)\s*$/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** When Wann called it: Wann's own prediction time (it matches the probability shown), else when J sent the call. */
export const calledAt = (c: WannCall): string => c.prediction_time ?? c.sent_at ?? c.created_at;

/** Calls a card may claim: finished and won. Earliest call first. */
export function claimable(calls: WannCall[]): WannCall[] {
  return calls.filter((c) => c.status === "finished" && c.outcome === "won").sort((a, b) => calledAt(a).localeCompare(calledAt(b)));
}

/** Combo headline: "4 for 4." */
export const comboHeadline = (n: number) => `${n} for ${n}.`;

const dayKey = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
/** "Sat 8 Nov" for one day, otherwise the locale's own range ("7–9 Nov", "Nov 7 – 9", "30 Oct – 2 Nov"). */
export function dateSpan(isos: string[], locale?: string): string {
  if (!isos.length) return "";
  const sorted = [...isos].sort(); const a = new Date(sorted[0]), b = new Date(sorted[sorted.length - 1]);
  if (dayKey(sorted[0]) === dayKey(sorted[sorted.length - 1])) return a.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).formatRange(a, b);
}
export const sameDay = (isos: string[]) => new Set(isos.map(dayKey)).size <= 1;
