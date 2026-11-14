import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { afterLoad } from "./channels";

/** The signals an admin switched on for this member ("usdjpy", "gold", "wann", "stocks", "crypto", ...). null while loading. */
export function useChannels(userId: string | undefined): string[] | null {
  const [channels, setChannels] = useState<string[] | null>(null);
  useEffect(() => {
    if (!userId) { setChannels(null); return; }
    let alive = true, known = false, retry: ReturnType<typeof setTimeout> | undefined;
    const load = () => {
      void supabase.rpc("my_channels").then(({ data, error }) => {
        if (!alive) return;
        setChannels((was) => afterLoad(was, data, error != null));
        if (!error) known = true;
        else if (!known) { clearTimeout(retry); retry = setTimeout(load, 3000); }   // nothing to show yet: keep asking
      });
    };
    load();
    const onVisible = () => { if (document.visibilityState === "visible") load(); };   // an admin may have switched something while the app was closed
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; clearTimeout(retry); document.removeEventListener("visibilitychange", onVisible); };
  }, [userId]);
  return channels;
}
