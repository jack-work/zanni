import type { AriaRow } from "figaro-forms/aria";

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
