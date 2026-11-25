import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Tree, branchPeek, inlineBranch, treeRows, type TreeNodeData } from "zanni-react";

const form: TreeNodeData[] = [
  { id: "aria_id", label: "aria_id", value: '"0da9f5cd"' },
  { id: "datetime", label: "datetime", value: '"Saturday"' },
  { id: "deep", label: "deep", children: [{ id: "deep.inner", label: "inner", children: [{ id: "deep.inner.a", label: "a", value: "1" }] }, { id: "deep.side", label: "side", value: "2" }] },
  { id: "mood", label: "mood", value: '"calm"' },
  {
    id: "system",
    label: "system",
    children: ["credo", "cwd", "model", "outfit_name", "provider"].map((k) => ({ id: "system." + k, label: k, value: '"x"' })),
  },
];

const text = (el: Element) => (el.textContent ?? "").replace(/^⌖|^▸/, "");
const lines = () => [...document.querySelectorAll(".zr-tree-row")].map(text);

describe("treeRows (formNode rows)", () => {
  it("closed branches carry their count and a peek of the child labels, leaves align per parent", () => {
    const rows = treeRows(form);
    expect(rows.map((r) => [r.label, r.count, r.peek, r.gap.length])).toEqual([
      ["aria_id", 0, "", 1],
      ["datetime", 0, "", 0],
      ["deep", 2, "inner · side", 0],
      ["mood", 0, "", 4],
      ["system", 5, "credo · cwd · model · outfit_name …", 0],
    ]);
  });

  it("an open branch shows its count only, and its children sit one level deeper", () => {
    const rows = treeRows(form, (id) => id === "system" || id === "deep");
    expect(rows.filter((r) => r.parent === "system").map((r) => r.depth)).toEqual([1, 1, 1, 1, 1]);
    expect(rows.find((r) => r.id === "system")!.peek).toBe("");
    expect(rows.filter((r) => r.parent === "deep").map((r) => r.label)).toEqual(["inner", "side"]);
  });

  it("nests by depth, in order, whatever the siblings are", () => {
    const roots: TreeNodeData[] = [
      {
        id: "root",
        label: "root",
        children: [
          { id: "a", label: "a", children: [{ id: "a1", label: "a1", children: [] }, { id: "a2", label: "a2", children: [] }] },
          { id: "b", label: "b", children: [{ id: "b1", label: "b1", children: [] }] },
        ],
      },
    ];
    const rows = treeRows(roots, () => true);
    expect(rows.map((r) => r.depth + r.label)).toEqual(["0root", "1a", "2a1", "2a2", "1b", "2b1"]);
  });

  it("a closed branch of up to three short leaves shows inline", () => {
    const kids: TreeNodeData[] = [{ id: "a", label: "a", value: "1" }, { id: "b", label: "b", value: "2" }];
    expect(inlineBranch(kids)).toBe("{a: 1, b: 2}");
    expect(inlineBranch([...kids, { id: "c", label: "c", value: "3" }, { id: "d", label: "d", value: "4" }])).toBe("");
    expect(inlineBranch([{ id: "n", label: "n", value: '{"x":1}' }])).toBe("");
    expect(inlineBranch([{ id: "n", label: "n", children: [] }])).toBe("");
  });

  it("peeks four labels then an ellipsis", () => {
    expect(branchPeek(form[4]!.children!)).toBe("credo · cwd · model · outfit_name …");
  });

  it("a leaf label past the pad cap takes no padding", () => {
    const long = "x".repeat(30);
    const rows = treeRows([{ id: "l", label: long, value: "1" }, { id: "s", label: "s", value: "2" }]);
    expect(rows[0]!.gap).toBe("");
    expect(rows[1]!.gap.length).toBe(23);
  });
});

describe("Tree", () => {
  it("has no header and no arrow, and the collapsed state tree tells what is inside", () => {
    render(<Tree roots={form} mark="⌖" label="Bound form" />);
    expect(document.querySelector("th, button")).toBeNull();
    expect(lines()).toEqual(['aria_id:  "0da9f5cd"', 'datetime: "Saturday"', "deep (2)  inner · side", 'mood:     "calm"', "system (5)  credo · cwd · model · outfit_name …"]);
    expect(document.querySelector("[data-cursor] .zr-tree-mark")!.textContent).toBe("⌖");
  });

  it("j and k move the cursor, l opens, h closes, and h on a closed row climbs to the parent", () => {
    render(<Tree roots={form} mark="⌖" />);
    const tree = document.querySelector<HTMLElement>("[role='tree']")!;
    const key = (k: string) => fireEvent.keyDown(tree, { key: k });
    const at = () => document.querySelector("[data-cursor]")!.getAttribute("data-id");
    key("j");
    key("j");
    expect(at()).toBe("deep");
    key("l");
    expect(lines().slice(2, 5)).toEqual(["deep (2)", "inner: {a: 1}", "side: 2"]);
    expect(document.querySelector("[data-id='deep']")!.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector("[data-id='deep'] .zr-tree-disclosure")).toBeTruthy();
    expect(document.querySelector("[data-id='side'], [data-id='deep.side']")!.querySelector(".zr-tree-disclosure")).toBeNull();
    key("j");
    key("h");
    expect(at()).toBe("deep");
    key("h");
    expect(lines()).toHaveLength(5);
    key("G");
    expect(at()).toBe("system");
    key("g");
    key("g");
    expect(at()).toBe("aria_id");
    key("k");
    expect(at()).toBe("aria_id");
  });

  it("Enter toggles a branch when nothing handles activation, and a leaf does nothing", () => {
    render(<Tree roots={form} mark="⌖" />);
    const tree = document.querySelector<HTMLElement>("[role='tree']")!;
    fireEvent.keyDown(tree, { key: "Enter" });
    expect(lines()).toHaveLength(5);
    fireEvent.keyDown(tree, { key: "G" });
    fireEvent.keyDown(tree, { key: "Enter" });
    expect(lines()).toHaveLength(10);
    fireEvent.keyDown(tree, { key: "Enter" });
    expect(lines()).toHaveLength(5);
  });

  it("with onActivate, Enter and a tap activate and never toggle; l and h still do", () => {
    const go = vi.fn();
    render(<Tree roots={form} mark="▸" onActivate={go} />);
    const tree = document.querySelector<HTMLElement>("[role='tree']")!;
    fireEvent.keyDown(tree, { key: "G" });
    fireEvent.keyDown(tree, { key: "Enter" });
    expect(go).toHaveBeenCalledWith("system");
    expect(lines()).toHaveLength(5);
    fireEvent.click(document.querySelector("[data-id='deep']")!);
    expect(go).toHaveBeenLastCalledWith("deep");
    expect(lines()).toHaveLength(5);
    fireEvent.keyDown(tree, { key: "l" });
    expect(lines()).toHaveLength(7);
  });

  it("a tap toggles in a tree without onActivate", () => {
    render(<Tree roots={form} mark="⌖" />);
    fireEvent.click(document.querySelector("[data-id='system']")!);
    expect(document.querySelector("[data-id='system.cwd']")).toBeTruthy();
  });

  it("keeps expansion and cursor by id across a live update", () => {
    const { rerender } = render(<Tree roots={form} mark="⌖" />);
    fireEvent.click(document.querySelector("[data-id='system']")!);
    const next = [{ id: "a0", label: "a0", value: "1" }, ...form];
    rerender(<Tree roots={next} mark="⌖" />);
    expect(document.querySelector("[data-cursor]")!.getAttribute("data-id")).toBe("system");
    expect(document.querySelector("[data-id='system.cwd']")).toBeTruthy();
  });

  it("starts the cursor on the current row, marks it, and shows its hint only there", () => {
    const roots: TreeNodeData[] = [{ id: "n", label: "node", count: 1, here: true, children: [{ id: "x", label: "x-handle", count: 8, peek: "", role: "@holder", mantra: "q", here: true, hint: "Enter attend" }] }];
    render(<Tree roots={roots} mark="▸" current="x" defaultOpen={() => true} />);
    expect([...document.querySelectorAll(".zr-tree-row")].map((r) => r.textContent)).toEqual(["node (1)●", '▸x-handle (8)  @holder  "q"●  Enter attend']);
    const x = document.querySelector("[data-id='x']")!;
    expect(x.getAttribute("aria-selected")).toBe("true");
    expect(x.hasAttribute("data-here")).toBe(true);
    expect([...x.querySelectorAll("[data-tone]")].map((n) => n.className + "=" + n.getAttribute("data-tone"))).toEqual(["zr-tree-label=body", "zr-tree-role=holder", "zr-tree-mantra=quiet", "zr-ink zr-tree-here=label"]);
    expect(x.getAttribute("aria-level")).toBe("2");
    expect(document.querySelector("[data-id='n']")!.getAttribute("aria-level")).toBe("1");
  });

  it("hands a key it does not own to the caller with the cursor row", () => {
    const x = vi.fn();
    render(<Tree roots={form} mark="▸" keys={{ x }} />);
    fireEvent.keyDown(screen.getByRole("tree"), { key: "j" });
    fireEvent.keyDown(screen.getByRole("tree"), { key: "x" });
    expect(x).toHaveBeenCalledWith("datetime");
    expect(fireEvent.keyDown(screen.getByRole("tree"), { key: "q" })).toBe(true);
  });

  it("takes focus when asked, so the pager's keys work at once", () => {
    render(<Tree roots={form} mark="▸" autoFocus />);
    expect(document.activeElement).toBe(screen.getByRole("tree"));
    fireEvent.keyDown(screen.getByRole("tree"), { key: "j" });
    expect(document.querySelector("[data-cursor='true']")).toBeTruthy();
  });

  it("does not take focus unless asked", () => {
    render(<Tree roots={form} mark="▸" />);
    expect(document.activeElement).not.toBe(screen.getByRole("tree"));
  });
});

describe("the pager's other motions", () => {
  const press = (k: string, init: object = {}) => fireEvent.keyDown(document.querySelector("[role='tree']")!, { key: k, ...init });
  const at = () => document.querySelector("[data-cursor]")!.getAttribute("data-id");

  it("^N and ^P are down and up, PageDown and PageUp half a page", () => {
    render(<Tree roots={form} mark="⌖" />);
    press("n", { ctrlKey: true });
    expect(at()).toBe("datetime");
    press("n", { ctrlKey: true });
    press("p", { ctrlKey: true });
    expect(at()).toBe("datetime");
    press("PageDown");
    expect(at()).toBe("deep");
    press("PageUp");
    expect(at()).toBe("datetime");
  });

  it("a key bound by the caller gets the cursor row, ctrl chords arrive as ^x, and the others are left to the browser", () => {
    const keys = { a: vi.fn(), X: vi.fn(), "^k": vi.fn() };
    render(<Tree roots={form} mark="⌖" keys={keys} />);
    const prevented = (init: object) => !fireEvent.keyDown(document.querySelector("[role='tree']")!, init);
    expect(prevented({ key: "a" })).toBe(true);
    expect(prevented({ key: "X" })).toBe(true);
    expect(prevented({ key: "k", ctrlKey: true })).toBe(true);
    expect(prevented({ key: "r", ctrlKey: true })).toBe(false);
    expect(keys.a).toHaveBeenCalledWith("aria_id");
    expect(keys.X).toHaveBeenCalledWith("aria_id");
    expect(keys["^k"]).toHaveBeenCalledWith("aria_id");
  });
});
