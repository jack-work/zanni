import { glyphs } from "./glyphs";
import type { DeltaCell, DeltaRow } from "./nodi-types";

export const DELTA_KEY_CAP = 28;
export const DELTA_VALUE_FLOOR = 6;

export interface WireDelta {
  readonly value?: unknown;
  readonly prev?: unknown;
  readonly kind: string;
  readonly event?: string;
  readonly form: string;
}

export const FORKED_FROM_KEYS: readonly string[] = ["runtime.forked_from", "system.forked_from"];

const ARIA_ID_KEY = "aria_id";

export function sanitize(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 0x20 || c === 0x7f || (c >= 0x80 && c <= 0x9f)) {
      if (/\s/.test(ch)) out += " ";
    } else out += ch;
  }
  return out;
}

export function flatten(s: string): string {
  return sanitize(s).split(/\s+/).filter(Boolean).join(" ");
}

export function isForkKey(kind: string, bare: string): boolean {
  return kind === "bound" && (FORKED_FROM_KEYS.includes(bare) || bare === ARIA_ID_KEY);
}

function cellOf(raw: unknown): DeltaCell {
  if (raw === undefined) return { present: false, text: "" };
  if (typeof raw === "string") return { present: true, text: raw };
  return { present: true, text: JSON.stringify(raw) };
}

interface Group {
  kind: string;
  deleted: boolean;
  keys: string[];
  byKey: Map<string, WireDelta>;
}

function grouped(deltas: Readonly<Record<string, WireDelta>>): { groups: Map<string, Group>; order: string[] } {
  const groups = new Map<string, Group>();
  for (const [key, d] of Object.entries(deltas)) {
    let g = groups.get(d.form);
    if (!g) {
      g = { kind: d.kind, deleted: false, keys: [], byKey: new Map() };
      groups.set(d.form, g);
    }
    if (d.event === "deleted") {
      g.deleted = true;
      continue;
    }
    const bare = key.startsWith(d.form + ".") ? key.slice(d.form.length + 1) : key;
    g.keys.push(bare);
    g.byKey.set(bare, d);
  }
  const order = [...groups.keys()];
  for (const g of groups.values()) g.keys.sort(byCodeUnit);
  order.sort((a, b) => {
    const ba = groups.get(a)!.kind === "bound";
    const bb = groups.get(b)!.kind === "bound";
    if (ba !== bb) return ba ? -1 : 1;
    return byCodeUnit(a, b);
  });
  return { groups, order };
}

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function deltaRowsOf(deltas: Readonly<Record<string, WireDelta>> | undefined, forked: boolean): DeltaRow[] {
  if (!deltas) return [];
  const { groups, order } = grouped(deltas);
  const out: DeltaRow[] = [];
  for (const formId of order) {
    const g = groups.get(formId)!;
    const prefix = g.kind === "bound" ? "" : formId + ".";
    if (g.deleted) out.push({ banner: true, key: sanitize(formId), from: cellOf(undefined), to: cellOf(undefined) });
    for (const k of g.keys) {
      if (forked && isForkKey(g.kind, k)) continue;
      const d = g.byKey.get(k)!;
      out.push({
        banner: false,
        key: sanitize(prefix + k),
        from: cellOf(d.prev),
        to: d.event === "removed" ? cellOf(undefined) : cellOf(d.value),
      });
    }
  }
  return out;
}

export function headLine(text: string): string {
  const cut = text.trim().split("\n");
  const line = flatten(cut[0] ?? "");
  if (cut.length > 1 && cut.slice(1).join("").trim() !== "") return line + "…";
  return line === "" ? '""' : line;
}

export function cellLine(c: DeltaCell): string {
  return c.present ? headLine(c.text) : glyphs.absent;
}

export function cellFull(c: DeltaCell): string {
  if (!c.present) return glyphs.absent;
  const s = flatten(c.text);
  return s === "" ? '""' : s;
}

export function rowFull(r: DeltaRow): string {
  if (r.banner) return glyphs.dead + " " + r.key;
  return r.key + "  " + cellFull(r.from) + " -> " + cellFull(r.to);
}

export function keyColumns(rows: readonly DeltaRow[]): number {
  let w = 0;
  for (const r of rows) {
    if (r.banner) continue;
    const n = [...r.key].length;
    if (n > w && n <= DELTA_KEY_CAP) w = n;
  }
  return w;
}

export function valueLines(c: DeltaCell): string[] {
  if (!c.present) return [glyphs.absent];
  const pretty = (t: string): string[] | null => {
    const s = t.trim();
    if (s[0] !== "{" && s[0] !== "[") return null;
    try {
      return JSON.stringify(JSON.parse(s), null, 2).split("\n");
    } catch {
      return null;
    }
  };
  const lines = pretty(c.text) ?? c.text.split("\n");
  return lines.map((l) => sanitize(l.replace(/\r$/, "")));
}
