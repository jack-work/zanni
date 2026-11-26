const { chromium } = require('playwright-core');
const fs = require('fs');
const P = process.env.HOME + '/.cache/ms-playwright/';
const exe = P + 'chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell';
const list = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const out = '/tmp/research/shots/';
const metaFile = '/tmp/research/meta.json';
const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : {};

async function one(browser, item) {
  const res = { url: item.url, slug: item.slug, ok: false };
  for (const [tag, vp, dpr, mobile] of [['m', { width: 390, height: 844 }, 2, true], ['d', { width: 1280, height: 800 }, 1, false]]) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile,
      userAgent: mobile ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1' : undefined });
    const page = await ctx.newPage();
    try {
      const r = await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForLoadState('load', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(item.wait || 2500);
      if (item.after) { try { await item.after.split(';;').reduce((p, s) => p.then(() => page.evaluate(s)), Promise.resolve()); await page.waitForTimeout(1200); } catch (e) {} }
      if (tag === 'd') {
        res.status = r && r.status();
        res.lastModified = r && r.headers()['last-modified'];
        res.date = r && r.headers()['date'];
        res.info = await page.evaluate(() => {
          const q = (s) => Array.from(document.querySelectorAll(s));
          const metas = {};
          for (const m of q('meta[property],meta[name]')) {
            const k = m.getAttribute('property') || m.getAttribute('name');
            if (/date|time|modified|publish/i.test(k)) metas[k] = m.content;
          }
          const ld = q('script[type="application/ld+json"]').map((s) => s.textContent).join(' ');
          const ldDates = (ld.match(/"(datePublished|dateModified)"\s*:\s*"[^"]+"/g) || []).slice(0, 4);
          const times = q('time[datetime]').slice(0, 3).map((t) => t.getAttribute('datetime'));
          const body = document.body ? document.body.innerText : '';
          const copy = (body.match(/©\s*(?:\d{4}\s*[-–]\s*)?(20\d\d)/g) || []).slice(-2);
          const n2026 = (body.match(/2026/g) || []).length;
          const n2025 = (body.match(/2025/g) || []).length;
          return { title: document.title, canonical: (q('link[rel=canonical]')[0] || {}).href, metas, ldDates, times, copy, n2026, n2025 };
        });
      }
      await page.screenshot({ path: out + item.slug + '-' + tag + '.png' });
      res.ok = true;
    } catch (e) { res['err_' + tag] = String(e.message).split('\n')[0]; }
    await ctx.close();
  }
  return res;
}

(async () => {
  const browser = await chromium.launch({ executablePath: exe });
  const queue = list.slice();
  const workers = Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const item = queue.shift();
      const r = await one(browser, item);
      meta[item.slug] = r;
      console.log(item.slug, r.ok, r.status || '', r.err_m || r.err_d || '');
      fs.writeFileSync(metaFile, JSON.stringify(meta, null, 1));
    }
  });
  await Promise.all(workers);
  await browser.close();
})();
