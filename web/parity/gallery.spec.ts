import pw from "@playwright/test";
const { test, expect } = pw;

const origin = `http://127.0.0.1:${Number(process.env.GALLERY_PORT ?? 4174)}/gallery/`;

test.skip(({ hasTouch }) => hasTouch, "the desktop project walks the gallery; each scene sets its own frame");

test("every gallery scene mounts the real app without a console error", async ({ page }) => {
  await page.goto(origin + "scene.html");
  await page.waitForFunction(() => window.gallery.ready);
  const scenes = await page.evaluate(() => window.gallery.scenes);
  expect(scenes.length).toBeGreaterThan(10);
  for (const scene of scenes) {
    await page.setViewportSize({ width: scene.width, height: scene.height });
    await page.goto(`${origin}scene.html?scene=${scene.name}`);
    await page.waitForFunction(() => window.gallery.ready, undefined, { timeout: 20000 });
    const errors = await page.evaluate(() => window.gallery.errors);
    expect(errors, scene.name).toEqual([]);
    expect(await page.locator("#app > *").count(), scene.name).toBeGreaterThan(0);
  }
});

test("every gallery part renders from fixed props without a console error", async ({ page }) => {
  await page.goto(origin + "part.html");
  await page.waitForFunction(() => window.partsGallery.ready);
  const parts = await page.evaluate(() => window.partsGallery.parts);
  expect(parts.length).toBeGreaterThan(10);
  for (const part of parts) {
    await page.setViewportSize({ width: part.width, height: part.height });
    await page.goto(`${origin}part.html?part=${part.name}`);
    await page.waitForFunction(() => window.partsGallery.ready, undefined, { timeout: 20000 });
    const errors = await page.evaluate(() => window.partsGallery.errors);
    expect(errors, part.name).toEqual([]);
    expect(await page.locator("#app > *").count(), part.name).toBeGreaterThan(0);
  }
});

test("the index lists a light and a dark frame for every scene and part", async ({ page }) => {
  await page.goto(origin + "index.html");
  await page.waitForFunction(() => document.querySelectorAll("#gi iframe").length > 0);
  const frames = await page.locator("#gi iframe").count();
  await page.goto(origin + "scene.html");
  await page.waitForFunction(() => window.gallery.ready);
  const scenes = await page.evaluate(() => window.gallery.scenes.length);
  await page.goto(origin + "part.html");
  await page.waitForFunction(() => window.partsGallery.ready);
  const parts = await page.evaluate(() => window.partsGallery.parts.length);
  expect(frames).toBe(2 * (scenes + parts));
});

declare global {
  interface Window {
    gallery: { scenes: { name: string; width: number; height: number }[]; ready: boolean; errors: string[] };
    partsGallery: { parts: { name: string; width: number; height: number }[]; ready: boolean; errors: string[] };
  }
}
