import { atom, type Atom } from "jotai";
import type { AriaClient, Phase } from "figaro-forms/aria";
import type { ConnectionState } from "figaro-forms";

export type Link = Phase | "signedout";

const connectionPhase: Record<ConnectionState, Link> = { open: "live", connecting: "connecting", waiting: "offline", signedout: "signedout", closed: "closed" };

const families = new WeakMap<AriaClient, Atom<Link>>();

export function connectionLinkAtom(client: AriaClient): Atom<Link> {
  let a = families.get(client);
  if (!a) {
    const state = atom<ConnectionState>(client.connection.state);
    state.onMount = (set) => {
      set(client.connection.state);
      return client.connection.onState(set);
    };
    a = atom((get) => connectionPhase[get(state)]);
    families.set(client, a);
  }
  return a;
}
