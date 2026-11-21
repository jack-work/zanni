import { describe, expect, it } from "vitest";
import { AriaClient, type AriaSnapshot } from "figaro-forms/aria";
import { nodi, type TurnModel } from "zanni-react";
import { mock, type MockCore } from "./mock";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(fn: () => boolean, ms = 8000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return;
    await wait(10);
  }
  throw new Error("timed out waiting: " + fn);
}

const clientFor = (core: MockCore) => new AriaClient({ dial: core.dial, retryMinMs: 20, retryMaxMs: 60, pageBytes: 3000 });

function turnsOf(snap: AriaSnapshot): TurnModel[] {
  const ends: Record<number, { reason?: string }> = {};
  for (const e of snap.ends) if (e.done && !e.replayed) ends[e.turn] = e.done;
  return nodi.model(snap.view, ends);
}

const last = (snap: AriaSnapshot) => turnsOf(snap).slice(-1)[0]!;

describe("the stream the client draws from", () => {
  it("pages the tail back through older turns in order with no duplicates", async () => {
    const core = mock.create({ step: 1 });
    const c = clientFor(core);
    const st = c.attach(core.ids.main);
    await st.ready();
    let snap = st.snapshot();
    const first = turnsOf(snap);
    expect(first.length).toBeGreaterThanOrEqual(1);
    expect(first.length).toBeLessThan(26);
    expect(first[first.length - 1]!.turn).toBe(26);
    expect(snap.olderAvailable).toBe(true);
    let pages = 0;
    while (await st.loadOlder()) pages++;
    snap = st.snapshot();
    expect(pages).toBeGreaterThanOrEqual(3);
    expect(turnsOf(snap).map((t) => t.turn)).toEqual(Array.from({ length: 26 }, (_, i) => i + 1));
    expect(snap.olderAvailable).toBe(false);
    c.close();
  });

  it("carries an unknown node in history into the view model", async () => {
    const core = mock.create({ step: 1 });
    const c = clientFor(core);
    const st = c.attach(core.ids.main);
    await st.ready();
    while (await st.loadOlder());
    const u = turnsOf(st.snapshot()).find((t) => t.turn === 6)!.items.find((i) => i.kind === "unknown");
    expect(u).toBeTruthy();
    expect(u!.kind === "unknown" && u!.type).toBe("sparkle");
    c.close();
  });

  it("loses nothing and repeats nothing when the door drops in the middle of a turn", async () => {
    const core = mock.create({ step: 4 });
    const c = clientFor(core);
    const st = c.attach(core.ids.main);
    await st.ready();
    await st.qua("please run the tests [drop]");
    await until(() => {
      const l = turnsOf(st.snapshot()).slice(-1)[0];
      return !!l && l.turn === 27 && !l.open && l.items.length === 4;
    });
    expect(core.dropped).toBeGreaterThanOrEqual(1);
    const fresh = clientFor(core);
    const other = fresh.attach(core.ids.main);
    await other.ready();
    const mine = turnsOf(st.snapshot()).find((t) => t.turn === 27)!;
    const theirs = turnsOf(other.snapshot()).find((t) => t.turn === 27)!;
    expect(mine.items).toEqual(theirs.items);
    expect(mine.items.map((i) => i.kind)).toEqual(["thinking", "prose", "tool", "prose"]);
    expect(mine.items.every((i) => i.settled)).toBe(true);
    c.close();
    fresh.close();
  });

  it("folds a message sent while a turn runs in as steering", async () => {
    const core = mock.create({ step: 4 });
    const c = clientFor(core);
    const st = c.attach(core.ids.main);
    await st.ready();
    await st.qua("run the build");
    await wait(30);
    const r = await st.qua("also mind the dark theme");
    expect(r.active).toBe(true);
    await until(() => !core.running(core.ids.main));
    await until(() => !last(st.snapshot()).open);
    expect(last(st.snapshot()).items.some((i) => i.kind === "steering" && i.text === "also mind the dark theme")).toBe(true);
    c.close();
  });

  it("keeps the error a failed turn ends in", async () => {
    const core = mock.create({ step: 2 });
    const c = clientFor(core);
    const st = c.attach(core.ids.main);
    await st.ready();
    await st.qua("[error] now");
    await until(() => !!turnsOf(st.snapshot()).slice(-1)[0]?.end);
    const t = last(st.snapshot());
    expect(t.end!.kind).toBe("error");
    expect(t.end!.text).toMatch(/refused on purpose/);
    c.close();
  });

  it("says nothing for a replayed end and names a live interrupt", async () => {
    const core = mock.create({ step: 30 });
    const c = clientFor(core);
    const st = c.attach(core.ids.main);
    await st.ready();
    expect(st.snapshot().ends.every((e) => !e.done)).toBe(true);
    await st.qua("run a long thing");
    await wait(60);
    await st.interrupt({ queue: "keep" });
    await until(() => !!turnsOf(st.snapshot()).slice(-1)[0]?.end);
    expect(last(st.snapshot()).end).toEqual({ kind: "end", text: "interrupted" });
    c.close();
  });
});
