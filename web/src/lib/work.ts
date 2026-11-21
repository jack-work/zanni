import type { Item, ThinkingItem, ToolItem, TurnModel } from "./zanni";

export type Work = ToolItem | ThinkingItem;

export type Row = Item | { kind: "group"; key: string; items: Work[] };

const COMMAND = /^(bash|sh|shell|exec|run|command|terminal)$/i;
const EDIT = /^(edit|write|patch|apply_patch|replace|str_replace|multiedit|create|delete)$/i;
const READ = /^(read|cat|view|open|webfetch|fetch)$/i;
const SEARCH = /^(grep|glob|find|ls|search|rg|list|websearch)$/i;

export type ToolKind = "run" | "edit" | "read" | "search" | "other";

export function toolKind(name: string): ToolKind {
  const bare = name.replace(/^mcp__[^_]+__/, "").trim();
  if (COMMAND.test(bare)) return "run";
  if (EDIT.test(bare)) return "edit";
  if (READ.test(bare)) return "read";
  if (SEARCH.test(bare)) return "search";
  return "other";
}

const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

export function formatWorkedTime(ms: number): string {
  const total = Math.max(1, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}h ${m}m` : m ? `${m}m ${s}s` : `${s}s`;
}

export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2);
}

export function stepsTitle(items: readonly Work[], live: boolean): string {
  let edits = 0;
  let reads = 0;
  let searches = 0;
  let commands = 0;
  let others = 0;
  let thoughts = 0;
  for (const it of items) {
    if (it.kind === "thinking") {
      thoughts++;
      continue;
    }
    switch (toolKind(it.name)) {
      case "edit":
        edits++;
        break;
      case "read":
        reads++;
        break;
      case "search":
        searches++;
        break;
      case "run":
        commands++;
        break;
      default:
        others++;
    }
  }
  const explore = [reads ? plural(reads, "file", "files") : "", searches ? plural(searches, "search", "searches") : ""].filter(Boolean).join(", ");
  const ran = commands ? "ran " + plural(commands, "command", "commands") : "";
  if (edits) return [(live ? "Editing " : "Edited ") + plural(edits, "file", "files"), explore ? "explored " + explore : "", ran].filter(Boolean).join(", ");
  if (reads || searches) return [(live ? "Exploring " : "Explored ") + explore, ran].filter(Boolean).join(", ");
  if (commands) return (live ? "Running " : "Ran ") + plural(commands, "command", "commands");
  if (others) return (live ? "Calling " : "Called ") + plural(others, "tool", "tools");
  return live ? "Thinking" : thoughts > 1 ? `Thought ${thoughts} times` : "Thought";
}

export function groupWork(items: readonly Item[]): Row[] {
  const rows: Row[] = [];
  let run: Work[] = [];
  const flush = () => {
    if (run.length > 1) rows.push({ kind: "group", key: "g" + run[0]!.key, items: run });
    else rows.push(...run);
    run = [];
  };
  for (const it of items) {
    if (it.kind === "thinking" || it.kind === "tool") run.push(it);
    else {
      flush();
      rows.push(it);
    }
  }
  flush();
  return rows;
}

function strip(summary: string): string {
  return summary.replace(/^[a-z_]+=/i, "").trim();
}

export function liveVerb(item: Item | undefined): string {
  if (!item) return "Working";
  switch (item.kind) {
    case "thinking":
      return "Thinking";
    case "prose":
      return "Writing";
    case "steering":
      return "Steered";
    case "unknown":
      return "Working";
    case "tool": {
      if (item.status !== "running") return "Working";
      const detail = strip(item.summary);
      const verb = { run: "Running", edit: "Editing", read: "Reading", search: "Searching", other: "Calling " + (item.name || "tool") }[toolKind(item.name)];
      return detail ? verb + " " + detail : verb;
    }
  }
}

export interface Work_ {
  readonly verb: string;
  readonly startedAt: number | undefined;
}

const SIX_HOURS = 6 * 3600_000;

export function workOf(turn: TurnModel | undefined, now: number): Work_ {
  if (!turn || !turn.open) return { verb: "Working", startedAt: undefined };
  const live = [...turn.items].reverse().find((i) => i.kind === "tool" && i.status === "running") ?? turn.items[turn.items.length - 1];
  const at = Number(turn.input?.at);
  const startedAt = isFinite(at) && at > 0 && now - at >= 0 && now - at < SIX_HOURS ? at : undefined;
  return { verb: liveVerb(live), startedAt };
}
