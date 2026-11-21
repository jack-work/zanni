import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TranscriptContext, TurnView, deltaRowsOf } from "zanni-react";
import type { TurnModel, WireDelta } from "zanni-react";

const d = (form: string, kind: string, event: string, prev: unknown, value: unknown): WireDelta => ({ form, kind, event, ...(prev === undefined ? {} : { prev }), ...(value === undefined ? {} : { value }) });

const turn = (deltas: Record<string, WireDelta> | undefined, forkedFrom?: string): TurnModel => {
  const rows = deltaRowsOf(deltas, !!forkedFrom);
  return { key: "t5", turn: 5, input: null, items: [], end: null, open: false, sealed: true, ...(forkedFrom ? { forkedFrom } : {}), ...(rows.length ? { deltas: rows } : {}) };
};

const view = (m: TurnModel, nameOf?: (id: string) => string) =>
  render(
    <TranscriptContext value={nameOf ? { nameOf } : {}}>
      <ol>
        <TurnView turn={m} speaking={null} fresh={false} />
      </ol>
    </TranscriptContext>,
  );

const mark = () => screen.queryByRole("button", { name: /^Form changes: / });

describe("a turn's form deltas", () => {
  it("a turn with none has no delta mark", () => {
    view(turn(undefined));
    expect(mark()).toBeNull();
    expect(document.querySelector(".nodi-deltas")).toBeNull();
  });

  it("a fork's birth keys alone leave no delta mark, only the fork mark", () => {
    view(turn({ "a1.system.forked_from": d("a1", "bound", "set", undefined, "parent"), "a1.aria_id": d("a1", "bound", "set", undefined, "a1") }, "parent"));
    expect(mark()).toBeNull();
    expect(document.querySelector(".nodi-turn-fork")!.textContent).toBe("⑂ parent");
  });

  it("wears the delta glyph, collapsed, with the count for a screen reader", () => {
    view(turn({ "a1.phase": d("a1", "bound", "set", "seed", "canary"), "a1.mode": d("a1", "bound", "set", undefined, "x") }));
    const m = mark()!;
    expect(m.textContent).toBe("Δ");
    expect(m.getAttribute("aria-label")).toBe("Form changes: 2");
    expect(m.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector(".nodi-deltas")).toBeNull();
  });

  it("opens one row per key, old to new, and shuts again", () => {
    view(turn({ "a1.phase": d("a1", "bound", "set", "seed", "canary"), "@f1.sha": d("@f1", "studied", "set", undefined, "8b12f128"), "@f2": d("@f2", "studied", "deleted", undefined, undefined) }));
    fireEvent.click(mark()!);
    expect(mark()!.getAttribute("aria-expanded")).toBe("true");
    const rows = [...document.querySelectorAll(".nodi-deltas > .nodi-delta")].map((r) => r.textContent);
    expect(rows).toEqual(["Δphaseseed -> canary", "Δ@f1.sha∅ -> 8b12f128", "⊘@f2"]);
    fireEvent.click(mark()!);
    expect(document.querySelector(".nodi-deltas")).toBeNull();
  });

  it("keeps both sides of a row in elidable cells and the whole row in its title", () => {
    view(turn({ "a1.brief": d("a1", "bound", "set", "o".repeat(60), "n".repeat(40)) }));
    fireEvent.click(mark()!);
    const row = document.querySelector(".nodi-delta-row")!;
    expect(row.getAttribute("title")).toBe("brief  " + "o".repeat(60) + " -> " + "n".repeat(40));
    expect(row.querySelector(".nodi-delta-from")!.textContent).toBe("o".repeat(60));
    expect(row.querySelector(".nodi-delta-to")!.textContent).toBe("n".repeat(40));
  });

  it("a row opens to its old and new value whole, an object as indented JSON", () => {
    view(turn({ "a1.cfg": d("a1", "bound", "set", { a: 1 }, "line one\nline two") }));
    fireEvent.click(mark()!);
    const row = document.querySelector(".nodi-delta-row")!;
    expect(row.getAttribute("aria-expanded")).toBe("false");
    expect(row.querySelector(".nodi-delta-to")!.textContent).toBe("line one…");
    fireEvent.click(row);
    expect(row.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector("[data-side='-']")!.textContent).toBe('- {\n    "a": 1\n  }');
    expect(document.querySelector("[data-side='+']")!.textContent).toBe("+ line one\n  line two");
  });

  it("names an aria id value by its handle", () => {
    const id = "c0ffee01c0ffee01c0ffee01c0ffee01";
    view(turn({ "@r1.target-aria": d("@r1", "role", "set", id, "plain") }), (x) => (x === id ? "zanni" : x));
    fireEvent.click(mark()!);
    expect(document.querySelector(".nodi-delta-from")!.textContent).toBe("zanni");
    expect(document.querySelector(".nodi-delta-to")!.textContent).toBe("plain");
  });

  it("shows hostile text as characters and boxes what it cannot strip", () => {
    view(turn({ "a1.k": d("a1", "bound", "set", undefined, "<img src=x onerror=alert(1)>\u202e\u200b") }));
    fireEvent.click(mark()!);
    expect(document.querySelector(".nodi-deltas img")).toBeNull();
    expect(document.querySelector(".nodi-delta-to")!.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(document.querySelectorAll(".nodi-deltas .nodi-ctl").length).toBeGreaterThan(0);
  });
});
