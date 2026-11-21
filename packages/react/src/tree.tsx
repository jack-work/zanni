import { useMemo, useState, type ReactNode } from "react";
import { glyphs } from "./glyphs";

export interface TreeNodeData {
  id: string;
  label: string;
  marker?: string;
  badge?: string;
  fields?: Record<string, string>;
  children?: readonly TreeNodeData[];
}

export interface TreeColumn {
  header: string;
  field?: string;
  max?: number;
}

export interface TreeColorRule {
  value: string;
  color: string;
}

export interface TreeFieldColor {
  field: string;
  rules: readonly TreeColorRule[];
}

export interface TreeWash {
  field: string;
  value: string;
  wash: string;
}

export interface TreeRowData {
  id: string;
  branch: string;
  marker: string;
  label: string;
  badge: string;
  fields: Record<string, string>;
  color: string;
  wash: string;
  depth: number;
  expandable: boolean;
  open: boolean;
}

export function truncRunes(s: string, max: number): string {
  if (max <= 0) return s;
  const r = [...s];
  if (r.length <= max) return s;
  if (max < 2) return r.slice(0, max).join("");
  return r.slice(0, max - 2).join("") + "..";
}

function colorOf(n: TreeNodeData, colors: readonly TreeFieldColor[]): string {
  for (const fc of colors) {
    const fields = n.fields ?? {};
    if (!(fc.field in fields)) continue;
    const hit = fc.rules.find((r) => r.value === fields[fc.field]);
    if (hit) return hit.color;
  }
  return "";
}

function washOf(n: TreeNodeData, washes: readonly TreeWash[]): string {
  return washes.find((w) => (n.fields ?? {})[w.field] === w.value)?.wash ?? "";
}

export function treeRows(roots: readonly TreeNodeData[], colors: readonly TreeFieldColor[] = [], washes: readonly TreeWash[] = [], isOpen: (id: string, depth: number) => boolean = () => true): TreeRowData[] {
  const rows: TreeRowData[] = [];
  const walk = (n: TreeNodeData, prefix: string, isLast: boolean, isRoot: boolean, depth: number) => {
    const branch = isRoot ? "" : prefix + (isLast ? "└─" : "├─");
    const kids = n.children ?? [];
    const open = kids.length > 0 && isOpen(n.id, depth);
    rows.push({
      id: n.id,
      branch,
      marker: n.marker ?? "",
      label: n.label,
      badge: n.badge ?? "",
      fields: n.fields ?? {},
      color: colorOf(n, colors),
      wash: washOf(n, washes),
      depth,
      expandable: kids.length > 0,
      open,
    });
    if (!open) return;
    const childPrefix = isRoot ? prefix : prefix + (isLast ? "  " : "│ ");
    kids.forEach((c, i) => walk(c, childPrefix, i === kids.length - 1, false, depth + 1));
  };
  for (const r of roots) walk(r, "", true, true, 0);
  return rows;
}

export interface TreeProps {
  roots: readonly TreeNodeData[];
  columns?: readonly TreeColumn[];
  colors?: readonly TreeFieldColor[];
  washes?: readonly TreeWash[];
  current?: string;
  defaultOpen?: (id: string, depth: number) => boolean;
  collapsible?: boolean;
  onSelect?: (id: string) => void;
  label?: string;
  className?: string;
  empty?: ReactNode;
}

export function Tree({ roots, columns, colors, washes, current, defaultOpen = () => true, collapsible = true, onSelect, label, className, empty }: TreeProps) {
  const [flipped, setFlipped] = useState<ReadonlySet<string>>(new Set());
  const isOpen = (id: string, depth: number) => (flipped.has(id) ? !defaultOpen(id, depth) : defaultOpen(id, depth));
  const rows = useMemo(() => treeRows(roots, colors, washes, isOpen), [roots, colors, washes, flipped, defaultOpen]);
  const flip = (id: string) =>
    setFlipped((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const cols = columns ?? [];
  if (rows.length === 0) return <>{empty ?? null}</>;
  return (
    <table className={["zr-tree", className].filter(Boolean).join(" ")} role="treegrid" aria-label={label}>
      {cols.length > 0 && (
        <thead>
          <tr>
            {cols.map((c, i) => (
              <th key={i} scope="col">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
      )}
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.id}
            className="zr-tree-row"
            role="row"
            aria-level={r.depth + 1}
            aria-expanded={r.expandable ? r.open : undefined}
            aria-selected={current === r.id ? true : undefined}
            data-id={r.id}
            data-depth={r.depth}
            data-wash={r.wash || (current === r.id ? "current" : undefined)}
          >
            {(cols.length > 0 ? cols : [{ header: "" }]).map((c, i) =>
              !("field" in c) || !c.field ? (
                <td key={i} className="zr-tree-cell" role="gridcell">
                  <div className="zr-tree-line">
                    <span className="zr-tree-branch">{r.branch}</span>
                    {collapsible &&
                      (r.expandable ? (
                        <button type="button" className="zr-tree-toggle" aria-label={r.open ? "Collapse" : "Expand"} onClick={() => flip(r.id)}>
                          {r.open ? glyphs["comment.open"] : glyphs["comment.closed"]}
                        </button>
                      ) : (
                        <span className="zr-tree-toggle-gap" />
                      ))}
                    <button type="button" className="zr-tree-hit" data-color={r.color || undefined} onClick={() => (onSelect ? onSelect(r.id) : r.expandable && collapsible && flip(r.id))} aria-current={current === r.id ? "true" : undefined}>
                      {r.marker && <span className="zr-tree-marker">{r.marker}</span>}
                      {r.badge && <span className="zr-tree-badge">{r.badge}</span>}
                      <span className="zr-tree-label">{r.label}</span>
                    </button>
                  </div>
                </td>
              ) : (
                <td key={i} className="zr-tree-field" role="gridcell" data-field={c.field}>
                  {truncRunes(r.fields[c.field] ?? "", "max" in c ? (c.max ?? 0) : 0)}
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

