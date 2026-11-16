// Captures the real Crypto screens in J for the crypto video (no app code involved): the Crypto tab, a swing pick
// (before and after "I bought it"), a long-term pick with the companies that hold it, and the portfolio. Pick pages are
// captured at their full height so the video can scroll them. Writes layout.json with where each section starts, as a
// fraction of the page height. The picks shown are the app's own preview examples.
// Run from promo/: node scripts/capture-crypto.cjs   (needs the app's deps installed one level up)
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? 'playwright'); const { spawn } = require('child_process');
const path = require('path'); const fs = require('fs');
const OUT = path.join(__dirname, '..', 'public', 'ui', 'crypto'); const PORT = 5183; const W = 390, H = 844;
const waitFor = async (page, url) => { for (let n = 0; n < 80; n++) { try { await page.goto(url, { waitUntil: 'load', timeout: 5000 }); return; } catch { await new Promise((r) => setTimeout(r, 500)); } } throw new Error('dev server did not start'); };
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const dev = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: path.join(__dirname, '..', '..'), stdio: 'ignore' });
  const layout = {};
  try {
    const b = await chromium.launch();
    { const p = await b.newPage(); await waitFor(p, `http://127.0.0.1:${PORT}/`); await p.close(); }
    const shots = [['c-list', '/__preview/crypto', false], ['c-coin', '/__preview/coin', true], ['c-coin-taken', '/__preview/coin?pos=1', true], ['c-coin-long', '/__preview/coin?state=long', true], ['c-portfolio', '/__preview/portfolio', true]];
    for (const [name, url, tall] of shots) {
      const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 3 }); const page = await ctx.newPage();
      await page.goto(`http://127.0.0.1:${PORT}${url}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(900);
      let h = H;
      if (tall) {
        h = await page.evaluate(() => Math.max(...[...document.querySelectorAll('.scroll-area, .app-frame, body')].map((e) => e.scrollHeight)));
        await page.setViewportSize({ width: W, height: h }); await page.waitForTimeout(400);
      }
      // where each titled block starts (h2 / small uppercase labels), as a fraction of the captured height
      layout[name] = { height: h / H, marks: await page.evaluate((hh) => [...document.querySelectorAll('h1, h2, h3, p, button')].map((e) => ({ t: (e.textContent || '').trim().slice(0, 40), y: e.getBoundingClientRect().top / hh, tag: e.tagName })).filter((m) => m.t && m.t.length < 40 && (m.tag !== 'P' || /^[A-Z]/.test(m.t))), h) };
      await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('captured', name, `${W}x${h}`); await ctx.close();
    }
    fs.writeFileSync(`${OUT}/layout.json`, JSON.stringify(layout, null, 1)); console.log('wrote layout.json');
    await b.close();
  } finally { dev.kill('SIGTERM'); }
})();
