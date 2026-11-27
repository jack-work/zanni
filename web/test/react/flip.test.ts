import { afterEach, describe, expect, it, vi } from "vitest";
import { EASE } from "../../../packages/react/src/motion";
import { FLIP_MS, glide, place } from "../../../packages/react/src/lib/flip";

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}

function part(first: DOMRect, last: DOMRect) {
  const el = document.createElement("div");
  let at = first;
  el.getBoundingClientRect = () => at;
  const animate = vi.fn();
  (el as unknown as { animate: typeof animate }).animate = animate;
  return { el, animate, settle: () => (at = last) };
}

function motion(reduced: boolean) {
  window.matchMedia = (() => ({ matches: reduced })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("glide", () => {
  it("plays each part from where it stood to where it is, on transform alone", () => {
    motion(false);
    const input = part(rect(60, 800, 235, 36), rect(16, 750, 358, 36));
    const pair = part(rect(303, 800, 71, 36), rect(303, 806, 71, 36));
    const held = place([
      [input.el, true],
      [pair.el, false],
    ]);
    input.settle();
    pair.settle();
    glide(held);
    const [frames, timing] = input.animate.mock.calls[0] as unknown as [Keyframe[], KeyframeAnimationOptions];
    expect(frames).toEqual([{ transform: "translate(44px, 50px) scale(" + 235 / 358 + ", 1)" }, { transform: "none" }]);
    expect(timing).toEqual({ duration: FLIP_MS, easing: EASE });
    const [moved] = pair.animate.mock.calls[0] as unknown as [Keyframe[]];
    expect(moved).toEqual([{ transform: "translate(0px, -6px) scale(1, 1)" }, { transform: "none" }]);
  });

  it("leaves a part alone that did not move", () => {
    motion(false);
    const still = part(rect(16, 800, 36, 36), rect(16, 800, 36, 36));
    const held = place([[still.el, false]]);
    glide(held);
    expect(still.animate).not.toHaveBeenCalled();
  });

  it("snaps under reduced motion", () => {
    motion(true);
    const input = part(rect(60, 800, 235, 36), rect(16, 750, 358, 36));
    const held = place([[input.el, true]]);
    input.settle();
    glide(held);
    expect(input.animate).not.toHaveBeenCalled();
  });

  it("skips what is not there and what cannot animate", () => {
    motion(false);
    const bare = document.createElement("div");
    bare.getBoundingClientRect = () => rect(0, 0, 10, 10);
    const held = place([
      [null, false],
      [undefined, true],
      [bare, true],
    ]);
    expect(held).toHaveLength(1);
    bare.getBoundingClientRect = () => rect(5, 5, 10, 10);
    expect(() => glide(held)).not.toThrow();
  });
});
