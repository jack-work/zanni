import { glyphs, voiceGlyph } from "../../index";

export type PitRowId = "new" | "outfits" | "state" | "tail-fork" | "fork-at" | "tree" | "recent" | "voice";
export type PitView = "list" | "outfits" | "state" | "fork-at" | "tree" | "recent";

export interface PitRowSpec {
  readonly id: PitRowId;
  readonly label: string;
  readonly glyph: string;
}

export const PIT_ROWS: readonly PitRowSpec[] = [
  { id: "new", label: "New figaro", glyph: glyphs.composer },
  { id: "state", label: "State", glyph: glyphs["pit.form"] },
  { id: "tail-fork", label: "Fork at the tail", glyph: glyphs.fork },
  { id: "fork-at", label: "Fork at turn", glyph: glyphs.fork },
  { id: "tree", label: "Tree", glyph: glyphs["pit.troupe"] },
  { id: "recent", label: "Recent", glyph: glyphs["pit.form"] },
  { id: "outfits", label: "Outfits", glyph: glyphs["pit.models"] },
  { id: "voice", label: "Voice", glyph: voiceGlyph },
];

export function byLastUsed(rows: readonly PitRowSpec[], used: Readonly<Record<string, number>>): PitRowSpec[] {
  const order = new Map(rows.map((r, i) => [r.id, i]));
  return [...rows].sort((a, b) => (used[b.id] ?? 0) - (used[a.id] ?? 0) || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

export function valueAt(root: unknown, path: string): string | undefined {
  let cur: unknown = root;
  for (const seg of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return typeof cur === "string" ? cur : cur === undefined || cur === null ? undefined : JSON.stringify(cur);
}

export const EFFORT_KEY = "system.thinking_effort";
export const FORKED_FROM_KEY = "system.forked_from";
