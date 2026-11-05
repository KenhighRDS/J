import { Preferences } from "@capacitor/preferences";
import { BiometricAuth, BiometryError, BiometryErrorType } from "@aparajita/capacitor-biometric-auth";
import { isAndroidNative } from "./platform";

const KEY = "j:bio";
export async function biometricEnabled(): Promise<boolean> { if (!isAndroidNative) return false; return (await Preferences.get({ key: KEY })).value === "1"; }
export async function setBiometricEnabled(on: boolean): Promise<void> { await Preferences.set({ key: KEY, value: on ? "1" : "0" }); }
export async function biometricAvailable(): Promise<boolean> {
  if (!isAndroidNative) return false;
  try { const r = await BiometricAuth.checkBiometry(); return r.isAvailable || r.deviceIsSecure; } catch { return false; }
}
/** Fingerprint with device PIN fallback. Resolves true when unlocked. */
export async function unlock(): Promise<boolean> {
  try { await BiometricAuth.authenticate({ reason: "Unlock J", allowDeviceCredential: true, androidTitle: "Unlock J", androidSubtitle: "Fingerprint or device PIN" }); return true; }
  catch (e) { if (e instanceof BiometryError && e.code === BiometryErrorType.biometryNotAvailable) return true; return false; }
}
