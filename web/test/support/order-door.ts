import { readFileSync } from "node:fs";
import { createStore } from "jotai";
import { AriaClient } from "figaro-forms/aria";
import { entriesOf } from "../../src/order/queue";
import { graphOf, type Graph } from "../../src/order/graph";
import { ariaName } from "../../src/order/roles";
import { interimFormsAtom, orderClientAtom, readsAtom, treeStateAtom, viewAtom } from "../../src/order/state";
import { mock } from "../mock";

export interface Role {
  id: string;
  name: string;
  target: string;
  form: { queue?: Record<string, Record<string, unknown>> } & Record<string, unknown>;
}

export const fixture = JSON.parse(readFileSync("test/fixtures/order-queues.json", "utf8")) as { roles: Role[]; topology: Record<string, string> };

export const NOW = Date.parse("2026-11-25T20:30:00Z");

async function until<T>(read: () => T | undefined): Promise<T> {
  for (let i = 0; i < 300; i++) {
    const v = read();
    if (v !== undefined) return v;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("never arrived");
}

export async function fixtureGraph(): Promise<Graph> {
  const core = (mock as unknown as { create(o: object): any }).create({ step: 1, roles: fixture.roles, topology: fixture.topology });
  const client = new AriaClient({ dial: core.dial, pageBytes: 24000, retryMinMs: 20, retryMaxMs: 40 });
  const store = createStore();
  store.set(orderClientAtom, client);
  store.set(interimFormsAtom, []);
  const stops = [store.sub(viewAtom, () => {}), store.sub(readsAtom, () => {})];
  const view = await until(() => {
    const v = store.get(viewAtom);
    return v.kind === "ready" ? v : undefined;
  });
  await until(() => (store.get(readsAtom).every((r) => r.form.ready || r.form.refusal || r.form.phase === "gone") ? true : undefined));
  const entries = new Map(store.get(readsAtom).flatMap((r) => (r.queue ? [[r.id.replace(/^@/, ""), entriesOf(r.form.root)] as const] : [])));
  const tree = store.get(treeStateAtom);
  const graph = graphOf({ topology: view.topology, atlas: view.atlas, entries, nameOf: (aria) => ariaName(tree, aria), now: NOW });
  for (const stop of stops) stop();
  client.close();
  return graph;
}
