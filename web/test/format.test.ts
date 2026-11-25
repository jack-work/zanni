import { describe, expect, it } from "vitest";
import { bytes, clip, clock, duration, stamp, time } from "zanni-react";

describe("duration", () => {
  it("steps from milliseconds to days and drops a zero second unit", () => {
    expect([0, 850, 1200, 12_000, 60_000, 63_000, 341_000, 3_600_000, 3_840_000, 3_720_000, 26 * 3_600_000, 48 * 3_600_000].map(duration)).toEqual(["0ms", "850ms", "1.2s", "12s", "1m", "1m 3s", "5m 41s", "1h", "1h 4m", "1h 2m", "1d 2h", "2d"]);
  });

  it("carries a rounded-up unit instead of printing 60s or 10.0s", () => {
    expect(duration(999.6)).toBe("1.0s");
    expect(duration(9_960)).toBe("10s");
    expect(duration(59_600)).toBe("1m");
    expect(duration(3_599_600)).toBe("1h");
  });

  it("says nothing for a negative or missing span", () => {
    expect(duration(-1)).toBe("");
    expect(duration(NaN)).toBe("");
  });
});

describe("clock", () => {
  it("counts minutes and seconds without a cap on minutes", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(75_000)).toBe("1:15");
    expect(clock(-5)).toBe("0:00");
    expect(clock(3_700_000)).toBe("61:40");
  });
});

describe("time and stamp", () => {
  const at = new Date(2026, 10, 24, 9, 5, 7).getTime();

  it("stamps the local date and second", () => {
    expect(stamp(at)).toBe("2026-11-24 09:05:07");
  });

  it("gives the hour and minute, and nothing for a missing time", () => {
    expect(time(at)).toMatch(/^0?9:05/);
    expect(time(0)).toBe("");
    expect(time(NaN)).toBe("");
  });
});

describe("bytes", () => {
  it("reads sizes the way a person does", () => {
    expect(bytes(512)).toBe("512 B");
    expect(bytes(1536)).toBe("1.5 KB");
    expect(bytes(250 * 1024)).toBe("250 KB");
    expect(bytes(3.2 * 1024 * 1024)).toBe("3.2 MB");
  });
});

describe("clip", () => {
  it("cuts to a width with one ellipsis", () => {
    expect(clip("abcdef", 4)).toBe("abc…");
    expect(clip("abc", 4)).toBe("abc");
    expect(clip("abcd", 4)).toBe("abcd");
  });

  it("keeps the first line", () => {
    expect(clip("one\ntwo")).toBe("one");
    expect(clip("one\ntwo", 2)).toBe("o…");
  });

  it("counts code points, not code units", () => {
    expect(clip("😀😀😀😀", 3)).toBe("😀😀…");
  });
});
