import { useEffect, useState } from "react";
import { Button, Sheet } from "./ui";
import { checkForUpdate, type LatestJson } from "../lib/update";

export function UpdateSheet() {
  const [latest, setLatest] = useState<LatestJson | null>(null);
  useEffect(() => { void checkForUpdate().then(setLatest); }, []);
  if (!latest) return null;
  return (
    <Sheet open onClose={() => setLatest(null)} title={`New version ${latest.version}`}>
      {latest.notes && <p className="whitespace-pre-wrap text-[14px] text-muted mb-4">{latest.notes}</p>}
      <Button full type="button" onClick={() => { window.open(latest.url, "_system"); }}>Update</Button>
      <Button className="mt-2" variant="quiet" full type="button" onClick={() => setLatest(null)}>Later</Button>
    </Sheet>
  );
}
