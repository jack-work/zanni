import { beforeAll, describe, expect, it } from "vitest";
import { collapse, cellDepth, type Cell, type Graph, type GraphEdge, type GraphNode, type NodeKind, EDGE_KINDS } from "../src/order/graph";
import { fitted, layoutOf, type Layout } from "../src/order/graph-layout";
import { fixtureGraph } from "./support/order-door";
import { nodeCrossings, overlaps, strayEnds } from "./support/layout-check";

let full: Graph;
beforeAll(async () => {
  full = await fixtureGraph();
});

function rules(layout: Layout): void {
  expect(nodeCrossings(layout)).toEqual([]);
  expect(overlaps(layout)).toEqual([]);
  expect(strayEnds(layout)).toEqual([]);
}

describe("the layout of the fixture graph", () => {
  it("routes no edge through a node it does not join, in the full view", () => {
    const layout = layoutOf(full);
    expect(layout.edges.length).toBe(full.edges.length);
    rules(layout);
  });

  it("routes no edge through a node it does not join, in the command view", () => {
    const layout = layoutOf(collapse(full));
    expect(layout.edges.length).toBeGreaterThan(3);
    rules(layout);
  });

  it("gives every node a box with its label and keeps the box inside the bounds", () => {
    const layout = layoutOf(full);
    for (const n of full.nodes) {
      const b = layout.boxes.get(n.id)!;
      expect(b, n.id).toBeDefined();
      expect(layout.text.get(n.id)!.label.length).toBeGreaterThan(0);
      expect(b.x).toBeGreaterThanOrEqual(layout.bounds.x);
      expect(b.x + b.w).toBeLessThanOrEqual(layout.bounds.x + layout.bounds.w);
      expect(b.y + b.h).toBeLessThanOrEqual(layout.bounds.y + layout.bounds.h);
    }
  });

  it("draws a role form above the aria that holds it, a queue form and the forks beside that aria, and a child seat below its parent", () => {
    const layout = layoutOf(full);
    const depth = cellDepth(full.cells);
    for (const n of full.nodes) {
      if (n.kind !== "role") continue;
      const holder = full.edges.find((e) => e.kind === "target" && e.a === n.id);
      if (holder) expect(layout.boxes.get(n.id)!.y).toBeLessThan(layout.boxes.get(holder.b)!.y);
    }
    for (const n of full.nodes.filter((x) => x.kind === "queue" || x.kind === "group")) {
      const holder = full.cells.find((c) => c.id === n.cell)?.aria;
      if (holder) expect(layout.boxes.get(n.id)!.y + layout.boxes.get(n.id)!.h / 2).toBeCloseTo(layout.boxes.get(holder)!.y + layout.boxes.get(holder)!.h / 2, 5);
    }
    for (const e of full.edges.filter((x) => x.kind === "under" && !x.b.startsWith("forks:"))) expect(layout.boxes.get(e.b)!.y).toBeGreaterThan(layout.boxes.get(e.a)!.y);
    for (const c of full.cells) if (c.parent !== undefined) expect(depth.get(c.id)).toBe(depth.get(c.parent)! + 1);
  });

  it("is the same on every run", () => {
    expect(layoutOf(full).edges.map((e) => e.d)).toEqual(layoutOf(full).edges.map((e) => e.d));
  });

  it("puts each label on the edge it names", () => {
    const layout = layoutOf(full);
    for (const e of layout.edges) expect(Boolean(e.lp)).toBe(Boolean(e.label));
  });
});

describe("the checks themselves", () => {
  it("see an edge drawn through a node, a node drawn over a node, and an edge that leaves its nodes", () => {
    const layout = layoutOf(full);
    const [first, second] = [...layout.boxes];
    const through = { ...layout, edges: [{ ...layout.edges[0]!, a: "elsewhere", b: "else", d: "M" + (first![1].x + 10) + "," + (first![1].y + 10) + " C" + (first![1].x + 20) + "," + (first![1].y + 20) + " " + (first![1].x + 30) + "," + (first![1].y + 20) + " " + (first![1].x + 40) + "," + (first![1].y + 20) }] };
    expect(nodeCrossings(through).length).toBeGreaterThan(0);
    const stacked = { ...layout, boxes: new Map([...layout.boxes, [second![0], { ...first![1] }]]) };
    expect(overlaps(stacked).length).toBeGreaterThan(0);
    const loose = { ...layout, edges: [{ ...layout.edges[0]!, d: "M5000,5000 C5000,5000 5000,5000 5000,5000" }] };
    expect(strayEnds(loose).length).toBe(2);
  });
});

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function wildGraph(seed: number): Graph {
  const rnd = seeded(seed);
  const pick = (n: number): number => Math.floor(rnd() * n);
  const nodes: GraphNode[] = [];
  const cells: Cell[] = [];
  const count = 2 + pick(13);
  const node = (id: string, kind: NodeKind, cell: string): string => {
    nodes.push({ id, kind, label: "node " + "x".repeat(pick(22)), sub: "sub " + "y".repeat(pick(30)), about: "", cell, tone: "" });
    return id;
  };
  for (let i = 0; i < count; i++) {
    const id = "c" + i;
    const roles = Array.from({ length: pick(3) }, (_, k) => node("r" + i + "." + k, "role", id));
    const hasAria = roles.length === 0 || rnd() < 0.8;
    const aria = hasAria ? node("a" + i, "aria", id) : undefined;
    const queues = Array.from({ length: pick(3) }, (_, k) => node("q" + i + "." + k, "queue", id));
    const group = rnd() < 0.3 ? node("g" + i, "group", id) : undefined;
    cells.push({ id, parent: i > 0 && rnd() < 0.85 ? "c" + pick(i) : undefined, roles, aria, queues, group });
  }
  const edges: GraphEdge[] = [];
  const total = 10 + pick(70);
  for (let i = 0; i < total; i++) {
    const a = nodes[pick(nodes.length)]!;
    const b = nodes[pick(nodes.length)]!;
    if (a.id === b.id) continue;
    const kind = EDGE_KINDS[pick(EDGE_KINDS.length)]!;
    edges.push({ a: a.id, b: b.id, kind, label: rnd() < 0.3 ? "label " + i : "", count: 1, lapsed: 0 });
  }
  return { central: "c0", nodes, edges, cells };
}

describe("the layout of random graphs", () => {
  for (let seed = 1; seed <= 60; seed++) {
    it("seed " + seed + " has no edge through a node and no overlapping nodes", () => {
      rules(layoutOf(wildGraph(seed)));
    });
  }

  it("lays out an empty graph", () => {
    const layout = layoutOf({ central: "", nodes: [], edges: [], cells: [] });
    expect(layout.bounds.w).toBe(0);
    expect(layout.edges).toEqual([]);
  });

  it("fits a long label to its box", () => {
    const f = fitted({ id: "x", kind: "role", label: "@" + "Q".repeat(80), sub: "role form", about: "", cell: "x", tone: "" });
    expect(f.w).toBeLessThanOrEqual(224);
    expect(f.label.endsWith("…")).toBe(true);
  });
});
