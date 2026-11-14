// Display helpers for stock picks.
import type { StockPick } from "./types";

export type Asset = "stock" | "crypto";
export const assetOf = (k: Pick<StockPick, "asset">): Asset => (k.asset === "crypto" ? "crypto" : "stock");
/** Where an asset's screens live: /stocks or /crypto. */
export const baseOf = (asset: Asset) => (asset === "crypto" ? "/crypto" : "/stocks");
const kinds: Record<Asset, Record<StockPick["kind"], string>> = { stock: { ipo: "New listing", catalyst: "Fresh event" }, crypto: { ipo: "New listing", catalyst: "Fresh breakout" } };
export const kindLabel = (k: Pick<StockPick, "asset" | "kind">) => kinds[assetOf(k)][k.kind];
export const horizonLabel: Record<StockPick["horizon"], string> = { swing: "Swing trade", long: "Long-term hold" };
export const closeLabel: Record<NonNullable<StockPick["close_reason"]>, string> = { target: "Target hit", stop: "Stop hit", time: "Time ran out", manual: "Closed by J" };

/** A price: "$67,171", "$112.40", "$0.4521", "$0.00001235". Under a dollar it keeps four significant figures. */
export function usd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "–";
  if (Math.abs(v) < 1 && v !== 0) return "$" + Number(v.toPrecision(4)).toString();
  if (Math.abs(v) >= 10000) return "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 });   // cents mean nothing on a $118,240 coin
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
/** Large amounts: "$2.1B", "$340M", "$85K". */
export function bigUsd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "–";
  const a = Math.abs(v);
  if (a >= 1e12) return "$" + (v / 1e12).toFixed(2) + "T";
  if (a >= 1e9) return "$" + (v / 1e9).toFixed(a >= 1e10 ? 0 : 1) + "B";
  if (a >= 1e6) return "$" + (v / 1e6).toFixed(a >= 1e8 ? 0 : 1) + "M";
  if (a >= 1e3) return "$" + Math.round(v / 1e3) + "K";
  return "$" + Math.round(v);
}
export function dayShort(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: "numeric", month: "short", ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });
}
/** A typed amount such as "1,250.50" or "$500" as a number, or null when it is not one. */
export function parseAmount(s: string): number | null {
  const n = Number(s.replace(/[$,\s]/g, ""));
  return s.trim() !== "" && Number.isFinite(n) ? n : null;
}
