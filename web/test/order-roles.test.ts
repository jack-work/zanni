import type { TreeNode, TreeState } from "figaro-forms/aria";
import { describe, expect, it } from "vitest";
import { ariaName, rolesOf, shortId } from "../src/order/roles";

const node = (o: Partial<TreeNode> & { id: string }): TreeNode => ({ kind: "aria", label: o.id, roleName: undefined, target: undefined, handle: undefined, mantra: undefined, parent: undefined, children: [], daemon: "d", state: "idle", status: "live", roles: [], cwd: undefined, activeAt: undefined, ctx: undefined, ctxLimit: undefined, reapsAt: undefined, bound: false, ...o });

const tree = (...nodes: TreeNode[]): TreeState => ({ ready: true, freshness: "current", error: undefined, daemons: [], roots: [], more: 0, nodes: new Map(nodes.map((n) => [n.id, n])), reaped: new Map() });

describe("roles from the tree", () => {
  it("lists live role rows by name with the holder's handle", () => {
    const rows = rolesOf(
      tree(
        node({ id: "aria-1", handle: "sunny-owl" }),
        node({ id: "@r2", kind: "role", roleName: "Zebra Lead", target: "aria-1" }),
        node({ id: "@r1", kind: "role", roleName: "Alpha Lead", target: "aria-1" }),
        node({ id: "@r3", kind: "role", roleName: "Retired Lead", status: "retired" }),
      ),
    );
    expect(rows.map((r) => [r.name, r.holder?.name])).toEqual([["Alpha Lead", "sunny-owl"], ["Zebra Lead", "sunny-owl"]]);
  });

  it("marks a role with no holder vacant, and a holder the tree cannot see by its short id", () => {
    const rows = rolesOf(tree(node({ id: "@r1", kind: "role", roleName: "A", target: undefined }), node({ id: "@r2", kind: "role", roleName: "B", target: "0123456789abcdef" })));
    expect(rows[0]!.holder).toBeUndefined();
    expect(rows[1]!.holder).toEqual({ id: "0123456789abcdef", name: "01234567", known: false });
  });

  it("names an aria by handle, else the role it holds, else short id, and never by its mantra", () => {
    const t = tree(
      node({ id: "a1", handle: "h", mantra: "private task title" }),
      node({ id: "a2", mantra: "private task title" }),
      node({ id: "a3" }),
      node({ id: "@r1", kind: "role", roleName: "Zebra Lead", target: "a2" }),
      node({ id: "@r2", kind: "role", roleName: "Alpha Lead", target: "a2" }),
    );
    expect([ariaName(t, "a1"), ariaName(t, "a2"), ariaName(t, "a3"), ariaName(t, "ffffffffffff"), ariaName(null, "@role123456")]).toEqual(["h", "Alpha Lead", "a3", "ffffffff", "role1234"]);
    expect(shortId("@abcdef012345")).toBe("abcdef01");
  });
});
