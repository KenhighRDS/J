import { useEffect } from "react";
import { supabase } from "../lib/supabase";

/** Re-runs `onChange` for inserts/updates on the given tables (RLS applies to realtime rows). */
export function useRealtime(tables: { table: string; filter?: string }[], onChange: () => void, deps: unknown[]): void {
  useEffect(() => {
    const ch = supabase.channel(`rt-${tables.map((t) => t.table + (t.filter ?? "")).join("-")}-${Math.random().toString(36).slice(2)}`);
    for (const t of tables) ch.on("postgres_changes", { event: "*", schema: "public", table: t.table, ...(t.filter ? { filter: t.filter } : {}) }, () => onChange());
    ch.subscribe();
    const onVisible = () => { if (document.visibilityState === "visible") onChange(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { void supabase.removeChannel(ch); document.removeEventListener("visibilitychange", onVisible); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
