// Renders chosen frames of a composition as half-size JPEGs for a visual check: node scripts/stills.mjs <CompId> <outDir> <frame> [frame...]
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
const [id, outDir, ...frames] = process.argv.slice(2);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(outDir, { recursive: true });
const serveUrl = await bundle({ entryPoint: join(root, "src", "index.ts"), publicDir: join(root, "public") });
const browserExecutable = process.env.REMOTION_BROWSER || undefined;
const composition = await selectComposition({ serveUrl, id, browserExecutable });
for (const f of frames.map(Number)) {
  await renderStill({ composition, serveUrl, frame: f, output: join(outDir, `f${String(f).padStart(4, "0")}.jpg`), imageFormat: "jpeg", jpegQuality: 82, scale: 0.5, browserExecutable });
  console.log("frame", f);
}
