import { describe, expect, it } from "vitest";
import { cellLine, deltaRowsOf, keyColumns, valueLines, type WireDelta } from "zanni-react";

const d = (form: string, kind: string, event: string, prev: unknown, value: unknown): WireDelta => ({
  form,
  kind,
  event,
  ...(prev === undefined ? {} : { prev }),
  ...(value === undefined ? {} : { value }),
});

const lines = (deltas: Record<string, WireDelta>, forked = false) => deltaRowsOf(deltas, forked).map((r) => (r.banner ? "⊘ " + r.key : r.key + "  " + cellLine(r.from) + " -> " + cellLine(r.to)));

describe("deltaRowsOf, the pager's table", () => {
  it("draws the bound form first and unprefixed, then every other form dotted onto its id, keys sorted", () => {
    expect(
      lines({
        "@f1.status": d("@f1", "studied", "set", "open", "merged"),
        "@f1.sha": d("@f1", "studied", "set", undefined, "8b12f128"),
        "a1.phase": d("a1", "bound", "set", "seed", "canary"),
      }),
    ).toEqual(["phase  seed -> canary", "@f1.sha  ∅ -> 8b12f128", "@f1.status  open -> merged"]);
  });

  it("a removed key keeps its old side, a deleted form is one banner row", () => {
    expect(lines({ "@f1.brief": d("@f1", "studied", "removed", "ship it", undefined) })).toEqual(["@f1.brief  ship it -> ∅"]);
    expect(lines({ "@f1": d("@f1", "studied", "deleted", undefined, undefined) })).toEqual(["⊘ @f1"]);
  });

  it("a role's recast is a row", () => {
    expect(lines({ "@r1.target-aria": d("@r1", "role", "set", "a3", "a9") })).toEqual(["@r1.target-aria  a3 -> a9"]);
  });

  it("the empty string is not absent", () => {
    expect(lines({ "a1.k": d("a1", "bound", "set", "", "v") })).toEqual(['k  "" -> v']);
  });

  it("values that are not strings come back as JSON", () => {
    expect(lines({ "a1.n": d("a1", "bound", "set", 1, { a: [true] }) })).toEqual(["n  1 -> " + '{"a":[true]}']);
  });

  it("a multi-line value is its first line and an ellipsis", () => {
    expect(lines({ "a1.credo": d("a1", "bound", "set", undefined, "one\ntwo\n\nthree") })).toEqual(["credo  ∅ -> one…"]);
  });

  it("a form value is untrusted: control sequences never reach a row or a key", () => {
    const rows = deltaRowsOf({ "a1.k": d("a1", "bound", "set", undefined, "safe\u001b[2Jhidden"), "a1.x\u001b[31my": d("a1", "bound", "set", undefined, "v") }, false);
    for (const r of rows) {
      for (const text of [r.key, cellLine(r.to), ...valueLines(r.to)]) expect(/[\u0000-\u001f\u007f-\u009f]/.test(text)).toBe(false);
    }
    expect(rows.map((r) => r.key)).toEqual(["k", "x[31my"]);
  });

  it("a fork's birth keys leave no rows, and only on the bound form", () => {
    const deltas = {
      "a1.runtime.forked_from": d("a1", "bound", "set", undefined, "aaaa1111"),
      "a1.system.forked_from": d("a1", "bound", "set", undefined, "aaaa1111"),
      "a1.aria_id": d("a1", "bound", "set", undefined, "beef5678"),
      "a1.mantra": d("a1", "bound", "set", undefined, "sing"),
      "@f2.aria_id": d("@f2", "studied", "set", undefined, "kept"),
    };
    expect(lines(deltas, true)).toEqual(["mantra  ∅ -> sing", "@f2.aria_id  ∅ -> kept"]);
    expect(lines(deltas, false)).toHaveLength(5);
    expect(lines({ "a1.runtime.forked_from": d("a1", "bound", "set", undefined, "x") }, true)).toEqual([]);
  });

  it("no deltas, no rows", () => {
    expect(deltaRowsOf(undefined, false)).toEqual([]);
    expect(deltaRowsOf({}, true)).toEqual([]);
  });

  it("the key column is the widest key that fits the cap of 28", () => {
    const rows = deltaRowsOf({ "a1.mantra": d("a1", "bound", "set", undefined, "x"), ["a1." + "k".repeat(40)]: d("a1", "bound", "set", undefined, "x"), "a1.state": d("a1", "bound", "set", undefined, "x") }, false);
    expect(keyColumns(rows)).toBe(6);
  });

  it("an object value opens as indented JSON, a plain one as its own lines", () => {
    expect(valueLines({ present: true, text: '{"a":1}' })).toEqual(["{", '  "a": 1', "}"]);
    expect(valueLines({ present: true, text: "x\ny" })).toEqual(["x", "y"]);
    expect(valueLines({ present: false, text: "" })).toEqual(["∅"]);
  });
});
