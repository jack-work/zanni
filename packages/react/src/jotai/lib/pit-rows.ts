import { glyphs, voiceGlyph } from "../../index";

export type PitRowId = "new" | "outfits" | "state" | "tail-fork" | "fork-at" | "tree" | "recent" | "asks" | "queue" | "voice" | "hands-free";
export type PitView = "list" | "outfits" | "state" | "fork-at" | "tree" | "recent" | "asks" | "queue";

export interface PitRowSpec {
  readonly id: PitRowId;
  readonly label: string;
  readonly glyph: string;
  readonly tile?: string;
}

export const PIT_ROWS: readonly PitRowSpec[] = [
  { id: "new", label: "New figaro", glyph: glyphs.composer, tile: "New" },
  { id: "state", label: "State", glyph: glyphs["pit.form"] },
  { id: "tail-fork", label: "Fork at the tail", glyph: glyphs.fork, tile: "Fork" },
  { id: "fork-at", label: "Fork at turn", glyph: glyphs.fork },
  { id: "tree", label: "Tree", glyph: glyphs["pit.troupe"], tile: "Tree" },
  { id: "recent", label: "Recent", glyph: glyphs["pit.form"], tile: "Recent" },
  { id: "asks", label: "Asks", glyph: glyphs["pit.form"], tile: "Asks" },
  { id: "queue", label: "Queue", glyph: glyphs["pit.queue"], tile: "Queue" },
  { id: "outfits", label: "Outfits", glyph: glyphs["pit.models"] },
  { id: "voice", label: "Voice", glyph: voiceGlyph, tile: "Voice" },
  { id: "hands-free", label: "Hands-free", glyph: glyphs["audio.play"], tile: "Hands-free" },
];

export function byLastUsed(rows: readonly PitRowSpec[], used: Readonly<Record<string, number>>): PitRowSpec[] {
  const order = new Map(rows.map((r, i) => [r.id, i]));
  return [...rows].sort((a, b) => (used[b.id] ?? 0) - (used[a.id] ?? 0) || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

export function pick(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const seg of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

export function valueAt(root: unknown, path: string): string | undefined {
  const cur = pick(root, path);
  return typeof cur === "string" ? cur : cur === undefined || cur === null ? undefined : JSON.stringify(cur);
}

export const EFFORT_KEY = "system.thinking_effort";
export const FORKED_FROM_KEY = "system.forked_from";
