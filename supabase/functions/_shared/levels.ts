// Pure helpers for SL / TP levels coming from MetaTrader (no Deno or Supabase imports, so Node tests can load them).

/** MetaTrader uses 0 for "no SL / no TP": store null instead of a level at zero. */
export function level(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) && n !== 0 ? n : null;
}

/** A pure trailing move: the stop only locks in more (above the old one on a buy, below on a sell) and TP is unchanged.
 *  Members get it as a quiet update instead of a ringing call. */
export function isTrailOnly(direction: "buy" | "sell", prevSl: number | null, newSl: number | null, prevTp: number | null, newTp: number | null | undefined): boolean {
  if (prevSl == null || newSl == null) return false;
  const tighter = direction === "buy" ? newSl > prevSl : newSl < prevSl;
  const tpSame = newTp === undefined || (newTp ?? null) === (prevTp ?? null);
  return tighter && tpSame;
}
