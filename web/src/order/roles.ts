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

const nameOf = (node: TreeNode): string => node.handle ?? node.mantra ?? shortId(node.id);

export function ariaName(tree: TreeState | null, id: string): string {
  const node = tree?.nodes.get(id);
  return node ? nameOf(node) : shortId(id);
}

function holderOf(tree: TreeState, target: string | undefined): Holder | undefined {
  if (!target) return undefined;
  const node = tree.nodes.get(target);
  return node ? { id: target, name: nameOf(node), known: true } : { id: target, name: shortId(target), known: false };
}

export function rolesOf(tree: TreeState): RoleRow[] {
  return [...tree.nodes.values()]
    .filter((n) => n.kind === "role" && n.status === "live")
    .map((n) => ({ id: n.id, name: n.roleName ?? n.label, holder: holderOf(tree, n.target) }))
    .sort((a, b) => a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1));
}
