import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FIT_ELLIPSIS, Fit, Typeset, firstLine } from "zanni-react";

vi.mock("../../../packages/react/src/typeset-pretext", () => ({
  engine: {
    name: "fake",
    prepare: (text: string) => text,
    lines: (text: string, width: number) => {
      const per = Math.max(1, Math.floor(width / 10));
      const out: string[] = [];
      for (let i = 0; i < text.length; i += per) out.push(text.slice(i, i + per));
      return out.length ? out : [""];
    },
    width: (text: string) => text.length * 10,
  },
}));

describe("firstLine", () => {
  it("takes the first non-blank line, collapses its blanks, and says whether more follows", () => {
    expect(firstLine("  hello   there  \nsecond")).toEqual({ line: "hello there", more: true });
    expect(firstLine("\n\nonly")).toEqual({ line: "only", more: false });
    expect(firstLine("one\n  \n")).toEqual({ line: "one", more: false });
    expect(firstLine("  \n ")).toEqual({ line: "", more: false });
  });
});

let resize: ((width: number) => void) | undefined;

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private cb: ResizeObserverCallback) {}
      observe() {
        resize = (width) => this.cb([{ contentRect: { width } } as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  resize = undefined;
});

const rows = (box: Element) => [...box.querySelectorAll(".zr-ts-line")].map((r) => r.textContent);

describe("Typeset and Fit", () => {
  it("draws the plain text, clamped by CSS, until Pretext has loaded and the box has a width", () => {
    const { container } = render(<Typeset text="hello there" />);
    const box = container.querySelector(".zr-ts")!;
    expect(box.textContent).toBe("hello there");
    expect(box.hasAttribute("data-set")).toBe(false);
  });

  it("sets the first line of a question at the width it was given, with the ellipsis dimmed", async () => {
    const { container } = render(<Fit text={"a long first line of a question\nsecond"} />);
    await waitFor(() => expect(resize).toBeDefined());
    act(() => resize!(200));
    await waitFor(() => expect(container.querySelector(".zr-ts")!.hasAttribute("data-set")).toBe(true));
    const box = container.querySelector(".zr-ts")!;
    expect(rows(box)).toEqual(["a long first line" + FIT_ELLIPSIS]);
    expect(box.querySelector(".zr-fit-more")!.textContent).toBe(FIT_ELLIPSIS);
  });

  it("draws a whole line that fits with nothing after it", async () => {
    const { container } = render(<Fit text="short question" />);
    await waitFor(() => expect(resize).toBeDefined());
    act(() => resize!(400));
    await waitFor(() => expect(container.querySelector(".zr-ts")!.hasAttribute("data-set")).toBe(true));
    expect(rows(container.querySelector(".zr-ts")!)).toEqual(["short question"]);
    expect(container.querySelector(".zr-fit-more")).toBeNull();
  });

  it("sets the lines again when the box changes width, and keeps the lines that did not change", async () => {
    const { container } = render(<Typeset text="abcdefghijklmnopqrstuvwxyz" />);
    await waitFor(() => expect(resize).toBeDefined());
    act(() => resize!(130));
    await waitFor(() => expect(rows(container.querySelector(".zr-ts")!)).toEqual(["abcdefghijklm", "nopqrstuvwxyz"]));
    const first = container.querySelector(".zr-ts-line")!;
    act(() => resize!(260));
    await waitFor(() => expect(rows(container.querySelector(".zr-ts")!)).toEqual(["abcdefghijklmnopqrstuvwxyz"]));
    expect(container.querySelector(".zr-ts-line")).not.toBe(first);
  });
});
