import { readFileSync } from "node:fs";
import type { JsonObject } from "figaro-forms";
import { describe, expect, it } from "vitest";
import { byQueueOrder, entriesOf, flatten, forestOf, leaseOf, orderHash, parseOrderRoute, safeHref, stateCounts, wantsAttention, type Branch } from "../src/order/queue";

const fixture = JSON.parse(readFileSync("test/fixtures/order-queues.json", "utf8")) as { roles: { name: string; form: JsonObject }[] };
const form = (name: string) => fixture.roles.find((r) => r.name === name)!.form;
const shape = (forest: readonly Branch[]): unknown => forest.map((b) => (b.children.length ? [b.entry.title, shape(b.children)] : b.entry.title));

const raw = (extra: Record<string, unknown>): JsonObject => ({ kind: "work", title: "t", state: "posted", ...extra }) as JsonObject;
const root = (queue: Record<string, JsonObject>): JsonObject => ({ queue }) as JsonObject;

describe("entries of a role form", () => {
  it("reads every contract field of the widget queue", () => {
    const entries = entriesOf(form("Widget Work"));
    const catalogue = entries.find((e) => e.title === "Ship the widget catalogue")!;
    expect(catalogue.kind).toBe("work");
    expect(catalogue.state).toBe("claimed");
    expect(catalogue.claimedBy).toMatchObject({ role: "Widget Engineer", leaseUntil: "2026-11-25T21:05:00Z" });
    expect(catalogue.amendments).toHaveLength(2);
    expect(catalogue.amendments[1]!.body?.bytes).toBe(912);
    expect(catalogue.commits).toEqual(["4f1c9ad", "9be02e7"]);
    expect(catalogue.links).toHaveLength(2);
    expect(wantsAttention(catalogue)).toBe(true);
    expect(catalogue.body?.uri).toMatch(/^https:/);
    expect(catalogue.extra).toEqual([]);
  });

  it("keeps keys the contract does not name, so a full view loses nothing", () => {
    const [e] = entriesOf(root({ A: raw({ detail: "long text", zeta: 1 }) }));
    expect(e!.extra).toEqual([["detail", "long text"], ["zeta", 1]]);
  });

  it("is empty for a role with no queue, a queue that is not an object, or no form", () => {
    expect(entriesOf(form("Idle Scout"))).toEqual([]);
    expect(entriesOf({ queue: "nope" })).toEqual([]);
    expect(entriesOf(undefined)).toEqual([]);
  });

  it("skips an entry that is not an object and survives wrong field types", () => {
    const entries = entriesOf(root({ A: "x" as never, B: raw({ children: "no", amendments: [1, { note: 2 }], claimed_by: 4, priority: "high", body: { uri: 7 } }) }));
    expect(entries.map((e) => e.id)).toEqual(["B"]);
    const b = entries[0]!;
    expect(b.children).toEqual([]);
    expect(b.amendments).toHaveLength(1);
    expect(b.claimedBy).toBeUndefined();
    expect(b.priority).toBeUndefined();
    expect(b.body).toBeUndefined();
  });
});

describe("the tree of work orders", () => {
  it("nests children under their parent, in the order the lead declared", () => {
    expect(shape(forestOf(entriesOf(form("Widget Work"))))).toEqual([
      "Retire the old widget index",
      "Handoff: widget tooling lane",
      ["Ship the widget catalogue", ["Catalogue schema", "Catalogue loader", ["Catalogue page", ["Page: empty state"]]]],
    ]);
  });

  it("puts an entry the lead lists but that names no parent under the lead", () => {
    const forest = forestOf(entriesOf(root({ A: raw({ title: "a", children: ["B"] }), B: raw({ title: "b" }) })));
    expect(shape(forest)).toEqual([["a", ["b"]]]);
  });

  it("treats a parent that is not in the queue as no parent", () => {
    expect(shape(forestOf(entriesOf(root({ A: raw({ title: "a", parent: "GONE" }) }))))).toEqual(["a"]);
  });

  it("breaks a cycle and shows every entry once", () => {
    const entries = entriesOf(root({ A: raw({ title: "a", parent: "B" }), B: raw({ title: "b", parent: "A" }), C: raw({ title: "c", parent: "C" }) }));
    const shown = flatten(forestOf(entries)).map((e) => e.id);
    expect(shown.sort()).toEqual(["A", "B", "C"]);
  });

  it("orders by priority, then the oldest state_at first, then id; ids never lead", () => {
    const at = (id: string, p: Record<string, unknown>) => [id, raw({ title: id, ...p })] as const;
    const queue = Object.fromEntries([
      at("aaa-late", { state_at: "2026-11-25T12:00:00Z" }),
      at("zzz-early", { state_at: "2026-11-25T08:00:00Z" }),
      at("mmm-tied-b", { state_at: "2026-11-25T10:00:00Z" }),
      at("mmm-tied-a", { state_at: "2026-11-25T10:00:00Z" }),
      at("bbb-undated", {}),
      at("ccc-urgent", { priority: 5, state_at: "2026-11-25T23:00:00Z" }),
    ]);
    expect(forestOf(entriesOf(root(queue))).map((b) => b.entry.id)).toEqual(["ccc-urgent", "zzz-early", "mmm-tied-a", "mmm-tied-b", "aaa-late", "bbb-undated"]);
  });

  it("keeps the lead's child order even when state_at says otherwise", () => {
    const queue = {
      lead: raw({ title: "lead", children: ["kid-new", "kid-old"], state_at: "2026-11-25T09:00:00Z" }),
      "kid-old": raw({ title: "kid-old", parent: "lead", state_at: "2026-11-25T01:00:00Z" }),
      "kid-new": raw({ title: "kid-new", parent: "lead", state_at: "2026-11-25T08:00:00Z" }),
    };
    expect(shape(forestOf(entriesOf(root(queue))))).toEqual([["lead", ["kid-new", "kid-old"]]]);
  });

  it("orders roots by priority, higher first", () => {
    const forest = forestOf(entriesOf(form("Review Queue")));
    expect(forest.map((b) => b.entry.priority)).toEqual([20, 10, 5]);
    const a = { id: "A", priority: undefined } as never;
    const b = { id: "B", priority: undefined } as never;
    expect(byQueueOrder(a, b)).toBeLessThan(0);
  });
});

describe("summaries and links", () => {
  it("counts entries by state", () => {
    expect([...stateCounts(entriesOf(form("Widget Work")))].sort()).toEqual([["blocked", 1], ["claimed", 1], ["done", 1], ["posted", 3], ["review", 1]]);
  });

  it("tells a live lease from a lapsed one and from none", () => {
    const claim = { role: "r", aria: "a", at: "", leaseUntil: "2026-11-25T21:00:00Z" };
    const now = Date.parse("2026-11-25T20:30:00Z");
    expect(leaseOf(claim, now)).toEqual({ kind: "live", leftMs: 30 * 60000 });
    expect(leaseOf(claim, now + 60 * 60000)).toEqual({ kind: "lapsed", overMs: 30 * 60000 });
    expect(leaseOf({ ...claim, leaseUntil: "soon" }, now)).toEqual({ kind: "none" });
    expect(leaseOf(undefined, now)).toEqual({ kind: "none" });
  });

  it("links only http and https", () => {
    expect(safeHref("https://keel.example.test/diff/1")).toBe("https://keel.example.test/diff/1");
    expect(safeHref("javascript:alert(1)")).toBeUndefined();
    expect(safeHref("data:text/html,x")).toBeUndefined();
    expect(safeHref("garage://orders/abc")).toBeUndefined();
    expect(safeHref("not a url")).toBeUndefined();
  });
});

describe("the page route", () => {
  it("round-trips a role and an entry", () => {
    expect(parseOrderRoute(orderHash("@c0de0001", "@7e1a0001", "clear-lens"))).toEqual({ central: "@c0de0001", role: "@7e1a0001", entry: "clear-lens" });
    expect(parseOrderRoute(orderHash("@c0de0001"))).toEqual({ central: "@c0de0001", role: undefined, entry: undefined });
    expect(parseOrderRoute("#/")).toEqual({ central: undefined, role: undefined, entry: undefined });
    expect(parseOrderRoute("")).toEqual({ central: undefined, role: undefined, entry: undefined });
    expect(parseOrderRoute("#/%E0%A4%A")).toEqual({ central: undefined, role: undefined, entry: undefined });
  });
});
