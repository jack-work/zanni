import { describe, expect, it } from "vitest";
import type { TreeNode, TreeState } from "figaro-forms/aria";
import { REFUSED, topologyNodes } from "../../packages/react/src/jotai/lib/topology";

const node = (id: string, daemon: string): TreeNode => ({ id, daemon, label: id, handle: id, mantra: "", roles: [], children: [], parent: undefined } as unknown as TreeNode);

function twoNodes(): TreeState {
  const a = node("aria-a", "alpha");
  return {
    ready: true,
    freshness: "live",
    error: "figaro.follow: aria 9f1c0e2a-0000-4000-8000-000000000000/@arias not found",
    daemons: [
      { id: "alpha", self: true, form: "f", phase: "live", error: undefined, more: 0 },
      { id: "beta", self: false, form: "f", phase: "live", error: "figaro.follow: aria 9f1c0e2a-0000-4000-8000-000000000000/@arias not found", more: 0 },
    ],
    roots: ["aria-a"],
    more: 0,
    nodes: new Map([["aria-a", a]]),
    reaped: new Map(),
  } as unknown as TreeState;
}

describe("a troupe node that refuses the caller", () => {
  it("shows as unavailable while the other node's tree is untouched", () => {
    const rows = topologyNodes(twoNodes(), undefined, { troupe: {}, arias: {} });
    expect(rows.map((r) => r.id)).toEqual(["@node:alpha", "@node:beta"]);
    expect(rows[0]!.children![0]!.children!.map((c) => c.id)).toEqual(["aria-a"]);
    expect(rows[1]!.mantra).toBe(REFUSED);
    expect(rows[1]!.children).toEqual([]);
    expect(JSON.stringify(rows)).not.toMatch(/figaro\.follow|@arias not found|9f1c0e2a/);
  });
});

describe("a role row in the tree feed", () => {
  it("reads @name with its holder, and is vacant without one", () => {
    const holder = node("aria-a", "alpha");
    const role = { ...node("@frontend", "alpha"), kind: "role", roleName: "frontend", target: "aria-a", handle: "@frontend" } as unknown as TreeNode;
    const vacant = { ...node("@qa", "alpha"), kind: "role", roleName: "qa", target: undefined } as unknown as TreeNode;
    const state = { ...twoNodes(), roots: ["@frontend", "@qa", "aria-a"], nodes: new Map([["aria-a", holder], ["@frontend", role], ["@qa", vacant]]) } as unknown as TreeState;
    const rows = topologyNodes(state, undefined, { troupe: {}, arias: {} })[0]!.children![0]!.children!;
    expect(rows.map((r) => [r.label, r.role])).toEqual([["@frontend", "\u2192 aria-a"], ["@qa", "vacant"], ["aria-a", ""]]);
  });
});
