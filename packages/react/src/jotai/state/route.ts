import { atom } from "jotai";
import { flushSync } from "react-dom";
import type { AriaClient } from "figaro-forms/aria";
import { transition } from "../../index";
import { parseRoute, routeFor, type Route } from "../lib/route";
import { bootAtom } from "./boot";

const hashAtom = atom(typeof window === "undefined" ? "" : window.location.hash);
hashAtom.onMount = (set) => {
  let last = window.location.hash;
  set(last);
  const read = () => {
    const next = window.location.hash;
    const crossing = !!parseRoute(last)?.aria !== !!parseRoute(next)?.aria;
    last = next;
    if (crossing) transition(() => flushSync(() => set(next)));
    else set(next);
  };
  window.addEventListener("hashchange", read);
  return () => window.removeEventListener("hashchange", read);
};

export const routeAtom = atom<Route | null>((get) => parseRoute(get(hashAtom)));

export const goAtom = atom(null, (_get, _set, to: { store: string; aria?: string; turn?: number } | null) => {
  window.location.hash = to ? routeFor(to.store, to.aria, to.turn) : "#/";
});

export const storeNameAtom = atom((get) => get(routeAtom)?.store || get(bootAtom).store);

export const clientAtom = atom<AriaClient | null>((get) => get(bootAtom).stores[get(storeNameAtom)] ?? null);

export interface Attended {
  readonly client: AriaClient;
  readonly store: string;
  readonly aria: string;
  readonly turn: number | undefined;
}

export const attendedAtom = atom<Attended | null>((get) => {
  const r = get(routeAtom);
  const client = get(clientAtom);
  return r && r.aria && client ? { client, store: r.store, aria: r.aria, turn: r.turn } : null;
});

export const routeKindAtom = atom<"list" | "aria">((get) => (get(routeAtom)?.aria ? "aria" : "list"));
