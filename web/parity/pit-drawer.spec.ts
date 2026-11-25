import { createRequire } from "node:module";
import type { Page } from "@playwright/test";
import { fakeRpc, fakeSpeech, test, expect, type MockCore } from "./fixtures";
import { store } from "./store";

const require = createRequire(import.meta.url);
const mock = require("../../examples/aria-mock.js") as { create(o: object): MockCore };

test.skip(({ hasTouch }) => !hasTouch, "touch phones only");

async function attend(page: Page): Promise<void> {
  const core = mock.create({ step: 120, pageBytes: 24000, history: 40 });
  await fakeRpc(page, core);
  await fakeSpeech(page);
  await page.goto(`/#/${store}/${core.ids.main}`);
  await page.locator(".fw[data-link='live']").waitFor();
  await page.locator(".zr-pit .zr-pit-head .zr-input").waitFor();
  await rest(page);
}

function rest(page: Page): Promise<void> {
  return page.evaluate(
    () =>
      new Promise<void>((done) => {
        let still = 0;
        const tick = () => {
          if (!document.getAnimations().some((a) => a.playState === "running")) still++;
          else still = 0;
          if (still > 10) done();
          else requestAnimationFrame(tick);
        };
        tick();
      }),
  );
}

function top(page: Page): Promise<number> {
  return page.evaluate(() => document.querySelector(".zr-pit")!.getBoundingClientRect().top);
}

function pointer(page: Page, type: "pointerdown" | "pointermove" | "pointerup", x: number, y: number): Promise<void> {
  return page.evaluate(
    ([type, x, y]) => {
      const init = { pointerId: 7, pointerType: "touch", isPrimary: true, button: 0, buttons: type === "pointerup" ? 0 : 1, clientX: x as number, clientY: y as number, bubbles: true, cancelable: true, composed: true };
      const at = type === "pointerdown" ? document.elementFromPoint(x as number, y as number)! : window;
      at.dispatchEvent(new PointerEvent(type as string, init));
    },
    [type, x, y] as const,
  );
}

async function grabInput(page: Page): Promise<{ x: number; y: number }> {
  const r = (await page.locator(".zr-pit-head .zr-input").boundingBox())!;
  return { x: r.x + r.width * 0.8, y: r.y + r.height / 2 };
}

function drag(page: Page, from: { x: number; y: number }, to: number, steps: number, gap: number): Promise<void> {
  return page
    .evaluate(
      ([x, y, to, steps, gap]) =>
        new Promise<void>((done) => {
          const init = (type: string, cy: number) => ({ pointerId: 7, pointerType: "touch", isPrimary: true, button: 0, buttons: type === "pointerup" ? 0 : 1, clientX: x, clientY: cy, bubbles: true, cancelable: true, composed: true });
          document.elementFromPoint(x, y)!.dispatchEvent(new PointerEvent("pointerdown", init("pointerdown", y)));
          let i = 0;
          const step = () => {
            i++;
            const cy = y + ((to - y) * i) / steps;
            window.dispatchEvent(new PointerEvent("pointermove", init("pointermove", cy)));
            if (i < steps) setTimeout(step, gap);
            else {
              window.dispatchEvent(new PointerEvent("pointerup", init("pointerup", cy)));
              done();
            }
          };
          setTimeout(step, gap);
        }),
      [from.x, from.y, to, steps, gap] as const,
    )
    .then(() => rest(page));
}

const pit = (page: Page) => page.locator(".zr-pit");

test.describe("the pit drawer", () => {
  test("follows the finger one to one from anywhere on the input bar", async ({ page }) => {
    await attend(page);
    const start = await top(page);
    const g = await grabInput(page);
    await pointer(page, "pointerdown", g.x, g.y);
    for (const dy of [-12, -60, -140, -260, -200]) {
      await pointer(page, "pointermove", g.x, g.y + dy);
      expect(Math.abs((await top(page)) - (start + dy)), `the drawer moved with a ${dy} px drag`).toBeLessThanOrEqual(1);
    }
    await expect(pit(page)).toHaveAttribute("data-dragging", "");
    await pointer(page, "pointerup", g.x, g.y - 200);
    await rest(page);
    await expect(pit(page)).not.toHaveAttribute("data-dragging", "");
  });

  test("a slow release rests on the nearest stop and a flick carries on", async ({ page }) => {
    await attend(page);
    const g = await grabInput(page);
    await drag(page, g, g.y - 40, 8, 40);
    await expect(pit(page), "a short slow drag falls back closed").toHaveAttribute("data-snap", "closed");
    await drag(page, g, g.y - 80, 5, 16);
    await expect(pit(page), "a short flick opens to half").toHaveAttribute("data-snap", "half");
    const head = await grabInput(page);
    await drag(page, head, head.y - 60, 4, 16);
    await expect(pit(page), "a flick up from half reaches full").toHaveAttribute("data-snap", "full");
    const high = await grabInput(page);
    await drag(page, high, high.y + 300, 4, 16);
    await expect(pit(page), "a hard flick down from full skips half and closes").toHaveAttribute("data-snap", "closed");
  });

  test("a short screen has no half stop", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 600 });
    await attend(page);
    await page.locator(".zr-pit-knob").tap();
    await rest(page);
    await expect(pit(page), "the knob opens a short screen straight to full").toHaveAttribute("data-snap", "full");
    await page.locator(".zr-pit-knob").tap();
    await rest(page);
    await expect(pit(page)).toHaveAttribute("data-snap", "closed");
    const g = await grabInput(page);
    await drag(page, g, g.y - 240, 12, 30);
    await expect(pit(page), "a slow drag to the middle settles on a stop that exists").toHaveAttribute("data-snap", /closed|full/);
  });

  test("opening over a draft keeps it, keeps typing, and flattens the composer to one line", async ({ page }) => {
    await attend(page);
    const box = page.locator(".zr-pit-head .zr-input");
    await box.tap();
    await box.fill("one line of draft\nand a second line\nand a third");
    const tall = (await box.boundingBox())!.height;
    await page.locator(".zr-pit-knob").tap();
    await rest(page);
    await expect(pit(page)).toHaveAttribute("data-snap", "half");
    await expect(box, "the composer keeps focus").toBeFocused();
    await page.keyboard.type(" more");
    await expect(box).toHaveValue("one line of draft\nand a second line\nand a third more");
    const flat = (await box.boundingBox())!.height;
    const line = await box.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
    expect(flat, `the composer flattens from ${tall} px`).toBeLessThan(tall);
    expect(flat, "the composer shows one line").toBeLessThanOrEqual(line + 14);
    await page.locator(".zr-pit-knob").tap();
    await rest(page);
    expect((await box.boundingBox())!.height, "closing gives the composer back its height").toBeGreaterThan(flat);
  });

  test("the pit body meets the composer with nothing between, at every stop", async ({ page }) => {
    await attend(page);
    for (const snap of ["half", "full"]) {
      const knob = page.locator(".zr-pit-knob");
      if (snap === "half") await knob.tap();
      else await knob.press("ArrowUp");
      await rest(page);
      await expect(pit(page)).toHaveAttribute("data-snap", snap);
      const seam = await page.evaluate(() => {
        const head = document.querySelector(".zr-pit-head")!.getBoundingClientRect();
        const body = document.querySelector(".zr-pit-body")!.getBoundingClientRect();
        const owners = [-1, 0, 1].map((d) => document.elementFromPoint(head.left + head.width / 2, head.bottom + d)?.closest(".zr-pit") !== null);
        return { gap: body.top - head.bottom, owners, bottom: body.bottom, view: window.visualViewport?.height ?? window.innerHeight };
      });
      expect(Math.abs(seam.gap), `at ${snap} the body starts where the head ends`).toBeLessThanOrEqual(0.5);
      expect(seam.owners, `at ${snap} the drawer owns the seam`).toEqual([true, true, true]);
      expect(seam.bottom, `at ${snap} the body reaches the bottom of the screen`).toBeGreaterThanOrEqual(seam.view - 1);
      const last = await page.evaluate(() => {
        const body = document.querySelector<HTMLElement>(".zr-pit-body")!;
        body.scrollTop = body.scrollHeight;
        return body.lastElementChild!.getBoundingClientRect().bottom;
      });
      expect(last, `at ${snap} the last control scrolls into view`).toBeLessThanOrEqual(seam.view);
      await page.evaluate(() => (document.querySelector<HTMLElement>(".zr-pit-body")!.scrollTop = 0));
    }
  });

  test("the drawer's surface reaches below the screen in the composer's colour", async ({ page }) => {
    await attend(page);
    const bleed = await page.evaluate(() => {
      const el = document.querySelector(".zr-pit")!;
      const after = getComputedStyle(el, "::before");
      const head = getComputedStyle(document.querySelector(".zr-pit-head")!);
      const r = el.getBoundingClientRect();
      return { reach: r.top + parseFloat(after.height) - window.innerHeight, same: after.backgroundColor === head.backgroundColor };
    });
    expect(bleed.reach, "the surface runs on below the bottom edge").toBeGreaterThan(300);
    expect(bleed.same, "it is the head's colour while closed").toBe(true);
  });
});

test.describe("the pit drawer under load", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "the frame probe reads Chromium's trace");

  test("a drag restyles only the drawer, lays nothing out, and has no long frames at 4x CPU throttle", async ({ page }) => {
    await attend(page);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const g = await grabInput(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: g.x, y: g.y }] });
    for (let i = 1; i <= 4; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: g.x, y: g.y - i * 8 }] });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const w = window as unknown as { __long: number[] };
      w.__long = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__long.push(e.duration);
      }).observe({ type: "long-animation-frame" });
    });
    const events: { name: string; args?: { elementCount?: number }; dur?: number }[] = [];
    cdp.on("Tracing.dataCollected", (d: { value: typeof events }) => events.push(...d.value));
    await cdp.send("Tracing.start", { categories: "devtools.timeline,disabled-by-default-devtools.timeline", transferMode: "ReportEvents" });
    const steps = 40;
    for (let i = 1; i <= steps; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: g.x, y: g.y - 32 - i * 9 }] });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
    }
    const done = new Promise<void>((r) => cdp.once("Tracing.tracingComplete", () => r()));
    await cdp.send("Tracing.end");
    await done;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const long = await page.evaluate(() => (window as unknown as { __long: number[] }).__long);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    const restyles = events.filter((e) => e.name === "UpdateLayoutTree" || e.name === "RecalculateStyles");
    const layouts = events.filter((e) => e.name === "Layout");
    const widest = Math.max(0, ...restyles.map((e) => e.args?.elementCount ?? 0));
    const probe = { moves: steps, restyles: restyles.length, widest, layouts: layouts.length, longFrames: long.map(Math.round) };
    console.log("drag frame probe", JSON.stringify(probe));
    test.info().annotations.push({ type: "drag frame probe", description: JSON.stringify(probe) });
    expect(widest, `no restyle per move reaches past the drawer (${JSON.stringify(probe)})`).toBeLessThanOrEqual(4);
    expect(layouts.length, `no layout during the drag (${JSON.stringify(probe)})`).toBe(0);
    expect(long, `no long frames at 4x throttle (${JSON.stringify(probe)})`).toEqual([]);
  });
});
