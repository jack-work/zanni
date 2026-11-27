import type { TreeNode, TreeState } from "figaro-forms/aria";
import { describe, expect, it } from "vitest";
import { enumerateForms } from "../src/order/enumerate";

const node = (o: Partial<TreeNode> & { id: string }): TreeNode => ({ kind: "aria", label: o.id, roleName: undefined, target: undefined, handle: undefined, mantra: undefined, parent: undefined, children: [], daemon: "d", state: "idle", status: "live", roles: [], cwd: undefined, activeAt: undefined, ctx: undefined, ctxLimit: undefined, reapsAt: undefined, bound: false, ...o });

const tree = (...nodes: TreeNode[]): TreeState => ({ ready: true, freshness: "current", error: undefined, daemons: [], roots: [], more: 0, nodes: new Map(nodes.map((n) => [n.id, n])), reaped: new Map() });

describe("which forms the page reads", () => {
  it("is the live role rows of @arias, as form ids", () => {
    const ids = enumerateForms(tree(node({ id: "a1" }), node({ id: "@r1", kind: "role", roleName: "A" }), node({ id: "r2", kind: "role", roleName: "B" }), node({ id: "@r3", kind: "role", roleName: "C", status: "retired" })));
    expect(ids).toEqual(["@r1", "@r2"]);
  });

  it("keeps a queue form and a vacant seat, which carry no target", () => {
    const ids = enumerateForms(tree(node({ id: "@q1", kind: "role", roleName: "Widget Work", target: undefined }), node({ id: "@s1", kind: "role", roleName: "Vacant Lead", target: undefined }), node({ id: "@r1", kind: "role", roleName: "King", target: "c0ffee01" })));
    expect(ids).toEqual(["@r1", "@s1", "@q1"]);
  });

  it("is empty with no tree", () => {
    expect(enumerateForms(null)).toEqual([]);
  });
});
