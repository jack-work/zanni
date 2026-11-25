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
const origin = `http://127.0.0.1:${server.httpServer.address().port}/gallery/`;
const browser = await pw.chromium.launch();
let failed = 0;

async function listOf(page, global) {
  await page.waitForFunction((g) => window[g]?.ready, global);
  return page.evaluate((g) => window[g][g === "gallery" ? "scenes" : "parts"], global);
}

async function shoot(item, kind, theme) {
  const phone = kind === "scene" && item.frame === "phone";
  const context = await browser.newContext({
    viewport: { width: item.width, height: item.height },
    deviceScaleFactor: phone ? 2 : 1,
    isMobile: phone,
    hasTouch: phone,
    reducedMotion: "reduce",
    colorScheme: theme,
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(FIXED);
  await page.goto(`${origin}${kind}.html?${kind}=${item.name}&theme=${theme}`);
  const global = kind === "scene" ? "gallery" : "partsGallery";
  await page.waitForFunction((g) => window[g].ready, global, { timeout: 20000 });
  const errors = await page.evaluate((g) => window[g].errors, global);
  const file = join(out, `${kind === "part" ? "part-" : ""}${item.name}.${theme}.png`);
  await page.screenshot({ path: file });
  console.log(file + (errors.length ? `  ERRORS: ${errors.join(" | ")}` : ""));
  if (errors.length) failed++;
  await context.close();
}

try {
  const probe = await browser.newPage();
  await probe.goto(origin + "scene.html");
  const scenes = await listOf(probe, "gallery");
  await probe.goto(origin + "part.html");
  const parts = await listOf(probe, "partsGallery");
  await probe.close();
  const known = new Set([...scenes, ...parts].map((i) => i.name));
  const missing = only.filter((n) => !known.has(n));
  if (missing.length) throw new Error(`no such scene or part: ${missing.join(", ")}`);
  const pick = (list) => (only.length ? list.filter((i) => only.includes(i.name)) : list);
  mkdirSync(out, { recursive: true });
  for (const [list, kind] of [[scenes, "scene"], [parts, "part"]]) {
    for (const item of pick(list)) for (const theme of themes) await shoot(item, kind, theme);
  }
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
