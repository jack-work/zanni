import type { TreeState } from "figaro-forms/aria";
import { bare, formId } from "./charter";
import { rolesOf } from "./roles";

export function enumerateForms(tree: TreeState | null): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  if (tree) {
    for (const row of rolesOf(tree)) {
      if (row.id === "" || seen.has(bare(row.id))) continue;
      seen.add(bare(row.id));
      out.push(formId(row.id));
    }
  }
  return out;
}
