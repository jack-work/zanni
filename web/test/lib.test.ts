import { describe, expect, it } from "vitest";
import { labelOf, refusalText } from "zanni-react/jotai";
import { ctxLine, parseRoute, routeFor, stateGlyph } from "zanni-react/jotai";

describe("route", () => {
  it("round trips store, aria and an optional turn", () => {
    expect(parseRoute("#/local/abc123")).toEqual({ store: "local", aria: "abc123" });
    expect(parseRoute("#/local/abc123:17")).toEqual({ store: "local", aria: "abc123", turn: 17 });
    expect(parseRoute("#/local")).toEqual({ store: "local", aria: "" });
    expect(parseRoute("#/")).toBeNull();
    expect(parseRoute("#/a/b:x")).toBeNull();
    expect(routeFor("local", "abc", 17)).toBe("#/local/abc:17");
    expect(routeFor("local", "abc")).toBe("#/local/abc");
    expect(routeFor("", "abc")).toBe("#/");
    expect(parseRoute(routeFor("a b", "c/d", 3))).toEqual({ store: "a b", aria: "c/d", turn: 3 });
  });
});

describe("roster", () => {
  it("the label prefers the mantra, then handle, then the short id", () => {
    expect(labelOf({ id: "abcdef012345", mantra: "M", handle: "H", short: "S" } as never)).toBe("M");
    expect(labelOf({ id: "abcdef012345", handle: "H" } as never)).toBe("H");
    expect(labelOf({ id: "abcdef012345" } as never)).toBe("abcdef01");
  });

  it("a refusal has words", () => {
    expect(refusalText("not_found")).toContain("No such aria");
    expect(refusalText(undefined)).toBe("Refused.");
  });
});

describe("status bar", () => {
  it("formats context like the pager's formatContextUsage", () => {
    expect(ctxLine(31000, 936000)).toBe("31.0k/936.0k 3.3%");
    expect(ctxLine(950, undefined)).toBe("950 (capacity unknown)");
    expect(ctxLine(31000, undefined)).toBe("31.0k (capacity unknown)");
    expect(ctxLine(undefined, 936000)).toBe("");
  });
  it("marks an interrupted turn with ! rather than done", () => {
    const base = { link: "live", running: false, failed: false, frame: 0 };
    expect(stateGlyph({ ...base, interrupted: true })).toBe("!");
    expect(stateGlyph(base)).not.toBe("!");
    expect(stateGlyph({ ...base, failed: true, interrupted: true })).not.toBe("!");
  });
});
