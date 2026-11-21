import { afterEach, describe, expect, it, vi } from "vitest";
import { KEYBOARD_MIN, frameOf, onKeyboard, trackViewport } from "zanni-react";

class FakeViewport extends EventTarget {
  height = 844;
  offsetTop = 0;
  scale = 1;
  move(height: number, offsetTop = 0) {
    this.height = height;
    this.offsetTop = offsetTop;
    this.dispatchEvent(new Event("resize"));
  }
}

function install(vv: FakeViewport | null): void {
  Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: 844, configurable: true });
}

afterEach(() => {
  document.documentElement.removeAttribute("data-keyboard");
  for (const n of ["--zr-vv-h", "--zr-vv-top", "--zr-kb"]) document.documentElement.style.removeProperty(n);
});

describe("frameOf", () => {
  it("reads the keyboard as the layout height the visual viewport gave up", () => {
    expect(frameOf({ height: 844, offsetTop: 0, scale: 1 }, 844)).toEqual({ height: 844, top: 0, inset: 0, keyboard: false });
    expect(frameOf({ height: 508, offsetTop: 0, scale: 1 }, 844)).toEqual({ height: 508, top: 0, inset: 336, keyboard: true });
    expect(frameOf({ height: 508, offsetTop: 60, scale: 1 }, 844)).toEqual({ height: 508, top: 60, inset: 276, keyboard: true });
  });

  it("does not mistake a small shrink for a keyboard, or a pinch zoom for either", () => {
    expect(frameOf({ height: 844 - KEYBOARD_MIN + 1, offsetTop: 0, scale: 1 }, 844).keyboard).toBe(false);
    expect(frameOf({ height: 400, offsetTop: 0, scale: 2 }, 844)).toEqual({ height: 844, top: 0, inset: 0, keyboard: false });
  });
});

describe("trackViewport", () => {
  it("writes the viewport variables and the keyboard flag as the visual viewport moves", () => {
    const vv = new FakeViewport();
    install(vv);
    const root = document.documentElement;
    const stop = trackViewport(root);
    expect(root.hasAttribute("style")).toBe(false);
    expect(root.hasAttribute("data-keyboard")).toBe(false);
    vv.move(508, 40);
    expect(root.style.getPropertyValue("--zr-vv-h")).toBe("508px");
    expect(root.style.getPropertyValue("--zr-vv-top")).toBe("40px");
    expect(root.style.getPropertyValue("--zr-kb")).toBe("296px");
    expect(root.hasAttribute("data-keyboard")).toBe(true);
    vv.move(844);
    expect(root.hasAttribute("data-keyboard")).toBe(false);
    expect(root.hasAttribute("style")).toBe(false);
    stop();
    expect(root.style.getPropertyValue("--zr-vv-h")).toBe("");
    vv.move(300);
    expect(root.style.getPropertyValue("--zr-vv-h")).toBe("");
  });

  it("tells listeners when the keyboard opens and closes, once per change", () => {
    const vv = new FakeViewport();
    install(vv);
    const seen: boolean[] = [];
    const off = onKeyboard((open) => seen.push(open));
    const stop = trackViewport();
    vv.move(500);
    vv.move(480);
    vv.move(844);
    expect(seen).toEqual([true, false]);
    off();
    vv.move(500);
    expect(seen).toEqual([true, false]);
    stop();
  });

  it("reads the viewport again when the page returns from the background", () => {
    const vv = new FakeViewport();
    install(vv);
    const stop = trackViewport();
    vv.height = 508;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(document.documentElement.style.getPropertyValue("--zr-vv-h")).toBe("508px");
    stop();
  });

  it("does nothing where there is no visual viewport", () => {
    install(null);
    const stop = vi.fn(trackViewport());
    expect(() => stop()).not.toThrow();
  });
});
