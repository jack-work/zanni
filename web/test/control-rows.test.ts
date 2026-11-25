import { describe, expect, it } from "vitest";
import { ctxLine, controlRows, statusWord, type ControlInput } from "zanni-react/jotai";

const base: ControlInput = {
  aria: "e36a7ec5e5b69c40c2c0c15cf2582d43",
  name: "tripod-onion",
  link: "live",
  running: false,
  end: "",
  turns: 1,
  mantra: "warm up",
  route: ["anthropic", "claude-sonnet-4-5"],
  limit: 1_000_000,
  metrics: { context_tokens: 32, context_exact: true, tokens_in: 12, tokens_out: 20, cache_read_tokens: 0, cache_write_tokens: 0 },
  started: new Date(2026, 10, 24, 18, 52, 42).getTime(),
};

describe("the control pit rows, as the pager's panel draws them", () => {
  it("lists aria, status, mantra, route, context, tokens, cache and started in that order", () => {
    const rows = controlRows(base);
    expect(rows.map((r) => r.label)).toEqual(["aria", "status", "mantra", "route", "context", "tokens", "cache", "started"]);
    expect(rows.map((r) => r.value)).toEqual(["tripod-onion", "done ✓", "warm up", "anthropic > claude-sonnet-4-5", "32/1.0m 0.0%", "in 12 · out 20", "read 0 · write 0", "2026-11-24 18:52:42"]);
    expect(rows[0]!.dim).toBe(base.aria);
  });

  it("leaves out mantra, route and context when they are unknown, and keeps the rest", () => {
    const rows = controlRows({ ...base, mantra: " ", route: undefined, limit: undefined, metrics: undefined });
    expect(rows.map((r) => r.label)).toEqual(["aria", "status", "tokens", "cache", "started"]);
    expect(rows.find((r) => r.label === "tokens")!.value).toBe("in 0 · out 0");
  });

  it("folds runs of whitespace in the mantra", () => {
    expect(controlRows({ ...base, mantra: "a \n  b" }).find((r) => r.label === "mantra")!.value).toBe("a b");
  });

  it("marks an estimated context with a tilde and names an unknown capacity", () => {
    expect(ctxLine(12000, 1_000_000, false)).toBe("~12.0k/1.0m 1.2%");
    expect(ctxLine(1500, undefined, true)).toBe("1.5k (capacity unknown)");
    expect(ctxLine(0, 1_000_000, false)).toBe("0/1.0m 0.0%");
  });

  it("draws no context row when nothing is used and no capacity is known", () => {
    const rows = controlRows({ ...base, limit: undefined, metrics: { ...base.metrics!, context_tokens: 0 } });
    expect(rows.map((r) => r.label)).not.toContain("context");
  });

  it("words the status the way the pager does", () => {
    const s = (o: Partial<ControlInput>) => statusWord({ ...base, ...o });
    expect(s({})).toBe("done ✓");
    expect(s({ turns: 0 })).toBe("idle 𝄐");
    expect(s({ end: "failed" })).toBe("error ✗");
    expect(s({ end: "interrupted" })).toBe("hup !");
    expect(s({ link: "offline" })).toBe("detached ⠸");
    expect(s({ running: true })).toBe("⠋");
  });
});
