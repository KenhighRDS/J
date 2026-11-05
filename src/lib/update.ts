import { App as CapApp } from "@capacitor/app";
import { isAndroidNative } from "./platform";

export interface LatestJson { version: string; versionCode: number; url: string; notes?: string }
const latestJson = import.meta.env.VITE_RELEASES_LATEST_JSON ?? "https://raw.githubusercontent.com/KenhighRDS/j-releases/main/latest.json";

/** On APK start: compare the installed versionCode with latest.json. */
export async function checkForUpdate(): Promise<LatestJson | null> {
  if (!isAndroidNative) return null;
  try {
    const info = await CapApp.getInfo();
    const res = await fetch(latestJson, { cache: "no-store" });
    if (!res.ok) return null;
    const j = (await res.json()) as LatestJson;
    return Number(j.versionCode) > Number(info.build) ? j : null;
  } catch { return null; }
}
