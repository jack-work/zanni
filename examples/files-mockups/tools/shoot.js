const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const exe = process.env.CHROME || path.join(process.env.HOME, '.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell');
const dirs = (process.argv[2] || 'copione,provino,sipario').split(',');
const only = process.argv[3] ? process.argv[3].split(',') : null;
const full = process.env.FULL === '1';
const outRoot = process.env.OUT || path.join(root, 'shots');
const screens = ['u-ready', 'u-sending', 'u-paused', 'u-away', 'u-reload', 'u-problem', 'u-done', 'f-root', 'f-folder', 'f-photo', 'f-heic', 'f-video', 'f-pdf', 'f-empty'];
const views = [['390', { width: 390, height: 844 }, 2, true], ['1280', { width: 1280, height: 800 }, 1, false]];
(async () => {
  const browser = await chromium.launch({ executablePath: exe });
  for (const d of dirs) {
    fs.mkdirSync(path.join(outRoot, d), { recursive: true });
    for (const [tag, vp, dpr, mobile] of views) {
      const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
      const page = await ctx.newPage();
      for (const s of screens) {
        if (only && !only.includes(s)) continue;
        await page.goto('file://' + path.join(root, d + '.html') + '#' + s);
        await page.addStyleTag({ content: '.mk-bar,.from{display:none!important}' });
                await page.waitForTimeout(250);
        await page.screenshot({ path: path.join(outRoot, d, `${s}-${tag}.png`), fullPage: full });
        if (tag === '390' && process.env.TALL === '1') await page.screenshot({ path: path.join(outRoot, d, `${s}-${tag}-tall.png`), fullPage: true });
      }
      await ctx.close();
    }
  }
  await browser.close();
})();
