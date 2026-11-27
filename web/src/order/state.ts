import { atom } from "jotai";
import type { AriaClient } from "figaro-forms/aria";
import { ariaConnectionAtom, boundFormAtom, treeAtom } from "figaro-forms/aria/jotai";
import { TOPOLOGY_FORM } from "./charter";
import { canonFor, completeOf, readsOf, standingOf, viewOf, type OrderView, type Read, type Standing } from "./derive";
import { orderHash, parseOrderRoute, type GraphView, type OrderRoute } from "./queue";
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

export const openAtom = atom(null, (get, set, to: { node?: string; entry?: string; view?: GraphView }) => {
  const route = get(orderRouteAtom);
  const central = route.central ?? get(viewAtom).central;
  window.location.hash = orderHash(central, to.node, to.entry, to.view ?? route.view);
  set(hashAtom, window.location.hash);
});

export const carryCentralAtom = atom(null, (get, set) => {
  const central = get(viewAtom).central;
  const route = get(orderRouteAtom);
  if (!central || route.central) return;
  window.history.replaceState(null, "", orderHash(central, undefined, undefined, route.view));
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

export const readsAtom = atom<Read[]>((get) => {
  const client = get(orderClientAtom);
  const tree = get(treeStateAtom);
  if (!client || !tree) return [];
  return readsOf({ tree, canon: get(canonAtom), asked: get(orderRouteAtom).central, formOf: (id) => get(boundFormAtom(client, id)) });
});

export const viewAtom = atom<OrderView>((get) => {
  const client = get(orderClientAtom);
  const tree = get(treeStateAtom);
  if (!client || !tree) return { kind: "none", central: undefined };
  return viewOf({ tree, canon: get(canonAtom), reads: get(readsAtom), topo: get(boundFormAtom(client, TOPOLOGY_FORM)), asked: get(orderRouteAtom).central });
});

export interface Page {
  readonly view: OrderView;
  readonly reads: readonly Read[];
  readonly complete: boolean;
  readonly standing: Standing;
}

export const pageAtom = atom<Page>((get) => {
  const client = get(orderClientAtom);
  const tree = get(treeStateAtom);
  const view = get(viewAtom);
  const reads = get(readsAtom);
  if (!client || !tree) return { view, reads, complete: false, standing: "stale" };
  const topo = get(boundFormAtom(client, TOPOLOGY_FORM));
  const complete = completeOf(view, reads, topo);
  const forms = [topo, ...reads.filter((r) => r.role || r.queue).map((r) => r.form)];
  return { view, reads, complete, standing: standingOf({ live: get(linkAtom) === "live", complete, tree: tree.freshness, forms }) };
});
