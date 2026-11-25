import { createRequire } from "node:module";
import { fakeRpc, fakeSpeech, test, expect, type MockCore } from "./fixtures";
import { store } from "./store";

const require = createRequire(import.meta.url);
const mock = require("../../examples/aria-mock.js") as { create(o: object): MockCore };

test.skip(({ hasTouch }) => hasTouch, "desktop browsers only");

test.beforeEach(async ({ page }) => {
  const core = mock.create({ step: 120, pageBytes: 24000, history: 60 });
  await fakeRpc(page, core);
  await fakeSpeech(page);
  await page.goto(`/#/${store}/${core.ids.main}`);
  await page.locator(".fw[data-link='live']").waitFor();
  await page.locator(".zr-pit .zr-pit-knob").waitFor();
  await page.waitForFunction(() => {
    const s = document.querySelector<HTMLElement>("[data-zr-scroll]")!;
    return s.scrollHeight - s.clientHeight - s.scrollTop < 2;
  });
});

async function wheelUp(page: import("@playwright/test").Page, by: number): Promise<void> {
  await page.mouse.move(640, 300);
  await page.mouse.wheel(0, -by);
  await page.waitForTimeout(300);
  if ((await away(page)) < 100) await page.evaluate((by) => ((document.querySelector("[data-zr-scroll]") as HTMLElement).scrollTop -= by), by);
}

const away = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const s = document.querySelector<HTMLElement>("[data-zr-scroll]")!;
    return Math.round(s.scrollHeight - s.clientHeight - s.scrollTop);
  });

test("the wheel and the keys let go of the end without a script error, and Latest comes back", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await wheelUp(page, 900);
  await page.locator(".zr-latest").waitFor();
  const there = await away(page);
  expect(there).toBeGreaterThan(600);
  await page.locator(".fw-h1").focus();
  await page.keyboard.press("PageUp");
  await page.waitForFunction((was) => {
    const s = document.querySelector<HTMLElement>("[data-zr-scroll]")!;
    return s.scrollHeight - s.clientHeight - s.scrollTop > was;
  }, there);
  await page.locator(".zr-latest").click();
  await page.waitForFunction(() => {
    const s = document.querySelector<HTMLElement>("[data-zr-scroll]")!;
    return s.scrollHeight - s.clientHeight - s.scrollTop < 2;
  });
  expect(errors).toEqual([]);
});

test("a turn above the reader changing size without a render leaves the reader's place", async ({ page }) => {
  await wheelUp(page, 1500);
  await page.locator(".zr-latest").waitFor();
  await page.waitForTimeout(500);
  const mark = await page.evaluate(() => {
    const view = document.querySelector<HTMLElement>("[data-zr-scroll]")!.getBoundingClientRect();
    const all = [...document.querySelectorAll<HTMLElement>(".nodi-turn")];
    const at = all.findIndex((t) => t.getBoundingClientRect().bottom > view.top + 40);
    return { above: all[at - 2]?.dataset.turn ?? null, turn: all[at]!.dataset.turn!, top: all[at]!.getBoundingClientRect().top };
  });
  expect(mark.above, "a mounted turn sits above the one in view").not.toBeNull();
  await page.evaluate((turn) => {
    const el = document.querySelector<HTMLElement>(`.nodi-turn[data-turn="${turn}"]`)!;
    el.style.minHeight = el.offsetHeight + 300 + "px";
  }, mark.above);
  await page.waitForTimeout(300);
  const now = await page.evaluate((turn) => document.querySelector(`.nodi-turn[data-turn="${turn}"]`)!.getBoundingClientRect().top, mark.turn);
  expect(Math.abs(now - mark.top), "the turn in view stays where it was").toBeLessThanOrEqual(3);
});
