import { isObject, type Json, type JsonObject } from "figaro-forms";
import type { TreeState } from "figaro-forms/aria";
import { bare, formId } from "./charter";
import { rolesOf } from "./roles";

export const LISTING_FORM = "@arias-global";

export function listedForms(root: JsonObject | undefined): string[] {
  const out: string[] = [];
  const walk = (level: Json | undefined): void => {
    if (!isObject(level)) return;
    for (const row of Object.values(level)) {
      if (!isObject(row)) continue;
      if (row.kind === "form" && typeof row.id === "string" && row.id !== "") out.push(formId(row.id));
      walk(row.forks);
    }
  };
  walk(root?.arias);
  return out;
}

export function enumerateForms(tree: TreeState | null, listed: readonly string[] = []): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (id: string): void => {
    if (id === "" || seen.has(bare(id))) return;
    seen.add(bare(id));
    out.push(formId(id));
  };
  if (tree) for (const row of rolesOf(tree)) add(row.id);
  for (const id of listed) add(id);
  return out;
}
