import { describe, expect, it, vi } from "vitest";
import { AriaClient, Transcript, type AriaClientOptions, type AriaSnapshot, type AriaStream, type Page, type ReadRequest } from "figaro-forms/aria";
import type { Dial } from "figaro-forms";
import { nodi, type TurnModel } from "zanni-react";
import { CATCH_UP_PAGES, EVICT_BATCH, KEEP_ABOVE, TailClient, cutOf, farCut, releaseBefore, runTop } from "zanni-react/jotai";
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
    const top = runTop(st)?.turn;
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
    await until(() => numbers(st.snapshot())[0] === top.turn);
    expect(runTop(st)).toBeUndefined();
    expect(st.snapshot().olderAvailable).toBe(true);
    expect(await st.loadOlder()).toBe(true);
    const after = numbers(st.snapshot());
    expect(after[0]).toBeLessThan(top.turn);
    expect(after.every((n, i) => i === 0 || n === after[i - 1]! + 1)).toBe(true);
    c.close();
  });
});

interface Shape {
  readonly turn: number;
  readonly sealed: boolean;
  readonly nodes: number;
}

function paged(shapes: readonly Shape[], per: number) {
  const node = (turn: number, i: number) => ({ type: "prose", markdown: "t" + turn + "n" + i, id: String(i) });
  const part = (t: Shape, from: number, to: number) => ({
    turn: t.turn,
    sealed: t.sealed,
    from,
    ...(from === 0 ? { inquiry: "q" + t.turn } : {}),
    nodes: Array.from({ length: to - from }, (_, i) => node(t.turn, from + i)),
    ...(t.sealed ? {} : { live: { from, v: to } }),
    ...(from > 0 ? { clipped_head: true } : {}),
    ...(to < t.nodes ? { clipped_tail: true } : {}),
  });
  const forward = (at: { turn: number; node: number }): Page => {
    const parts: unknown[] = [];
    let budget = per;
    let next: { turn: number; node: number } | undefined;
    for (const [k, t] of shapes.entries()) {
      if (t.turn < at.turn) continue;
      const from = t.turn === at.turn ? at.node : 0;
      if (from >= t.nodes) continue;
      const take = Math.min(budget, t.nodes - from);
      parts.push(part(t, from, from + take));
      budget -= take;
      if (from + take < t.nodes) next = { turn: t.turn, node: from + take };
      else if (budget === 0 && shapes[k + 1]) next = { turn: shapes[k + 1]!.turn, node: 0 };
      if (next) break;
    }
    return { parts, more: next ? { after: true } : {}, ...(next ? { next } : {}) } as Page;
  };
  const backward = (end?: { turn: number; node: number }): Page => {
    const parts: unknown[] = [];
    let budget = per;
    let more = false;
    for (let k = shapes.length - 1; k >= 0 && !more; k--) {
      const t = shapes[k]!;
      if (end && t.turn > end.turn) continue;
      const to = end && t.turn === end.turn ? end.node : t.nodes;
      if (to <= 0) continue;
      const take = Math.min(budget, to);
      parts.unshift(part(t, to - take, to));
      budget -= take;
      if (to - take > 0) more = true;
      else if (budget === 0 && k > 0) more = true;
      if (budget === 0) break;
    }
    return { parts, more: more ? { before: true } : {} } as Page;
  };
  return (req: ReadRequest): Page => (req.backward ? backward(req.at) : forward(req.at ?? { turn: 0, node: 0 }));
}

async function sleepThrough(shapes: (base: number) => Shape[], per: number) {
  const core = mock.create({ step: 1, pageBytes: 3000 });
  const g = gate(core);
  const c = new TailClient({ dial: g.dial, retryMinMs: 20, retryMaxMs: 60, pageBytes: 3000 });
  const st = c.attach(core.ids.main);
  await st.ready();
  const base = st.cursor;
  const serve = paged(shapes(base), per);
  const asked: ReadRequest[] = [];
  const spy = vi.spyOn(AriaClient.prototype, "read").mockImplementation(async (_aria, req = {}) => {
    asked.push(req as ReadRequest);
    return serve(req as ReadRequest);
  });
  g.shut();
  core.drop();
  await until(() => st.state === "offline");
  g.release();
  await until(() => st.state === "live");
  await wait(50);
  spy.mockRestore();
  return { c, st, asked, base };
}

describe("a long turn that straddles the pages of a catch up", () => {
  it("is read on to its end, not jumped into the middle of, so no node of it is left blank", async () => {
    const { c, st, asked, base } = await sleepThrough((b) => [{ turn: b, sealed: true, nodes: 1 }, { turn: b + 1, sealed: true, nodes: 1 }, { turn: b + 2, sealed: false, nodes: 18 }], 4);
    const view = st.transcript.view();
    const turn = [...view.closed, ...(view.open ? [view.open] : [])].filter((m) => m.turn === base + 2);
    const nodes = turn.flatMap((m) => m.nodes.map((n) => [m.from, n.type]));
    expect(nodes.map(([, type]) => type)).toEqual(Array.from({ length: 18 }, () => "prose"));
    expect(runTop(st)).toBeUndefined();
    expect(asked.some((r) => r.backward)).toBe(false);
    c.close();
  });

  it("still jumps to the tail once a page ends between two turns", async () => {
    const { c, st, asked, base } = await sleepThrough((b) => Array.from({ length: 40 }, (_, i) => ({ turn: b + i, sealed: i < 39, nodes: 1 })), 4);
    expect(asked.filter((r) => !r.backward).length).toBeLessThanOrEqual(CATCH_UP_PAGES);
    expect(asked.some((r) => r.backward && r.at === undefined)).toBe(true);
    expect(numbers(st.snapshot()).at(-1)).toBe(base + 39);
    c.close();
  });
});

function holding(pages: Page[]) {
  const transcript = new Transcript();
  for (const page of pages) transcript.apply(page, "quiet");
  return { transcript, ensure: async () => {} } as unknown as AriaStream;
}

const word = (id: number) => ({ type: "prose", markdown: "n" + id, id: String(id) });
const ranges = (s: AriaStream) => s.transcript.held().rangesHeld().map((r) => r.from.turn + ":" + r.from.node + ".." + r.to.turn + ":" + r.to.node);

describe("a hole inside one turn", () => {
  const straddle = () =>
    holding([
      { parts: [{ turn: 9, sealed: true, from: 0, inquiry: "q9", nodes: [word(0)] }, { turn: 10, sealed: true, from: 0, inquiry: "q10", nodes: [word(0), word(1), word(2)], clipped_tail: true }], more: { after: true }, next: { turn: 10, node: 3 } },
      { parts: [{ turn: 10, sealed: true, from: 7, nodes: [word(7), word(8)], clipped_head: true }, { turn: 11, sealed: true, from: 0, inquiry: "q11", nodes: [word(0)] }], more: { before: true } },
    ] as unknown as Page[]);

  it("is where the held run begins, so the head of that turn is released with the rest above it", () => {
    const s = straddle();
    expect(ranges(s)).toEqual(["9:0..10:2", "10:7..11:0"]);
    const top = runTop(s)!;
    expect(top).toEqual({ turn: 10, node: 7 });
    releaseBefore(s, top);
    expect(ranges(s)).toEqual(["10:7..11:0"]);
    expect(runTop(s)).toBeUndefined();
    expect(s.transcript.moreBefore()).toBe(true);
  });

  it("cuts at whichever of the run and the far window is later", () => {
    expect(cutOf(undefined, 0)).toBeUndefined();
    expect(cutOf(undefined, 30)).toEqual({ turn: 30, node: 0 });
    expect(cutOf({ turn: 10, node: 7 }, 0)).toEqual({ turn: 10, node: 7 });
    expect(cutOf({ turn: 10, node: 7 }, 10)).toEqual({ turn: 10, node: 7 });
    expect(cutOf({ turn: 10, node: 7 }, 11)).toEqual({ turn: 11, node: 0 });
    expect(cutOf({ turn: 40, node: 0 }, 30)).toEqual({ turn: 40, node: 0 });
  });
});

describe("what the view holds", () => {
  const run = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => ({ turn: from + i }));

  it("keeps KEEP_ABOVE turns above the window and releases only in batches", () => {
    const turns = run(1, 200);
    expect(farCut(turns, KEEP_ABOVE + EVICT_BATCH - 1)).toBe(0);
    expect(farCut(turns, KEEP_ABOVE + EVICT_BATCH)).toBe(EVICT_BATCH + 1);
    expect(farCut(turns, 150)).toBe(150 - KEEP_ABOVE + 1);
    expect(farCut(turns, 0)).toBe(0);
  });

  it("names the turn by number, not by place, when turns are missing", () => {
    const turns = [...run(1, 30), ...run(41, 90)];
    expect(farCut(turns, 70)).toBe(turns[70 - KEEP_ABOVE]!.turn);
  });
});
