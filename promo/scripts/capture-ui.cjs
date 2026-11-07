// Captures the real app UI from the app's dev-only preview routes (no app code involved).
// Run from promo/: node scripts/capture-ui.cjs   (needs the app's deps installed one level up)
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? '/opt/node-tools/node_modules/playwright'); const { spawn } = require('child_process'); const path = require('path');
const OUT = path.join(__dirname, '..', 'public', 'ui');
/** Waits for the local dev server by retrying page loads through Playwright itself. */
const waitFor = async (page, url) => { for (let n = 0; n < 80; n++) { try { await page.goto(url, { waitUntil: 'load', timeout: 5000 }); return; } catch { await new Promise((r) => setTimeout(r, 500)); } } throw new Error('dev server did not start'); };
(async () => {
  const dev = spawn('npx', ['vite', '--port', '5174', '--strictPort', '--host', '127.0.0.1'], { cwd: path.join(__dirname, '..', '..'), stdio: 'ignore' });
  try {
    const b = await chromium.launch();
    { const probe = await b.newPage(); await waitFor(probe, 'http://127.0.0.1:5174/'); await probe.close(); }
    const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 };
    const shots = [
      ['signal-live', '/__preview/signal?state=live', phone, false], ['signal-closed', '/__preview/signal?state=closed', phone, false],
      ['wann', '/__preview/wann', phone, false], ['wann-tall', '/__preview/wann', { viewport: { width: 390, height: 2200 }, deviceScaleFactor: 3 }, false],
      ['backtest-card', '/__preview/backtest-card?money=1', { viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 }, false],
    ];
    for (const [name, p, ctxOpts] of shots) {
      const ctx = await b.newContext(ctxOpts); const page = await ctx.newPage();
      await page.goto('http://127.0.0.1:5174' + p, { waitUntil: 'networkidle', timeout: 60000 }); await page.waitForTimeout(1200);
      await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('captured', name); await ctx.close();
    }
    const ctx = await b.newContext(phone); const page = await ctx.newPage();
    await page.goto('https://j-signals.netlify.app/login', { waitUntil: 'networkidle', timeout: 60000 }); await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/login.png` }); console.log('captured login'); await ctx.close();
    await b.close();
  } finally { dev.kill('SIGTERM'); }
})();
