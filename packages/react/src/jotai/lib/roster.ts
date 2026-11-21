import type { AriaRow } from "figaro-forms/aria";

export function depths(rows: readonly AriaRow[]): Record<string, number> {
  const by = new Map<string, AriaRow>();
  const out: Record<string, number> = {};
  for (const r of rows) by.set(r.id, r);
  const depth = (r: AriaRow, guard: number): number => {
    const known = out[r.id];
    if (known !== undefined) return known;
    const p = r.parent && r.parent !== r.id ? by.get(r.parent) : undefined;
    let d = p && guard < 32 ? depth(p, guard + 1) + 1 : 0;
    if (d > 6) d = 6;
    out[r.id] = d;
    return d;
  };
  for (const r of rows) depth(r, 0);
  return out;
}

export function labelOf(row: AriaRow | undefined): string {
  if (!row) return "";
  return row.mantra || row.handle || row.short || String(row.id).slice(0, 8);
}

export function refusalText(kind: string | undefined): string {
  const words: Record<string, string> = {
    denied: "You may not read or follow this aria.",
    not_found: "No such aria, or one you may not read.",
    dormant: "This aria is asleep.",
    moved: "This aria is moving between nodes.",
    unavailable: "Momentarily unavailable.",
  };
  return (kind && words[kind]) || "Refused.";
}

export const PHASE_WORDS: Record<string, string> = {
  connecting: "Connecting",
  "catching-up": "Catching up",
  live: "Live",
  offline: "Offline",
  refused: "Not allowed",
  gone: "Not found",
  closed: "Closed",
  detached: "",
};
