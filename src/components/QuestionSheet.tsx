import { Button, Sheet } from "./ui";
import { headline, pips } from "../lib/format";
import type { Signal } from "../lib/types";

export function QuestionSheet({ signal, open, onAnswer, onClose }: { signal: Signal; open: boolean; onAnswer: (yes: boolean) => void; onClose: () => void }) {
  const h = headline(signal.base_symbol, signal.direction, signal.order_type);
  const result = signal.close_reason ? `hit ${signal.close_reason.toUpperCase()} ${pips(signal.result_pips)} pips` : `closed ${pips(signal.result_pips)} pips`;
  return (
    <Sheet open={open} onClose={onClose} title="Did you catch it?">
      <p className="text-[15px] text-muted">{h} {result}. Did you take this trade?</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button type="button" onClick={() => onAnswer(true)}>Yes, I took it</Button>
        <Button type="button" variant="ghost" onClick={() => onAnswer(false)}>No</Button>
      </div>
    </Sheet>
  );
}
