import { readFileSync } from "node:fs";
import type { JsonObject } from "figaro-forms";
import type { TreeNode, TreeState } from "figaro-forms/aria";
import { describe, expect, it } from "vitest";
import { enumerateForms, listedForms } from "../src/order/enumerate";

const node = (o: Partial<TreeNode> & { id: string }): TreeNode => ({ kind: "aria", label: o.id, roleName: undefined, target: undefined, handle: undefined, mantra: undefined, parent: undefined, children: [], daemon: "d", state: "idle", status: "live", roles: [], cwd: undefined, activeAt: undefined, ctx: undefined, ctxLimit: undefined, reapsAt: undefined, bound: false, ...o });

const tree = (...nodes: TreeNode[]): TreeState => ({ ready: true, freshness: "current", error: undefined, daemons: [], roots: [], more: 0, nodes: new Map(nodes.map((n) => [n.id, n])), reaped: new Map() });

const listing = JSON.parse(readFileSync("test/fixtures/arias-global.json", "utf8")) as JsonObject;
const roles = JSON.parse(readFileSync("test/fixtures/order-queues.json", "utf8")) as { roles: { id: string }[] };

describe("which forms the page reads", () => {
  it("is the live role rows of @arias, as form ids", () => {
    const ids = enumerateForms(tree(node({ id: "a1" }), node({ id: "@r1", kind: "role", roleName: "A" }), node({ id: "r2", kind: "role", roleName: "B" }), node({ id: "@r3", kind: "role", roleName: "C", status: "retired" })));
    expect(ids).toEqual(["@r1", "@r2"]);
  });

  it("is empty with no tree", () => {
    expect(enumerateForms(null)).toEqual([]);
  });

  it("adds the listed forms once each, after the rows", () => {
    const ids = enumerateForms(tree(node({ id: "@r1", kind: "role", roleName: "King" })), ["@r1", "@aaaaaaaa", "aaaaaaaa", "@bbbbbbbb"]);
    expect(ids).toEqual(["@r1", "@aaaaaaaa", "@bbbbbbbb"]);
  });
});

describe("the form listing, as @arias and @arias-global carry it", () => {
  it("lists every row of kind form, however deep it is nested under the forks of its parent form", () => {
    const ids = listedForms(listing);
    expect(ids).toHaveLength(17);
    expect([...ids].sort()).toEqual(roles.roles.map((r) => r.id.replace(/^(?!@)/, "@")).sort());
  });

  it("reaches a queue form and a vacant seat, which carry no target, as well as a seat with one", () => {
    const rows: Record<string, { name: string; target?: string }> = {};
    const walk = (level: Record<string, any>): void => {
      for (const row of Object.values(level)) {
        if (row.kind === "form") rows[row.id] = row;
        walk(row.forks ?? {});
      }
    };
    walk(listing.arias as Record<string, any>);
    const bare = (name: string) => Object.values(rows).find((r) => r.name === name)!;
    expect(bare("Widget Work").target).toBeUndefined();
    expect(bare("Backend Lead").target).toBeUndefined();
    expect(bare("Crown").target).toBeDefined();
    expect(listedForms(listing)).toContain(Object.keys(rows).find((id) => rows[id]!.name === "Widget Work"));
  });

  it("skips the arias and the anchor, and rows without an id", () => {
    const ids = listedForms({ arias: { null: { id: "null", state: "anchor", forks: { "@x-y": { id: "@aaaa1111", kind: "form" }, "@z-z": { kind: "form" }, "@w-w": { id: "", kind: "form" } } }, "plain-owl": { id: "c0ffee01", state: "idle", forks: { "little-fox": { id: "c0ffee02", state: "dormant" } } } } });
    expect(ids).toEqual(["@aaaa1111"]);
  });

  it("is empty for a root with no arias, or one that is not an object", () => {
    expect(listedForms(undefined)).toEqual([]);
    expect(listedForms({})).toEqual([]);
    expect(listedForms({ arias: [] })).toEqual([]);
    expect(listedForms({ arias: "x" })).toEqual([]);
  });
});
