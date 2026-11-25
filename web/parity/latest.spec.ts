import { createRequire } from "node:module";
import type { Page } from "@playwright/test";
import { fakeRpc, fakeSpeech, test, expect, type MockCore } from "./fixtures";
import { store } from "./store";

const require = createRequire(import.meta.url);
const mock = require("../../examples/aria-mock.js") as { create(o: object): MockCore };

test.skip(({ hasTouch }) => !hasTouch, "touch phones only");

interface Frame {
  t: number;
  top: number;
  away: number;
  seen: number;
  pill: boolean;
}

async function attend(page: Page, stream?: { bytes: number }): Promise<void> {
  const core = mock.create({ step: 120, pageBytes: 24000, history: 60, ...(stream ? { stream: { fps: 30, bytes: stream.bytes, chunk: 64 } } : {}) });
  await page.addInitScript(() => {
    const writes: number[] = [];
    (window as unknown as { __writes: number[] }).__writes = writes;
    const own = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop")!;
    Object.defineProperty(Element.prototype, "scrollTop", {
      configurable: true,
      get() {
        return own.get!.call(this);
      },
      set(value) {
        if ((this as HTMLElement).hasAttribute?.("data-zr-scroll")) writes.push(Math.round(value));
        own.set!.call(this, value);
      },
    });
  });
  await fakeRpc(page, core);
  await fakeSpeech(page);
  await page.goto(`/#/${store}/${core.ids.main}`);
  await page.locator(".fw[data-link='live']").waitFor();
  await page.locator(".zr-pit .zr-pit-knob").waitFor();
  await page.waitForTimeout(1200);
}

const away = (page: Page) =>
  page.evaluate(() => {
    const s = document.querySelector<HTMLElement>("[data-zr-scroll]")!;
    return Math.round(s.scrollHeight - s.clientHeight - s.scrollTop);
  });

const turnsInView = (page: Page) =>
  page.evaluate(() => {
    const view = document.querySelector<HTMLElement>("[data-zr-scroll]")!.getBoundingClientRect();
    return [...document.querySelectorAll(".nodi-turn")].filter((t) => {
      const r = t.getBoundingClientRect();
      return r.bottom > view.top && r.top < view.bottom;
    }).length;
  });

function frames(page: Page, ms: number): Promise<Frame[]> {
  return page.evaluate(
    (ms) =>
      new Promise<Frame[]>((done) => {
        const s = document.querySelector<HTMLElement>("[data-zr-scroll]")!;
        const out: Frame[] = [];
        const t0 = performance.now();
        const tick = () => {
          const view = s.getBoundingClientRect();
          const seen = [...document.querySelectorAll(".nodi-turn")].filter((t) => {
            const r = t.getBoundingClientRect();
            return r.bottom > view.top && r.top < view.bottom;
          }).length;
          out.push({ t: performance.now() - t0, top: s.scrollTop, away: s.scrollHeight - s.clientHeight - s.scrollTop, seen, pill: !!document.querySelector(".zr-latest") });
          if (performance.now() - t0 < ms) requestAnimationFrame(tick);
          else done(out);
        };
        tick();
      }),
    ms,
  );
}

async function farUp(page: Page, browserName: string): Promise<void> {
  if (browserName === "chromium") {
    const cdp = await page.context().newCDPSession(page);
    for (let i = 0; i < 12; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 195, y: 250 }] });
      for (let k = 1; k <= 10; k++) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 195, y: 250 + 40 * k }] });
        await page.waitForTimeout(16);
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    }
    await cdp.detach();
  } else {
    await page.evaluate(() => {
      const s = document.querySelector<HTMLElement>("[data-zr-scroll]")!;
      s.scrollTop = (s.scrollHeight - s.clientHeight) / 2;
    });
  }
  await page.locator(".zr-latest").waitFor();
  await page.waitForTimeout(600);
  expect(await away(page), "the reader is far above the end").toBeGreaterThan(3000);
}

async function tapLatest(page: Page): Promise<void> {
  const pill = (await page.locator(".zr-latest").boundingBox())!;
  await page.touchscreen.tap(pill.x + pill.width / 2, pill.y + pill.height / 2);
}

function ofWrites(page: Page): Promise<number[]> {
  return page.evaluate(() => (window as unknown as { __writes: number[] }).__writes);
}

async function send(page: Page, text: string): Promise<void> {
  await page.locator(".zr-pit-head .zr-input").fill(text);
  await page.locator(".zr-send").click();
}

const swoopEnded = (page: Page) => page.waitForFunction(() => !document.querySelector("[data-swooping]") && document.getAnimations().every((a) => a.playState !== "running"));

test.describe("Latest and the follow", () => {
  test("from far up in a long transcript, one tap puts the view on the end in one move", async ({ page, browserName }) => {
    await attend(page);
    await farUp(page, browserName);
    const before = (await ofWrites(page)).length;
    const run = frames(page, 1500);
    await tapLatest(page);
    const seen = await run;
    const writes = (await ofWrites(page)).slice(before);
    const landed = seen.findIndex((f) => f.away <= 1);
    expect(landed, "the view reaches the end").toBeGreaterThanOrEqual(0);
    for (const f of seen.slice(landed)) expect(f.away, `the view stays on the end at ${Math.round(f.t)}ms`).toBeLessThanOrEqual(1);
    expect(
      seen.slice(landed).every((f) => f.seen > 0),
      "no frame shows an empty spacer",
    ).toBe(true);
    for (let i = landed + 1; i < seen.length; i++) expect(seen[i]!.top, `the view never moves back up at ${Math.round(seen[i]!.t)}ms`).toBeGreaterThanOrEqual(seen[i - 1]!.top - 1);
    expect(writes.length, `the end is written once, not chased: ${writes}`).toBeLessThanOrEqual(2);
    await expect(page.locator(".zr-latest")).toHaveCount(0);
    await swoopEnded(page);
    expect(await away(page)).toBeLessThanOrEqual(1);
  });

  test("tapped while a reply streams, the view reaches the end and rides it while the reply grows", async ({ page, browserName }) => {
    await attend(page, { bytes: 40000 });
    await send(page, "go on at length");
    await page.waitForTimeout(1200);
    await farUp(page, browserName);
    const run = frames(page, 2500);
    await tapLatest(page);
    const seen = await run;
    const landed = seen.findIndex((f) => f.away <= 1);
    expect(landed, "the view reaches the end").toBeGreaterThanOrEqual(0);
    for (const f of seen.slice(landed)) expect(f.away, `the view rides the growing end at ${Math.round(f.t)}ms`).toBeLessThanOrEqual(1);
    expect(seen.slice(landed).every((f) => f.seen > 0)).toBe(true);
    expect(seen[seen.length - 1]!.top, "the reply kept growing under the view").toBeGreaterThan(seen[landed]!.top);
  });

  test("tapped after the reply has finished, the view lands and stays", async ({ page, browserName }) => {
    await attend(page, { bytes: 2500 });
    await send(page, "a short one");
    await page.waitForFunction(() => !document.querySelector(".fw")!.hasAttribute("data-running"), undefined, { timeout: 20000 });
    await farUp(page, browserName);
    const run = frames(page, 1500);
    await tapLatest(page);
    const seen = await run;
    expect(seen[seen.length - 1]!.away).toBeLessThanOrEqual(1);
    for (const f of seen.slice(seen.findIndex((x) => x.away <= 1))) expect(f.away).toBeLessThanOrEqual(1);
    await swoopEnded(page);
    expect(await away(page)).toBeLessThanOrEqual(1);
  });

  for (const delay of [0, 100, 300]) {
    test(`a scroll up ${delay}ms after the transcript goes live shows the pill and holds`, async ({ page }) => {
      const core = mock.create({ step: 120, pageBytes: 24000, history: 60 });
      await fakeRpc(page, core);
      await fakeSpeech(page);
      await page.goto(`/#/${store}/${core.ids.main}`);
      await page.locator(".fw[data-link='live']").waitFor();
      await page.waitForTimeout(delay);
      await page.evaluate(() => {
        const s = document.querySelector<HTMLElement>("[data-zr-scroll]")!;
        s.scrollTop = Math.max(0, s.scrollTop - 700);
      });
      await page.locator(".zr-latest").waitFor({ timeout: 3000 });
      const there = await away(page);
      expect(there, "the view moved away from the end").toBeGreaterThan(600);
      await page.waitForTimeout(800);
      expect(Math.abs((await away(page)) - there), "nothing pulls the reader back").toBeLessThanOrEqual(150);
      await expect(page.locator(".zr-latest")).toHaveCount(1);
    });
  }

  test("the top of a long transcript shows turns, not an empty spacer, once older turns have loaded", async ({ page }) => {
    await attend(page);
    await page.evaluate(() => {
      document.querySelector<HTMLElement>("[data-zr-scroll]")!.scrollTop = 0;
    });
    await page.waitForFunction(() => Number(document.querySelector(".nodi-turns")!.getAttribute("data-held")) > 55, undefined, { timeout: 10000 });
    await page.waitForTimeout(600);
    expect(await turnsInView(page), "a turn is on screen").toBeGreaterThan(0);
  });

  test("a reader's place holds while the window moves through turns it has never measured", async ({ page }) => {
    await attend(page);
    await page.evaluate(() => {
      const s = document.querySelector<HTMLElement>("[data-zr-scroll]")!;
      s.scrollTop = s.scrollHeight - s.clientHeight - 1500;
    });
    await page.waitForTimeout(500);
    const drift: string[] = [];
    for (let step = 0; step < 14; step++) {
      const mark = await page.evaluate(() => {
        const view = document.querySelector<HTMLElement>("[data-zr-scroll]")!.getBoundingClientRect();
        const t = [...document.querySelectorAll<HTMLElement>(".nodi-turn")].find((el) => el.getBoundingClientRect().bottom > view.top + 40);
        return t ? { turn: t.dataset.turn!, top: t.getBoundingClientRect().top } : null;
      });
      if (!mark) continue;
      await page.evaluate(() => {
        const s = document.querySelector<HTMLElement>("[data-zr-scroll]")!;
        s.scrollTop -= 500;
      });
      await page.waitForTimeout(250);
      const now = await page.evaluate((turn) => document.querySelector(`.nodi-turn[data-turn="${turn}"]`)?.getBoundingClientRect().top ?? null, mark.turn);
      if (now !== null && Math.abs(now - (mark.top + 500)) > 4) drift.push(`turn ${mark.turn}: expected ${Math.round(mark.top + 500)}, at ${Math.round(now)}`);
    }
    expect(drift, "each 500px scroll moves the page by exactly 500px").toEqual([]);
  });
});
