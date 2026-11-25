import { mkdirSync } from "node:fs";
import { join } from "node:path";
import pw from "@playwright/test";
import { createServer } from "vite";

const FIXED = new Date("2026-11-25T12:00:00-05:00");
const out = process.env.GALLERY_OUT ?? "/var/tmp/zanni-gallery";
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const themes = process.argv.includes("--light") ? ["light"] : process.argv.includes("--dark") ? ["dark"] : ["light", "dark"];

const server = await createServer({ configFile: new URL("../vite.config.ts", import.meta.url).pathname, server: { port: 0, host: "127.0.0.1" }, logLevel: "error" });
await server.listen();
const base = `http://127.0.0.1:${server.config.server.port ?? server.httpServer.address().port}/gallery/scene.html`;
const browser = await pw.chromium.launch();
let failed = 0;

try {
  const probe = await browser.newPage();
  await probe.goto(base);
  await probe.waitForFunction(() => window.gallery?.ready);
  const scenes = await probe.evaluate(() => window.gallery.scenes);
  await probe.close();
  const wanted = only.length ? scenes.filter((s) => only.includes(s.name)) : scenes;
  if (only.length && wanted.length !== only.length) throw new Error(`no such scene in ${only.join(", ")}; have ${scenes.map((s) => s.name).join(", ")}`);
  mkdirSync(out, { recursive: true });
  for (const scene of wanted) {
    for (const theme of themes) {
      const phone = scene.frame === "phone";
      const context = await browser.newContext({
        viewport: { width: scene.width, height: scene.height },
        deviceScaleFactor: phone ? 2 : 1,
        isMobile: phone,
        hasTouch: phone,
        reducedMotion: "reduce",
        colorScheme: theme,
      });
      const page = await context.newPage();
      await page.clock.setFixedTime(FIXED);
      await page.goto(`${base}?scene=${scene.name}&theme=${theme}`);
      await page.waitForFunction(() => window.gallery.ready, undefined, { timeout: 20000 });
      const errors = await page.evaluate(() => window.gallery.errors);
      const file = join(out, `${scene.name}.${theme}.png`);
      await page.screenshot({ path: file });
      console.log(file + (errors.length ? `  ERRORS: ${errors.join(" | ")}` : ""));
      if (errors.length) failed++;
      await context.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
