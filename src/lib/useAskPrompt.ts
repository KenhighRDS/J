import { useCallback, useEffect, useRef, useState } from "react";
import type { SetURLSearchParams } from "react-router-dom";
import { shouldPrompt } from "./askPrompt";
import type { Receipt } from "./types";

/** Drives the "Did you catch it?" sheet. The ?ask=1 deep link is consumed on arrival, and a receipt is prompted at most once per mount,
 *  so refreshes (realtime reloads, the answer round-trip) cannot re-open a sheet the user already answered or dismissed. */
export function useAskPrompt(receipt: Receipt | null, params: URLSearchParams, setParams: SetURLSearchParams) {
  const [open, setOpen] = useState(false);
  const prompted = useRef<string | null>(null);
  const clearAsk = useCallback(() => {
    if (!params.has("ask")) return;
    const next = new URLSearchParams(params); next.delete("ask"); setParams(next, { replace: true });
  }, [params, setParams]);
  useEffect(() => {
    if (!receipt) return;
    const asked = params.get("ask") === "1";
    if (shouldPrompt(receipt, asked, prompted.current)) { prompted.current = receipt.id; setOpen(true); }
    if (asked) clearAsk();
  }, [receipt, params, clearAsk]);
  const settle = useCallback(() => { if (receipt) prompted.current = receipt.id; setOpen(false); clearAsk(); }, [receipt, clearAsk]);
  return { open, settle };
}
