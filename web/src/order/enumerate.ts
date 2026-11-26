import type { TreeState } from "figaro-forms/aria";
import { bare, formId } from "./charter";
import { rolesOf } from "./roles";

export function enumerateForms(tree: TreeState | null, interim: readonly string[] = []): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (id: string): void => {
    if (id === "" || seen.has(bare(id))) return;
    seen.add(bare(id));
    out.push(formId(id));
  };
  if (tree) for (const row of rolesOf(tree)) add(row.id);
  for (const id of interim) add(id);
  return out;
}
