const { chromium } = require('playwright-core');
const exe = process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell';
(async () => {
  const browser = await chromium.launch({ executablePath: exe });
  for (const [tag, vp, dpr, mobile] of [['m', { width: 390, height: 844 }, 2, true], ['d', { width: 1280, height: 800 }, 1, false]]) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
    const page = await ctx.newPage();
    await page.goto('https://demo.immich.app/', { waitUntil: 'load', timeout: 40000 });
    await page.waitForTimeout(2500);
    await page.getByText(/Login as demo user/i).click({ timeout: 8000 }).catch(e => console.log('click1', e.message.split('\n')[0]));
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: /^Login$/ }).click({ timeout: 8000 }).catch(e => console.log('click2', e.message.split('\n')[0]));
    await page.waitForTimeout(6000);
    console.log(tag, page.url());
    await page.screenshot({ path: `/tmp/research/shots/immich-timeline-${tag}.png` });
    // open first asset
    const first = page.locator('[data-thumbnail-focus-container], a[href*="/photos/"]').first();
    if (await first.count()) { await first.click({ timeout: 5000 }).catch(()=>{}); await page.waitForTimeout(3000); await page.screenshot({ path: `/tmp/research/shots/immich-viewer-${tag}.png` }); }
    await ctx.close();
  }
  await browser.close();
})();
