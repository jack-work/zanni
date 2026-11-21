import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TurnView, ToolView, nodi } from "zanni-react";
import type { Item, ToolItem, TurnModel } from "zanni-react";

const tool = (node: number, name: string, extra: Partial<ToolItem> = {}): ToolItem => ({ key: "n" + node, kind: "tool", node, settled: true, name, status: "ok", summary: "", label: "", head: "", body: undefined, diff: false, args: "", input: "", output: "out", outputBase: 0, ms: 0, ...extra });
const think = (node: number): Item => ({ key: "n" + node, kind: "thinking", node, settled: true, text: "hmm" });
const prose = (node: number, text = "words"): Item => ({ key: "n" + node, kind: "prose", node, settled: true, text });

const turn = (items: Item[], extra: Partial<TurnModel> = {}): TurnModel => ({ key: "t9", turn: 9, input: null, items, end: null, open: false, sealed: true, ...extra });

const kinds = (el: HTMLElement) => [...el.querySelectorAll(".nodi-turn-body > *")].map((n) => n.className.split(" ")[0]);

describe("a turn", () => {
  it("reads words, a fold of work, words", () => {
    const { container } = render(<ol><TurnView turn={turn([prose(0), think(1), tool(2, "read"), tool(3, "read"), tool(4, "bash", { ms: 63_000 }), prose(5)])} speaking={null} fresh={false} /></ol>);
    expect(kinds(container)).toEqual(["nodi-prose", "zr-work", "nodi-prose"]);
    const group = container.querySelector<HTMLDetailsElement>(".zr-work")!;
    expect(group.open).toBe(true);
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

  it("opens every fold of work by default, in the order the model made it", () => {
    const { container } = render(<ol><TurnView turn={turn([think(0), tool(1, "bash", { args: '{"command":"ls"}' }), think(2), tool(3, "read"), prose(4)])} speaking={null} fresh={false} /></ol>);
    const folds = [...container.querySelectorAll<HTMLDetailsElement>("details")];
    expect(folds.map((d) => d.className.split(" ")[0])).toEqual(["zr-work", "nodi-thinking", "nodi-tool", "nodi-thinking", "nodi-tool"]);
    expect(folds.every((d) => d.open)).toBe(true);
  });

  it("lets a fold be collapsed and keeps it collapsed while the turn streams on", () => {
    const first = turn([prose(0), tool(1, "bash", { status: "running", output: "a" })], { open: true, sealed: false });
    const { container, rerender } = render(<ol><TurnView turn={first} speaking={null} fresh={false} /></ol>);
    const fold = container.querySelector<HTMLDetailsElement>(".nodi-tool")!;
    fireEvent.click(fold.querySelector("summary")!);
    fold.open = false;
    rerender(<ol><TurnView turn={turn([prose(0), tool(1, "bash", { status: "running", output: "a\nb" })], { open: true, sealed: false })} speaking={null} fresh={false} /></ol>);
    expect(container.querySelector<HTMLDetailsElement>(".nodi-tool")!.open).toBe(false);
  });

  it("marks a tool by the pager's glyphs and shows the duration in brackets", () => {
    const { container } = render(
      <ol>
        <TurnView turn={turn([tool(0, "bash", { ms: 1500 }), prose(1), tool(2, "bash", { status: "error" }), prose(3), tool(4, "bash", { status: "running" })])} speaking={null} fresh={false} />
      </ol>,
    );
    const marks = [...container.querySelectorAll(".nodi-tool-mark")].map((n) => n.textContent);
    expect(marks.slice(0, 2)).toEqual(["✓", "✗"]);
    expect("⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏").toContain(marks[2]);
    expect(container.querySelector(".nodi-tool-status")!.textContent).toBe("[1.5s]");
  });

  it("shows the last ten lines of a long result and all of it on request", () => {
    const lines = Array.from({ length: 25 }, (_, i) => "line " + (i + 1)).join("\n");
    const { container, getByText } = render(<ol><TurnView turn={turn([tool(0, "bash", { output: lines })])} speaking={null} fresh={false} /></ol>);
    const out = () => container.querySelector(".nodi-tool-out")!.textContent!.split("\n");
    expect(out()).toHaveLength(10);
    expect(out()[0]).toBe("line 16");
    fireEvent.click(getByText("… last 10 of 25 lines, show all"));
    expect(out()).toHaveLength(25);
    expect(container.querySelector(".nodi-more")).toBeNull();
  });

  it("leaves a short result whole", () => {
    const { container } = render(<ol><TurnView turn={turn([tool(0, "bash", { output: "a\nb\n" })])} speaking={null} fresh={false} /></ol>);
    expect(container.querySelector(".nodi-more")).toBeNull();
    expect(container.querySelector(".nodi-tool-out")!.textContent).toBe("a\nb\n");
  });
});

describe("a tool drawn from the node's own fields", () => {
  const view = (extra: Partial<ToolItem>) => render(<ToolView item={tool(1, "bash", { summary: "command=ls", ...extra })} />);

  it("the header wears label and the head argument, falling back to name and summary", () => {
    const { container, unmount } = view({ label: "$", head: "go test ./..." });
    expect(container.querySelector(".nodi-tool-name")!.textContent).toBe("$");
    expect(container.querySelector(".nodi-tool-summary")!.textContent).toBe("go test ./...");
    unmount();
    const plain = view({});
    expect(plain.container.querySelector(".nodi-tool-name")!.textContent).toBe("bash");
    expect(plain.container.querySelector(".nodi-tool-summary")!.textContent).toBe("command=ls");
  });

  it("a declared body argument is drawn in place of the output", () => {
    const { container } = view({ body: "file text", output: "wrote 9 bytes" });
    expect(container.querySelector(".nodi-tool-out")!.textContent).toBe("file text");
  });

  it("a declared diff colours added, removed, hunk and file lines, and only then", () => {
    const text = "--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new\n same";
    const { container, unmount } = view({ diff: true, output: text });
    const sides = [...container.querySelectorAll(".nodi-diff-line")].map((l) => l.getAttribute("data-side"));
    expect(sides).toEqual(["file", "file", "hunk", "del", "add", ""]);
    unmount();
    expect(view({ output: text }).container.querySelector(".nodi-diff-line")).toBeNull();
  });
});

describe("nodi's tool item from the node's drawing fields", () => {
  const item = (node: object) => (nodi.model({ closed: [{ turn: 1, from: 0, role: "output", nodes: [{ type: "tool", role: "output", name: "write", status: "ok", ...node }] }] } as never, {})[0]!.items[0]) as ToolItem;

  it("carries label, the head argument's value, the body argument's value and diff", () => {
    const got = item({ label: "✎", head_arg: "path", body_arg: "content", diff: true, args: { path: "a.go", content: "package a", mode: "0644" } });
    expect(got).toMatchObject({ label: "✎", head: "a.go", body: "package a", diff: true });
    expect(JSON.parse(got.args)).toEqual({ path: "a.go", mode: "0644" });
  });

  it("a tool with no special drawing has none of them", () => {
    expect(item({ args: { command: "ls" } })).toMatchObject({ label: "", head: "", body: undefined, diff: false });
  });

  it("reads an argument still arriving as partial JSON", () => {
    expect(item({ status: "running", head_arg: "path", body_arg: "content", input: '{"path":"a.go","content":"line one\\nline' })).toMatchObject({ head: "a.go", body: "line one\nline" });
  });
});
