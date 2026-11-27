import { createRequire } from "node:module";
import { fakeRpc, fakeSpeech, test, expect, type MockCore } from "./fixtures";
import { store } from "./store";

const require = createRequire(import.meta.url);
const mock = require("../../examples/aria-mock.js") as { create(o: object): MockCore };

const WORDS = "the quick brown fox jumps over the lazy dog ".repeat(4);

test("attach, input and the pair share one row until the draft outgrows it, then the pills sit under the input", async ({ page, hasTouch }) => {
  const core = mock.create({ step: 120, pageBytes: 24000, history: 40 });
  await fakeRpc(page, core);
  await fakeSpeech(page);
  await page.goto(`/#/${store}/${core.ids.main}`);
  await page.locator(".fw[data-link='live']").waitFor();
  await page.locator(".zr-pit-head .zr-input").waitFor();
  await page.waitForTimeout(600);
  const measure = () =>
    page.evaluate(() => {
      const r = (sel: string) => {
        const b = document.querySelector(sel)!.getBoundingClientRect();
        return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, w: b.width, h: b.height };
      };
      return { input: r(".zr-pit-head .zr-input"), attach: r(".zr-pit-head .zr-attach"), command: r(".zr-pit-head .zr-command"), send: r(".zr-pit-head .zr-send"), row: r(".zr-pit-head .zr-compose-row") };
    });
  const one = await measure();
  const note = JSON.stringify(one);
  expect(one.attach.right, `attach is left of the input: ${note}`).toBeLessThanOrEqual(one.input.left + 1);
  expect(one.command.left, `the pair is right of the input: ${note}`).toBeGreaterThanOrEqual(one.input.right - 1);
  expect(Math.abs(one.send.bottom - one.input.bottom), `one baseline: ${note}`).toBeLessThanOrEqual(1);
  expect(one.command.right, note).toBeLessThanOrEqual(one.send.left + 1);
  await page.locator(".zr-pit-head .zr-input").click();
  await page.keyboard.insertText(WORDS);
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))));
  const many = await measure();
  const stacked = JSON.stringify(many);
  expect(many.input.w, `the input takes the row's full width: ${stacked}`).toBeGreaterThanOrEqual(many.row.w - 2);
  expect(many.attach.top, `the attachments button is under the input: ${stacked}`).toBeGreaterThanOrEqual(many.input.bottom - 1);
  expect(many.send.top, stacked).toBeGreaterThanOrEqual(many.input.bottom - 1);
  expect(Math.abs(many.attach.left - many.input.left), `attach is left-justified: ${stacked}`).toBeLessThanOrEqual(2);
  expect(Math.abs(many.send.right - many.input.right), `the pair is right-justified: ${stacked}`).toBeLessThanOrEqual(2);
  if (hasTouch) {
    const reach = await page.evaluate(() =>
      [".zr-attach", ".zr-command", ".zr-send"].map((sel) => {
        const el = document.querySelector<HTMLElement>(".zr-pit-head " + sel)!;
        const after = getComputedStyle(el, "::after");
        return { sel, tall: el.getBoundingClientRect().height - parseFloat(after.top) - parseFloat(after.bottom) };
      }),
    );
    for (const r of reach) expect(r.tall, `${r.sel} keeps a 44px target: ${JSON.stringify(reach)}`).toBeGreaterThanOrEqual(44);
  }
  await page.locator(".zr-pit-head .zr-input").fill("");
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))));
  const back = await measure();
  expect(Math.abs(back.input.w - one.input.w), `an empty draft puts the row back: ${JSON.stringify(back)}`).toBeLessThanOrEqual(2);
});
