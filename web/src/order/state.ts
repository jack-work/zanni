import { atom } from "jotai";
import type { AriaClient } from "figaro-forms/aria";
import { ariaConnectionAtom, treeAtom } from "figaro-forms/aria/jotai";
import { orderHash, parseOrderRoute, type OrderRoute } from "./queue";
import { rolesOf, type RoleRow } from "./roles";

export const orderClientAtom = atom<AriaClient | null>(null);

const hashAtom = atom(typeof window === "undefined" ? "" : window.location.hash);
hashAtom.onMount = (set) => {
  const read = () => set(window.location.hash);
  read();
  window.addEventListener("hashchange", read);
  return () => window.removeEventListener("hashchange", read);
};

export const orderRouteAtom = atom<OrderRoute>((get) => parseOrderRoute(get(hashAtom)));

export const openEntryAtom = atom(null, (_get, set, to: { role?: string; entry?: string }) => {
  window.location.hash = orderHash(to.role, to.entry);
  set(hashAtom, window.location.hash);
});

export const treeStateAtom = atom((get) => {
  const client = get(orderClientAtom);
  return client ? get(treeAtom(client)) : null;
});

export const rolesAtom = atom<RoleRow[]>((get) => {
  const tree = get(treeStateAtom);
  return tree ? rolesOf(tree) : [];
});

export type Link = "live" | "connecting" | "offline" | "signedout" | "closed" | "detached";

const linkOf = { open: "live", connecting: "connecting", waiting: "offline", signedout: "signedout", closed: "closed" } as const;

export const linkAtom = atom<Link>((get) => {
  const client = get(orderClientAtom);
  return client ? linkOf[get(ariaConnectionAtom(client))] : "detached";
});
