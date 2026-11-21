import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FIT_ELLIPSIS, Fit, firstLine, fitText } from "zanni-react";

const room = (cells: number) => (c: string) => Array.from(c).length <= cells;

describe("firstLine", () => {
  it("takes the first non-blank row, squeezed, and says whether more follows", () => {
    expect(firstLine("  hello   there  \nsecond")).toEqual({ line: "hello there", more: true });
    expect(firstLine("\n\nonly")).toEqual({ line: "only", more: false });
    expect(firstLine("one\n  \n")).toEqual({ line: "one", more: false });
    expect(firstLine("  \n ")).toEqual({ line: "", more: false });
  });
});

describe("fitText", () => {
  it("leaves a line that fits and nothing follows", () => {
    expect(fitText("short", false, room(10))).toEqual({ text: "short", cut: false });
  });

  it("marks a fitting line that has more after it", () => {
    expect(fitText("short", true, room(10))).toEqual({ text: "short", cut: true });
  });

  it("cuts to the longest prefix that leaves room for the ellipsis", () => {
    const got = fitText("where did the layered layout pass leave the crossing", false, room(20));
    expect(got).toEqual({ text: "where did the lay", cut: true });
    expect(Array.from(got.text + FIT_ELLIPSIS)).toHaveLength(20);
  });

  it("drops the blank a cut would leave before the ellipsis", () => {
    expect(fitText("where did the layered", false, room(16)).text).toBe("where did the");
  });

  it("never splits a surrogate pair and gives up cleanly when nothing fits", () => {
    expect(fitText("😀😀😀😀😀", false, room(4)).text).toBe("😀");
    expect(fitText("anything", true, () => false)).toEqual({ text: "", cut: true });
  });
});

describe("Fit", () => {
  afterEach(() => vi.restoreAllMocks());

  function measure(width: number) {
    vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(width);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
      return (this.textContent ?? "").length * 10;
    });
  }

  const shown = (box: Element) =>
    [...box.childNodes]
      .filter((n) => !(n as Element).classList?.contains("zr-fit-probe"))
      .map((n) => n.textContent)
      .join("");

  it("shows the first line cut to the width it was given, with the ellipsis dimmed", () => {
    measure(200);
    const { container } = render(<Fit text={"a long first line of a question\nsecond"} />);
    const box = container.querySelector(".zr-fit")!;
    expect(box.querySelector(".zr-fit-more")!.textContent).toBe(FIT_ELLIPSIS);
    expect(shown(box)).toBe("a long first line" + FIT_ELLIPSIS);
    expect(shown(box).length * 10).toBeLessThanOrEqual(200);
  });

  it("draws the whole line when it fits and nothing follows", () => {
    measure(400);
    const { container } = render(<Fit text="short question" />);
    expect(container.querySelector(".zr-fit-more")).toBeNull();
    expect(shown(container.querySelector(".zr-fit")!)).toBe("short question");
  });

  it("refits when the line changes", () => {
    measure(100);
    const { container, rerender } = render(<Fit text="abcdefghijklmnopqrstuvwxyz" />);
    expect(shown(container.querySelector(".zr-fit")!)).toBe("abcdefg" + FIT_ELLIPSIS);
    rerender(<Fit text="tiny" />);
    expect(shown(container.querySelector(".zr-fit")!)).toBe("tiny");
  });
});
