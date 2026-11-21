import { clipEllipsis, glyphs, VALUE_COLUMNS, type TreeNodeData } from "../../index";
import type { TreeNode, TreeState } from "figaro-forms/aria";

const EPOCH_MS_LOW = 1_000_000_000_000;
const EPOCH_MS_HIGH = 100_000_000_000_000;

const pad2 = (n: number): string => String(n).padStart(2, "0");

function epochText(label: string, raw: unknown): string | undefined {
  if (label !== "at" && !label.endsWith("_at")) return undefined;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < EPOCH_MS_LOW || raw >= EPOCH_MS_HIGH) return undefined;
  const d = new Date(raw);
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds());
}

export function leafPreview(label: string, v: unknown): string {
  const at = epochText(label, v);
  if (at) return at;
  const raw = JSON.stringify(v) ?? "null";
  return clipEllipsis(raw.replace(/\s+/g, " ").trim(), VALUE_COLUMNS);
}

export function topologyNodes(tree: TreeState, here: string | undefined, storeId: string, counts: Readonly<Record<string, number>> = {}): TreeNodeData[] {
  const make = (n: TreeNode): TreeNodeData => {
    const msgs = counts[n.id];
    const kids = n.children.flatMap((c) => {
      const k = tree.nodes.get(c);
      return k ? [make(k)] : [];
    });
    return {
      id: n.id,
      label: n.handle ?? n.label,
      count: msgs ?? kids.length,
      peek: n.mantra ? JSON.stringify(n.mantra) : "",
      badge: n.id === here ? glyphs["state.here"] : "",
      hint: "Enter attend",
      children: kids,
    };
  };
  const arias = tree.roots.flatMap((id) => {
    const n = tree.nodes.get(id);
    return n ? [make(n)] : [];
  });
  if (arias.length === 0) return [];
  const node = tree.daemons.find((d) => d.self)?.id ?? tree.daemons[0]?.id ?? storeId;
  const group: TreeNodeData = { id: "@arias", label: "arias", count: arias.length, children: arias };
  return [{ id: "@node:" + node, label: node, count: 1, badge: here ? glyphs["state.here"] : "", children: [group] }];
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
