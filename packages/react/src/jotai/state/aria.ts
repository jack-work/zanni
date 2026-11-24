import { atom, type Atom } from "jotai";
import { ariaAtom, ariaConnectionAtom, ariaPhaseAtom } from "figaro-forms/aria/jotai";
import type { AriaClient, AriaSnapshot, Phase } from "figaro-forms/aria";
import type { ConnectionState } from "figaro-forms";
import { nodi, type TurnModel } from "../../index";
import { workOf, type Work_ } from "../../index";
import { refusalText } from "../lib/roster";
import { newTurnCache, turnsOf } from "../lib/turns";
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
    const cache = newTurnCache();
    return atom((get) => {
      const snap = get(ariaAtom(client, aria));
      return turnsOf(snap.view, endsOf(snap), cache);
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

export function endStateAtom(client: AriaClient, aria: string): Atom<"" | "failed" | "interrupted"> {
  return memo(client, `end\0${aria}`, () =>
    atom((get) => {
      const t = get(turnsAtom(client, aria));
      const end = t[t.length - 1]?.end;
      return end?.kind === "error" ? "failed" : end?.kind === "end" && /interrupt/i.test(end.text) ? "interrupted" : "";
    }),
  );
}

export function contextTokensAtom(client: AriaClient, aria: string): Atom<number | undefined> {
  return memo(client, `ctx\0${aria}`, () => atom((get) => get(ariaAtom(client, aria)).metrics?.context_tokens));
}

export function metricsLineAtom(client: AriaClient, aria: string): Atom<string> {
  return memo(client, `metrics\0${aria}`, () =>
    atom((get) => {
      const m = get(ariaAtom(client, aria)).metrics;
      return m ? nodi.metricsLine(m) : "";
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

export type Link = Phase | "signedout";

const connectionPhase: Record<ConnectionState, Link> = { open: "live", connecting: "connecting", waiting: "offline", signedout: "signedout", closed: "closed" };

export const linkAtom = atom<Link>((get) => {
  const a = get(attendedAtom);
  const client = a?.client ?? get(clientAtom);
  if (!client) return "detached";
  const connection = get(ariaConnectionAtom(client));
  if (connection === "signedout") return "signedout";
  return a ? get(ariaPhaseAtom(a.client, a.aria)) : connectionPhase[connection];
});

export const attendedRunningAtom = atom((get) => {
  const a = get(attendedAtom);
  return a ? get(runningAtom(a.client, a.aria)) : false;
});
