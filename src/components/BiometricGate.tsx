import { useEffect, useState, type ReactNode } from "react";
import { App as CapApp } from "@capacitor/app";
import { Button, Logo } from "./ui";
import { biometricEnabled, unlock } from "../lib/biometric";
import { isAndroidNative } from "../lib/platform";

const BACKGROUND_MS = 5 * 60_000;
/** Set by the push listener when the app was opened from an alert/push: that open skips the prompt (speed matters). */
export const launchFlags = { fromAlert: false };

export function BiometricGate({ children }: { children: ReactNode }) {
  const [locked, setLocked] = useState<boolean | null>(isAndroidNative ? null : false);
  useEffect(() => {
    if (!isAndroidNative) return;
    let hiddenAt = 0;
    const decide = async (coldStart: boolean) => {
      if (!(await biometricEnabled())) { setLocked(false); return; }
      if (launchFlags.fromAlert) { launchFlags.fromAlert = false; setLocked(false); return; }
      if (coldStart || (hiddenAt && Date.now() - hiddenAt > BACKGROUND_MS)) setLocked(true);
    };
    void decide(true);
    const sub = CapApp.addListener("appStateChange", ({ isActive }) => { if (!isActive) hiddenAt = Date.now(); else void decide(false); });
    return () => { void sub.then((h) => h.remove()); };
  }, []);
  if (locked === null) return <div className="app-frame" />;
  if (!locked) return <>{children}</>;
  const tryUnlock = async () => { if (await unlock()) setLocked(false); };
  return (
    <div className="app-frame items-center justify-center px-8">
      <Logo size={72} />
      <p className="mt-6 text-[17px]">J is locked</p>
      <Button className="mt-5" type="button" onClick={tryUnlock}>Unlock with fingerprint</Button>
    </div>
  );
}
