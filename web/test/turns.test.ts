import { describe, expect, it, vi } from "vitest";
import { nodi } from "zanni-react";
import { newTurnCache, turnsOf } from "zanni-react/jotai";

type Msg = Record<string, unknown> & { turn: number };

function settled(n: number): Msg[] {
  const out: Msg[] = [];
  for (let t = 1; t <= n; t++) {
    out.push({ turn: t, from: 0, role: "input", nodes: [], inquiry: "Question " + t, at: t });
    out.push({
      turn: t,
      from: 0,
      role: "output",
      nodes: [
        { type: "thinking", role: "output", markdown: "hm ".repeat(40), at: t },
        { type: "tool", role: "output", name: "bash", status: "ok", tool_call_id: "c" + t, args: { command: "go test" }, summary: "command=go test", output: "ok ".repeat(200), at: t },
        { type: "prose", role: "output", markdown: "word ".repeat(100), at: t },
      ],
    });
  }
  return out;
}

const live = (turn: number, k: number): Msg => ({ turn, from: 0, role: "output", nodes: [{ type: "prose", role: "output", markdown: "streaming ".repeat(k), at: 1 }], inquiry: "live" });

function legacy(view: object, ends: object, cache: Map<string, { sig: string; turn: unknown }>) {
  return (nodi.model(view as never, ends as never) as { key: string }[]).map((t) => {
    const sig = JSON.stringify(t);
    const hit = cache.get(t.key);
    if (hit && hit.sig === sig) return hit.turn;
    cache.set(t.key, { sig, turn: t });
    return t;
  });
}

describe("turnsOf", () => {
  it("gives what the whole-view model gave, frame after frame, through a turn that opens, streams and ends", () => {
    const closed = settled(30);
    const cache = newTurnCache();
    const old = new Map<string, { sig: string; turn: unknown }>();
    const same = (view: { closed: Msg[]; open?: Msg }, ends: Record<number, { reason?: string }>) => expect(JSON.parse(JSON.stringify(turnsOf(view as never, ends, cache)))).toEqual(JSON.parse(JSON.stringify(legacy(view, ends, old))));
    same({ closed }, {});
    for (let k = 1; k < 6; k++) same({ closed, open: live(31, k) }, {});
    const sealed = [...closed, { ...live(31, 6), nodes: (live(31, 6).nodes as unknown[]) }];
    same({ closed: sealed }, { 31: { reason: "stop" } });
    same({ closed: sealed, open: live(32, 1) }, { 31: { reason: "stop" } });
    same({ closed: sealed.slice(10) }, { 31: { reason: "stop" } });
    same({ closed: [] }, {});
    same({} as never, {});
  });

  it("hands back the same turn objects for settled turns and the same array when nothing changed", () => {
    const closed = settled(5);
    const cache = newTurnCache();
    const a = turnsOf({ closed, open: live(6, 1) } as never, {}, cache);
    const b = turnsOf({ closed, open: live(6, 2) } as never, {}, cache);
    expect(b).not.toBe(a);
    for (let i = 0; i < 5; i++) expect(b[i]).toBe(a[i]);
    expect(b[5]).not.toBe(a[5]);
    expect(turnsOf({ closed, open: live(6, 2) } as never, {}, cache)).toBe(b);
  });

  it("models only the open turn while it streams, not the history", () => {
    const closed = settled(200);
    const cache = newTurnCache();
    turnsOf({ closed, open: live(201, 1) } as never, {}, cache);
    const spy = vi.spyOn(nodi, "model");
    turnsOf({ closed, open: live(201, 2) } as never, {}, cache);
    expect(spy).toHaveBeenCalledTimes(1);
    expect((spy.mock.calls[0]![0] as unknown as { closed: unknown[] }).closed).toEqual([]);
    spy.mockRestore();
  });

  it("re-models a settled turn whose end arrives", () => {
    const closed = settled(3);
    const cache = newTurnCache();
    const a = turnsOf({ closed } as never, {}, cache);
    const b = turnsOf({ closed } as never, { 2: { reason: "error: boom" } }, cache);
    expect(b[0]).toBe(a[0]);
    expect(b[1]).not.toBe(a[1]);
    expect(b[1]!.end).toBeTruthy();
  });

  it("keeps a stream frame cheap however long the history is: a thousand turns cost a fraction of the whole-view model", () => {
    const closed = settled(1000);
    const cache = newTurnCache();
    const old = new Map<string, { sig: string; turn: unknown }>();
    turnsOf({ closed, open: live(1001, 1) } as never, {}, cache);
    legacy({ closed, open: live(1001, 1) }, {}, old);
    const time = (fn: (k: number) => void) => {
      const t0 = performance.now();
      for (let k = 2; k < 22; k++) fn(k);
      return performance.now() - t0;
    };
    const fast = time((k) => turnsOf({ closed, open: live(1001, k) } as never, {}, cache));
    const slow = time((k) => legacy({ closed, open: live(1001, k) }, {}, old));
    expect(fast * 5).toBeLessThan(slow);
  });
});

describe("turnsOf and the fork mark", () => {
  it("marks the turn whose opening message carries forked_from, and no other", () => {
    const closed = [...settled(2), { turn: 3, from: 0, role: "input", nodes: [], inquiry: "mine", at: 3, forkedFrom: "parent-id" }, { turn: 3, from: 0, role: "output", nodes: [], at: 3 }];
    const got = turnsOf({ closed } as never, {}, newTurnCache());
    expect(got.map((t) => t.forkedFrom)).toEqual([undefined, undefined, "parent-id"]);
  });

  it("marks an open turn from its first frame", () => {
    const open = { ...live(4, 1), forkedFrom: "parent-id" };
    const got = turnsOf({ closed: settled(3), open } as never, {}, newTurnCache());
    expect(got[3]!.forkedFrom).toBe("parent-id");
  });

  it("reads the field, not a key name: a forked_from delta alone marks nothing", () => {
    const delta = { "alt.runtime.forked_from": { form: "alt", kind: "bound", event: "set", value: "parent-id" } };
    const closed = [{ turn: 1, from: 0, role: "input", nodes: [], inquiry: "q", at: 1, formDeltas: delta }];
    expect(turnsOf({ closed } as never, {}, newTurnCache())[0]!.forkedFrom).toBeUndefined();
  });
});

describe("turnsOf and the form deltas", () => {
  const set = (form: string, key: string, prev: unknown, value: unknown) => ({ [form + "." + key]: { form, kind: "bound", event: "set", ...(prev === undefined ? {} : { prev }), value } });

  it("carries a turn's own deltas, and its nodes', as rows on the turn", () => {
    const closed = [
      { turn: 1, from: 0, role: "input", nodes: [], inquiry: "q", at: 1, formDeltas: set("a1", "phase", "seed", "canary") },
      { turn: 1, from: 0, role: "output", nodes: [{ type: "prose", role: "output", markdown: "x", at: 1, formDeltas: set("a1", "mood", undefined, "calm") }], at: 1 },
    ];
    const got = turnsOf({ closed } as never, {}, newTurnCache())[0]!;
    expect(got.deltas!.map((r) => r.key)).toEqual(["phase", "mood"]);
  });

  it("drops a fork's birth keys from the turn that carries forked_from, and leaves no deltas when nothing else changed", () => {
    const birth = { ...set("alt", "system.forked_from", undefined, "parent-id"), ...set("alt", "aria_id", undefined, "alt") };
    const closed = [{ turn: 3, from: 0, role: "input", nodes: [], inquiry: "mine", at: 3, forkedFrom: "parent-id", formDeltas: birth }];
    const got = turnsOf({ closed } as never, {}, newTurnCache())[0]!;
    expect(got.forkedFrom).toBe("parent-id");
    expect(got.deltas).toBeUndefined();
  });

  it("drops the birth keys under the runtime name as under the legacy one", () => {
    const closed = [{ turn: 3, from: 0, role: "input", nodes: [], inquiry: "mine", at: 3, forkedFrom: "parent-id", formDeltas: set("alt", "runtime.forked_from", undefined, "parent-id") }];
    const got = turnsOf({ closed } as never, {}, newTurnCache())[0]!;
    expect(got.forkedFrom).toBe("parent-id");
    expect(got.deltas).toBeUndefined();
  });

  it("a turn with nothing to show has no deltas key at all", () => {
    expect(turnsOf({ closed: settled(1) } as never, {}, newTurnCache())[0]).not.toHaveProperty("deltas");
  });
});
