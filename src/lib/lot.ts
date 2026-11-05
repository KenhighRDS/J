import type { Signal } from "./types";

export interface LotInput {
  balance: number | null; riskPct: number; entry: number; sl: number | null;
  tickSize: number | null; tickValue: number | null; volMin: number; volStep: number; volMax: number;
}
/** lot = (balance × risk% ) ÷ (|entry − sl| ÷ tick_size × tick_value), rounded DOWN to vol_step, clamped. */
export function calcLot(i: LotInput): number | null {
  if (i.balance == null || i.balance <= 0 || i.sl == null) return null;
  const tickSize = i.tickSize && i.tickSize > 0 ? i.tickSize : null;
  const tickValue = i.tickValue && i.tickValue > 0 ? i.tickValue : null;
  if (!tickSize || !tickValue) return null;
  const distance = Math.abs(i.entry - i.sl);
  if (distance <= 0) return null;
  const riskMoney = (i.balance * i.riskPct) / 100;
  const lossPerLot = (distance / tickSize) * tickValue;
  if (lossPerLot <= 0) return null;
  const raw = riskMoney / lossPerLot;
  const step = i.volStep > 0 ? i.volStep : 0.01;
  const stepped = Math.floor(raw / step + 1e-9) * step;
  const clamped = Math.min(i.volMax, Math.max(i.volMin, stepped));
  return Number(clamped.toFixed(stepDecimals(step)));
}
export function stepDecimals(step: number): number {
  const s = step.toString();
  return s.includes(".") ? s.split(".")[1].length : 0;
}
export function lotForSignal(s: Signal, balance: number | null, riskPct: number): number | null {
  return calcLot({ balance, riskPct, entry: s.entry, sl: s.sl, tickSize: s.tick_size, tickValue: s.tick_value, volMin: s.vol_min, volStep: s.vol_step, volMax: s.vol_max });
}
