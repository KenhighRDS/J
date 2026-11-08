// Captures the real Wann screens in J for the Wann video (no app code involved): the gallery at 90%+, and the call card
// fresh, with the pick copied, mid-swipe, taken and won. Writes layout.json with element positions as screen fractions.
// Run from promo/: node scripts/capture-wann.cjs   (needs the app's deps installed one level up)
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? '/opt/node-tools/node_modules/playwright'); const { spawn } = require('child_process');
const path = require('path'); const fs = require('fs');
const OUT = path.join(__dirname, '..', 'public', 'ui', 'wann'); const PORT = 5181; const W = 390, H = 844;
const waitFor = async (page, url) => { for (let n = 0; n < 80; n++) { try { await page.goto(url, { waitUntil: 'load', timeout: 5000 }); return; } catch { await new Promise((r) => setTimeout(r, 500)); } } throw new Error('dev server did not start'); };
const noRecord = (page) => page.evaluate(() => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) if (n.nodeValue && / · record \d+–\d+/.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(/ · record \d+–\d+/, ''); });
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const dev = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: path.join(__dirname, '..', '..'), stdio: 'ignore' });
  try {
    const b = await chromium.launch();
    { const p = await b.newPage(); await waitFor(p, `http://127.0.0.1:${PORT}/`); await p.close(); }
    for (const [name, h] of [['w-gallery', H], ['w-gallery-tall', 2400]]) {
      const ctx = await b.newContext({ viewport: { width: W, height: h }, deviceScaleFactor: 3 }); const page = await ctx.newPage();
      await page.goto(`http://127.0.0.1:${PORT}/__preview/wann?min=90`, { waitUntil: 'networkidle' }); await page.waitForTimeout(900); await noRecord(page); await page.waitForTimeout(200);
      await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('captured', name); await ctx.close();
    }
    const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 3 });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://127.0.0.1:${PORT}` });
    const rect = async (page, sel) => { const r = await page.locator(sel).first().boundingBox(); return { x: r.x / W, y: r.y / H, w: r.width / W, h: r.height / H }; };
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/__preview/wann-call`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
    const layout = { pick: await rect(page, 'button[aria-label^="Copy Pick"]'), home: await rect(page, 'button[aria-label^="Copy Home"]'), kickoff: await rect(page, 'button[aria-label^="Copy Kickoff"]'),
      call: await rect(page, 'p.chrome'), knob: await rect(page, 'div[role="button"][aria-label]'), track: await rect(page, 'div[aria-live="polite"]') };
    await page.screenshot({ path: `${OUT}/w-call.png` }); console.log('captured w-call');
    await page.locator('button[aria-label^="Copy Pick"]').click(); await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/w-call-copied.png` }); console.log('captured w-call-copied');
    const k = await page.locator('div[role="button"][aria-label="Swipe to confirm you took it"]').boundingBox(); const t = layout.track;
    const cx = k.x + k.width / 2, cy = k.y + k.height / 2, end = (t.x + t.w) * W - 30;
    await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + (end - cx) * 0.5, cy, { steps: 8 }); await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/w-call-swipe.png` }); console.log('captured w-call-swipe');
    await page.mouse.move(end, cy, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/w-call-taken.png` }); console.log('captured w-call-taken');
    const won = await ctx.newPage(); await won.goto(`http://127.0.0.1:${PORT}/__preview/wann-call?state=won`, { waitUntil: 'networkidle' }); await won.waitForTimeout(800);
    await won.screenshot({ path: `${OUT}/w-call-won.png` }); console.log('captured w-call-won');
    fs.writeFileSync(`${OUT}/layout.json`, JSON.stringify(layout, null, 2)); console.log('wrote layout.json');
    await b.close();
  } finally { dev.kill('SIGTERM'); }
})();
