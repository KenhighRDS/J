import { useEffect, useState } from "react";
import { isAndroidBrowser } from "../lib/platform";

const KEY = "j:androidBarHiddenUntil";
const latestJson = import.meta.env.VITE_RELEASES_LATEST_JSON ?? "https://raw.githubusercontent.com/KenhighRDS/j-releases/main/latest.json";
const releasesPage = import.meta.env.VITE_RELEASES_PAGE ?? "https://github.com/KenhighRDS/j-releases/releases";

/** 30 px bar on Android browsers only (never iPhone, never the APK, never an installed PWA). ✕ hides it for 14 days. */
export function AndroidBar() {
  const [href, setHref] = useState(releasesPage);
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!isAndroidBrowser) return;
    try { const until = Number(localStorage.getItem(KEY) ?? 0); if (until > Date.now()) return; } catch { /* ignore */ }
    setShow(true);
    fetch(latestJson, { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then((j: { url?: string } | null) => { if (j?.url) setHref(j.url); }).catch(() => undefined);
  }, []);
  if (!show) return null;
  return (
    <div className="flex h-[30px] shrink-0 items-center bg-surface-2 border-b border-border text-[13px]">
      <a className="flex-1 px-3 truncate text-text" href={href}>Tap here to download the J app</a>
      <button type="button" aria-label="Hide for 14 days" className="h-full px-3 text-muted" onClick={() => { try { localStorage.setItem(KEY, String(Date.now() + 14 * 86400e3)); } catch { /* ignore */ } setShow(false); }}>✕</button>
    </div>
  );
}
