import { toPng } from "html-to-image";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { isNative } from "./platform";

/** Renders a node at its CSS size (e.g. 1080×1350) to a PNG data URL. */
export async function renderPng(node: HTMLElement): Promise<string> {
  return toPng(node, { pixelRatio: 1, cacheBust: true, backgroundColor: "#000000" });
}

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
  downloadDataUrl(dataUrl, filename);
  return "downloaded";
}
export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement("a"); a.href = dataUrl; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
}
