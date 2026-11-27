import { createStore } from "jotai";
import { afterEach, describe, expect, it } from "vitest";
import { AriaClient } from "figaro-forms/aria";
import { connectionLinkAtom } from "zanni-react/jotai";
import { mock } from "./mock";

let client: AriaClient;

afterEach(() => client?.close());

function gatedDoor() {
  const core = mock.create({ step: 1, pageBytes: 3000 });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  client = new AriaClient({ dial: async (events) => (await gate, core.dial(events)), pageBytes: 24000 });
  const opened = new Promise<void>((resolve) => {
    const off = client.connection.onState((s) => s === "open" && (off(), resolve()));
  });
  return { release, opened };
}

describe("the connection link", () => {
  it("reads live when the socket opened after the atom was first read and before it was mounted", async () => {
    const { release, opened } = gatedDoor();
    const store = createStore();
    const link = connectionLinkAtom(client);
    expect(store.get(link)).toBe("connecting");
    release();
    await opened;
    const off = store.sub(link, () => {});
    expect(store.get(link)).toBe("live");
    off();
  });

  it("follows the socket once mounted", async () => {
    const { release, opened } = gatedDoor();
    const store = createStore();
    const link = connectionLinkAtom(client);
    const seen: string[] = [];
    const off = store.sub(link, () => seen.push(store.get(link)));
    release();
    await opened;
    expect(store.get(link)).toBe("live");
    expect(seen).toContain("live");
    off();
  });
});
