import { atom } from "jotai";
import type { AriaClient } from "figaro-forms/aria";
import { ariaConnectionAtom, boundFormAtom, treeAtom } from "figaro-forms/aria/jotai";
import { TOPOLOGY_FORM } from "./charter";
import { selectAtom } from "jotai/utils";
import { canonFor, readsOf, settled, viewOf, type Listing, type OrderView, type Read } from "./derive";
import { LISTING_FORM, listedForms } from "./enumerate";
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

export const openEntryAtom = atom(null, (get, set, to: { role?: string; entry?: string }) => {
  const central = get(orderRouteAtom).central ?? get(viewAtom).central;
  window.location.hash = orderHash(central, to.role, to.entry);
  set(hashAtom, window.location.hash);
});

export const carryCentralAtom = atom(null, (get, set) => {
  const central = get(viewAtom).central;
  if (!central || get(orderRouteAtom).central) return;
  window.history.replaceState(null, "", orderHash(central));
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

export const canonAtom = atom((get) => canonFor(get(treeStateAtom)));

const listingFormAtom = atom((get) => {
  const client = get(orderClientAtom);
  return client ? get(boundFormAtom(client, LISTING_FORM)) : undefined;
});

const sameIds = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((id, i) => id === b[i]);

export const listedAtom = selectAtom(listingFormAtom, (form): readonly string[] => (form?.ready ? listedForms(form.root) : []), sameIds);

export const listingAtom = selectAtom(listingFormAtom, (form): Listing => (!form ? "pending" : form.ready ? "listed" : settled(form) ? "unreadable" : "pending"));

export const readsAtom = atom<Read[]>((get) => {
  const client = get(orderClientAtom);
  const tree = get(treeStateAtom);
  if (!client || !tree) return [];
  return readsOf({ tree, canon: get(canonAtom), asked: get(orderRouteAtom).central, listed: get(listedAtom), formOf: (id) => get(boundFormAtom(client, id)) });
});

export const viewAtom = atom<OrderView>((get) => {
  const client = get(orderClientAtom);
  const tree = get(treeStateAtom);
  if (!client || !tree) return { kind: "none", central: undefined };
  return viewOf({ tree, canon: get(canonAtom), reads: get(readsAtom), topo: get(boundFormAtom(client, TOPOLOGY_FORM)), listing: get(listingAtom), asked: get(orderRouteAtom).central });
});
