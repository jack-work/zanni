import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface TreeNodeData {
  id: string;
  label: string;
  value?: string;
  count?: number;
  peek?: string;
  badge?: string;
  hint?: string;
  children?: readonly TreeNodeData[];
}

export interface TreeRowData {
  id: string;
  parent: string | undefined;
  depth: number;
  lead: string;
  label: string;
  leaf: boolean;
  gap: string;
  value: string;
  inline: string;
  count: number;
  peek: string;
  badge: string;
  hint: string;
  expandable: boolean;
  open: boolean;
}

export const LABEL_PAD_MAX = 24;
export const INLINE_MAX = 3;
export const INLINE_COLUMNS = 60;
export const PEEK_KEYS = 4;
export const VALUE_COLUMNS = 120;

const width = (s: string): number => [...s].length;

export function clipEllipsis(s: string, max: number): string {
  const r = [...s];
  if (r.length <= max) return s;
  return r.slice(0, Math.max(max - 1, 0)).join("") + "…";
}

export function branchPeek(kids: readonly TreeNodeData[]): string {
  if (kids.length === 0) return "";
  const names = kids.slice(0, PEEK_KEYS).map((k) => k.label).join(" · ");
  return kids.length > PEEK_KEYS ? names + " …" : names;
}

export function inlineBranch(kids: readonly TreeNodeData[]): string {
  if (kids.length === 0 || kids.length > INLINE_MAX) return "";
  if (kids.some((k) => k.value === undefined || /^\s*[{[]/.test(k.value))) return "";
  const text = "{" + kids.map((k) => k.label + ": " + k.value).join(", ") + "}";
  return width(text) > INLINE_COLUMNS ? "" : text;
}

export function treeRows(roots: readonly TreeNodeData[], isOpen: (id: string, depth: number) => boolean = () => false): TreeRowData[] {
  const rows: TreeRowData[] = [];
  const walk = (kids: readonly TreeNodeData[], depth: number, cont: string, parent: string | undefined) => {
    let pad = 0;
    for (const k of kids) if (k.value !== undefined) pad = Math.max(pad, Math.min(width(k.label), LABEL_PAD_MAX));
    kids.forEach((n, i) => {
      const sub = n.children ?? [];
      const leaf = n.value !== undefined && sub.length === 0;
      const open = !leaf && sub.length > 0 && isOpen(n.id, depth);
      const last = i === kids.length - 1;
      const lead = depth === 0 ? "" : cont + (last ? "└─ " : "├─ ");
      const own = leaf && width(n.label) > LABEL_PAD_MAX ? 0 : pad;
      rows.push({
        id: n.id,
        parent,
        depth,
        lead,
        label: n.label,
        leaf,
        gap: leaf ? " ".repeat(Math.max(own - width(n.label), 0)) : "",
        value: n.value ?? "",
        inline: !leaf && !open && n.peek === undefined ? inlineBranch(sub) : "",
        count: n.count ?? sub.length,
        peek: n.peek ?? (open ? "" : branchPeek(sub)),
        badge: n.badge ?? "",
        hint: n.hint ?? "",
        expandable: sub.length > 0,
        open,
      });
      if (open) walk(sub, depth + 1, depth === 0 ? "" : cont + (last ? "   " : "│  "), n.id);
    });
  };
  walk(roots, 0, "", undefined);
  return rows;
}

export interface TreeProps {
  roots: readonly TreeNodeData[];
  mark: string;
  current?: string;
  defaultOpen?: (id: string, depth: number) => boolean;
  onActivate?: (id: string) => void;
  autoFocus?: boolean;
  onRows?: (ids: readonly string[]) => void;
  label?: string;
  testid?: string;
  className?: string;
  empty?: ReactNode;
}

const never = () => false;

export function Tree({ roots, mark, current, defaultOpen = never, onActivate, autoFocus, onRows, label, testid, className, empty }: TreeProps) {
  const [chosen, setChosen] = useState<ReadonlyMap<string, boolean>>(new Map());
  const [cursorId, setCursorId] = useState<string | undefined>(undefined);
  const lastKey = useRef("");
  const box = useRef<HTMLDivElement>(null);
  const isOpen = (id: string, depth: number) => chosen.get(id) ?? defaultOpen(id, depth);
  const rows = useMemo(() => treeRows(roots, isOpen), [roots, chosen, defaultOpen]);
  const at = Math.max(
    rows.findIndex((r) => r.id === (cursorId ?? current)),
    0,
  );
  const cursor = rows[at];

  const shown = rows.map((r) => r.id).join("\n");
  useEffect(() => {
    onRows?.(shown ? shown.split("\n") : []);
  }, [shown]);

  useEffect(() => {
    if (autoFocus) box.current?.focus({ preventScroll: true });
  }, [autoFocus, rows.length > 0]);

  useEffect(() => {
    if (!cursor) return;
    const el = [...(box.current?.querySelectorAll<HTMLElement>("[data-id]") ?? [])].find((e) => e.dataset.id === cursor.id);
    el?.scrollIntoView?.({ block: "nearest" });
  }, [cursor?.id]);

  if (rows.length === 0) return <>{empty ?? null}</>;

  const set = (id: string, open: boolean) => setChosen((prev) => new Map(prev).set(id, open));
  const toggle = (r: TreeRowData) => r.expandable && set(r.id, !r.open);
  const activate = (r: TreeRowData) => (onActivate ? onActivate(r.id) : toggle(r));
  const moveTo = (i: number) => setCursorId(rows[Math.min(Math.max(i, 0), rows.length - 1)]?.id);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey || !cursor) return;
    const prev = lastKey.current;
    lastKey.current = e.key;
    const page = Math.max(Math.floor((box.current?.clientHeight ?? 0) / 28 / 2), 1);
    switch (e.key) {
      case "j":
      case "ArrowDown":
        moveTo(at + 1);
        break;
      case "k":
      case "ArrowUp":
        moveTo(at - 1);
        break;
      case "d":
        moveTo(at + page);
        break;
      case "u":
        moveTo(at - page);
        break;
      case "G":
      case "End":
        moveTo(rows.length - 1);
        break;
      case "Home":
        moveTo(0);
        break;
      case "g":
        if (prev === "g") {
          moveTo(0);
          lastKey.current = "";
        }
        break;
      case "l":
      case "ArrowRight":
        if (cursor.expandable && !cursor.open) set(cursor.id, true);
        break;
      case "h":
      case "ArrowLeft":
        if (cursor.open) set(cursor.id, false);
        else if (cursor.parent) setCursorId(cursor.parent);
        break;
      case "Enter":
        activate(cursor);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  return (
    <div ref={box} className={["zr-tree", className].filter(Boolean).join(" ")} role="tree" aria-label={label} data-testid={testid} tabIndex={0} aria-activedescendant={cursor ? "zr-tree-" + cursor.id : undefined} onKeyDown={onKeyDown}>
      {rows.map((r, i) => {
        const selected = i === at;
        return (
          <div
            key={r.id}
            id={"zr-tree-" + r.id}
            className="zr-tree-row"
            role="treeitem"
            aria-level={r.depth + 1}
            aria-expanded={r.expandable ? r.open : undefined}
            aria-selected={selected}
            data-id={r.id}
            data-testid={testid && testid + "-row"}
            data-depth={r.depth}
            data-cursor={selected ? "true" : undefined}
            onClick={() => {
              setCursorId(r.id);
              activate(r);
            }}
          >
            <span className="zr-tree-mark">{selected ? mark : " "} </span>
            <span className="zr-tree-lead">{r.lead}</span>
            <span className="zr-tree-label">{r.label}</span>
            {r.leaf ? (
              <>
                <span className="zr-tree-colon">: </span>
                {r.gap}
                <span className="zr-tree-value">{r.value}</span>
              </>
            ) : r.inline ? (
              <span className="zr-tree-peek">{": " + r.inline}</span>
            ) : (
              <>
                <span className="zr-tree-count">{" (" + r.count + ")"}</span>
                {r.peek && <span className="zr-tree-peek">{"  " + r.peek}</span>}
              </>
            )}
            {r.badge && <span className="zr-tree-badge">{"  " + r.badge}</span>}
            {selected && r.hint && <span className="zr-tree-hint">{"  " + r.hint}</span>}
          </div>
        );
      })}
    </div>
  );
}
