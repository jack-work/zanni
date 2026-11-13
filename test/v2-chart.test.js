// zanni2: z2.chart's pure parts (bins, alignment, ticks, formatting). node test/v2-chart.test.js
"use strict";
process.env.TZ = "America/New_York";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const eq = (a, b, m) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), m); // values from the vm realm
const SRC = path.join(__dirname, "..", "assets/v2/z2-chart.js");

function load(text) {
  const ctx = { globalThis: {}, Date, Math, Object, Set, String, Number, isFinite, Array };
  ctx.globalThis = ctx;
  vm.runInNewContext(text, ctx);
  return ctx.z2._chart;
}

function suite(C) {
  const H = 3600e3, D = 24 * H;
  const at = (s) => new Date(s).getTime();
  // alignment: local hour, k-hour blocks, local midnight, Monday
  assert.strictEqual(C.align(at("2026-11-12T14:37:00-05:00"), H), at("2026-11-12T14:00:00-05:00"), "hour");
  assert.strictEqual(C.align(at("2026-11-12T14:37:00-05:00"), 6 * H), at("2026-11-12T12:00:00-05:00"), "6 h block");
  assert.strictEqual(C.align(at("2026-11-12T14:37:00-05:00"), D), at("2026-11-12T00:00:00-05:00"), "day");
  assert.strictEqual(C.align(at("2026-11-15T09:00:00-05:00"), 7 * D), at("2026-11-09T00:00:00-05:00"), "a Sunday is in the week of Monday 9th");
  assert.strictEqual(C.align(at("2026-11-09T00:00:00-05:00"), 7 * D), at("2026-11-09T00:00:00-05:00"), "Monday midnight is its own week");
  // a DST day is still one bin of one day (Nov 1 2026 has 25 h in New York)
  assert.strictEqual(C.step(at("2026-11-01T00:00:00-04:00"), D), at("2026-11-02T00:00:00-05:00"), "calendar day across DST");
  // binning: sums by series, window, hidden, NaN-safe, partial last bin
  const now = at("2026-11-12T20:00:00-05:00");
  const rows = [
    { t: at("2026-11-12T10:00:00-05:00"), lines: 100, s: "A" },
    { t: at("2026-11-12T11:00:00-05:00"), lines: 50, s: "B" },
    { t: at("2026-11-11T09:00:00-05:00"), lines: 30, s: "A" },
    { t: at("2026-11-11T09:30:00-05:00"), lines: "x", s: "A" },          // not a number: counts 0, never NaN
    { t: at("2026-10-01T09:00:00-04:00"), lines: 999, s: "A" },          // outside the window: dropped
  ];
  const o = { now, rangeMs: 7 * D, intervalMs: D, value: (r) => r.lines, series: (r) => r.s };
  const b = C.bin(rows, o);
  assert.strictEqual(b.total, 180, "the window's total");
  assert.strictEqual(b.bins.length, 8, "7 days back from 20:00 = 8 calendar days");
  assert.ok(b.bins[b.bins.length - 1].partial, "today is partial");
  eq(b.bins[b.bins.length - 1].by, { A: 100, B: 50 });
  eq(b.keys, ["A", "B"], "series by total, largest first");
  assert.strictEqual(b.max, 150);
  assert.ok(b.bins.every((x) => Number.isFinite(x.total)), "no NaN bin");
  const hid = C.bin(rows, Object.assign({}, o, { hidden: new Set(["A"]) }));
  assert.strictEqual(hid.total, 50, "a hidden series leaves the totals");
  eq(hid.keys, ["A", "B"], "but stays in the legend");
  assert.ok(hid.bins.every((x) => x.rows.every((r) => r.s !== "A")), "and leaves the tip's events");
  const cum = C.bin(rows, Object.assign({}, o, { cumulative: true }));
  assert.strictEqual(cum.bins[cum.bins.length - 1].total, 180, "running total ends at the window total");
  assert.strictEqual(cum.total, 180);
  const prs = C.bin(rows, Object.assign({}, o, { value: () => 1 }));
  assert.strictEqual(prs.total, 4, "count unit: one per event in the window");
  // ticks: round steps covering the max
  eq(C.ticks(180, 4), [0, 50, 100, 150, 200]);
  eq(C.ticks(0, 4), [0, 1], "an empty chart still has an axis");
  eq(C.ticks(3, 4), [0, 1, 2, 3], "counts never tick in fractions");
  // the toggles a range allows: < 2 or > 400 bins is disabled
  assert.strictEqual(C.binCount(D, 7 * D, now) < 2, true, "a week bin in a 24 h range is disabled");
  assert.ok(C.binCount(14 * D, H, now) <= 400, "hourly over 14 days fits");
  // formatting
  assert.strictEqual(C.fmt(1234), "1.2k");
  assert.strictEqual(C.fmt(12000), "12k");
  assert.strictEqual(C.fmt(null), "\u2014", "no answer is a dash, never 0");
  assert.strictEqual(C.fmt(2.5), "2.5");
  assert.strictEqual(Math.abs(C.PHI - 1.6180339887) < 1e-9, true);
}

const text = fs.readFileSync(SRC, "utf8");
suite(load(text));
// negative control: a chart that stops adding values must fail the suite (the test is not a no-op)
const broken = text.replace("B.total += v;", "/* dropped */");
assert.notStrictEqual(broken, text, "the mutation found its target");
let failed = false;
try { suite(load(broken)); } catch (e) { failed = /window's total/.test(e.message); }
assert.ok(failed, "a bin that drops values must fail on the window's total");
console.log("v2-chart.test: ok");
