import { useEffect, useState } from "react";
import { supabase } from "./supabase";

/** The signals an admin switched on for this member ("usdjpy", "gold", "wann", "stocks", "crypto", ...). null while loading. */
export function useChannels(userId: string | undefined): string[] | null {
  const [channels, setChannels] = useState<string[] | null>(null);
  useEffect(() => {
    if (!userId) { setChannels(null); return; }
    let alive = true;
    const load = () => { void supabase.rpc("my_channels").then(({ data, error }) => { if (alive) setChannels(error ? [] : ((data ?? []) as string[])); }); };
    load();
    const onVisible = () => { if (document.visibilityState === "visible") load(); };   // an admin may have switched something while the app was closed
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; document.removeEventListener("visibilitychange", onVisible); };
  }, [userId]);
  return channels;
}
