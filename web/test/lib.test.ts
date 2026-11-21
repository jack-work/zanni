import { describe, expect, it } from "vitest";
import { labelOf, refusalText } from "zanni-react/jotai";
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

import { parseTemplates } from "zanni-react/jotai";
describe("templates", () => {
  it("reads id=Label pairs from data-templates and drops anything that is not an aria id", () => {
    expect(parseTemplates("c0ffee01c0ffee01c0ffee01c0ffee01=New figaro; deadbeef ; nope=X")).toEqual([
      { id: "c0ffee01c0ffee01c0ffee01c0ffee01", label: "New figaro" },
      { id: "deadbeef", label: "New figaro" },
    ]);
    expect(parseTemplates(null)).toEqual([]);
  });
});
