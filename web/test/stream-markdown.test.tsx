import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nodi, ProseView } from "zanni-react";

const reply = "# Findings\n\nThe cause is a stale cursor.\n\n- read backward\n- follow live\n\n```go\nfmt.Println(1)\n```\n\n| file | lines | note |\n|------|------:|:----:|\n| a.go | 12 | ok |\n| b.go | 7 | slow |\n\nThat is all.\n";

const item = (text: string, settled: boolean) => ({ key: "t", kind: "prose" as const, node: 0, text, settled });
const view = (text: string, settled: boolean) => <ProseView item={item(text, settled)} turn={1} speaking={false} spokenChars={undefined} />;
const blockEls = () => [...document.querySelectorAll(".nodi-text > *")];

afterEach(() => vi.restoreAllMocks());

describe("streaming markdown", () => {
  it("draws the heading, list, code and table progressively, the table once its header and delimiter are in", () => {
    const { rerender } = render(view("", false));
    expect(blockEls()).toHaveLength(0);
    rerender(view("# Findings\n\nThe cause", false));
    expect(blockEls().map((e) => e.tagName)).toEqual(["H3", "P"]);
    const mid = reply.indexOf("| a.go");
    rerender(view(reply.slice(0, mid), false));
    const table = document.querySelector(".nodi-table")!;
    expect(table).toBeTruthy();
    expect([...table.querySelectorAll("th")].map((th) => th.textContent)).toEqual(["file", "lines", "note"]);
    expect([...table.querySelectorAll("th")].map((th) => th.getAttribute("data-align"))).toEqual([null, "right", "center"]);
    expect(table.querySelectorAll("tbody tr")).toHaveLength(0);
    rerender(view(reply.slice(0, mid) + "| a.go | 12 | ok |\n| b.go | 7", false));
    expect(table.querySelectorAll("tbody tr")).toHaveLength(1);
    rerender(view(reply, true));
    expect(document.querySelector(".nodi-table")).toBe(table);
    expect(document.querySelectorAll(".nodi-table tbody tr")).toHaveLength(2);
    expect(blockEls().map((e) => e.className.split(" ")[0])).toEqual(["nodi-h", "nodi-p", "nodi-list", "nodi-pre", "nodi-table-wrap", "nodi-p"]);
  });

  it("an open code fence shows as code while it streams", () => {
    render(view("Look:\n\n```go\nfmt.Pri", false));
    expect(document.querySelector(".nodi-pre code")!.textContent).toBe("fmt.Pri");
  });

  it("keeps every settled block's DOM node across deltas and never re-renders it", () => {
    const spans = vi.spyOn(nodi, "spans");
    const { rerender } = render(view("# Findings\n\nThe cause is a stale cursor.\n\n- read backward\n- follow", false));
    const [h, p, list] = blockEls();
    const heading = spans.mock.calls.filter((c) => c[0] === "Findings").length;
    const para = spans.mock.calls.filter((c) => c[0] === "The cause is a stale cursor.").length;
    expect(heading).toBe(1);
    expect(para).toBe(1);
    const steps = ["- read backward\n- follow live", "- read backward\n- follow live\n\n```go\nfmt.Println(1)", "- read backward\n- follow live\n\n```go\nfmt.Println(1)\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n"];
    for (const tail of steps) rerender(view("# Findings\n\nThe cause is a stale cursor.\n\n" + tail, false));
    const after = blockEls();
    expect(after[0]).toBe(h);
    expect(after[1]).toBe(p);
    expect(after[2]).toBe(list);
    expect(spans.mock.calls.filter((c) => c[0] === "Findings")).toHaveLength(1);
    expect(spans.mock.calls.filter((c) => c[0] === "The cause is a stale cursor.")).toHaveLength(1);
    rerender(view("# Findings\n\nThe cause is a stale cursor.\n\n" + steps[2] + "\nDone.", true));
    expect(blockEls()[0]).toBe(h);
    expect(spans.mock.calls.filter((c) => c[0] === "Findings")).toHaveLength(1);
  });

  it("draws history, a closed message, exactly as the stream ended", () => {
    const { rerender, container } = render(view("", false));
    for (let k = 0; k <= reply.length; k += 7) rerender(view(reply.slice(0, k), false));
    rerender(view(reply, true));
    const streamed = container.querySelector(".nodi-text")!.innerHTML;
    const { container: fresh } = render(view(reply, true));
    expect(fresh.querySelector(".nodi-text")!.innerHTML).toBe(streamed);
  });
});
