import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { entryOf, keyMarks, parse, query, valueMarks, type Entry } from "../../../packages/react/src/lib/find-terms";

interface Golden {
  path: string;
  score: number;
  onKey: boolean;
  spread: boolean;
  valueAt: number;
  keyMarks: number[] | null;
  valueMarks: number[] | null;
}

const corpus = JSON.parse(readFileSync("test/fixtures/find/corpus.json", "utf8")) as { entries: Record<string, string | number>; queries: string[] };
const golden = JSON.parse(readFileSync("test/fixtures/find/golden.json", "utf8")) as Record<string, Golden[] | null>;

const text = (v: string | number): string => (typeof v === "string" ? v : JSON.stringify(v));
const order = (a: string[], b: string[]): number => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return (a[i] as string) < (b[i] as string) ? -1 : 1;
  return a.length - b.length;
};
const entries: Entry[] = Object.entries(corpus.entries)
  .map(([path, v]) => ({ keys: path.split("."), v }))
  .sort((a, b) => order(a.keys, b.keys))
  .map(({ keys, v }) => entryOf(keys.join("."), keys, undefined, keys, text(v)));
const raw = new Map(Object.entries(corpus.entries).map(([path, v]) => [path, text(v)]));

const runeAt = (s: string, byte: number): number => (byte <= 0 ? byte : Array.from(new TextDecoder().decode(new TextEncoder().encode(s).subarray(0, byte))).length);

describe("the tree's fuzzy find against figaro's own internal/fuzzy", () => {
  it("has queries that match, so the comparison says something", () => {
    expect(Object.values(golden).filter((h) => h && h.length > 0).length).toBeGreaterThan(60);
  });

  for (const q of corpus.queries) {
    it(`ranks ${JSON.stringify(q)} as the pager does, with the same marks`, () => {
      const terms = parse(q);
      const want = golden[q] ?? [];
      const got = query(entries, terms).map((h) => {
        const value = raw.get(h.entry.path) as string;
        return {
          path: h.entry.path,
          score: h.score,
          onKey: h.onKey,
          spread: h.spread,
          valueAt: h.valueAt,
          keyMarks: keyMarks(h, terms),
          valueMarks: valueMarks(h, terms, value),
        };
      });
      expect(got.map((g) => g.path)).toEqual(want.map((w) => w.path));
      expect(got.map((g) => [g.score, g.onKey, g.spread])).toEqual(want.map((w) => [w.score, w.onKey, w.spread]));
      expect(got.map((g) => g.valueAt)).toEqual(want.map((w) => (w.valueAt < 0 ? w.valueAt : runeAt((raw.get(w.path) as string).toLowerCase(), w.valueAt))));
      expect(got.map((g) => g.keyMarks)).toEqual(want.map((w) => w.keyMarks ?? []));
      expect(got.map((g) => g.valueMarks)).toEqual(want.map((w) => (w.valueMarks ?? []).map((p) => runeAt(raw.get(w.path) as string, p))));
    });
  }
});
