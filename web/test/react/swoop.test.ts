import { afterEach, describe, expect, it, vi } from "vitest";
import { SWOOP_EASE, SWOOP_MS, SWOOP_REACH, swoop } from "zanni-react";

function fakeAnimation() {
  const listeners = new Map<string, () => void>();
  return {
    cancel: vi.fn(() => listeners.get("cancel")?.()),
    addEventListener: (name: string, fn: () => void) => listeners.set(name, fn),
    finish: () => listeners.get("finish")?.(),
  };
}

function content(height = 800) {
  Object.defineProperty(document.documentElement, "clientHeight", { configurable: true, value: height });
  const el = document.createElement("ol");
  const run = fakeAnimation();
  const animate = vi.fn(() => run);
  (el as unknown as { animate: typeof animate }).animate = animate;
  return { el, run, animate };
}

function motion(reduced: boolean) {
  vi.stubGlobal("matchMedia", () => ({ matches: reduced }));
  window.matchMedia = (() => ({ matches: reduced })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("swoop", () => {
  it("slides the content down from a capped offset on the sheet curve, with transform and opacity only", () => {
    motion(false);
    const { el, animate } = content(800);
    swoop(el);
    const [frames, timing] = animate.mock.calls[0] as unknown as [Keyframe[], KeyframeAnimationOptions];
    expect(frames).toEqual([
      { transform: "translateY(-" + Math.round(800 * SWOOP_REACH) + "px)", opacity: 0 },
      { transform: "translateY(0)", opacity: 1 },
    ]);
    expect(Math.round(800 * SWOOP_REACH)).toBeGreaterThanOrEqual(240);
    expect(Math.round(800 * SWOOP_REACH)).toBeLessThanOrEqual(320);
    expect(timing.easing).toBe("cubic-bezier(0.32, 0.72, 0, 1)");
    expect(SWOOP_EASE).toBe(timing.easing);
    expect(SWOOP_MS).toBeGreaterThanOrEqual(350);
    expect(SWOOP_MS).toBeLessThanOrEqual(450);
  });

  it("holds will-change only while it plays", () => {
    motion(false);
    const { el, run } = content();
    swoop(el);
    expect(el.hasAttribute("data-swooping")).toBe(true);
    run.finish();
    expect(el.hasAttribute("data-swooping")).toBe(false);
  });

  it("a second tap cancels the first and keeps its own mark", () => {
    motion(false);
    const { el, run, animate } = content();
    swoop(el);
    const second = fakeAnimation();
    animate.mockReturnValueOnce(second);
    swoop(el);
    expect(run.cancel).toHaveBeenCalled();
    expect(el.hasAttribute("data-swooping")).toBe(true);
    second.finish();
    expect(el.hasAttribute("data-swooping")).toBe(false);
  });

  it("is only the jump under reduced motion", () => {
    motion(true);
    const { el, animate } = content();
    swoop(el);
    expect(animate).not.toHaveBeenCalled();
    expect(el.hasAttribute("data-swooping")).toBe(false);
  });
});
