import { supabase } from "./supabase";
import type { Signal } from "./types";
import type { SignalShots } from "../components/PromoCard";

/** Signed URL → data URL, so the share-card capture never touches a cross-origin image. */
async function asDataUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from("trade-shots").createSignedUrl(path, 600);
  if (!data?.signedUrl) return null;
  const res = await fetch(data.signedUrl);
  if (!res.ok) return null;
  const blob = await res.blob();
  return await new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(typeof r.result === "string" ? r.result : null); r.onerror = () => resolve(null); r.readAsDataURL(blob); });
}

/** The EA's chart images for a signal (open and/or close), ready to draw. */
export async function loadShots(s: Pick<Signal, "shot_open" | "shot_close">): Promise<SignalShots> {
  const [open, close] = await Promise.all([s.shot_open ? asDataUrl(s.shot_open) : null, s.shot_close ? asDataUrl(s.shot_close) : null]);
  return { open, close };
}
