import type { TreeNode, TreeState } from "figaro-forms/aria";
import { describe, expect, it } from "vitest";
import { enumerateForms } from "../src/order/enumerate";
import { INTERIM_FORMS } from "../src/order/interim-forms";

const node = (o: Partial<TreeNode> & { id: string }): TreeNode => ({ kind: "aria", label: o.id, roleName: undefined, target: undefined, handle: undefined, mantra: undefined, parent: undefined, children: [], daemon: "d", state: "idle", status: "live", roles: [], cwd: undefined, activeAt: undefined, ctx: undefined, ctxLimit: undefined, reapsAt: undefined, bound: false, ...o });

const tree = (...nodes: TreeNode[]): TreeState => ({ ready: true, freshness: "current", error: undefined, daemons: [], roots: [], more: 0, nodes: new Map(nodes.map((n) => [n.id, n])), reaped: new Map() });

describe("which forms the page reads", () => {
  it("is the live role rows of @arias, as form ids", () => {
    const ids = enumerateForms(tree(node({ id: "a1" }), node({ id: "@r1", kind: "role", roleName: "A" }), node({ id: "r2", kind: "role", roleName: "B" }), node({ id: "@r3", kind: "role", roleName: "C", status: "retired" })));
    expect(ids).toEqual(["@r1", "@r2"]);
  });

  it("is empty with no tree", () => {
    expect(enumerateForms(null)).toEqual([]);
  });
});

describe("the interim list", () => {
  it("adds the listed forms once each, after the rows", () => {
    const ids = enumerateForms(tree(node({ id: "@r1", kind: "role", roleName: "King" })), ["@r1", "@aaaaaaaa", "aaaaaaaa", "@bbbbbbbb"]);
    expect(ids).toEqual(["@r1", "@aaaaaaaa", "@bbbbbbbb"]);
  });

  it("is the full ids of chartered forms", () => {
    expect(INTERIM_FORMS.length).toBeGreaterThan(10);
    for (const id of INTERIM_FORMS) expect(id).toMatch(/^@[0-9a-f]{8,32}$/);
    expect(new Set(INTERIM_FORMS).size).toBe(INTERIM_FORMS.length);
  });
});
