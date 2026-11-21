import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TurnView } from "zanni-react";
import type { Item, ToolItem, TurnModel } from "zanni-react";

const tool = (node: number, name: string, extra: Partial<ToolItem> = {}): ToolItem => ({ key: "n" + node, kind: "tool", node, settled: true, name, status: "ok", summary: "", args: "", input: "", output: "out", outputBase: 0, ms: 0, ...extra });
const think = (node: number): Item => ({ key: "n" + node, kind: "thinking", node, settled: true, text: "hmm" });
const prose = (node: number, text = "words"): Item => ({ key: "n" + node, kind: "prose", node, settled: true, text });

const turn = (items: Item[], extra: Partial<TurnModel> = {}): TurnModel => ({ key: "t9", turn: 9, input: null, items, end: null, open: false, sealed: true, ...extra });

const kinds = (el: HTMLElement) => [...el.querySelectorAll(".nodi-turn-body > *")].map((n) => n.className.split(" ")[0]);

describe("a turn", () => {
  it("reads words, a fold of work, words", () => {
    const { container } = render(<ol><TurnView turn={turn([prose(0), think(1), tool(2, "read"), tool(3, "read"), tool(4, "bash", { ms: 63_000 }), prose(5)])} speaking={null} fresh={false} /></ol>);
    expect(kinds(container)).toEqual(["nodi-prose", "zr-work", "nodi-prose"]);
    const group = container.querySelector<HTMLDetailsElement>(".zr-work")!;
    expect(group.open).toBe(false);
    expect(group.querySelector(".nodi-sum-label")!.textContent).toBe("Explored 2 files, ran 1 command");
    expect(group.querySelector(".zr-work-time")!.textContent).toBe("1m 3s");
    expect(group.querySelectorAll(".nodi-thinking, .nodi-tool")).toHaveLength(4);
  });

  it("leaves a single step and the words alone", () => {
    const { container } = render(<ol><TurnView turn={turn([think(0), prose(1), tool(2, "bash"), prose(3)])} speaking={null} fresh={false} /></ol>);
    expect(kinds(container)).toEqual(["nodi-thinking", "nodi-prose", "nodi-tool", "nodi-prose"]);
  });

  it("marks a running group live", () => {
    const { container } = render(<ol><TurnView turn={turn([think(0), tool(1, "bash", { status: "running" })], { open: true, sealed: false })} speaking={null} fresh={false} /></ol>);
    expect(container.querySelector(".zr-work")!.hasAttribute("data-live")).toBe(true);
    expect(container.querySelector(".nodi-sum-label")!.textContent).toBe("Running 1 command");
  });

  it("carries the fresh mark only when told", () => {
    const { container, rerender } = render(<ol><TurnView turn={turn([prose(0)])} speaking={null} fresh={false} /></ol>);
    expect(container.querySelector(".nodi-turn")!.hasAttribute("data-fresh")).toBe(false);
    rerender(<ol><TurnView turn={turn([prose(0)])} speaking={null} fresh={true} /></ol>);
    expect(container.querySelector(".nodi-turn")!.hasAttribute("data-fresh")).toBe(true);
  });

  it("marks the prose node being spoken and boxes control characters in tool output", () => {
    const { container } = render(<ol><TurnView turn={turn([prose(0), prose(1, "gnp\u202Eavaj")])} speaking={{ turn: 9, node: 1, chars: 4 }} fresh={false} /></ol>);
    const nodes = container.querySelectorAll(".nodi-prose");
    expect(nodes[0]!.hasAttribute("data-speaking")).toBe(false);
    expect(nodes[1]!.getAttribute("data-speaking")).toBe("");
    expect(nodes[1]!.getAttribute("data-spoken-chars")).toBe("4");
    expect(nodes[1]!.textContent).toContain("U+202E");
  });
});
