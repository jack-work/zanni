import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Tree, treeRows, truncRunes, type TreeNodeData } from "zanni-react";

const sample: TreeNodeData[] = [
  {
    id: "root",
    label: "root",
    children: [
      { id: "first", label: "first", children: [{ id: "first-kid", label: "first-kid" }, { id: "first-last", label: "first-last" }] },
      { id: "last", label: "last", children: [{ id: "last-kid", label: "last-kid" }] },
    ],
  },
];

describe("treeRows (figtree.Rows)", () => {
  it("draws the pager's branch glyphs and keeps branch, marker and label apart", () => {
    const rows = treeRows(sample);
    expect(rows.map((r) => r.branch + r.label)).toEqual(["root", "├─first", "│ ├─first-kid", "│ └─first-last", "└─last", "  └─last-kid"]);
    const marked = treeRows([{ id: "a", label: "a", marker: "●", badge: "@lane" }]);
    expect([marked[0]!.branch, marked[0]!.marker, marked[0]!.label, marked[0]!.badge]).toEqual(["", "●", "a", "@lane"]);
  });

  it("paints the label by the first matching rule of a watched field and leaves the rest alone", () => {
    const roots: TreeNodeData[] = [
      {
        id: "r",
        label: "root",
        fields: { exists: "yes" },
        children: [{ id: "g", label: "gone", fields: { exists: "no" } }, { id: "u", label: "unknown", fields: { exists: "maybe" } }, { id: "w", label: "unwatched" }],
      },
    ];
    const colors = [{ field: "exists", rules: [{ value: "yes", color: "present" }, { value: "no", color: "absent" }] }];
    expect(treeRows(roots, colors).map((r) => r.color)).toEqual(["present", "absent", "", ""]);
  });

  it("washes the whole row when a field holds the value", () => {
    const roots: TreeNodeData[] = [{ id: "f", label: "form", fields: { kind: "form" } }, { id: "a", label: "aria", fields: { kind: "aria" } }];
    expect(treeRows(roots, [], [{ field: "kind", value: "form", wash: "form" }]).map((r) => r.wash)).toEqual(["form", ""]);
  });

  it("skips the rows under a collapsed node but keeps the glyphs of the rest", () => {
    const rows = treeRows(sample, [], [], (id) => id !== "first");
    expect(rows.map((r) => r.branch + r.label)).toEqual(["root", "├─first", "└─last", "  └─last-kid"]);
    expect(rows[1]!.expandable).toBe(true);
    expect(rows[1]!.open).toBe(false);
  });

  it("cuts a field to its column width with two dots", () => {
    expect(truncRunes("abcdef", 4)).toBe("ab..");
    expect(truncRunes("abc", 4)).toBe("abc");
    expect(truncRunes("abcdef", 0)).toBe("abcdef");
    expect(truncRunes("abcdef", 1)).toBe("a");
  });
});

describe("Tree", () => {
  it("renders a header and field columns, marks the current row, and tells a tap from a toggle", () => {
    const pick = vi.fn();
    render(
      <Tree
        label="Arias"
        roots={sample.map((n) => ({ ...n, fields: { id: "c0ffee01" } }))}
        columns={[{ header: "ARIA" }, { header: "ID", field: "id" }]}
        current="first"
        onSelect={pick}
      />,
    );
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["ARIA", "ID"]);
    const row = document.querySelector("[data-id='first']")!;
    expect(row.getAttribute("aria-selected")).toBe("true");
    expect(row.getAttribute("aria-level")).toBe("2");
    fireEvent.click(row.querySelector(".zr-tree-hit")!);
    expect(pick).toHaveBeenCalledWith("first");
    fireEvent.click(row.querySelector(".zr-tree-toggle")!);
    expect(document.querySelector("[data-id='first-kid']")).toBeNull();
    expect(row.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(row.querySelector(".zr-tree-toggle")!);
    expect(document.querySelector("[data-id='first-kid']")).toBeTruthy();
  });

  it("without onSelect a tap on a branch folds it", () => {
    render(<Tree roots={sample} />);
    fireEvent.click(document.querySelector("[data-id='last'] .zr-tree-hit")!);
    expect(document.querySelector("[data-id='last-kid']")).toBeNull();
  });
});
