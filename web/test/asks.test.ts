import { describe, expect, it } from "vitest";
import { ageOf, compareAsks, foldAsk, foldAsks, formatSpan } from "zanni-react/jotai";
import { readFileSync } from "node:fs";

const fixture = JSON.parse(readFileSync(new URL("../../test/wave1/fixtures/orders.json", import.meta.url), "utf8")) as { orders: Record<string, { state: string }> };

const T = (s: string) => Date.parse(s);
const NOW = T("2026-11-23T21:30:00-05:00");

describe("formatSpan", () => {
  it("keeps two units at most and floors", () => {
    expect(formatSpan(0)).toBe("<1m");
    expect(formatSpan(59_999)).toBe("<1m");
    expect(formatSpan(60_000)).toBe("1m");
    expect(formatSpan(59 * 60_000 + 59_999)).toBe("59m");
    expect(formatSpan(3_600_000)).toBe("1h");
    expect(formatSpan(3_600_000 + 10 * 60_000)).toBe("1h 10m");
    expect(formatSpan(24 * 3_600_000)).toBe("1d");
    expect(formatSpan(26 * 3_600_000 + 59 * 60_000)).toBe("1d 2h");
    expect(formatSpan(-5)).toBe("<1m");
  });
});

describe("foldAsk stage", () => {
  const order = (stages: Record<string, string>, state = "") => ({ text: "t", state, stages });

  it("is the latest stage with a time", () => {
    const a = foldAsk("a", order({ filed: "2026-11-23T10:00:00-05:00", lane: "2026-11-23T11:00:00-05:00", ready: "2026-11-23T12:00:00-05:00" }), NOW);
    expect(a.stage).toBe("ready");
    expect(a.stageIndex).toBe(2);
  });

  it("skips stages that were never stamped", () => {
    const a = foldAsk("a", order({ filed: "2026-11-23T10:00:00-05:00", live: "2026-11-23T12:00:00-05:00" }), NOW);
    expect(a.stage).toBe("live");
    expect(a.spans.map((s) => s.stage)).toEqual(["filed", "live"]);
  });

  it("maps the old states when there are no stamps", () => {
    expect(foldAsk("a", { state: "new" }, NOW).stage).toBe("filed");
    expect(foldAsk("a", { state: "taken" }, NOW).stage).toBe("lane");
    expect(foldAsk("a", { state: "shipped" }, NOW).stage).toBe("live");
    expect(foldAsk("a", { state: "wat" }, NOW).stage).toBe("filed");
    expect(foldAsk("a", {}, NOW).stage).toBe("filed");
  });

  it("lets a later state win over older stamps, without inventing a time for it", () => {
    const a = foldAsk("a", order({ filed: "2026-11-23T10:00:00-05:00", lane: "2026-11-23T11:00:00-05:00" }, "live"), NOW);
    expect(a.stage).toBe("live");
    expect(a.spans.every((s) => !s.current)).toBe(true);
  });

  it("falls back to the filed field when stages carries no filed time, and ignores bad times", () => {
    const a = foldAsk("a", { filed: "2026-11-23T10:00-05:00", stages: { lane: "not a time" } }, NOW);
    expect(a.filedAt).toBe(T("2026-11-23T10:00:00-05:00"));
    expect(a.stage).toBe("filed");
  });
});

describe("foldAsk time in stage", () => {
  const stages = {
    filed: "2026-11-23T10:00:00-05:00",
    lane: "2026-11-23T10:20:00-05:00",
    ready: "2026-11-23T13:20:00-05:00",
    live: "2026-11-23T20:30:00-05:00",
  };

  it("is the gap to the next stamped stage, and the time since for the current one", () => {
    const a = foldAsk("a", { text: "x", stages }, NOW);
    expect(a.spans.map((s) => [s.stage, s.ms])).toEqual([
      ["filed", 20 * 60_000],
      ["lane", 3 * 3_600_000],
      ["ready", 7 * 3_600_000 + 10 * 60_000],
      ["live", 60 * 60_000],
    ]);
    expect(a.spans.map((s) => s.current)).toEqual([false, false, false, true]);
  });

  it("gives a validated ask no running clock", () => {
    const a = foldAsk("a", { stages: { ...stages, validated: "2026-11-23T21:00:00-05:00" } }, NOW);
    const last = a.spans[a.spans.length - 1]!;
    expect(last.stage).toBe("validated");
    expect(last.ms).toBeUndefined();
    expect(a.spans[a.spans.length - 2]!.ms).toBe(30 * 60_000);
  });

  it("clamps a back-filled stamp that precedes the one before it", () => {
    const a = foldAsk("a", { stages: { filed: "2026-11-23T19:00:00-05:00", lane: "2026-11-23T11:50:00-05:00" } }, NOW);
    expect(a.stage).toBe("lane");
    expect(a.spans[0]!.ms).toBe(0);
    expect(a.spans[1]!.ms).toBe(NOW - T("2026-11-23T11:50:00-05:00"));
  });
});

describe("age", () => {
  it("counts from the filed time and never goes negative", () => {
    const a = foldAsk("a", { stages: { filed: "2026-11-23T20:30:00-05:00" } }, NOW);
    expect(ageOf(a, NOW)).toBe(60 * 60_000);
    expect(ageOf(a, T("2026-11-23T20:00:00-05:00"))).toBe(0);
    expect(ageOf(foldAsk("b", {}, NOW), NOW)).toBeUndefined();
  });
});

describe("sort", () => {
  const mk = (id: string, stages: Record<string, string>) => foldAsk(id, { stages }, NOW);

  it("orders by stage, filed first and validated last, then oldest filed first", () => {
    const rows = [
      mk("v", { filed: "2026-11-20T10:00:00-05:00", validated: "2026-11-21T10:00:00-05:00" }),
      mk("lane-new", { filed: "2026-11-23T10:00:00-05:00", lane: "2026-11-23T10:10:00-05:00" }),
      mk("filed-new", { filed: "2026-11-23T09:00:00-05:00" }),
      mk("lane-old", { filed: "2026-11-21T10:00:00-05:00", lane: "2026-11-21T10:10:00-05:00" }),
      mk("filed-old", { filed: "2026-11-22T09:00:00-05:00" }),
      mk("live", { filed: "2026-11-19T10:00:00-05:00", live: "2026-11-22T10:00:00-05:00" }),
    ];
    expect(rows.sort(compareAsks).map((r) => r.id)).toEqual(["filed-old", "filed-new", "lane-old", "lane-new", "live", "v"]);
  });

  it("puts an undated ask after the dated ones of its stage, then by id", () => {
    const rows = [mk("b", {}), mk("a", {}), mk("c", { filed: "2026-11-23T09:00:00-05:00" })];
    expect(rows.sort(compareAsks).map((r) => r.id)).toEqual(["c", "a", "b"]);
  });
});

describe("the real orders form", () => {
  const rows = foldAsks(fixture, NOW);

  it("folds every order", () => {
    expect(rows).toHaveLength(Object.keys(fixture.orders).length);
    expect(rows.every((r) => r.text.length > 0 && r.filedAt !== undefined)).toBe(true);
  });

  it("agrees with the state each order carries", () => {
    for (const r of rows) expect(r.stage, r.id).toBe(fixture.orders[r.id]!.state);
  });

  it("is sorted by stage then filed time", () => {
    const keys = rows.map((r) => [r.stageIndex, r.filedAt!] as const);
    for (let i = 1; i < keys.length; i++) {
      const [s0, t0] = keys[i - 1]!;
      const [s1, t1] = keys[i]!;
      expect(s1 > s0 || (s1 === s0 && t1 >= t0), rows[i]!.id).toBe(true);
    }
    expect(rows[0]!.stage).toBe("filed");
    expect(rows[rows.length - 1]!.stage).toBe("live");
  });

  it("never reports a negative span", () => {
    for (const r of rows) for (const s of r.spans) expect(s.ms === undefined || s.ms >= 0, r.id + " " + s.stage).toBe(true);
  });
});
