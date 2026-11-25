import { createRequire } from "node:module";
import { fakeRpc, fakeSpeech, test, expect, type MockCore } from "./fixtures";
import { store } from "./store";

const require = createRequire(import.meta.url);
const mock = require("../../examples/aria-mock.js") as { create(o: object): MockCore };

test("the Latest pill sits on the horizontal centre of the transcript column", async ({ page }) => {
  const core = mock.create({ step: 120, pageBytes: 24000, history: 40 });
  await fakeRpc(page, core);
  await fakeSpeech(page);
  await page.goto(`/#/${store}/${core.ids.main}`);
  await page.locator(".fw[data-link='live']").waitFor();
  await page.locator(".zr-pit .zr-pit-knob").waitFor();
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const s = document.querySelector<HTMLElement>("[data-zr-scroll]")!;
    s.scrollTop = 0;
  });
  await page.locator(".zr-latest").waitFor();
  await page.waitForTimeout(600);
  const m = await page.evaluate(() => {
    const mid = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, centre: (r.left + r.right) / 2 };
    };
    const scroller = document.querySelector<HTMLElement>("[data-zr-scroll]")!;
    return { pill: mid(document.querySelector(".zr-latest")!), main: mid(document.querySelector(".fw-main")!), scroller: { centre: scroller.getBoundingClientRect().left + scroller.clientWidth / 2 } };
  });
  expect(Math.abs(m.pill.centre - m.main.centre), JSON.stringify(m)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(m.pill.centre - m.scroller.centre), JSON.stringify(m)).toBeLessThanOrEqual(0.5);
});
