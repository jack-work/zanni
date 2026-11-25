import { createRequire } from "node:module";
import type { CDPSession, Page } from "@playwright/test";
import { fakeRpc, fakeSpeech, test, expect, type MockCore } from "./fixtures";
import { store } from "./store";

const require = createRequire(import.meta.url);
const mock = require("../../examples/aria-mock.js") as { create(o: object): MockCore };

test.skip(({ hasTouch }) => !hasTouch, "touch phones only");

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

async function attendLong(page: Page): Promise<void> {
  const core = mock.create({ step: 120, pageBytes: 24000, history: 40 });
  await fakeRpc(page, core);
  await fakeSpeech(page);
  await page.goto(`/#/${store}/${core.ids.main}`);
  await page.locator(".fw[data-link='live']").waitFor();
  await page.locator(".zr-composer .zr-grip").waitFor();
  await settle(page);
}

function away(page: Page): Promise<number> {
  return page.evaluate(() => {
    const s = document.querySelector<HTMLElement>("[data-zr-scroll]")!;
    return Math.round(s.scrollHeight - s.clientHeight - s.scrollTop);
  });
}

function settle(page: Page): Promise<void> {
  return page.evaluate(
    () =>
      new Promise<void>((done) => {
        const s = document.querySelector<HTMLElement>("[data-zr-scroll]")!;
        let last = s.scrollTop;
        let still = 0;
        const tick = () => {
          if (Math.abs(s.scrollTop - last) < 0.5) still++;
          else still = 0;
          last = s.scrollTop;
          if (still > 20 && !document.getAnimations().some((a) => a.playState === "running")) done();
          else requestAnimationFrame(tick);
        };
        tick();
      }),
  );
}

function rect(page: Page, sel: string): Promise<Box | null> {
  return page.evaluate((sel) => {
    const e = document.querySelector(sel);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, sel);
}

function hitAt(page: Page, x: number, y: number): Promise<string> {
  return page.evaluate(
    ([x, y]) => {
      const e = document.elementFromPoint(x!, y!);
      const owner = e?.closest(".zr-grip, .zr-latest, .zr-composer, [data-zr-scroll]");
      return owner ? owner.className : e ? e.tagName : "nothing";
    },
    [x, y],
  );
}

async function finger(page: Page): Promise<CDPSession> {
  return page.context().newCDPSession(page);
}

async function swipe(cdp: CDPSession, x: number, from: number, to: number, steps: number, gap: number, page: Page): Promise<void> {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: from }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: from + ((to - from) * i) / steps }] });
    if (gap) await page.waitForTimeout(gap);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

async function toMiddle(page: Page, browserName: string): Promise<void> {
  if (browserName === "chromium") {
    const cdp = await finger(page);
    for (let i = 0; i < 40; i++) {
      const half = await page.evaluate(() => {
        const s = document.querySelector<HTMLElement>("[data-zr-scroll]")!;
        return s.scrollTop < (s.scrollHeight - s.clientHeight) / 2;
      });
      if (half) break;
      await swipe(cdp, 195, 250, 650, 10, 16, page);
    }
    await cdp.detach();
  } else {
    await page.evaluate(() => {
      const s = document.querySelector<HTMLElement>("[data-zr-scroll]")!;
      s.scrollTop = (s.scrollHeight - s.clientHeight) / 2;
    });
  }
  await settle(page);
  expect(await away(page), "the transcript is well away from its end").toBeGreaterThan(2000);
  await page.locator(".zr-latest").waitFor();
  await settle(page);
}

test.describe("figaro web mobile scroll", () => {
  test("the grip's bar sits on the composer's top edge and stays uncovered scrolled up", async ({ page, browserName }) => {
    await attendLong(page);
    const edge = async () => {
      const bar = (await rect(page, ".zr-composer .zr-grip .zr-grip-bar"))!;
      const composer = (await rect(page, ".zr-composer"))!;
      return { gap: Math.abs(bar.y + bar.h / 2 - composer.y), bar };
    };
    const atEnd = await edge();
    expect(atEnd.gap, `the bar is on the edge at the end (${JSON.stringify(atEnd)})`).toBeLessThanOrEqual(3);
    await toMiddle(page, browserName);
    const up = await edge();
    expect(up.gap, `the bar is on the edge scrolled up (${JSON.stringify(up)})`).toBeLessThanOrEqual(3);
    const grip = (await rect(page, ".zr-composer .zr-grip"))!;
    for (const fx of [0.05, 0.5, 0.95]) for (const fy of [0.05, 0.5, 0.95]) expect(await hitAt(page, grip.x + grip.w * fx, grip.y + grip.h * fy), `nothing covers the grip at ${fx},${fy}`).toContain("zr-grip");
    const pill = (await rect(page, ".zr-latest"))!;
    const overlaps = pill.y < grip.y + grip.h && pill.y + pill.h > grip.y && pill.x < grip.x + grip.w && pill.x + pill.w > grip.x;
    expect(overlaps, `the Latest pill ${JSON.stringify(pill)} keeps off the grip ${JSON.stringify(grip)}`).toBe(false);
  });
});
