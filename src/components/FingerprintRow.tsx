import { useEffect, useState } from "react";
import { Toggle } from "./ui";
import { biometricAvailable, biometricEnabled, setBiometricEnabled, unlock } from "../lib/biometric";

export function FingerprintRow() {
  const [available, setAvailable] = useState(false);
  const [on, setOn] = useState(false);
  useEffect(() => { void biometricAvailable().then(setAvailable); void biometricEnabled().then(setOn); }, []);
  if (!available) return null;
  const change = async (v: boolean) => { if (v && !(await unlock())) return; await setBiometricEnabled(v); setOn(v); };
  return (
    <div className="flex items-center min-h-12 px-4 py-3">
      <div className="flex-1"><p className="text-[15px]">Unlock with fingerprint</p><p className="text-[13px] text-muted">On cold start and after 5 minutes away. Alerts open straight to the card.</p></div>
      <Toggle on={on} onChange={change} label="Unlock with fingerprint" />
    </div>
  );
}
