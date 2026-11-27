import { describe, expect, it } from "vitest";
import { AriaClient, type AriaClientOptions, type AriaSnapshot } from "figaro-forms/aria";
import type { Dial } from "figaro-forms";
import { nodi, type TurnModel } from "zanni-react";
import { CATCH_UP_PAGES, TailClient, releaseBefore, runTop } from "zanni-react/jotai";
import { mock, type MockCore } from "./mock";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(fn: () => boolean, ms = 12000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return;
    await wait(10);
  }
  throw new Error("timed out waiting: " + fn);
}

function turnsOf(snap: AriaSnapshot): TurnModel[] {
  const ends: Record<number, { reason?: string }> = {};
  for (const e of snap.ends) if (e.done && !e.replayed) ends[e.turn] = e.done;
  return nodi.model(snap.view, ends);
}

const numbers = (snap: AriaSnapshot) => turnsOf(snap).map((t) => t.turn);

function gate(core: MockCore) {
  let held: Promise<void> | null = null;
  let open: () => void = () => {};
  const dial: Dial = (events) => (held ?? Promise.resolve()).then(() => core.dial(events));
  return {
    dial,
    shut() {
      held = new Promise<void>((r) => (open = r));
    },
    release() {
      held = null;
      open();
    },
  };
}

async function accrue(core: MockCore, turns: number): Promise<void> {
  const other = new AriaClient({ dial: core.dial, pageBytes: 3000 });
  const st = other.attach(core.ids.main);
  await st.ready();
  for (let i = 0; i < turns; i++) {
    const before = core.calls.filter((c) => c.method === "figaro.qua").length;
    await st.qua("run the build " + i);
    await until(() => !core.running(core.ids.main) && core.calls.filter((c) => c.method === "figaro.qua").length > before);
  }
  other.close();
}

const reads = (core: MockCore, since: number) => core.calls.slice(since).filter((c) => c.method === "figaro.read").map((c) => c.params as { at?: unknown; backward?: boolean });

async function away(make: (o: AriaClientOptions) => AriaClient, behind: number) {
  const core = mock.create({ step: 1, pageBytes: 3000 });
  const g = gate(core);
  const c = make({ dial: g.dial, retryMinMs: 20, retryMaxMs: 60, pageBytes: 3000 });
  const st = c.attach(core.ids.main);
  await st.ready();
  g.shut();
  core.drop();
  await until(() => st.state === "offline");
  await accrue(core, behind);
  const mark = core.calls.length;
  g.release();
  await until(() => st.state === "live");
  await wait(50);
  return { core, c, st, mark };
}

describe("TailClient", () => {
  it("reads a short gap forward and keeps the held turns contiguous", async () => {
    const { core, c, st, mark } = await away((o) => new TailClient(o), 1);
    expect(reads(core, mark).every((r) => !r.backward)).toBe(true);
    const held = numbers(st.snapshot());
    expect(held[held.length - 1]).toBe(27);
    expect(runTop(st)).toBeUndefined();
    c.close();
  });

  it("stops paging forward after CATCH_UP_PAGES and reads the tail, however far behind it fell", async () => {
    const { core, c, st, mark } = await away((o) => new TailClient(o), 14);
    const seen = reads(core, mark);
    const forward = seen.filter((r) => r.at !== undefined && !r.backward);
    expect(forward.length).toBeLessThanOrEqual(CATCH_UP_PAGES);
    expect(seen.some((r) => r.backward && r.at === undefined)).toBe(true);
    const turns = numbers(st.snapshot());
    expect(turns[turns.length - 1]).toBe(40);
    const top = runTop(st);
    expect(top).toBeGreaterThan(turns[0]!);
    expect(turns.filter((n) => n >= top!)).toEqual(Array.from({ length: 41 - top! }, (_, i) => top! + i));
    c.close();
  });

  it("is what a plain client is not: the plain client reads every page", async () => {
    const { core, c, st, mark } = await away((o) => new AriaClient(o), 14);
    const forward = reads(core, mark).filter((r) => r.at !== undefined && !r.backward);
    expect(forward.length).toBeGreaterThan(CATCH_UP_PAGES);
    expect(numbers(st.snapshot()).at(-1)).toBe(40);
    expect(runTop(st)).toBeUndefined();
    c.close();
  });

  it("releases what lies above the hole, keeps older turns on demand, and joins up again", async () => {
    const { c, st } = await away((o) => new TailClient(o), 14);
    const top = runTop(st)!;
    releaseBefore(st, top);
    await until(() => numbers(st.snapshot())[0] === top);
    expect(runTop(st)).toBeUndefined();
    expect(st.snapshot().olderAvailable).toBe(true);
    expect(await st.loadOlder()).toBe(true);
    const after = numbers(st.snapshot());
    expect(after[0]).toBeLessThan(top);
    expect(after.every((n, i) => i === 0 || n === after[i - 1]! + 1)).toBe(true);
    c.close();
  });
});
