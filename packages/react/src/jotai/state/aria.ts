import { atom, type Atom } from "jotai";
import { ariaAtom, ariaConnectionAtom, ariaPhaseAtom } from "figaro-forms/aria/jotai";
import type { AriaClient, AriaSnapshot, Phase } from "figaro-forms/aria";
import { nodi, type TurnModel } from "../../index";
import { workOf, type Work_ } from "../../index";
import { refusalText } from "../lib/roster";
import { attendedAtom, clientAtom } from "./route";

const families = new WeakMap<AriaClient, Map<string, unknown>>();

export function memo<T>(client: AriaClient, key: string, make: () => T): T {
  let m = families.get(client);
  if (!m) {
    m = new Map();
    families.set(client, m);
  }
  let a = m.get(key) as T | undefined;
  if (a === undefined) {
    a = make();
    m.set(key, a);
  }
  return a;
}

function endsOf(snap: AriaSnapshot): Record<number, { reason?: string }> {
  const ends: Record<number, { reason?: string }> = {};
  for (const e of snap.ends) if (e.done && !e.replayed) ends[e.turn] = e.done;
  return ends;
}

export function turnsAtom(client: AriaClient, aria: string): Atom<TurnModel[]> {
  return memo(client, `turns\0${aria}`, () => {
    const cache = new Map<string, { sig: string; turn: TurnModel }>();
    let last: TurnModel[] = [];
    return atom((get) => {
      const snap = get(ariaAtom(client, aria));
      const next = nodi.model(snap.view, endsOf(snap));
      const seen = new Set<string>();
      const out = next.map((t) => {
        const sig = JSON.stringify(t);
        seen.add(t.key);
        const hit = cache.get(t.key);
        if (hit && hit.sig === sig) return hit.turn;
        cache.set(t.key, { sig, turn: t });
        return t;
      });
      for (const k of cache.keys()) if (!seen.has(k)) cache.delete(k);
      if (out.length === last.length && out.every((t, i) => t === last[i])) return last;
      last = out;
      return out;
    });
  });
}

export function runningAtom(client: AriaClient, aria: string): Atom<boolean> {
  return memo(client, `running\0${aria}`, () =>
    atom((get) => {
      const t = get(turnsAtom(client, aria));
      const last = t[t.length - 1];
      return !!last && last.open;
    }),
  );
}

export function workAtom(client: AriaClient, aria: string): Atom<Work_> {
  return memo(client, `work\0${aria}`, () => {
    let last: Work_ | undefined;
    return atom((get) => {
      const turns = get(turnsAtom(client, aria));
      const next = workOf(turns[turns.length - 1], Date.now());
      if (last && last.verb === next.verb && last.startedAt === next.startedAt) return last;
      last = next;
      return next;
    });
  });
}

export function noteAtom(client: AriaClient, aria: string): Atom<string> {
  return memo(client, `note\0${aria}`, () =>
    atom((get) => {
      const snap = get(ariaAtom(client, aria));
      if (snap.refusal) return refusalText(snap.refusal.kind);
      return get(turnsAtom(client, aria)).length || snap.phase !== "live" ? "" : "Nothing said yet.";
    }),
  );
}

const connectionPhase: Record<string, Phase> = { open: "live", connecting: "connecting", waiting: "offline", closed: "closed" };

export const linkAtom = atom<Phase>((get) => {
  const a = get(attendedAtom);
  if (a) return get(ariaPhaseAtom(a.client, a.aria));
  const client = get(clientAtom);
  return client ? (connectionPhase[get(ariaConnectionAtom(client))] ?? "detached") : "detached";
});

export const attendedRunningAtom = atom((get) => {
  const a = get(attendedAtom);
  return a ? get(runningAtom(a.client, a.aria)) : false;
});
