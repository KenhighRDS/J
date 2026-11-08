// Chart images sent by the EAs ("shot" events): decoded and checked here (pure, so Node tests can load it).
export const MAX_SHOT_BYTES = 3 * 1024 * 1024;
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Base64 PNG → bytes; null when it is not a PNG, empty or too large. */
export function decodePngBase64(b64: unknown): Uint8Array | null {
  if (typeof b64 !== "string" || b64.length < 16) return null;
  const clean = b64.replace(/\s+/g, "");
  if (clean.length > Math.ceil(MAX_SHOT_BYTES / 3) * 4) return null;
  let bin: string;
  try { bin = atob(clean); } catch { return null; }
  if (bin.length < PNG.length || bin.length > MAX_SHOT_BYTES) return null;
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return PNG.every((b, i) => out[i] === b) ? out : null;
}

/** Storage path of a signal's image: trade-shots/<signal id>/<open|close>.png */
export const shotPath = (signalId: string, kind: "open" | "close") => `${signalId}/${kind}.png`;
