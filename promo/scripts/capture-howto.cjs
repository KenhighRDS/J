// Captures the real J signal card at each step of the how-to (no app code involved): fresh, lot/SL/TP copied, unlocked, mid-swipe, taken,
// and a pending order with the entry copied. Also writes layout.json with row and knob positions as fractions of the screen.
// Run from promo/: node scripts/capture-howto.cjs   (needs the app's deps installed one level up)
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? '/opt/node-tools/node_modules/playwright'); const { spawn } = require('child_process');
const path = require('path'); const fs = require('fs');
const OUT = path.join(__dirname, '..', 'public', 'ui', 'howto'); const PORT = 5178; const W = 390, H = 844;
const waitFor = async (page, url) => { for (let n = 0; n < 80; n++) { try { await page.goto(url, { waitUntil: 'load', timeout: 5000 }); return; } catch { await new Promise((r) => setTimeout(r, 500)); } } throw new Error('dev server did not start'); };
const asJ = (page) => page.evaluate(() => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) if (n.nodeValue && n.nodeValue.includes('XAU EA')) n.nodeValue = n.nodeValue.replace('XAU EA', 'J'); });   // the sender is J
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const dev = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: path.join(__dirname, '..', '..'), stdio: 'ignore' });
  try {
    const b = await chromium.launch();
    { const p = await b.newPage(); await waitFor(p, `http://127.0.0.1:${PORT}/`); await p.close(); }
    const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 3 });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://127.0.0.1:${PORT}` });
    const shot = async (page, name) => { await asJ(page); await page.waitForTimeout(650); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('captured', name); };
    const rect = async (page, sel) => { const r = await page.locator(sel).first().boundingBox(); return { x: r.x / W, y: r.y / H, w: r.width / W, h: r.height / H }; };

    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/__preview/signal?state=live`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
    const layout = {
      lot: await rect(page, 'button[aria-label^="Copy Your lot"]'), sl: await rect(page, 'button[aria-label^="Copy SL"]'), tp: await rect(page, 'button[aria-label^="Copy TP"]'),
      entry: await rect(page, 'button[aria-label^="Copy Entry"]'), symbol: await rect(page, 'button[aria-label^="Copy Symbol"]'),
      knob: await rect(page, 'div[role="button"][aria-label]'), track: await rect(page, 'div[aria-live="polite"]'),
    };
    await shot(page, 'j-fresh');
    for (const [field, label] of [['lot', 'Copy Your lot'], ['sl', 'Copy SL'], ['tp', 'Copy TP']]) { await page.locator(`button[aria-label^="${label}"]`).first().click(); await page.waitForTimeout(600); await shot(page, `j-${field}`); }
    await page.waitForTimeout(10500);                                             // the slider unlocks 10 s after opening
    await shot(page, 'j-unlocked');
    const k = await page.locator('div[role="button"][aria-label="Swipe to confirm you took it"]').boundingBox(); const t = layout.track;
    const cx = k.x + k.width / 2, cy = k.y + k.height / 2, end = (t.x + t.w) * W - 30;
    await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + (end - cx) * 0.5, cy, { steps: 8 }); await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/j-swipe-mid.png` }); console.log('captured j-swipe-mid');
    await page.mouse.move(end, cy, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(900);
    await shot(page, 'j-taken');

    const pend = await ctx.newPage();
    await pend.goto(`http://127.0.0.1:${PORT}/__preview/signal?state=pending`, { waitUntil: 'networkidle' }); await pend.waitForTimeout(700);
    layout.pendingEntry = await rect(pend, 'button[aria-label^="Copy Entry"]'); layout.pendingOrder = await rect(pend, 'button[aria-label^="Copy Order"]');
    await shot(pend, 'j-pending');
    await pend.locator('button[aria-label^="Copy Entry"]').first().click(); await pend.waitForTimeout(600); await shot(pend, 'j-pending-entry');

    const closed = await ctx.newPage();
    await closed.goto(`http://127.0.0.1:${PORT}/__preview/signal?state=closed`, { waitUntil: 'networkidle' }); await closed.waitForTimeout(700); await shot(closed, 'j-closed');

    fs.writeFileSync(`${OUT}/layout.json`, JSON.stringify(layout, null, 2)); console.log('wrote layout.json');
    await b.close();
  } finally { dev.kill('SIGTERM'); }
})();
