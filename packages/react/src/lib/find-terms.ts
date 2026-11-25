import { VALUE_CAP, fuzzy, runesOf, scanLower } from "./fuzzy";

const FUZZY = 0;
const EXACT = 1;
const PREFIX = 2;
const SUFFIX = 3;
const EXACT_SCORE = 16;

export interface Term {
  kind: number;
  negate: boolean;
  onKey: boolean;
  onValue: boolean;
  text: string;
  lower: string;
  runes: number[];
}

export function parse(query: string): Term[] {
  const out: Term[] = [];
  for (const word of query.split(/\s+/u)) {
    let f = word;
    let onKey = true;
    let onValue = true;
    if (f.startsWith("k:")) {
      onValue = false;
      f = f.slice(2);
    } else if (f.startsWith("v:")) {
      onKey = false;
      f = f.slice(2);
    }
    let negate = false;
    if (f.startsWith("!")) {
      negate = true;
      f = f.slice(1);
    }
    let kind = FUZZY;
    if (f.startsWith("'")) {
      kind = EXACT;
      f = f.slice(1);
    } else if (f.startsWith("^")) {
      kind = PREFIX;
      f = f.slice(1);
    } else if (f.length > 1 && f.endsWith("$")) {
      kind = SUFFIX;
      f = f.slice(0, -1);
    }
    if (negate && kind === FUZZY) kind = EXACT;
    if (f === "") continue;
    const lower = f.toLowerCase();
    out.push({ kind, negate, onKey, onValue, text: f, lower, runes: runesOf(lower) });
  }
  return out;
}

export interface Entry {
  id: string;
  rows: readonly string[];
  field: string | undefined;
  keys: readonly string[];
  path: string;
  pathRunes: number[];
  segments: number[][];
  value: string;
  valueRunes: number[];
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function entryOf(id: string, rows: readonly string[], field: string | undefined, keys: readonly string[], value: string): Entry {
  const path = keys.join(".");
  const bytes = encoder.encode(value);
  const cut = bytes.length > VALUE_CAP ? decoder.decode(bytes.subarray(0, VALUE_CAP)) : value;
  const lower = cut.toLowerCase();
  return { id, rows, field, keys, path, pathRunes: runesOf(path), segments: keys.map(runesOf), value: lower, valueRunes: runesOf(lower) };
}

export interface Hit {
  entry: Entry;
  score: number;
  onKey: boolean;
  spread: boolean;
  valueAt: number;
  onValue: number;
}

const valueTerm = (h: Hit, i: number): boolean => i < 31 && (h.onValue & (1 << i)) !== 0;

const cpIndex = (s: string, at: number): number => (at < 0 ? at : Array.from(s.slice(0, at)).length);

function bestKey(t: Term, e: Entry): { seg: number; score: number } {
  let seg = -1;
  let score = 0;
  e.segments.forEach((runes, i) => {
    const got = fuzzy(runes, t.runes, false);
    if (got && (seg < 0 || got.score > score)) {
      seg = i;
      score = got.score;
    }
  });
  return { seg, score };
}

const spans = (t: Term): boolean => t.text.includes(".");

function matchKey(t: Term, e: Entry): { score: number; ok: boolean; spread: boolean } {
  const none = { score: 0, ok: false, spread: false };
  if (!t.onKey) return none;
  if (t.kind === FUZZY) {
    if (spans(t)) {
      const got = fuzzy(e.pathRunes, t.runes, false);
      return { score: got?.score ?? 0, ok: !!got, spread: !!got && !e.path.toLowerCase().includes(t.lower) };
    }
    const { seg, score } = bestKey(t, e);
    if (seg < 0) return none;
    return { score, ok: true, spread: !(e.keys[seg] as string).toLowerCase().includes(t.lower) };
  }
  const low = e.path.toLowerCase();
  const ok = t.kind === EXACT ? low.includes(t.lower) : t.kind === PREFIX ? low.startsWith(t.lower) : low.endsWith(t.lower);
  return { score: ok ? EXACT_SCORE * Array.from(t.text).length : 0, ok, spread: false };
}

interface ValueHit {
  ok: boolean;
  spread: boolean;
  at: number;
  score: number;
}

function valueAtOf(t: Term, value: string): number {
  if (t.kind === PREFIX) return value.startsWith(t.lower) ? 0 : -1;
  if (t.kind === SUFFIX) return value.endsWith(t.lower) ? cpIndex(value, value.length - t.lower.length) : -1;
  return cpIndex(value, value.indexOf(t.lower));
}

function matchValue(t: Term, e: Entry): ValueHit {
  const none = { ok: false, spread: false, at: 0, score: 0 };
  if (!t.onValue) return none;
  if (t.kind !== FUZZY) {
    const at = valueAtOf(t, e.value);
    return { ok: at >= 0, spread: false, at, score: EXACT_SCORE * t.runes.length };
  }
  const got = scanLower(e.valueRunes, t.runes);
  if (!got) return none;
  return { ok: true, spread: !e.value.includes(t.lower), at: got.start, score: got.score };
}

function match(terms: readonly Term[], e: Entry): Hit | undefined {
  const h: Hit = { entry: e, score: 0, onKey: false, spread: false, valueAt: -1, onValue: 0 };
  for (const [i, t] of terms.entries()) {
    const k = matchKey(t, e);
    const v = !k.ok || k.spread ? matchValue(t, e) : { ok: false, spread: false, at: 0, score: 0 };
    if (t.negate) {
      if (k.ok || v.ok) return undefined;
      continue;
    }
    if (v.ok && (!k.ok || !v.spread)) {
      if (i < 31) h.onValue |= 1 << i;
      h.spread = h.spread || v.spread;
      h.score += v.score;
      if (h.valueAt < 0 || v.at < h.valueAt) h.valueAt = v.at;
    } else if (k.ok) {
      h.onKey = true;
      h.spread = h.spread || k.spread;
      h.score += k.score;
    } else return undefined;
  }
  return h;
}

export function compare(a: Hit, b: Hit): number {
  if (a.spread !== b.spread) return a.spread ? 1 : -1;
  if (a.onKey !== b.onKey) return a.onKey ? -1 : 1;
  return b.score - a.score;
}

export function query(entries: readonly Entry[], terms: readonly Term[]): Hit[] {
  if (!terms.some((t) => !t.negate)) return [];
  let hits: Hit[] = [];
  let tight = false;
  for (const e of entries) {
    const h = match(terms, e);
    if (!h) continue;
    hits.push(h);
    tight = tight || !h.spread;
  }
  if (tight) hits = hits.filter((h) => !h.spread);
  return hits.sort(compare);
}

function valueMarksOf(t: Term, text: string, from: number): number[] {
  const runes = runesOf(text);
  if (from < 0 || from > runes.length) return [];
  if (t.kind === FUZZY) return (fuzzy(runes.slice(from), t.runes, true)?.positions ?? []).map((p) => from + p);
  const low = runesOf(text.toLowerCase());
  const out: number[] = [];
  for (let at = from; at + t.runes.length <= low.length; at++) {
    if (t.runes.every((r, k) => low[at + k] === r)) {
      for (let k = 0; k < t.runes.length; k++) out.push(at + k);
      at += t.runes.length - 1;
    }
  }
  return out;
}

export function valueMarks(h: Hit, terms: readonly Term[], text: string, from = 0): number[] {
  const out = new Set<number>();
  terms.forEach((t, i) => {
    if (valueTerm(h, i)) for (const p of valueMarksOf(t, text, from)) out.add(p);
  });
  return [...out].sort((a, b) => a - b);
}

function keyPositionsOf(t: Term, e: Entry): number[] {
  if (!t.onKey || t.negate) return [];
  if (t.kind === FUZZY) {
    if (spans(t)) return fuzzy(e.pathRunes, t.runes, true)?.positions ?? [];
    const { seg } = bestKey(t, e);
    if (seg < 0) return [];
    let at = 0;
    for (let i = 0; i < seg; i++) at += (e.segments[i] as number[]).length + 1;
    return (fuzzy(e.segments[seg] as number[], t.runes, true)?.positions ?? []).map((p) => p + at);
  }
  const low = e.path.toLowerCase();
  const at = t.kind === EXACT ? low.indexOf(t.lower) : t.kind === PREFIX ? (low.startsWith(t.lower) ? 0 : -1) : low.endsWith(t.lower) ? low.length - t.lower.length : -1;
  if (at < 0) return [];
  const first = Array.from(e.path.slice(0, at)).length;
  return t.runes.map((_, i) => first + i);
}

export function keyMarks(h: Hit, terms: readonly Term[]): number[] {
  const out: number[] = [];
  terms.forEach((t, i) => {
    if (!valueTerm(h, i)) out.push(...keyPositionsOf(t, h.entry));
  });
  return out.sort((a, b) => a - b);
}
