import { Capacitor } from "@capacitor/core";

export const isNative = Capacitor.isNativePlatform();
export const isAndroidNative = isNative && Capacitor.getPlatform() === "android";
export const isIOSDevice =
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
/** Android in a normal browser tab: not the APK and not an installed PWA. */
export const isAndroidBrowser = !isNative && /Android/.test(navigator.userAgent) && !isStandalone();
export const appVersion = __APP_VERSION__;
export const siteUrl = import.meta.env.VITE_SITE_URL ?? window.location.origin;
