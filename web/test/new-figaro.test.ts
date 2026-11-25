import { createStore } from "jotai";
import { afterEach, describe, expect, it } from "vitest";
import { bootAtom, landAtom, mintFigaroAtom } from "zanni-react/jotai";
import { mockDoor, type MockCore } from "./mock";
import type { AriaClient } from "figaro-forms/aria";

let core: MockCore;
let client: AriaClient;

const attempts: string[] = [];

function door(refuse?: { method: string; message: string }, landing = false) {
  attempts.length = 0;
  ({ core, client } = mockDoor(1, 3000, ["default"]));
  if (refuse) {
    const call = client.connection.call.bind(client.connection);
    (client.connection as { call: unknown }).call = (method: string, params: unknown) => (method === refuse.method ? (attempts.push(method), Promise.reject(new Error(refuse.message))) : call(method, params as never));
  }
  const store = createStore();
  store.set(bootAtom, { stores: { home: client }, store: "home", audioUrl: "audio", sttUrl: "stt", mark: "", landing });
  return store;
}

const created = () => core.calls.filter((c) => c.method === "figaro.create");

afterEach(() => {
  client?.close();
  window.location.hash = "";
});

describe("making a figaro from the sheet", () => {
  it("attends the figaro it made even when its first message fails, and says so", async () => {
    const store = door({ method: "figaro.qua", message: "gateway: HTTP 500" });
    window.location.hash = "#/";
    const done = await store.set(mintFigaroAtom, { outfits: "", text: "hello" });
    expect(done.ok).toBe(false);
    expect(!done.ok && done.why).toMatch(/^Created [0-9a-f]{8}; first message failed: gateway: HTTP 500$/);
    expect(window.location.hash).toMatch(/^#\/home\/[0-9a-f]{32}$/);
  });

  it("goes nowhere and says not created when the create itself fails", async () => {
    const store = door({ method: "figaro.create", message: "create: outfit x is not declared" });
    window.location.hash = "#/";
    const done = await store.set(mintFigaroAtom, { outfits: "x", text: "hello" });
    expect(!done.ok && done.why).toBe("Not created: create: outfit x is not declared");
    expect(window.location.hash).toBe("#/");
  });
});

describe("the landing", () => {
  it("creates nothing when the route is no longer the bare root by the time the link is live", async () => {
    const store = door(undefined, true);
    window.location.hash = "#/home/" + "c0ffee01".repeat(4);
    await store.set(landAtom);
    expect(created()).toEqual([]);
  });

  it("does not retry after an error that is not the outfit refusal", async () => {
    const store = door({ method: "figaro.create", message: "timeout" }, true);
    window.location.hash = "";
    await store.set(landAtom);
    expect(attempts).toEqual(["figaro.create"]);
    expect(window.location.hash).toBe("");
  });
});
