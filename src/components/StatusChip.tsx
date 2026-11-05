import type { ReceiptStatus } from "../lib/types";
const text: Record<ReceiptStatus, string> = { pending: "New", opened: "Opened", likely_taken: "Likely taken", taken: "Taken", skipped: "Skipped", missed: "Missed", not_taken: "Not taken" };
const tone: Record<ReceiptStatus, string> = { pending: "text-text border-border", opened: "text-muted border-border", likely_taken: "text-buy/80 border-buy/30", taken: "text-buy border-buy/40", skipped: "text-muted border-border", missed: "text-sell/80 border-sell/30", not_taken: "text-muted border-border" };
export function StatusChip({ status }: { status: ReceiptStatus }) {
  return <span className={`inline-flex h-6 items-center rounded-full border px-2 text-[12px] ${tone[status]}`}>{text[status]}</span>;
}
