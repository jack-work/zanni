import { readFileSync } from "node:fs";
import { createStore } from "jotai";
import { AriaClient } from "figaro-forms/aria";
import { boundFormAtom, treeAtom } from "figaro-forms/aria/jotai";
import { describe, expect, it } from "vitest";
import { mock } from "./mock";

const fixture = JSON.parse(readFileSync("test/fixtures/order-queues.json", "utf8")) as { roles: { id: string; name: string; target: string; form: { queue?: Record<string, unknown> } }[] };

function door() {
  const core = (mock as unknown as { create(o: object): any }).create({ step: 1, roles: fixture.roles });
  const client = new AriaClient({ dial: core.dial, pageBytes: 24000, retryMinMs: 20, retryMaxMs: 40 });
  const store = createStore();
  return { core, client, store };
}

async function until<T>(read: () => T | undefined): Promise<T> {
  for (let i = 0; i < 200; i++) {
    const v = read();
    if (v !== undefined) return v;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("never arrived");
}

describe("the fake door's role forms", () => {
  it("lists each role in the tree with its name and holder", async () => {
    const { client, store } = door();
    const stop = store.sub(treeAtom(client), () => {});
    const roles = await until(() => {
      const found = [...store.get(treeAtom(client)).nodes.values()].filter((n) => n.kind === "role" && n.id.startsWith("@7e1a"));
      return found.length === fixture.roles.length ? found : undefined;
    });
    expect(roles.map((r) => r.roleName).sort()).toEqual(fixture.roles.map((r) => r.name).sort());
    expect(roles.find((r) => r.roleName === "Widget Engineer")?.target).toBe(fixture.roles[0]!.target);
    stop();
    client.close();
  });

  it("serves a role's queue and pushes a change to a studier", async () => {
    const { core, client, store } = door();
    const role = fixture.roles[0]!;
    const stop = store.sub(boundFormAtom(client, role.id), () => {});
    const first = await until(() => (store.get(boundFormAtom(client, role.id)).ready ? store.get(boundFormAtom(client, role.id)).root : undefined));
    expect(Object.keys(first.queue as object)).toEqual(Object.keys(role.form.queue!));
    core.setRole(role.id, { ...role.form, queue: {} });
    await until(() => (Object.keys((store.get(boundFormAtom(client, role.id)).root.queue as object) ?? {}).length === 0 ? true : undefined));
    stop();
    client.close();
  });
});
