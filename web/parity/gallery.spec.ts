import pw from "@playwright/test";
const { test, expect } = pw;

const base = `http://127.0.0.1:${Number(process.env.GALLERY_PORT ?? 4174)}/gallery/scene.html`;

test.skip(({ hasTouch }) => hasTouch, "the desktop project walks the gallery; each scene sets its own frame");

test("every gallery scene mounts the real app without a console error", async ({ page }) => {
  await page.goto(base);
  await page.waitForFunction(() => window.gallery.ready);
  const scenes = await page.evaluate(() => window.gallery.scenes);
  expect(scenes.length).toBeGreaterThan(10);
  for (const scene of scenes) {
    await page.setViewportSize({ width: scene.width, height: scene.height });
    await page.goto(`${base}?scene=${scene.name}`);
    await page.waitForFunction(() => window.gallery.ready, undefined, { timeout: 20000 });
    const errors = await page.evaluate(() => window.gallery.errors);
    expect(errors, scene.name).toEqual([]);
    expect(await page.locator("#app > *").count(), scene.name).toBeGreaterThan(0);
  }
});

declare global {
  interface Window {
    gallery: { scenes: { name: string; width: number; height: number }[]; ready: boolean; errors: string[] };
  }
}
