import { atom } from "jotai";
import type { AriaClient } from "figaro-forms/aria";
import { ariaConnectionAtom, boundFormAtom, treeAtom } from "figaro-forms/aria/jotai";
import type { BoundFormState } from "figaro-forms/aria";
import { atlasOf, bare, canonOf, charterRoleOf, formId, overridesOf, pickCentral, queueFormOf, TOPOLOGY_FORM, topologyOf, type CharterRole, type QueueForm, type Topology } from "./charter";
import { enumerateForms } from "./enumerate";
import { orderHash, parseOrderRoute, type OrderRoute } from "./queue";
import { rolesOf, shortId, type RoleRow } from "./roles";

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

export interface Read {
  readonly id: string;
  readonly form: BoundFormState;
  readonly role: CharterRole | undefined;
  readonly queue: QueueForm | undefined;
}

const settled = (form: BoundFormState): boolean => form.ready || form.refusal !== undefined || form.phase === "gone" || form.phase === "failed" || form.phase === "incompatible";

export const canonAtom = atom((get) => {
  const tree = get(treeStateAtom);
  return canonOf(tree ? [...tree.nodes.keys()] : []);
});

export const readsAtom = atom<Read[]>((get) => {
  const client = get(orderClientAtom);
  if (!client) return [];
  const canon = get(canonAtom);
  const rows = new Map(get(rolesAtom).map((r) => [bare(canon(r.id)), r]));
  const ids = new Map(enumerateForms(get(treeStateAtom)).map((id) => [bare(canon(id)), formId(canon(id))]));
  const asked = get(orderRouteAtom).central;
  if (asked) ids.set(bare(canon(asked)), formId(canon(asked)));
  const read = (id: string): Read => {
    const form = get(boundFormAtom(client, id));
    const row = rows.get(bare(id));
    const name = row?.name ?? shortId(id);
    return { id, form, role: charterRoleOf(id, name, row?.holder?.id ?? "", form.root, canon), queue: queueFormOf(id, name, form.root, canon) };
  };
  const first = [...ids.values()].map(read);
  const extra = new Map<string, string>();
  for (const r of first) {
    const root = r.role?.chartered.root ?? r.queue?.root;
    if (root && !ids.has(bare(root))) extra.set(bare(root), root);
  }
  return [...first, ...[...extra.values()].map(read)];
});

export type MissingWhy = "unknown" | "closed" | "gone" | "unreadable" | "unchartered" | "queue";

export type OrderView =
  | { readonly kind: "loading"; readonly central: undefined }
  | { readonly kind: "none"; readonly central: undefined }
  | { readonly kind: "missing"; readonly central: string; readonly why: MissingWhy }
  | { readonly kind: "elsewhere"; readonly central: string; readonly role: CharterRole }
  | { readonly kind: "ready"; readonly central: string; readonly topology: Topology; readonly overrides: "applied" | "unreadable" };

export const viewAtom = atom<OrderView>((get) => {
  const client = get(orderClientAtom);
  const tree = get(treeStateAtom);
  if (!client || !tree) return { kind: "none", central: undefined };
  if (!tree.ready && tree.nodes.size === 0) return { kind: "loading", central: undefined };
  const canon = get(canonAtom);
  const reads = get(readsAtom);
  const topo = get(boundFormAtom(client, TOPOLOGY_FORM));
  const roles = reads.flatMap((r) => (r.role ? [r.role] : []));
  const queues = reads.flatMap((r) => (r.queue ? [r.queue] : []));
  const asked = get(orderRouteAtom).central;
  const askedId = asked ? formId(canon(asked)) : undefined;
  const waiting = !settled(topo) || reads.some((r) => !settled(r.form));
  const chosen = askedId ? roles.find((r) => r.id === askedId) : pickCentral(roles);
  if (!chosen) {
    if (waiting) return { kind: "loading", central: undefined };
    if (!askedId) return { kind: "none", central: undefined };
    const read = reads.find((r) => r.id === askedId);
    const why: MissingWhy = !read ? "unknown" : read.queue ? "queue" : read.form.refusal ? "closed" : read.form.phase === "gone" ? "gone" : read.form.phase === "ready" ? "unchartered" : "unreadable";
    return { kind: "missing", central: askedId, why };
  }
  if (!chosen.chartered.central) return { kind: "elsewhere", central: chosen.id, role: chosen };
  if (!settled(topo)) return { kind: "loading", central: undefined };
  const overrides = topo.ready ? overridesOf(topo.root, canon) : new Map<string, string>();
  const topology = topologyOf(chosen, roles, queues, atlasOf(tree.nodes, overrides, canon));
  return { kind: "ready", central: chosen.id, topology, overrides: topo.ready ? "applied" : "unreadable" };
});
