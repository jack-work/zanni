import { act, render } from "@testing-library/react";
import { createRef, useEffect, type RefObject } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { watchScroll, useTranscriptScroll, type TranscriptScroll } from "zanni-react";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("watchScroll", () => {
  it("listens on the element for an element root and on the window for the page", () => {
    const box = document.createElement("div");
    const onBox = vi.fn();
    const stopBox = watchScroll(box, onBox);
    box.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("scroll"));
    expect(onBox).toHaveBeenCalledTimes(1);
    stopBox();
    box.dispatchEvent(new Event("scroll"));
    expect(onBox).toHaveBeenCalledTimes(1);

    const onPage = vi.fn();
    const stopPage = watchScroll(document.documentElement, onPage);
    document.documentElement.dispatchEvent(new Event("scroll"));
    expect(onPage, "a scroll event dispatched on the page element never reaches a listener there").toHaveBeenCalledTimes(0);
    window.dispatchEvent(new Event("scroll"));
    expect(onPage).toHaveBeenCalledTimes(1);
    stopPage();
  });
});

interface Turn {
  turn: number;
  key: string;
}

function turnsOf(n: number, from = 1): Turn[] {
  return Array.from({ length: n }, (_, i) => ({ turn: from + i, key: "t" + (from + i) }));
}

function geometry(root: HTMLElement, sizes: { height: number; client: number }) {
  Object.defineProperty(root, "scrollHeight", { configurable: true, get: () => sizes.height });
  Object.defineProperty(root, "clientHeight", { configurable: true, get: () => sizes.client });
}

function Harness({ turns, sizes, out }: { turns: Turn[]; sizes: { height: number; client: number }; out: { current: TranscriptScroll | null } }) {
  const pane: RefObject<HTMLElement | null> = createRef();
  const scroll = useTranscriptScroll(turns, pane, true);
  out.current = scroll;
  useEffect(() => {
    geometry(document.querySelector<HTMLElement>("[data-zr-scroll]")!, sizes);
  });
  return (
    <div data-zr-scroll="">
      <main ref={pane as RefObject<HTMLElement>}>
        <ol className="nodi-turns">
          {scroll.spans.flatMap(([from, to]) => turns.slice(from, to).map((t) => <li key={t.key} className="nodi-turn" data-turn={t.turn} />))}
        </ol>
      </main>
    </div>
  );
}

function scene(count: number) {
  const sizes = { height: 5000, client: 800 };
  const out: { current: TranscriptScroll | null } = { current: null };
  const view = render(<Harness turns={turnsOf(count)} sizes={sizes} out={out} />);
  const root = view.container.querySelector<HTMLElement>("[data-zr-scroll]")!;
  geometry(root, sizes);
  const again = (n: number) => view.rerender(<Harness turns={turnsOf(n)} sizes={sizes} out={out} />);
  return { root, sizes, out, again };
}

describe("useTranscriptScroll", () => {
  it("keeps the end under the reader while the content grows, until the reader lets go", () => {
    const { root, sizes, again } = scene(12);
    again(13);
    expect(root.scrollTop).toBe(4200);
    sizes.height = 6000;
    again(14);
    expect(root.scrollTop).toBe(5200);

    act(() => {
      window.dispatchEvent(new WheelEvent("wheel", { deltaY: -40, bubbles: true }));
    });
    sizes.height = 7000;
    again(15);
    expect(root.scrollTop, "after a wheel up the view stays where the reader left it").toBe(5200);
  });

  it("lets go when the view moves far from the end without a gesture, and shows the pill", () => {
    const { root, out, again } = scene(12);
    again(13);
    expect(out.current!.away).toBe(false);
    act(() => {
      root.scrollTop = 100;
      root.dispatchEvent(new Event("scroll"));
    });
    expect(out.current!.away).toBe(true);
    again(14);
    expect(root.scrollTop, "a commit does not pull a reader who scrolled away back to the end").toBe(100);
  });

  it("toEnd pins again and scrolls to the end once the commit has measured", () => {
    const { root, out, again } = scene(12);
    again(13);
    act(() => {
      root.scrollTop = 100;
      root.dispatchEvent(new Event("scroll"));
    });
    again(14);
    expect(root.scrollTop).toBe(100);
    act(() => out.current!.toEnd());
    expect(root.scrollTop).toBe(4200);
    expect(out.current!.away).toBe(false);
  });

  it("says which turn an unpinned reader is on, and nothing while the end is followed", () => {
    const { root, out, again } = scene(12);
    again(13);
    expect(out.current!.readerAt()).toBeUndefined();
    act(() => {
      root.scrollTop = 100;
      root.dispatchEvent(new Event("scroll"));
    });
    again(14);
    const at = out.current!.readerAt();
    expect(at).toBeGreaterThanOrEqual(1);
    expect(at).toBeLessThan(14);
    act(() => out.current!.toEnd());
    expect(out.current!.readerAt()).toBeUndefined();
  });

  it("windows the turns around the end under one spacer", () => {
    const { out } = scene(40);
    const [near, far] = out.current!.spans;
    expect(near![1], "the window ends on the last turn").toBe(40);
    expect(near![0], "and starts well after the first").toBeGreaterThan(30);
    expect(near![2], "turns above the window are one spacer").toBe(true);
    expect(far![0], "nothing is left between the window and the tail").toBe(far![1]);
  });
});
