import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EDGE_FLICK, Pane, edgeSettle } from "zanni-react";

describe("edgeSettle", () => {
  it("opens past a third of the width at rest and closes short of it", () => {
    expect(edgeSettle(100, 280, 0)).toBe(true);
    expect(edgeSettle(60, 280, 0)).toBe(false);
  });

  it("lets a flick override the distance in either direction", () => {
    expect(edgeSettle(20, 280, EDGE_FLICK)).toBe(true);
    expect(edgeSettle(250, 280, -EDGE_FLICK)).toBe(false);
  });

  it("treats a speed under the flick as a drag", () => {
    expect(edgeSettle(200, 280, EDGE_FLICK - 0.01)).toBe(true);
    expect(edgeSettle(20, 280, EDGE_FLICK - 0.01)).toBe(false);
  });
});

function drag(zone: Element, to: number, from = 10) {
  fireEvent.pointerDown(zone, { pointerId: 1, button: 0, clientX: from, clientY: 100 });
  fireEvent.pointerMove(zone, { pointerId: 1, clientX: to, clientY: 100 });
  fireEvent.pointerUp(zone, { pointerId: 1, clientX: to, clientY: 100 });
}

function pane(open: boolean, onOpen = vi.fn()) {
  const view = render(
    <Pane id="p" label="Arias" open={open} width={280} onWidth={() => {}} onOpen={onOpen}>
      <span>list</span>
    </Pane>,
  );
  return { onOpen, zone: () => view.container.querySelector(".zr-pane-edge"), pane: () => document.getElementById("p")! };
}

describe("Pane edge", () => {
  it("has no edge zone while open, or without an onOpen", () => {
    expect(pane(true).zone()).toBeNull();
    render(
      <Pane id="q" label="Q" open={false} width={280} onWidth={() => {}}>
        <span>list</span>
      </Pane>,
    );
    expect(document.querySelector(".zr-pane-edge")).toBeNull();
  });

  it("opens on a long drag from the edge and follows the pointer until it lets go", () => {
    const { onOpen, zone, pane: el } = pane(false);
    const z = zone()!;
    fireEvent.pointerDown(z, { pointerId: 1, button: 0, clientX: 10, clientY: 100 });
    fireEvent.pointerMove(z, { pointerId: 1, clientX: 110, clientY: 100 });
    expect(el().hasAttribute("data-peek")).toBe(true);
    expect(el().style.transform).toBe("translateX(-180px)");
    expect(Number(el().style.opacity)).toBeCloseTo(200 / 280, 5);
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.pointerUp(z, { pointerId: 1, clientX: 210, clientY: 100 });
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(el().hasAttribute("data-peek")).toBe(false);
    expect(el().style.transform).toBe("");
  });

  it("snaps closed on a short drag, with nothing left on the pane", () => {
    const { onOpen, zone, pane: el } = pane(false);
    drag(zone()!, 50);
    expect(onOpen).not.toHaveBeenCalled();
    expect(el().hasAttribute("data-peek")).toBe(false);
    expect(el().style.cssText).toBe("");
  });

  it("opens on a quick flick however short", () => {
    vi.useFakeTimers();
    try {
      const { onOpen, zone } = pane(false);
      const z = zone()!;
      fireEvent.pointerDown(z, { pointerId: 1, button: 0, clientX: 10, clientY: 100 });
      vi.advanceTimersByTime(10);
      fireEvent.pointerMove(z, { pointerId: 1, clientX: 30, clientY: 100 });
      vi.advanceTimersByTime(20);
      fireEvent.pointerMove(z, { pointerId: 1, clientX: 60, clientY: 100 });
      fireEvent.pointerUp(z, { pointerId: 1, clientX: 60, clientY: 100 });
      expect(onOpen).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores a vertical start and a tap", () => {
    const { onOpen, zone, pane: el } = pane(false);
    const z = zone()!;
    fireEvent.pointerDown(z, { pointerId: 1, button: 0, clientX: 10, clientY: 100 });
    fireEvent.pointerMove(z, { pointerId: 1, clientX: 14, clientY: 160 });
    fireEvent.pointerMove(z, { pointerId: 1, clientX: 200, clientY: 160 });
    fireEvent.pointerUp(z, { pointerId: 1, clientX: 200, clientY: 160 });
    drag(z, 12);
    expect(onOpen).not.toHaveBeenCalled();
    expect(el().hasAttribute("data-peek")).toBe(false);
  });

  it("treats a cancelled drag as closed", () => {
    const { onOpen, zone } = pane(false);
    const z = zone()!;
    fireEvent.pointerDown(z, { pointerId: 1, button: 0, clientX: 10, clientY: 100 });
    fireEvent.pointerMove(z, { pointerId: 1, clientX: 250, clientY: 100 });
    fireEvent.pointerCancel(z, { pointerId: 1 });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("drops the zone once the pane is open", () => {
    const shown = (open: boolean) => (
      <Pane id="p" label="Arias" open={open} width={280} onWidth={() => {}} onOpen={() => {}}>
        <span>list</span>
      </Pane>
    );
    const view = render(shown(false));
    expect(view.container.querySelector(".zr-pane-edge")).not.toBeNull();
    act(() => view.rerender(shown(true)));
    expect(view.container.querySelector(".zr-pane-edge")).toBeNull();
  });
});

describe("the edge zone on a notched phone in landscape", () => {
  const css = readFileSync(resolve(process.cwd(), "../packages/react/src/zanni-react.css"), "utf8");
  const rules = css.split("\n").filter((l) => l.includes(".zr-pane-edge {"));

  it("starts at the left safe-area inset, fine pointer or coarse, so the notch cannot cover it", () => {
    expect(rules).toHaveLength(2);
    for (const rule of rules) expect(rule).toContain("env(safe-area-inset-left");
    expect(rules.some((r) => /left:\s*env\(safe-area-inset-left/.test(r))).toBe(true);
    expect(rules.some((r) => /left:\s*calc\(env\(safe-area-inset-left[^)]*\)\s*\+\s*6px\)/.test(r))).toBe(true);
  });
});
