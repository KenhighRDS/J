import type { Receipt, Signal } from "./types";

/** The levels a member has to copy before the "I took it" slider unlocks. A signal without SL or TP doesn't ask for them. */
export function copyNeeded(s: Pick<Signal, "sl" | "tp">): ("entry" | "sl" | "tp" | "lot")[] {
  return ["entry", ...(s.sl != null ? (["sl"] as const) : []), ...(s.tp != null ? (["tp"] as const) : []), ...(s.sl != null ? (["lot"] as const) : ["lot" as const])];
}
export const copiedAll = (s: Pick<Signal, "sl" | "tp">, r: Pick<Receipt, "copied">) => copyNeeded(s).every((f) => Boolean(r.copied[f]));
export function lockedHint(s: Pick<Signal, "sl" | "tp">): string {
  const names = copyNeeded(s).map((f) => (f === "entry" ? "entry" : f === "lot" ? "lot" : f.toUpperCase()));
  return `Copy ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} to unlock`;
}
