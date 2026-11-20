"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");

require(path.join(__dirname, "..", "assets", "v2", "z2-usage.js"));
const { usageSeats, usagePrimary } = globalThis.z2;
const name = (pl) => pl.label;
const seats = (plans) => Object.fromEntries(Object.entries(usageSeats(plans, name)).map(([k, v]) => [k, v.n]));

assert.deepEqual(seats([{ plan: "anthropic-kic", label: "t", account: "kic" }, { plan: "anthropic-kic-2", label: "t", account: "kic" }]),
  { "anthropic-kic": 1, "anthropic-kic-2": 2 });
assert.deepEqual(seats([{ plan: "anthropic-kic-2", label: "t", account: "kic" }, { plan: "anthropic-kic-3", label: "t", account: "kic" }]),
  { "anthropic-kic-2": 2, "anthropic-kic-3": 3 }, "a seat keeps the number in its upstream when a sibling is missing");
assert.deepEqual(seats([{ plan: "kic-b", label: "t", account: "kic" }, { plan: "kic-a", label: "t", account: "kic" }]),
  { "kic-a": 1, "kic-b": 2 }, "upstreams with no number are seated in name order");
assert.deepEqual(seats([{ plan: "anthropic-kic", label: "t", account: "kic" }]), {}, "one seat is not numbered");
assert.deepEqual(seats([{ plan: "anthropic-max", label: "max", account: "personal" }, { plan: "anthropic-personal", label: "key", account: "personal" }]), {},
  "one account under two products is not two seats");
assert.deepEqual(seats([{ plan: "unidentified", label: "t", account: null }, { plan: "unidentified-2", label: "t", account: null }]), {}, "plans with no account are not seats");

const recent = (rows) => ({ from: "2026-11-19T05:00:00Z", to: "2026-11-19T06:00:00Z", providers: [{ provider: "anthropic",
  plans: rows.map(([plan, ...access]) => ({ plan, access: access.map(([requests, last_seen]) => ({ requests, last_seen })) })) }] });
assert.deepEqual(usagePrimary(recent([["a", [9, null]], ["b", [30, null], [11, null]], ["c", [40, null]]])),
  { anthropic: { plan: "b", requests: 41, total: 90, span: 3600000 } }, "a plan's access lines add up");
assert.deepEqual(usagePrimary(recent([["a", [0, null]], ["b", [0, null]]])), {}, "an idle hour has no primary");
assert.equal(usagePrimary(recent([["a", [5, "2026-11-19T05:10:00Z"]], ["b", [5, "2026-11-19T05:50:00Z"]]])).anthropic.plan, "b", "a tie goes to the plan seen last");
assert.deepEqual(usagePrimary(recent([["a", [12, null]], ["b", [0, null]]])), {}, "one plan ran: nothing to choose between, no primary");
assert.deepEqual(usagePrimary(null), {});

console.log("v2-usage: ok");
