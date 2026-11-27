import type { BoundFormState, TreeState } from "figaro-forms/aria";
import { atlasOf, bare, canonOf, charterRoleOf, formId, overridesOf, pickCentral, queueFormOf, topologyOf, type Atlas, type Canon, type CharterRole, type QueueForm, type Topology } from "./charter";
import { enumerateForms } from "./enumerate";
import { rolesOf, shortId, type RoleRow } from "./roles";

export type FormRead = Pick<BoundFormState, "root" | "ready" | "refusal" | "phase">;

export interface Read {
  readonly id: string;
  readonly form: FormRead;
  readonly role: CharterRole | undefined;
  readonly queue: QueueForm | undefined;
}

export type MissingWhy = "unknown" | "closed" | "gone" | "unreadable" | "unchartered" | "queue";

export type OrderView =
  | { readonly kind: "loading"; readonly central: undefined }
  | { readonly kind: "none"; readonly central: undefined }
  | { readonly kind: "missing"; readonly central: string; readonly why: MissingWhy }
  | { readonly kind: "elsewhere"; readonly central: string; readonly role: CharterRole }
  | { readonly kind: "ready"; readonly central: string; readonly topology: Topology; readonly atlas: Atlas; readonly overrides: "applied" | "unreadable" };

export type ReadyView = Extract<OrderView, { readonly kind: "ready" }>;

export const settled = (form: FormRead): boolean => form.ready || form.refusal !== undefined || form.phase === "gone" || form.phase === "failed" || form.phase === "incompatible";

export const canonFor = (tree: TreeState | null): Canon => canonOf(tree ? [...tree.nodes.keys()] : []);

export function readsOf(o: { tree: TreeState; canon: Canon; asked: string | undefined; formOf: (id: string) => FormRead }): Read[] {
  const { tree, canon, asked, formOf } = o;
  const rows = new Map<string, RoleRow>(rolesOf(tree).map((r) => [bare(canon(r.id)), r]));
  const ids = new Map(enumerateForms(tree).map((id) => [bare(canon(id)), formId(canon(id))]));
  if (asked) ids.set(bare(canon(asked)), formId(canon(asked)));
  const read = (id: string): Read => {
    const form = formOf(id);
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
}

export function viewOf(o: { tree: TreeState; canon: Canon; reads: readonly Read[]; topo: FormRead; asked: string | undefined }): OrderView {
  const { tree, canon, reads, topo, asked } = o;
  if (!tree.ready && tree.nodes.size === 0) return { kind: "loading", central: undefined };
  const roles = reads.flatMap((r) => (r.role ? [r.role] : []));
  const queues = reads.flatMap((r) => (r.queue ? [r.queue] : []));
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
  const atlas = atlasOf(tree.nodes, overrides, canon);
  const topology = topologyOf(chosen, roles, queues, atlas);
  return { kind: "ready", central: chosen.id, topology, atlas, overrides: topo.ready ? "applied" : "unreadable" };
}
