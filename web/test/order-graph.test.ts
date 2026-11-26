import { beforeAll, describe, expect, it } from "vitest";
import { cellDepth, collapse, forksId, nodeAt, type Graph, type GraphEdge } from "../src/order/graph";
import { fixtureGraph } from "./support/order-door";

const aria = (hex: string): string => ("c0ffee" + hex).repeat(4);
const CROWN = "@c0de0001c0de0001c0de0001c0de0001";

let graph: Graph;
beforeAll(async () => {
  graph = await fixtureGraph();
});

const edges = (kind: string, g: Graph = graph): string[] => g.edges.filter((e) => e.kind === kind).map((e) => label(g, e.a) + " > " + label(g, e.b));
const label = (g: Graph, id: string): string => {
  const n = g.nodes.find((x) => x.id === id);
  return n ? (n.kind === "aria" ? "aria " : "") + n.label : id;
};
const edge = (kind: string, a: string, b: string): GraphEdge | undefined => graph.edges.find((e) => e.kind === kind && e.a === a && e.b === b);

describe("the graph of one central command", () => {
  it("has a role form node for every chartered seat, held or vacant", () => {
    const roles = graph.nodes.filter((n) => n.kind === "role").map((n) => n.label);
    expect(roles.sort()).toEqual(["@Backend Lead", "@Bridge Knight", "@Crown", "@Edge Engineer", "@Frontier Knight", "@Frontier Strategist", "@Lost Lead", "@Widget Engineer"]);
  });

  it("targets each held role form at its holder's aria and leaves vacant ones untargeted", () => {
    expect(edges("target").sort()).toEqual(["@Bridge Knight > aria Bridge Knight", "@Crown > aria Crown", "@Edge Engineer > aria Edge Engineer", "@Frontier Knight > aria Frontier Knight", "@Frontier Strategist > aria Frontier Strategist", "@Widget Engineer > aria Widget Engineer"]);
    for (const vacant of ["@c0de0004", "@c0de0005"]) expect(graph.edges.filter((e) => e.kind === "target" && e.a === vacant)).toEqual([]);
  });

  it("draws arias under their nearest chartered ancestor in the drawn tree", () => {
    expect(edges("under").sort()).toEqual(["aria Crown > aria Edge Engineer", "aria Crown > aria Frontier Knight", "aria Frontier Knight > aria Frontier Strategist", "aria Frontier Knight > aria Widget Engineer", "aria Frontier Knight > forks"]);
  });

  it("draws role forms under the form their reports-to names, and queue forms under their role", () => {
    expect(edges("formunder").sort()).toEqual([
      "@Bridge Knight > @Backend Lead",
      "@Bridge Knight > Backend Handoff",
      "@Crown > @Bridge Knight",
      "@Crown > @Edge Engineer",
      "@Crown > @Frontier Knight",
      "@Frontier Knight > @Frontier Strategist",
      "@Frontier Knight > Deploy Queue",
      "@Frontier Strategist > @Lost Lead",
      "@Frontier Strategist > @Widget Engineer",
      "@Frontier Strategist > Frontier Handoff",
      "@Widget Engineer > Widget Work",
    ]);
  });

  it("points a study from the studied queue form to the aria that studies it, and drops one it cannot find", () => {
    expect(edges("study").sort()).toEqual(["Deploy Queue > aria Edge Engineer", "Frontier Handoff > aria Frontier Knight", "Review Queue > aria Crown"]);
  });

  it("flags a seat drawn under someone other than its reports-to, and keeps its form where it declares", () => {
    const widget = nodeAt(graph, "@7e1a0001")!;
    expect(widget.tone).toBe("mismatch");
    expect(widget.mismatch?.declaredName).toBe("Frontier Strategist");
    expect(edge("formunder", "@c0de0007", "@7e1a0001")).toBeDefined();
    expect(edge("under", aria("02"), aria("05"))).toBeDefined();
  });

  it("counts a claim by the claimant, with the lapsed ones named, and ignores finished work", () => {
    expect(edge("lease", "@c0de0101", aria("01"))?.label).toBe("claimed 1");
    expect(edge("lease", "@c0de0101", aria("02"))?.label).toBe("claimed 1, 1 lapsed");
    expect(graph.edges.filter((e) => e.kind === "lease").every((e) => e.count > 0)).toBe(true);
  });

  it("gathers a claim by an unchartered fork onto the forks node under its nearest seat", () => {
    expect(edge("lease", "@c0de0104", forksId(aria("02")))?.count).toBe(1);
    expect(nodeAt(graph, forksId(aria("02")))?.kind).toBe("group");
  });

  it("draws who posts into each queue form, finding a poster by role when its aria is not drawn", () => {
    expect(edge("flow", aria("02"), "@c0de0101")?.label).toBe("posts 5");
    expect(edge("flow", aria("01"), "@c0de0104")?.label).toBe("posts 1");
  });

  it("lists vacant seats and a queue form under an unminted seat as their own nodes, hung by declaration", () => {
    const cells = new Map(graph.cells.map((c) => [c.id, c]));
    expect(nodeAt(graph, "@c0de0004")?.tone).toBe("vacant");
    expect(cells.get("@c0de0004")?.parent).toBe(aria("0a"));
    expect(cells.get("@c0de0005")?.parent).toBe(aria("06"));
    expect(nodeAt(graph, "@c0de0103")?.tone).toBe("stray");
    expect(cells.get("@c0de0103")?.parent).toBeUndefined();
  });

  it("finds a node by form id, short or long, and by aria id", () => {
    expect(nodeAt(graph, "c0de0001")).toBeUndefined();
    expect(nodeAt(graph, CROWN)?.label).toBe("@Crown");
    expect(nodeAt(graph, aria("01"))?.label).toBe("Crown");
    expect(nodeAt(graph, "@nothing")).toBeUndefined();
  });
});

describe("the command view", () => {
  it("keeps the central command and the seats drawn directly under it, one node each", () => {
    const view = collapse(graph);
    expect(view.nodes.map((n) => n.label).sort()).toEqual(["Bridge Knight", "Crown", "Edge Engineer", "Frontier Knight", "Review Queue"]);
  });

  it("folds deeper seats into their ancestor and counts them", () => {
    const view = collapse(graph);
    expect(nodeAt(view, aria("02"))?.sub).toContain("3 seats below");
  });

  it("carries only the relations between the kept nodes: under, study, lease and flow", () => {
    const view = collapse(graph);
    expect(new Set(view.edges.map((e) => e.kind))).toEqual(new Set(["under", "study", "lease", "flow"]));
    expect(view.edges.every((e) => e.a !== e.b)).toBe(true);
    const flow = view.edges.find((e) => e.kind === "flow" && e.a === aria("02") && e.b === aria("02"));
    expect(flow).toBeUndefined();
  });

  it("merges the relations a folded seat had into edges whose counts add up", () => {
    const view = collapse(graph);
    const levels = cellDepth(graph.cells);
    const up = new Map(graph.cells.map((c) => [c.id, c.parent]));
    const keep = (id: string): string => ((levels.get(id) ?? 0) > 1 ? keep(up.get(id)!) : id);
    const home = new Map(graph.nodes.map((n) => [n.id, keep(n.cell)]));
    for (const kind of ["lease", "flow"] as const) {
      const folded = graph.edges.filter((e) => e.kind === kind && home.get(e.a) !== home.get(e.b)).reduce((sum, e) => sum + e.count, 0);
      const kept = view.edges.filter((e) => e.kind === kind).reduce((sum, e) => sum + e.count, 0);
      expect(kept).toBe(folded);
    }
  });
});

it("is a pure function of its input", async () => {
  const again = await fixtureGraph();
  expect(again.edges).toEqual(graph.edges);
  expect(again.nodes.map((n) => n.id)).toEqual(graph.nodes.map((n) => n.id));
});
