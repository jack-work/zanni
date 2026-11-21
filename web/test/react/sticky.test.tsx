import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DOUBLE_TAP_MS, FIT_ELLIPSIS, TranscriptContext, TurnView, keyMode, tapMode } from "zanni-react";
import type { TurnModel } from "zanni-react";

const TURN_H = 600;
const BAR_H = 28;
const PANE_H = 500;
const QUESTION_H = 100;
const PAST = BAR_H + QUESTION_H + 20;

const question = (n: number) => "Question " + n + " first line\nsecond line of " + n;

const turn = (n: number, text: string | null = question(n)): TurnModel => ({
  key: "t" + n,
  turn: n,
  input: text === null ? null : { at: undefined, parts: [{ role: "you", label: "You", text }] },
  items: [{ key: "n0", kind: "prose", node: 0, settled: true, text: "reply " + n }],
  end: null,
  open: false,
  sealed: true,
});

let scrollTop = 0;
const observers = new Set<FakeObserver>();

function turnOf(el: Element): number {
  return Number(el.closest<HTMLElement>(".nodi-turn")!.dataset.turn) - 1;
}

function rectOf(el: Element): DOMRect {
  const root = document.querySelector("[data-zr-scroll]")!;
  if (el === root) return { top: 0, bottom: PANE_H, left: 0, right: 390, width: 390, height: PANE_H } as DOMRect;
  const asked = el.classList.contains("nodi-input");
  const top = turnOf(el) * TURN_H - scrollTop + (asked ? BAR_H : 0);
  const height = asked ? QUESTION_H : TURN_H;
  return { top, bottom: top + height, left: 0, right: 390, width: 390, height } as DOMRect;
}

class FakeObserver {
  private targets = new Set<Element>();
  private top: number;
  constructor(private cb: IntersectionObserverCallback, private opts: IntersectionObserverInit) {
    this.top = Math.abs(parseFloat((opts.rootMargin ?? "0px").split(" ")[0]!)) * -1;
    observers.add(this);
  }
  observe(el: Element) {
    this.targets.add(el);
    this.fire(el);
  }
  disconnect() {
    observers.delete(this);
  }
  unobserve() {}
  takeRecords() {
    return [];
  }
  fire(el: Element) {
    const r = rectOf(el);
    const rootTop = -this.top;
    const inside = r.bottom >= rootTop && r.top <= PANE_H;
    this.cb(
      [{ target: el, isIntersecting: inside, boundingClientRect: r, rootBounds: { top: rootTop, bottom: PANE_H } as DOMRectReadOnly } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
  refire() {
    for (const el of this.targets) this.fire(el);
  }
}

function scrollTo(y: number) {
  scrollTop = y;
  act(() => {
    for (const o of observers) o.refire();
  });
}

beforeEach(() => {
  scrollTop = 0;
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    return rectOf(this);
  });
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(BAR_H);
});

afterEach(() => {
  observers.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function transcript(turns: TurnModel[], actions?: (n: number) => React.ReactNode) {
  return render(
    <div data-zr-scroll="">
      <TranscriptContext value={{ actions }}>
        <ol className="nodi-turns">
          {turns.map((t) => (
            <TurnView key={t.key} turn={t} speaking={null} fresh={false} pinned />
          ))}
        </ol>
      </TranscriptContext>
    </div>,
  );
}

const head = (c: HTMLElement, n: number) => c.querySelector<HTMLElement>('.nodi-turn[data-turn="' + n + '"] .zr-sticky')!;
const tap = (c: HTMLElement, n: number) => head(c, n).querySelector<HTMLButtonElement>(".zr-sticky-tap")!;
const double = (el: Element) => el.querySelector(".zr-rule")!.hasAttribute("data-double");

describe("tapMode", () => {
  it("opens a shut head, goes full on a quick second tap, and shuts on a slow one", () => {
    expect(tapMode("shut", null)).toBe("open");
    expect(tapMode("shut", 10)).toBe("open");
    expect(tapMode("open", DOUBLE_TAP_MS - 1)).toBe("full");
    expect(tapMode("open", DOUBLE_TAP_MS)).toBe("shut");
    expect(tapMode("open", null)).toBe("shut");
    expect(tapMode("full", 10)).toBe("shut");
    expect(tapMode("full", null)).toBe("shut");
  });
});

describe("keyMode", () => {
  it("folds on Escape and toggles fullscreen on F only while open", () => {
    expect(keyMode("open", "Escape")).toBe("shut");
    expect(keyMode("full", "Escape")).toBe("shut");
    expect(keyMode("open", "F")).toBe("full");
    expect(keyMode("full", "F")).toBe("open");
    expect(keyMode("shut", "F")).toBe("shut");
    expect(keyMode("open", "x")).toBe("open");
  });
});

describe("the sticky head over a scrolling transcript", () => {
  it("replaces the per-turn header with a bar that carries the turn and its tools", () => {
    const { container } = transcript([turn(1)], (n) => <button className="mine">act {n}</button>);
    expect(container.querySelector(".nodi-turn-head")).toBeNull();
    const bar = head(container, 1).querySelector(".zr-sticky-bar")!;
    expect(bar.querySelector(".nodi-turn-no")!.textContent).toBe("Turn 1");
    expect(bar.querySelector(".mine")!.textContent).toBe("act 1");
    expect(container.querySelector(".nodi-turn-body")!.parentElement!.classList.contains("zr-sticky-scope")).toBe(true);
  });

  it("rests as a single bar, becomes the double bar with the question under it once its turn scrolls under it, and rests again", () => {
    const { container } = transcript([turn(1), turn(2), turn(3)]);
    for (const n of [1, 2, 3]) {
      expect(head(container, n).hasAttribute("data-pinned")).toBe(false);
      expect(double(head(container, n))).toBe(false);
      expect(head(container, n).querySelector(".zr-sticky-line")).toBeNull();
    }

    scrollTo(TURN_H + PAST);
    expect(head(container, 2).hasAttribute("data-pinned")).toBe(true);
    expect(double(head(container, 2))).toBe(true);
    expect(head(container, 2).querySelector(".zr-sticky-line")!.textContent).toContain("Question 2 first line");
    expect(head(container, 2).querySelector(".zr-fit-more")!.textContent).toBe(FIT_ELLIPSIS);
    expect(head(container, 1).hasAttribute("data-pinned")).toBe(false);
    expect(head(container, 3).hasAttribute("data-pinned")).toBe(false);

    scrollTo(2 * TURN_H + PAST);
    expect(head(container, 3).hasAttribute("data-pinned")).toBe(true);
    expect(head(container, 2).hasAttribute("data-pinned")).toBe(false);
    expect(head(container, 2).querySelector(".zr-sticky-line")).toBeNull();

    scrollTo(0);
    expect(container.querySelectorAll("[data-pinned]")).toHaveLength(0);
    expect(double(head(container, 3))).toBe(false);
  });

  it("keeps the rule single and the line away until the whole question has passed under the bar", () => {
    const { container } = transcript([turn(1), turn(2)]);
    const gone = TURN_H + BAR_H + QUESTION_H - BAR_H;
    scrollTo(TURN_H + 10);
    scrollTo(gone - 1);
    expect(head(container, 2).hasAttribute("data-pinned")).toBe(false);
    expect(double(head(container, 2))).toBe(false);
    expect(head(container, 2).querySelector(".zr-sticky-line")).toBeNull();

    scrollTo(gone + 1);
    expect(head(container, 2).hasAttribute("data-pinned")).toBe(true);
    expect(double(head(container, 2))).toBe(true);
    expect(head(container, 2).querySelector(".zr-sticky-line")).not.toBeNull();

    scrollTo(gone - 1);
    expect(head(container, 2).hasAttribute("data-pinned")).toBe(false);
    expect(double(head(container, 2))).toBe(false);
  });

  it("does not pin a turn whose question is blank, and disables its tap", () => {
    const { container } = transcript([turn(1, null), turn(2, "  \n ")]);
    scrollTo(TURN_H + PAST);
    expect(head(container, 2).querySelector(".zr-sticky-line")).toBeNull();
    expect(tap(container, 1).disabled).toBe(true);
    expect(tap(container, 2).disabled).toBe(true);
  });

  it("opens the whole question on a tap, goes full on a quick second tap, and shuts on a slow one", () => {
    const { container } = transcript([turn(1), turn(2)]);
    scrollTo(TURN_H + PAST);
    let now = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const h = head(container, 2);

    fireEvent.click(tap(container, 2), { detail: 1 });
    expect(h.dataset.head).toBe("open");
    expect(tap(container, 2).getAttribute("aria-expanded")).toBe("true");
    expect(h.querySelector(".zr-sticky-panel")!.textContent).toBe(question(2));
    expect(h.querySelector(".zr-sticky-glyph")!.textContent).toBe("∧");
    expect(h.querySelector(".zr-sticky-line")).toBeNull();
    expect(double(h)).toBe(true);

    now += DOUBLE_TAP_MS - 50;
    fireEvent.click(tap(container, 2), { detail: 2 });
    expect(h.dataset.head).toBe("full");

    now += DOUBLE_TAP_MS + 50;
    fireEvent.click(tap(container, 2), { detail: 1 });
    expect(h.dataset.head).toBe("shut");
    expect(h.querySelector(".zr-sticky-glyph")!.textContent).toBe("∨");
    expect(h.querySelector(".zr-sticky-panel")!.hasAttribute("hidden")).toBe(true);
  });

  it("answers the keyboard as the pager's pinned question does: Enter opens and shuts, F goes full, Escape folds", () => {
    const { container } = transcript([turn(1)]);
    const h = head(container, 1);
    fireEvent.click(tap(container, 1), { detail: 0 });
    expect(h.dataset.head).toBe("open");
    fireEvent.keyDown(tap(container, 1), { key: "F" });
    expect(h.dataset.head).toBe("full");
    fireEvent.keyDown(tap(container, 1), { key: "F" });
    expect(h.dataset.head).toBe("open");
    fireEvent.keyDown(tap(container, 1), { key: "Escape" });
    expect(h.dataset.head).toBe("shut");
    fireEvent.click(tap(container, 1), { detail: 0 });
    fireEvent.click(tap(container, 1), { detail: 0 });
    expect(h.dataset.head).toBe("shut");
  });

  it("taps the pinned line as well as the bar", () => {
    const { container } = transcript([turn(1), turn(2)]);
    scrollTo(TURN_H + PAST);
    fireEvent.click(head(container, 2).querySelector(".zr-sticky-line")!, { detail: 1 });
    expect(head(container, 2).dataset.head).toBe("open");
  });

  it("focuses the bar on a tap of the pinned line or of the bar, so Escape and F reach it", () => {
    const { container } = transcript([turn(1), turn(2)]);
    scrollTo(TURN_H + PAST);
    const h = head(container, 2);
    expect(document.activeElement).not.toBe(tap(container, 2));

    fireEvent.click(h.querySelector(".zr-sticky-line")!, { detail: 1 });
    expect(h.dataset.head).toBe("open");
    expect(document.activeElement).toBe(tap(container, 2));
    fireEvent.keyDown(document.activeElement!, { key: "F" });
    expect(h.dataset.head).toBe("full");
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(h.dataset.head).toBe("shut");

    (document.activeElement as HTMLElement).blur();
    fireEvent.click(tap(container, 2), { detail: 1 });
    expect(document.activeElement).toBe(tap(container, 2));
  });

  it("scrolls the open question a line at a time on j and k", () => {
    const { container } = transcript([turn(1)]);
    const h = head(container, 1);
    fireEvent.click(tap(container, 1), { detail: 0 });
    const panel = h.querySelector<HTMLElement>(".zr-sticky-scroll")!;
    const by = vi.fn();
    panel.scrollBy = by;
    fireEvent.keyDown(tap(container, 1), { key: "j" });
    fireEvent.keyDown(tap(container, 1), { key: "k" });
    expect(by.mock.calls.map((c) => Math.sign(c[0].top))).toEqual([1, -1]);
  });
});
