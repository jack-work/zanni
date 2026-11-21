import { describe, expect, it } from "vitest";
import { depths, labelOf, refusalText } from "zanni-react/jotai";
import { parseRoute, routeFor } from "zanni-react/jotai";

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
  it("depth follows the parent chain in the daemon order, a missing parent is a root", () => {
    const rows = [{ id: "a" }, { id: "b", parent: "a" }, { id: "c", parent: "b" }, { id: "d", parent: "gone" }, { id: "e", parent: "e" }] as never[];
    expect(depths(rows)).toEqual({ a: 0, b: 1, c: 2, d: 0, e: 0 });
  });

  it("depth stops at six", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ id: "n" + i, ...(i ? { parent: "n" + (i - 1) } : {}) })) as never[];
    expect(Math.max(...Object.values(depths(rows)))).toBe(6);
  });

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
