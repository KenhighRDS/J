import type { Direction, OrderType } from "./types";

/** Plain value with the signal's digits, no thousands separators (what the clipboard gets). */
export function price(v: number | null | undefined, digits: number): string {
  if (v == null || !Number.isFinite(v)) return "–";
  return v.toFixed(Math.max(0, Math.min(8, digits)));
}
export function lots(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "–";
  return String(Number(v.toFixed(2)));
}
export function pips(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "–";
  const r = Math.round(v * 10) / 10;
  return `${r > 0 ? "+" : ""}${r}`;
}
export const orderTypeLabel: Record<OrderType, string> = { market: "MARKET", buy_stop: "BUY STOP", sell_stop: "SELL STOP", buy_limit: "BUY LIMIT", sell_limit: "SELL LIMIT" };
export function headline(symbol: string, direction: Direction, orderType: OrderType): string {
  return orderType === "market" ? `${symbol} ${direction.toUpperCase()}` : `${symbol} ${orderTypeLabel[orderType]}`;
}
export function timeShort(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso); const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const t = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return sameDay ? t : `${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })} ${t}`;
}
export function dateRange(a: string, b: string): string {
  const f = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return `${f(a)} – ${f(b)}`;
}
export function countdown(ms: number): string {
  if (ms <= 0) return "0:00";
  const s = Math.ceil(ms / 1000);
  if (s >= 86400) return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
export function agoShort(iso: string | null | undefined): string {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
