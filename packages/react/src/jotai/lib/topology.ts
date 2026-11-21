import { glyphs, truncRunes, type TreeColumn, type TreeFieldColor, type TreeNodeData } from "../../index";
import type { TreeNode, TreeState } from "figaro-forms/aria";

export const ROLE_BADGE_MAX = 14;

export const TOPOLOGY_COLUMNS: readonly TreeColumn[] = [{ header: "ARIA" }, { header: "ID", field: "id" }, { header: "DETAIL", field: "detail" }];

export const TOPOLOGY_COLORS: readonly TreeFieldColor[] = [
  {
    field: "state",
    rules: [
      { value: "active", color: "accent" },
      { value: "dormant", color: "dim" },
      { value: "retired", color: "red" },
      { value: "reaped", color: "dim" },
    ],
  },
];

const quoteRole = (a: string): string => (/[\s"]/.test(a) ? JSON.stringify(a) : a);

export function roleBadge(roles: readonly string[]): string {
  let out = "";
  for (let i = 0; i < roles.length; i++) {
    const a = roles[i]!;
    if (i === 0) {
      out += quoteRole(truncRunes(a, ROLE_BADGE_MAX - 2));
      continue;
    }
    const q = quoteRole(a);
    if ([...out].length + 1 + [...q].length > ROLE_BADGE_MAX) {
      out += " +" + (roles.length - i);
      break;
    }
    out += " " + q;
  }
  return out;
}

export function markerOf(n: Pick<TreeNode, "status" | "state">, here: boolean): string {
  if (n.status === "retired") return glyphs.dead;
  if (n.status === "reaped") return glyphs.absent;
  if (n.state === "active") return glyphs.select;
  return here ? glyphs["state.here"] : glyphs["state.idle"];
}

export function topologyNodes(tree: TreeState, here: string | undefined, counts: Readonly<Record<string, number>> = {}): TreeNodeData[] {
  const make = (n: TreeNode): TreeNodeData => {
    const msgs = counts[n.id];
    return {
      id: n.id,
      label: n.mantra || n.label,
      marker: markerOf(n, n.id === here),
      badge: roleBadge(n.roles),
      fields: {
        id: n.id.slice(0, 8),
        detail: msgs !== undefined ? msgs + " msgs" : n.state,
        state: n.status === "live" ? n.state : n.status,
      },
      children: n.children.flatMap((c) => {
        const k = tree.nodes.get(c);
        return k ? [make(k)] : [];
      }),
    };
  };
  const roots = tree.roots.flatMap((id) => {
    const n = tree.nodes.get(id);
    return n ? [make(n)] : [];
  });
  const reaped = [...tree.reaped.values()].map((n) => ({ ...make(n), children: [] }));
  return [...roots, ...reaped];
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
      return {
        id: path,
        label: k,
        fields: { path, value: branch ? "" : typeof v === "string" ? v : JSON.stringify(v) },
        children: branch ? formNodes(v, path) : [],
      };
    });
}

export const FORM_COLUMNS: readonly TreeColumn[] = [{ header: "KEY" }, { header: "VALUE", field: "value", max: 44 }];

export const FORM_COLORS: readonly TreeFieldColor[] = [{ field: "path", rules: [{ value: "system.thinking_effort", color: "accent" }] }];
