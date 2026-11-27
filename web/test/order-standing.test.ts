import { describe, expect, it } from "vitest";
import { standingOf, type FormRead } from "../src/order/derive";
import { standingText } from "../src/order/standing";

const form = (freshness: FormRead["freshness"], phase: FormRead["phase"] = "ready"): FormRead => ({ root: {}, ready: freshness === "current", refusal: undefined, phase, freshness });

describe("the standing of what the page shows", () => {
  const live = { live: true, complete: true, tree: "current" as const };

  it("is current when the link is live and every loaded form is current", () => {
    expect(standingOf({ ...live, forms: [form("current"), form("current")] })).toBe("current");
  });

  it("is stale when the link is not live, or a loaded form or the roster is stale", () => {
    expect(standingOf({ ...live, live: false, forms: [form("current")] })).toBe("stale");
    expect(standingOf({ ...live, forms: [form("current"), form("stale")] })).toBe("stale");
    expect(standingOf({ ...live, tree: "stale", forms: [] })).toBe("stale");
  });

  it("is resyncing while a form resyncs, or the page still waits on forms it has not read again", () => {
    expect(standingOf({ ...live, forms: [form("resyncing")] })).toBe("resyncing");
    expect(standingOf({ ...live, complete: false, forms: [form("current")] })).toBe("resyncing");
  });

  it("does not count a form that has not loaded", () => {
    expect(standingOf({ ...live, forms: [form("stale", "loading")] })).toBe("current");
  });

  it("words each state, and the closed link apart from a retrying one", () => {
    expect(standingText("current", "live")).toBe("");
    expect(standingText("resyncing", "live")).toMatch(/^Resyncing/);
    expect(standingText("stale", "live")).toMatch(/^Out of date/);
    expect(standingText("stale", "offline")).toMatch(/^Offline.*retrying/);
    expect(standingText("stale", "closed")).toMatch(/Reload to reconnect/);
  });
});
