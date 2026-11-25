import { readFileSync } from "node:fs";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { TreeState } from "figaro-forms/aria";
import { foldTree } from "../../node_modules/figaro-forms/dist/aria/tree.js";
import { Tree, type TreeNodeData } from "zanni-react";
import { search } from "../../../packages/react/src/tree-find";
import { topologyNodes } from "../../../packages/react/src/jotai/lib/topology";

interface Capture {
  attend: string;
  ids: { king: string; lane: string };
  troupe: Record<string, unknown>;
  arias: { arias: Record<string, unknown> };
}

const capture = JSON.parse(readFileSync("test/fixtures/find/roles.json", "utf8")) as Capture;
const daemon = Object.keys(capture.troupe)[0] as string;

function roots(): TreeNodeData[] {
  const folded = foldTree(capture.troupe as never, new Map([[daemon, { root: capture.arias, phase: "ready", error: undefined }]]) as never);
  const tree = { ready: true, freshness: "live", error: undefined, ...folded } as unknown as TreeState;
  return topologyNodes(tree, capture.attend, { troupe: capture.troupe, arias: { [daemon]: capture.arias } });
}

const lit = (node: ReactNode): string[] => [...renderToStaticMarkup(<>{node}</>).matchAll(/<mark class="zr-tree-hit">(.*?)<\/mark>/g)].map((m) => m[1] as string);
const shape = (found: ReturnType<typeof search>) => found.rows.map((r) => [r.depth, r.label]);
const rowsOf = (): string[] => [...document.querySelectorAll(".zr-tree-row")].map((r) => (r.textContent ?? "").replace(/^[⌖▸]/, ""));
const hits = (): string[] => [...document.querySelectorAll(".zr-tree-hit")].map((m) => m.textContent ?? "");

describe("the tree's find against the pager's /king on the same forms (pager-find/king.txt)", () => {
  const nodes = roots();

  it("shows the chain to every hit with the pager's leaf rows, forks level aside, and lands on the best hit as the pager does: 2/5", () => {
    const found = search(nodes, "king", false);
    expect(shape(found)).toEqual([
      [0, daemon],
      [1, "arias"],
      [2, "@King of Spain"],
      [3, "utopia-magazine"],
      [4, "amplifier-rocket"],
      [4, "giftshop-handgun"],
      [4, "role"],
      [3, "name"],
    ]);
    expect(found.steps.length).toBe(5);
    expect(found.best + 1).toBe(2);
    expect(found.steps[found.best]).toBe(capture.arias.arias["@744a27e38ebd91da1988a0445709fb7e" as never] && found.rows[4]!.id);
  });

  it("marks the matched letters in the mantra and in the leaf rows' values", () => {
    const found = search(nodes, "king", false);
    const mantra = found.rows.find((r) => r.label === "amplifier-rocket")!;
    expect(lit(mantra.shown?.mantra)).toEqual(["King"]);
    const role = found.rows.find((r) => r.label === "role")!;
    expect(role.leaf).toBe(true);
    expect(role.value).toBe('"@King of Spain"');
    expect(lit(role.shown?.value)).toEqual(["King"]);
  });

  it("/engineer is the pager's 1/2: the holder's mantra, then its role leaf", () => {
    const found = search(nodes, "engineer", false);
    expect(shape(found).slice(-2)).toEqual([[4, "cymbal-pry"], [5, "role"]]);
    expect(found.steps.length).toBe(2);
    expect(found.best).toBe(0);
  });

  it("k:name keeps to keys, as the pager's 1/1 on the role row", () => {
    const found = search(nodes, "k:name", false);
    expect(found.steps.length).toBe(1);
    expect(lit(found.rows.find((r) => r.label === "name")!.shown?.label)).toEqual(["name"]);
  });

  it("finds 'fork' in the two mantras where the pager finds nothing, its 'forks' key matching first", () => {
    const found = search(nodes, "fork", false);
    expect(found.rows.filter((r) => r.shown?.mantra).map((r) => r.label)).toEqual(["amplifier-rocket", "giftshop-handgun"]);
  });

  it("an unmatched query shows no rows and no steps", () => {
    const found = search(nodes, "'idle !tmp", false);
    expect(found.rows).toEqual([]);
    expect(found.steps).toEqual([]);
  });

  it("Tab's flat view lists the best row of each hit, ranked, each at the top level", () => {
    const found = search(nodes, "king", true);
    expect(found.rows.every((r) => r.depth === 0)).toBe(true);
    expect(found.rows.length).toBeGreaterThan(2);
    expect(found.steps).toEqual(found.rows.map((r) => r.id));
  });
});

const sample: TreeNodeData[] = [
  {
    id: "top",
    label: "top",
    count: 2,
    childKey: "forks",
    row: { id: "top", mantra: "the trunk" },
    mantra: "the trunk",
    children: [
      { id: "a", label: "alpha", count: 1, childKey: "forks", row: { id: "a", mantra: "first branch" }, mantra: "first branch" },
      { id: "b", label: "beta", count: 1, childKey: "forks", row: { id: "b", mantra: "second branch" }, mantra: "second branch" },
    ],
  },
  { id: "lone", label: "lone", count: 1, childKey: "forks", row: { id: "lone", mantra: "branch of nothing" }, mantra: "branch of nothing" },
];

async function open(onActivate?: (id: string) => void) {
  await import("../../../packages/react/src/tree-find");
  const view = render(<Tree roots={sample} mark="⌖" onActivate={onActivate} autoFocus testid="t" />);
  await act(async () => {});
  const tree = view.container.querySelector<HTMLElement>("[role='tree']")!;
  fireEvent.keyDown(tree, { key: "/" });
  const input = view.container.querySelector<HTMLInputElement>(".zr-tree-find input")!;
  return { view, tree, input };
}

const type = async (input: HTMLInputElement, q: string) => {
  fireEvent.change(input, { target: { value: q } });
  await waitFor(() => expect(document.querySelector(".zr-tree-find .zr-tree-tally")!.textContent).not.toBe(""));
};

describe("Tree find", () => {
  it("/ opens a find field and focuses it, and typing narrows the rows to the hits and their parents", async () => {
    const { input } = await open();
    expect(document.activeElement).toBe(input);
    await type(input, "branch");
    expect(rowsOf().map((r) => r.split(" (")[0])).toEqual(["top", "alpha", "beta", "lone"]);
    await type(input, "second");
    expect(rowsOf().map((r) => r.split(" (")[0])).toEqual(["top", "beta"]);
    expect(hits()).toEqual(["second"]);
    expect(document.querySelector(".zr-tree-find .zr-tree-tally")!.textContent).toBe("1/1");
  });

  it("Tab flattens to the ranked hits as dotted paths, Tab again returns to the tree", async () => {
    const { input } = await open();
    await type(input, "branch");
    fireEvent.keyDown(input, { key: "Tab" });
    await waitFor(() => expect(rowsOf().map((r) => r.split(":")[0])).toEqual(["lone.mantra", "top.alpha.mantra", "top.beta.mantra"]));
    fireEvent.keyDown(input, { key: "Tab" });
    await waitFor(() => expect(rowsOf().map((r) => r.split(" (")[0])).toEqual(["top", "alpha", "beta", "lone"]));
  });

  it("^N and ^P, or the arrows, step through the hits and wrap", async () => {
    const { input } = await open();
    await type(input, "branch");
    const count = () => document.querySelector(".zr-tree-find .zr-tree-tally")!.textContent;
    const at = () => document.querySelector("[data-cursor]")?.getAttribute("data-id");
    expect(count()).toBe("3/3");
    expect(at()).toBe("lone");
    fireEvent.keyDown(input, { key: "n", ctrlKey: true });
    expect(count()).toBe("1/3");
    expect(at()).toBe("a");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(count()).toBe("2/3");
    fireEvent.keyDown(input, { key: "p", ctrlKey: true });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(count()).toBe("3/3");
    expect(at()).toBe("lone");
  });

  it("Enter keeps the cursor on the hit, opens its parents and ends the find; the tree has focus again", async () => {
    const { tree, input } = await open();
    await type(input, "second");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(document.querySelector(".zr-tree-find")).toBeNull();
    expect(document.querySelector("[data-cursor]")!.getAttribute("data-id")).toBe("b");
    expect(document.querySelector("[data-id='top']")!.getAttribute("aria-expanded")).toBe("true");
    expect(rowsOf().length).toBe(4);
    expect(document.activeElement).toBe(tree);
  });

  it("Esc ends the find and returns the cursor to where it was, and the pit never hears of it", async () => {
    const heard = vi.fn();
    document.addEventListener("keydown", heard);
    const { tree, input } = await open();
    fireEvent.keyDown(tree, { key: "x" });
    await type(input, "second");
    fireEvent.keyDown(input, { key: "Escape" });
    document.removeEventListener("keydown", heard);
    expect(document.querySelector(".zr-tree-find")).toBeNull();
    expect(document.querySelector("[data-cursor]")!.getAttribute("data-id")).toBe("top");
    expect(rowsOf().length).toBe(2);
    expect(heard.mock.calls.filter(([e]) => (e as KeyboardEvent).key === "Escape")).toHaveLength(0);
    expect(document.activeElement).toBe(tree);
  });

  it("hotkeys are off while the field has the keys: j types a j", async () => {
    const { input } = await open();
    fireEvent.keyDown(input, { key: "j" });
    await type(input, "j");
    expect(input.value).toBe("j");
  });

  it("Enter on a hit's leaf row attends its aria", async () => {
    const onActivate = vi.fn();
    const { tree, input } = await open(onActivate);
    await type(input, "k:id");
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(tree, { key: "Enter" });
    expect(onActivate).toHaveBeenCalledOnce();
  });

  it("a click on a hit ends the find there", async () => {
    const { input } = await open();
    await type(input, "second");
    const row = document.querySelector<HTMLElement>("[data-id='b']")!;
    await act(async () => fireEvent.click(row));
    expect(document.querySelector(".zr-tree-find")).toBeNull();
    expect(document.querySelector("[data-cursor]")!.getAttribute("data-id")).toBe("b");
  });
});
