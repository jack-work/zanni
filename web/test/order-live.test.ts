import { existsSync, readFileSync } from "node:fs";
import type { JsonObject } from "figaro-forms";
import { describe, expect, it } from "vitest";
import { foldTree } from "../node_modules/figaro-forms/dist/aria/tree.js";
import { bare, formId } from "../src/order/charter";
import { canonFor, readsOf, viewOf, type FormRead, type ReadyView } from "../src/order/derive";
import { collapse, graphOf } from "../src/order/graph";
import { layoutOf } from "../src/order/graph-layout";
import { entriesOf } from "../src/order/queue";
import { ariaName } from "../src/order/roles";
import { nodeCrossings, overlaps, strayEnds } from "./support/layout-check";

const path = process.env.ORDER_LIVE_SNAPSHOT ?? "";

interface Snapshot {
  taken: string;
  arias: JsonObject;
  topology: JsonObject;
  forms: Record<string, JsonObject>;
}

const ready = (root: JsonObject): FormRead => ({ root, ready: true, refusal: undefined, phase: "ready", freshness: "current" });
const missing: FormRead = { root: {}, ready: false, refusal: undefined, phase: "failed", freshness: "stale" };

function derived() {
  const snap = JSON.parse(readFileSync(path, "utf8")) as Snapshot;
  const folded = foldTree({ live: { self: true, form: "@arias" } }, new Map([["live", { root: snap.arias, phase: "ready" as const, error: undefined }]]), undefined, Date.now());
  const tree = { ready: true, freshness: "current" as const, error: undefined, ...folded };
  const canon = canonFor(tree);
  const formOf = (id: string): FormRead => {
    const key = Object.keys(snap.forms).find((k) => bare(canon(k)) === bare(canon(id)));
    return key ? ready(snap.forms[key]!) : missing;
  };
  const reads = readsOf({ tree, canon, asked: undefined, formOf });
  const view = viewOf({ tree, canon, reads, topo: ready(snap.topology), asked: undefined });
  const chartered = Object.entries(snap.forms).filter(([, f]) => typeof f.chartered === "object" && f.chartered !== null);
  return { snap, tree, canon, reads, view, chartered };
}

const rootOf = (f: JsonObject, canon: (id: string) => string): string => formId(canon(String((f.chartered as JsonObject).root ?? "")));

describe.skipIf(!path || !existsSync(path))("the live forms through the page's derivation", () => {
  it("reads every chartered form the daemon holds, from @arias alone", () => {
    const { chartered, reads, canon } = derived();
    expect(chartered.length).toBeGreaterThan(10);
    const read = reads.map((r) => bare(canon(r.id)));
    for (const [id] of chartered) expect(read).toContain(bare(canon(id)));
  });

  it("finds one central command and draws it", () => {
    expect(derived().view.kind).toBe("ready");
  });

  it("has a node for every chartered seat and every queue form of that command, and a seat is not dropped for being vacant", () => {
    const { snap, tree, canon, reads, view, chartered } = derived();
    if (view.kind !== "ready") throw new Error("no central command");
    const central = (view as ReadyView).central;
    const entries = new Map(reads.flatMap((r) => (r.queue ? [[bare(r.id), entriesOf(r.form.root)] as const] : [])));
    const graph = graphOf({ topology: view.topology, atlas: view.atlas, entries, nameOf: (aria) => ariaName(tree, aria), now: Date.now() });
    const ids = new Set(graph.nodes.map((n) => bare(n.id)));
    const mine = chartered.filter(([, f]) => rootOf(f, canon) === central);
    const roles = mine.filter(([, f]) => (f.chartered as JsonObject).kind !== "queue-form");
    const queues = mine.filter(([, f]) => (f.chartered as JsonObject).kind === "queue-form");
    expect(roles.length).toBeGreaterThan(5);
    expect(queues.length).toBeGreaterThan(2);
    const absent = [...roles, ...queues].filter(([id]) => !ids.has(bare(canon(id)))).map(([id, f]) => id + " " + String(f.name));
    expect(absent).toEqual([]);
    const held = roles.filter(([, f]) => tree.nodes.has(String(f["target-aria"] ?? "")));
    expect(held.length).toBeGreaterThan(5);
    for (const [, f] of held) expect(ids.has(String(f["target-aria"])), "holder of " + String(f.name)).toBe(true);
    for (const g of [graph, collapse(graph)]) {
      const layout = layoutOf(g);
      expect(nodeCrossings(layout)).toEqual([]);
      expect(overlaps(layout)).toEqual([]);
      expect(strayEnds(layout)).toEqual([]);
    }
    console.log(`live ${snap.taken}: central ${central}, ${roles.length} chartered seats (${held.length} held), ${queues.length} queue forms, ${graph.nodes.length} nodes, ${graph.edges.length} edges, all present`);
  });
});
