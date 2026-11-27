import type { TreeNode, TreeState } from "figaro-forms/aria";

export interface Holder {
  readonly id: string;
  readonly name: string;
  readonly known: boolean;
}

export interface RoleRow {
  readonly id: string;
  readonly name: string;
  readonly holder: Holder | undefined;
}

export const shortId = (id: string): string => id.replace(/^@/, "").slice(0, 8);

export function namerOf(tree: TreeState | null): (id: string) => string {
  const seat = new Map<string, string>();
  if (tree) for (const row of rolesOf(tree)) if (row.holder && !seat.has(row.holder.id)) seat.set(row.holder.id, row.name);
  return (id) => tree?.nodes.get(id)?.handle ?? seat.get(id) ?? shortId(id);
}

export const ariaName = (tree: TreeState | null, id: string): string => namerOf(tree)(id);

function holderOf(tree: TreeState, target: string | undefined): Holder | undefined {
  if (!target) return undefined;
  const node = tree.nodes.get(target);
  return node ? { id: target, name: node.handle ?? shortId(target), known: true } : { id: target, name: shortId(target), known: false };
}

export function rolesOf(tree: TreeState): RoleRow[] {
  return [...tree.nodes.values()]
    .filter((n) => n.kind === "role" && n.status === "live")
    .map((n) => ({ id: n.id, name: n.roleName ?? n.label, holder: holderOf(tree, n.target) }))
    .sort((a, b) => a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1));
}
