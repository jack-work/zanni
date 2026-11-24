import { pagerWebCommand, webCommandDocs, webCommands, type WebCommandDoc } from "figaro-forms/catalog";

export interface Token {
  readonly text: string;
  readonly at: number;
}

export function tokenize(line: string): Token[] {
  const out: Token[] = [];
  let cur = "";
  let at = -1;
  let quote = "";
  const flush = () => {
    if (at >= 0) out.push({ text: cur, at });
    cur = "";
    at = -1;
  };
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quote) {
      if (c === quote) quote = "";
      else if (c === "\\" && quote === '"' && i + 1 < line.length) cur += line[++i];
      else cur += c;
    } else if (c === "'" || c === '"') {
      if (at < 0) at = i;
      quote = c;
    } else if (c === "\\" && i + 1 < line.length) {
      if (at < 0) at = i;
      cur += line[++i];
    } else if (/\s/.test(c)) flush();
    else {
      if (at < 0) at = i;
      cur += c;
    }
  }
  flush();
  return out;
}

export interface Flags {
  id?: string;
  outfit?: string;
  stay?: boolean;
}

export type Plan =
  | { kind: "none" }
  | { kind: "refused"; word: string; why: string }
  | { kind: "run"; doc: WebCommandDoc; args: string[]; flags: Flags; prompt: string | undefined };

const UNBUILT: Partial<Record<WebCommandDoc["name"], string>> = {
  reaped: "figaro web has no view of reaped arias yet",
  models: "figaro web has no models view yet",
  comment: "figaro web does not write comments yet",
  notifications: "figaro web keeps no notification log yet",
};

const IDS = new Set<WebCommandDoc["name"]>(["set", "unset", "toggle", "get", "pwd", "hup", "send", "status", "name", "show", "state"]);

function flagWord(doc: WebCommandDoc, token: string): "id" | "outfit" | "stay" | "" {
  if (token === "--id" && (IDS.has(doc.name) || doc.name === "fork")) return "id";
  if ((token === "-O" || token === "--outfit") && doc.name === "new") return "outfit";
  if (token === "--stay" && doc.name === "fork") return "stay";
  return "";
}

export function refusalOf(doc: WebCommandDoc): string {
  const route = webCommands[doc.name];
  const unbuilt = UNBUILT[doc.name];
  if (unbuilt) return doc.name + ": " + unbuilt;
  if (doc.pager === "refused") return doc.name + ": " + (doc.refusal ?? "the pager does not run it");
  if (route.on === "nowhere") return route.reason;
  return "";
}

export function planOf(line: string): Plan {
  const toks = tokenize(line);
  if (toks.length === 0) return { kind: "none" };
  const word = toks[0]!.text;
  const doc = pagerWebCommand(word);
  if (!doc) return { kind: "refused", word, why: word + ": no such command. :help lists them." };
  const refused = refusalOf(doc);
  if (refused) return { kind: "refused", word, why: refused };
  const route = webCommands[doc.name];
  const cut = toks.findIndex((t, i) => i > 0 && t.text === "--");
  const head = cut < 0 ? toks.slice(1) : toks.slice(1, cut);
  const prompt = cut < 0 ? undefined : line.slice(toks[cut + 1]?.at ?? line.length).trim();
  const flags: Flags = {};
  const args: string[] = [];
  for (let i = 0; i < head.length; i++) {
    const t = head[i]!.text;
    if (t.startsWith("-") && t.length > 1 && !/^-\d+$/.test(t)) {
      const which = flagWord(doc, t);
      if (which === "stay") flags.stay = true;
      else if (which) {
        const value = head[++i]?.text;
        if (value === undefined) return { kind: "refused", word, why: doc.name + ": " + t + " takes a value. " + (doc.usage ?? "") };
        flags[which] = value;
      } else {
        const limit = route.on === "gateway" && route.limits ? " (" + route.limits + ")" : "";
        return { kind: "refused", word, why: doc.name + ": figaro web does not take " + t + limit };
      }
    } else args.push(t);
  }
  if (prompt !== undefined && !(doc.name === "new" || doc.name === "fork" || doc.name === "send")) {
    return { kind: "refused", word, why: doc.name + " takes no prompt after --. " + (doc.usage ?? "") };
  }
  if (doc.name === "new" && args.length) return { kind: "refused", word, why: "new: name outfits with -O and put a prompt after --. " + (doc.usage ?? "") };
  if (doc.name === "fork" && args.length > 1) return { kind: "refused", word, why: "fork: one spec, then -- and a prompt. " + (doc.usage ?? "") };
  if (doc.name === "send" && args.length > 1) return { kind: "refused", word, why: "send: one aria, then -- and the text. " + (doc.usage ?? "") };
  if (doc.name !== "new" && doc.name !== "fork" && doc.name !== "send") {
    const { min, max } = doc;
    if (args.length < min || (max > 0 && args.length > max)) return { kind: "refused", word, why: "usage: " + (doc.usage ?? doc.name) };
  }
  return { kind: "run", doc, args, flags, prompt };
}

export interface ForkSpec {
  readonly aria: string | undefined;
  readonly turn: number | undefined;
}

export function forkSpecOf(spec: string | undefined): ForkSpec | string {
  if (!spec) return { aria: undefined, turn: undefined };
  const at = spec.indexOf(":");
  const aria = at < 0 ? spec : spec.slice(0, at);
  if (at < 0) return { aria, turn: undefined };
  const rest = spec.slice(at + 1);
  const turn = /^(\d{1,6})(\.\d+)?$/.exec(rest);
  if (!turn) return "fork: " + spec + " is not <id>[:<turn>]";
  if (turn[2]) return "fork: a node fork point is not kept; give a turn";
  return { aria: aria || undefined, turn: Number(turn[1]) };
}

export function pathOf(root: unknown, path: string): { found: boolean; value: unknown } {
  let cur: unknown = root;
  for (const seg of path.split(".")) {
    if (Array.isArray(cur)) {
      const i = /^\d+$/.test(seg) ? Number(seg) : -1;
      if (i < 0 || i >= cur.length) return { found: false, value: undefined };
      cur = cur[i];
    } else if (cur !== null && typeof cur === "object" && Object.prototype.hasOwnProperty.call(cur, seg)) cur = (cur as Record<string, unknown>)[seg];
    else return { found: false, value: undefined };
  }
  return { found: true, value: cur };
}

export function shown(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

const PROTECTED = /^(system|runtime)(\.|$)|^(name|aria_id|role-name)$/;

export function keysOf(root: unknown, plainOnly: boolean): string[] {
  const out: string[] = [];
  const walk = (v: unknown, at: string, depth: number) => {
    if (v !== null && typeof v === "object" && !Array.isArray(v) && depth < 4) {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, at ? at + "." + k : k, depth + 1);
    } else if (at) out.push(at);
  };
  walk(root, "", 0);
  return (plainOnly ? out.filter((k) => !PROTECTED.test(k)) : out).sort();
}

export interface Candidate {
  readonly text: string;
  readonly label: string;
  readonly help: string;
  readonly off: string;
}

export interface Hint {
  readonly usage: string;
  readonly help: string;
  readonly refusal: string;
}

export interface Suggestions {
  readonly items: readonly Candidate[];
  readonly hint: Hint | null;
}

export interface Sources {
  readonly arias: readonly { id: string; label: string }[];
  readonly keys: readonly string[];
  readonly outfits: readonly string[];
}

export const NO_SUGGESTIONS: Suggestions = { items: [], hint: null };

const MAX_ITEMS = 12;

function matching(items: readonly Candidate[], typed: string): Candidate[] {
  const low = typed.toLowerCase();
  const starts = items.filter((c) => c.text.toLowerCase().startsWith(low) || c.label.toLowerCase().startsWith(low));
  const has = items.filter((c) => !starts.includes(c) && (c.text.toLowerCase().includes(low) || c.label.toLowerCase().includes(low)));
  return [...starts, ...has].slice(0, MAX_ITEMS);
}

function verbCandidates(): Candidate[] {
  const out: Candidate[] = [];
  for (const doc of webCommandDocs) {
    if (doc.hidden) continue;
    const off = refusalOf(doc);
    out.push({ text: doc.name, label: doc.name, help: doc.help, off });
  }
  return [...out.filter((c) => !c.off), ...out.filter((c) => c.off)];
}

const plain = (text: string): Candidate => ({ text, label: text, help: "", off: "" });

export function suggest(line: string, src: Sources): Suggestions {
  const toks = tokenize(line);
  const open = toks.length === 0 || !/\s$/.test(line);
  const typed = open && toks.length ? toks[toks.length - 1]!.text : "";
  const word = toks[0]?.text ?? "";
  if (toks.length === 0 || (toks.length === 1 && open)) {
    return { items: matching(verbCandidates(), typed), hint: null };
  }
  const doc = pagerWebCommand(word);
  if (!doc) return { items: [], hint: { usage: "", help: "", refusal: word + ": no such command" } };
  const refusal = refusalOf(doc);
  const hint: Hint = { usage: doc.usage ?? doc.name, help: doc.help, refusal };
  if (refusal) return { items: [], hint };
  const prev = open ? toks[toks.length - 2]?.text : toks[toks.length - 1]?.text;
  const beforeDash = toks.slice(1, open ? -1 : undefined).every((t) => t.text !== "--");
  if (!beforeDash) return { items: [], hint };
  const positional = toks.slice(1).filter((t, i, all) => !t.text.startsWith("-") && !(i > 0 && /^(--id|-O|--outfit)$/.test(all[i - 1]!.text))).length - (open && typed && !typed.startsWith("-") ? 1 : 0);
  if (prev === "-O" || prev === "--outfit") return { items: matching(src.outfits.map(plain), typed), hint };
  if (prev === "--id") return { items: matching(src.arias.map((a) => ({ text: a.id, label: a.label, help: a.id.slice(0, 8), off: "" })), typed), hint };
  const aria = () => matching(src.arias.map((a) => ({ text: a.id, label: a.label, help: a.id.slice(0, 8), off: "" })), typed);
  const keys = (plainOnly: boolean) => matching(src.keys.filter((k) => !plainOnly || !PROTECTED.test(k)).map(plain), typed);
  switch (doc.complete) {
    case "commands":
      return { items: positional === 0 ? matching(verbCandidates(), typed) : [], hint };
    case "arias":
    case "attend":
    case "aria-flag":
    case "fork":
    case "send":
      return { items: positional === 0 ? aria() : [], hint };
    case "keys":
      return { items: doc.name === "get" ? keys(false) : keys(true), hint };
    case "set":
      return { items: positional === 0 ? keys(true) : [], hint };
    case "state": {
      const verbs = doc.choices ?? [];
      return { items: positional === 0 ? matching(verbs.map((c) => ({ text: c.name, label: c.name, help: c.help, off: "" })), typed) : [], hint };
    }
    default:
      return { items: [], hint };
  }
}

export function applyCandidate(line: string, item: Candidate): string {
  const toks = tokenize(line);
  const open = toks.length > 0 && !/\s$/.test(line);
  const base = open ? line.slice(0, toks[toks.length - 1]!.at) : line;
  const text = /[\s"'\\]/.test(item.text) ? JSON.stringify(item.text) : item.text;
  return base + text + " ";
}
