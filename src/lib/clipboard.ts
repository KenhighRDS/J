import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { isNative } from "./platform";

export async function copyText(value: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(value); return true; } catch { /* fall through */ }
  try {
    const ta = document.createElement("textarea"); ta.value = value; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select(); const ok = document.execCommand("copy"); ta.remove(); return ok;
  } catch { return false; }
}
export async function tick(): Promise<void> {
  if (isNative) { try { await Haptics.impact({ style: ImpactStyle.Light }); } catch { /* ignore */ } }
  else if ("vibrate" in navigator) { try { navigator.vibrate(12); } catch { /* ignore */ } }
}
export async function success(): Promise<void> {
  if (isNative) { try { await Haptics.notification({ type: NotificationType.Success }); } catch { /* ignore */ } }
  else if ("vibrate" in navigator) { try { navigator.vibrate([20, 40, 20]); } catch { /* ignore */ } }
}
