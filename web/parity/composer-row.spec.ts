import { createRequire } from "node:module";
import { fakeRpc, fakeSpeech, test, expect, type MockCore } from "./fixtures";
import { store } from "./store";

const require = createRequire(import.meta.url);
const mock = require("../../examples/aria-mock.js") as { create(o: object): MockCore };

test("the pills sit under the input on the right and only the attachments button stays on the left", async ({ page, hasTouch }) => {
  const core = mock.create({ step: 120, pageBytes: 24000, history: 40 });
  await fakeRpc(page, core);
  await fakeSpeech(page);
  await page.goto(`/#/${store}/${core.ids.main}`);
  await page.locator(".fw[data-link='live']").waitFor();
  await page.locator(".zr-pit-head .zr-input").waitFor();
  await page.waitForTimeout(600);
  const box = await page.evaluate(() => {
    const r = (sel: string) => {
      const b = document.querySelector(sel)!.getBoundingClientRect();
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, w: b.width, h: b.height };
    };
    return { input: r(".zr-pit-head .zr-input"), attach: r(".zr-pit-head .zr-attach"), command: r(".zr-pit-head .zr-command"), send: r(".zr-pit-head .zr-send") };
  });
  const note = JSON.stringify(box);
  expect(box.attach.top, `the attachments button is under the input: ${note}`).toBeGreaterThanOrEqual(box.input.bottom - 1);
  expect(box.command.top, note).toBeGreaterThanOrEqual(box.input.bottom - 1);
  expect(box.send.top, note).toBeGreaterThanOrEqual(box.input.bottom - 1);
  expect(Math.abs(box.attach.left - box.input.left), `attach is left-justified: ${note}`).toBeLessThanOrEqual(2);
  expect(Math.abs(box.send.right - box.input.right), `the pair is right-justified: ${note}`).toBeLessThanOrEqual(2);
  expect(box.command.right, note).toBeLessThanOrEqual(box.send.left + 1);
  expect(box.command.left, "the command pill is not next to the attachments button").toBeGreaterThan(box.input.left + box.input.w / 2);
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
});
