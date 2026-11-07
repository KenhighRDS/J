import { toPng } from "html-to-image";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { isIOSDevice, isNative, isWebKit } from "./platform";

/** Renders a node at its CSS size (e.g. 1080×1350) to a PNG data URL.
 *  The card is parked offscreen with position:fixed; html-to-image copies that onto the clone, which would push the
 *  content outside the picture and leave a black image, so the clone is pinned at 0,0. WebKit needs a warm-up pass. */
export async function renderPng(node: HTMLElement): Promise<string> {
  try { await document.fonts.ready; } catch { /* ignore */ }
  const opts = { pixelRatio: 1, cacheBust: true, backgroundColor: "#000000", style: { position: "static", left: "0px", top: "0px", transform: "none" } };
  if (isWebKit) await toPng(node, opts);
  return toPng(node, opts);
}

/** A plain download link only works in a real browser tab; the APK WebView and an iPhone home-screen app need the share sheet. */
export const canDownloadDirectly = !isNative && !isIOSDevice;

/** Share a PNG (system share sheet) or download it. */
export async function sharePng(dataUrl: string, filename: string, title: string): Promise<"shared" | "downloaded"> {
  if (isNative) {
    const base64 = dataUrl.split(",")[1];
    const { uri } = await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache });
    await Share.share({ title, files: [uri] });
    return "shared";
  }
  const blob = await (await fetch(dataUrl)).blob();
  const file = new File([blob], filename, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return "shared"; } catch { /* cancelled or unsupported: fall through to download */ }
  }
  if (canDownloadDirectly) { downloadDataUrl(dataUrl, filename); return "downloaded"; }
  // iPhone without file sharing: open the image so it can be long-pressed and saved
  const url = URL.createObjectURL(blob); window.open(url, "_blank"); window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return "downloaded";
}
export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement("a"); a.href = dataUrl; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
}
