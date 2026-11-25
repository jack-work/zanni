import type { ChangeEvent, KeyboardEvent } from "react";
import { entryOf, keyMarks, parse, query, valueMarks, type Entry, type Hit, type Term } from "./lib/find-terms";
import { SNIPPET_SEP, treeRows, type RowShown, type TreeNodeData, type TreeRowData } from "./tree";

const SNIPPET_LEAD = 24;
const SNIPPET_WORD = 16;
const INLINE_FIELD = "mantra";

interface Index {
  entries: Entry[];
  parent: Map<string, string | undefined>;
  node: Map<string, TreeNodeData>;
}

export interface Found {
  rows: TreeRowData[];
  steps: string[];
  best: number;
  parent: ReadonlyMap<string, string | undefined>;
}

function fieldsOf(row: TreeNodeData["row"]): [string, string][] {
  return Object.entries(row ?? {})
    .filter(([k]) => k !== "forks")
    .map(([k, v]) => [k, typeof v === "string" ? v : (JSON.stringify(v) ?? "")]);
}

const indexes = new WeakMap<readonly TreeNodeData[], Index>();

function orderKeys(a: readonly string[], b: readonly string[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return (a[i] as string) < (b[i] as string) ? -1 : 1;
  return a.length - b.length;
}

function indexOf(roots: readonly TreeNodeData[]): Index {
  const known = indexes.get(roots);
  if (known) return known;
  const found: { sort: string[]; entry: Entry }[] = [];
  const parent = new Map<string, string | undefined>();
  const node = new Map<string, TreeNodeData>();
  const walk = (kids: readonly TreeNodeData[], rows: readonly string[], labels: readonly string[], sort: readonly string[], up: string | undefined) => {
    for (const n of kids) {
      const at = [...rows, n.id];
      const name = n.key ?? n.label;
      const keys = [...labels, name];
      const order = [...sort, name];
      parent.set(n.id, up);
      node.set(n.id, n);
      if (n.value !== undefined) found.push({ sort: order, entry: entryOf(n.id, at, undefined, keys, n.value) });
      for (const [field, value] of fieldsOf(n.row)) found.push({ sort: [...order, field], entry: entryOf(n.id, [...at, n.id], field, [...keys, field], value) });
      walk(n.children ?? [], at, keys, n.childKey ? [...order, n.childKey] : order, n.id);
    }
  };
  walk(roots, [], [], [], undefined);
  const built = { entries: found.sort((a, b) => orderKeys(a.sort, b.sort)).map((f) => f.entry), parent, node };
  indexes.set(roots, built);
  return built;
}

interface Resolved {
  hit: Hit;
  row: string;
  depth: number;
}

function resolve(h: Hit, terms: readonly Term[], labels: Map<string, number[]>): Resolved | undefined {
  const { keys, rows } = h.entry;
  if (h.valueAt >= 0 || !h.onKey) return { hit: h, row: h.entry.id, depth: keys.length };
  const marks = keyMarks(h, terms);
  let deepest = -1;
  let from = 0;
  keys.forEach((k, d) => {
    const to = from + Array.from(k).length;
    const inside = marks.filter((p) => p >= from && p < to).map((p) => p - from);
    if (inside.length > 0) {
      deepest = d;
      const named = h.entry.field === undefined || d < keys.length - 1;
      if (named && !labels.has(rows[d] as string)) labels.set(rows[d] as string, inside);
    }
    from = to + 1;
  });
  return deepest < 0 ? undefined : { hit: h, row: rows[deepest] as string, depth: deepest + 1 };
}

function snippetOf(value: string, at: number): string {
  const runes = Array.from(value);
  let from = Math.max(at - SNIPPET_LEAD, 0);
  const space = runes.slice(0, from).lastIndexOf(" ");
  if (from > 0 && space >= 0 && from - space < SNIPPET_WORD) from = space + 1;
  const tail = runes.slice(from).join("");
  return (from > 0 ? "\u2026" + tail : tail).split(/\s+/u).filter(Boolean).join(" ");
}

function prune(kids: readonly TreeNodeData[], keep: ReadonlySet<string>): TreeNodeData[] {
  return kids.filter((k) => keep.has(k.id)).map((k) => ({ ...k, children: prune(k.children ?? [], keep) }));
}

function previewOf(s: string, cap = 120): string {
  const runes = Array.from(s.replace(/\s+/gu, " ").trim());
  return runes.length > cap ? runes.slice(0, cap - 1).join("") + "\u2026" : runes.join("");
}

interface Marks {
  label?: readonly number[];
  mantra?: readonly number[];
  value?: readonly number[];
}

function dress(row: TreeRowData, m: Marks): TreeRowData {
  const shown: RowShown = {};
  if (m.label?.length) shown.label = <Marked text={row.label} at={m.label} />;
  if (m.value?.length) shown.value = <Marked text={row.value} at={m.value} />;
  if (m.mantra?.length) shown.mantra = <Marked text={JSON.stringify(row.mantra)} at={m.mantra} />;
  return shown.label || shown.value || shown.mantra ? { ...row, shown } : row;
}

function marksOf(n: TreeNodeData, resolved: readonly Resolved[], terms: readonly Term[], labels: ReadonlyMap<string, number[]>): Marks {
  const out: { label: number[]; mantra: number[]; value: number[] } = { label: n.key === undefined ? labels.get(n.id) ?? [] : [], mantra: [], value: [] };
  for (const r of resolved) {
    if (r.row !== n.id || r.hit.valueAt < 0) continue;
    const { field } = r.hit.entry;
    if (field === undefined) out.value = valueMarks(r.hit, terms, n.value ?? "");
    else if (field === INLINE_FIELD && n.mantra) out.mantra = valueMarks(r.hit, terms, JSON.stringify(n.mantra));
  }
  return out;
}

export function search(roots: readonly TreeNodeData[], text: string, flat: boolean): Found {
  const index = indexOf(roots);
  const terms = parse(text);
  const labels = new Map<string, number[]>();
  const resolved: Resolved[] = [];
  const ranked: string[] = [];
  const best = new Map<string, Resolved>();
  for (const h of query(index.entries, terms)) {
    const r = resolve(h, terms, labels);
    if (!r) continue;
    resolved.push(r);
    if (!best.has(r.row)) {
      best.set(r.row, r);
      ranked.push(r.row);
    }
  }

  const leaves = new Map<string, Resolved[]>();
  for (const r of resolved) {
    const { field, keys } = r.hit.entry;
    if (field === undefined || r.depth !== keys.length || (r.hit.valueAt >= 0 && field === INLINE_FIELD)) continue;
    const list = leaves.get(r.row) ?? [];
    if (!list.some((x) => x.hit.entry.path === r.hit.entry.path)) list.push(r);
    leaves.set(r.row, list);
  }

  const shown = new Set<string>();
  for (const id of ranked) for (let at: string | undefined = id; at !== undefined && !shown.has(at); at = index.parent.get(at)) shown.add(at);
  const open = new Set<string>();
  for (const id of shown) {
    const up = index.parent.get(id);
    if (up !== undefined) open.add(up);
  }

  const snippetRow = (under: TreeRowData, r: Resolved): TreeRowData => {
    const { field, path } = r.hit.entry;
    const name = field as string;
    const raw = fieldsOf(index.node.get(r.row)?.row).find(([k]) => k === name)?.[1] ?? "";
    const showing = r.hit.valueAt >= 0 ? snippetOf(raw, r.hit.valueAt) : previewOf(raw);
    const labelAt = Array.from(path).length - Array.from(name).length;
    return dress({
      id: r.row + SNIPPET_SEP + name,
      parent: r.row,
      depth: under.depth + 1,
      label: name,
      leaf: true,
      gap: "",
      value: showing,
      inline: "",
      count: 0,
      peek: "",
      role: "",
      mantra: "",
      here: false,
      hint: "",
      expandable: false,
      open: false,
    }, {
      label: r.hit.onKey ? keyMarks(r.hit, terms).filter((p) => p >= labelAt).map((p) => p - labelAt) : [],
      value: r.hit.valueAt >= 0 ? valueMarks(r.hit, terms, showing) : [],
    });
  };

  if (flat) {
    const base = new Map(treeRows(roots, () => true).map((row) => [row.id, row]));
    const rows: TreeRowData[] = [];
    for (const id of ranked) {
      const r = best.get(id) as Resolved;
      const row = base.get(id);
      if (!row) continue;
      if (r.hit.entry.field === undefined || r.depth < r.hit.entry.keys.length) {
        const path = r.hit.entry.keys.slice(0, r.depth).join(".");
        rows.push(dress({ ...row, depth: 0, parent: undefined, label: path, expandable: false, open: false }, { ...marksOf(index.node.get(id) as TreeNodeData, resolved, terms, labels), label: [] }));
        continue;
      }
      const leaf = snippetRow({ ...row, depth: -1 }, r);
      rows.push({ ...leaf, parent: undefined, depth: 0, label: r.hit.entry.path, shown: { ...leaf.shown, label: undefined } });
    }
    return { rows, steps: rows.map((r) => r.id), best: 0, parent: index.parent };
  }

  const lit = new Set(ranked);
  const rows: TreeRowData[] = treeRows(prune(roots, shown), (id) => open.has(id)).map((row) => (lit.has(row.id) ? dress(row, marksOf(index.node.get(row.id) as TreeNodeData, resolved, terms, labels)) : row));
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i] as TreeRowData;
    const own = leaves.get(row.id);
    if (!own) continue;
    let end = i + 1;
    while (end < rows.length && (rows[end] as TreeRowData).depth > row.depth) end++;
    const before = own.filter((r) => (r.hit.entry.field as string) < "forks").map((r) => snippetRow(row, r));
    const after = own.filter((r) => (r.hit.entry.field as string) >= "forks").map((r) => snippetRow(row, r));
    const byField = (a: TreeRowData, b: TreeRowData) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0);
    rows.splice(end, 0, ...after.sort(byField));
    rows.splice(i + 1, 0, ...before.sort(byField));
    rows[i] = { ...row, expandable: true, open: true };
  }
  const steps = rows.filter((r) => r.shown).map((r) => r.id);
  const first = ranked[0];
  const at = first === undefined ? 0 : Math.max(steps.findIndex((id) => id === first || id.startsWith(first + SNIPPET_SEP)), 0);
  return { rows, steps, best: at, parent: index.parent };
}

export function Marked({ text, at }: { text: string; at: readonly number[] }) {
  const lit = new Set(at);
  const parts: [boolean, string][] = [];
  Array.from(text).forEach((c, i) => {
    const on = lit.has(i);
    const last = parts[parts.length - 1];
    if (last && last[0] === on) last[1] += c;
    else parts.push([on, c]);
  });
  return (
    <>
      {parts.map(([on, t], i) =>
        on ? (
          <mark key={i} className="zr-tree-hit">
            {t}
          </mark>
        ) : (
          t
        ),
      )}
    </>
  );
}

export function scroll(from: HTMLElement | null, dy: number): void {
  for (let el = from?.parentElement; el; el = el.parentElement) {
    if (el.scrollHeight > el.clientHeight && /auto|scroll/.test(getComputedStyle(el).overflowY)) return void el.scrollBy({ top: dy });
  }
}

export interface BarProps {
  query: string;
  tally: string;
  edit: (query: string) => void;
  hop: (by: number) => void;
  flip: () => void;
  end: (keep: boolean) => void;
}

export function Bar({ query, tally, edit, hop, flip, end }: BarProps) {
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    const key = e.ctrlKey ? "^" + e.key : e.key;
    if (key === "ArrowDown" || key === "^n") hop(1);
    else if (key === "ArrowUp" || key === "^p") hop(-1);
    else if (key === "Tab") flip();
    else if (key === "Enter") end(true);
    else if (key === "Escape") end(false);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  return (
    <div className="zr-tree-find">
      <span aria-hidden="true">/</span>
      <input autoFocus value={query} onChange={(e: ChangeEvent<HTMLInputElement>) => edit(e.target.value)} onKeyDown={onKeyDown} aria-label="Find" spellCheck={false} autoComplete="off" autoCapitalize="off" />
      <span className="zr-tree-tally" role="status">
        {tally}
      </span>
    </div>
  );
}
