import { VALUE_COLUMNS, clip, stamp, type TreeNodeData } from "../../index";
import type { TreeNode, TreeState } from "figaro-forms/aria";

const EPOCH_MS_LOW = 1_000_000_000_000;
const EPOCH_MS_HIGH = 100_000_000_000_000;

function epochText(label: string, raw: unknown): string | undefined {
  if (label !== "at" && !label.endsWith("_at")) return undefined;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < EPOCH_MS_LOW || raw >= EPOCH_MS_HIGH) return undefined;
  return stamp(raw);
}

export function leafPreview(label: string, v: unknown): string {
  const at = epochText(label, v);
  if (at) return at;
  const raw = JSON.stringify(v) ?? "null";
  return clip(raw.replace(/\s+/g, " ").trim(), VALUE_COLUMNS);
}

export const REFUSED = "not available to you";

const FORKS = "forks";

export interface TopologyForms {
  readonly troupe: unknown;
  readonly arias: Readonly<Record<string, unknown>>;
}

function keyCount(v: unknown): number {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? Object.keys(v).length : 0;
}

type Row = Record<string, unknown>;

export function ariaRows(root: unknown): Map<string, Row> {
  const out = new Map<string, Row>();
  const walk = (level: unknown) => {
    if (level === null || typeof level !== "object") return;
    for (const row of Object.values(level as Record<string, unknown>)) {
      if (row === null || typeof row !== "object") continue;
      const id = (row as Row).id;
      if (typeof id === "string") out.set(id, row as Row);
      walk((row as Row).forks);
    }
  };
  walk((root as { arias?: unknown } | undefined)?.arias);
  return out;
}

export function topologyNodes(tree: TreeState, here: string | undefined, forms: TopologyForms): TreeNodeData[] {
  const rows = new Map<string, Row>();
  for (const root of Object.values(forms.arias)) for (const [id, row] of ariaRows(root)) rows.set(id, row);
  const make = (n: TreeNode): TreeNodeData => {
    const kids = n.children.flatMap((c) => {
      const k = tree.nodes.get(c);
      return k ? [make(k)] : [];
    });
    if (n.kind === "role") {
      const name = n.roleName ?? n.label;
      const holder = n.target ? tree.nodes.get(n.target) : undefined;
      return {
        id: n.id,
        label: name.startsWith("@") ? name : "@" + name,
        key: n.id,
        count: keyCount(rows.get(n.id)) || kids.length,
        peek: "",
        role: n.target ? "\u2192 " + (holder?.handle ?? holder?.label ?? n.target.slice(0, 8)) : "vacant",
        here: false,
        hint: n.target ? "Enter attend the holder" : "",
        row: rows.get(n.id),
        childKey: FORKS,
        children: kids,
      };
    }
    return {
      id: n.id,
      label: n.handle ?? n.label,
      count: keyCount(rows.get(n.id)) + (n.parent && !rows.get(n.id)?.parent && tree.nodes.get(n.parent)?.kind !== "role" ? 1 : 0) || kids.length,
      peek: "",
      role: n.roles.join(" "),
      mantra: n.mantra ?? "",
      here: n.id === here,
      hint: "Enter attend · x kill",
      row: rows.get(n.id),
      childKey: FORKS,
      children: kids,
    };
  };
  const out: TreeNodeData[] = [];
  for (const d of tree.daemons) {
    const arias = tree.roots.flatMap((id) => {
      const n = tree.nodes.get(id);
      return n && n.daemon === d.id ? [make(n)] : [];
    });
    if (arias.length === 0) {
      if (d.error) out.push({ id: "@node:" + d.id, label: d.id, count: 0, peek: "", mantra: REFUSED, here: d.self, children: [] });
      continue;
    }
    const top = (forms.arias[d.id] as { arias?: unknown } | undefined)?.arias;
    const group: TreeNodeData = { id: "@arias:" + d.id, label: "arias", count: keyCount(top) || arias.length, peek: "", children: arias };
    const mine = (forms.troupe as Record<string, unknown> | undefined)?.[d.id];
    out.push({ id: "@node:" + d.id, label: d.id, count: keyCount(mine) || 1, peek: "", here: d.self, children: [group] });
  }
  return out;
}

export function ancestorsOf(tree: TreeState, id: string | undefined): Set<string> {
  const out = new Set<string>();
  let cur = id ? tree.nodes.get(id) : undefined;
  const seen = new Set<string>();
  while (cur && cur.parent && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.add(cur.parent);
    cur = tree.nodes.get(cur.parent);
  }
  return out;
}

export function formNodes(root: unknown, prefix = ""): TreeNodeData[] {
  if (root === null || typeof root !== "object" || Array.isArray(root)) return [];
  return Object.keys(root)
    .sort()
    .map((k) => {
      const v = (root as Record<string, unknown>)[k];
      const path = prefix ? prefix + "." + k : k;
      const branch = v !== null && typeof v === "object" && !Array.isArray(v);
      if (!branch) return { id: path, label: k, value: leafPreview(k, v) };
      const children = formNodes(v, path);
      return { id: path, label: k, count: children.length, children };
    });
}
