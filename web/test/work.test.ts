import { describe, expect, it } from "vitest";
import { clock, formatWorkedTime, groupWork, liveVerb, stepsTitle, toolKind, workOf, type Work } from "zanni-react";
import type { Item, ToolItem, TurnModel } from "zanni-react";

const tool = (node: number, name: string, extra: Partial<ToolItem> = {}): ToolItem => ({ key: "n" + node, kind: "tool", node, settled: true, name, status: "ok", summary: "", label: "", head: "", body: undefined, diff: false, args: "", input: "", output: "", outputBase: 0, ms: 0, ...extra });
const think = (node: number): Item => ({ key: "n" + node, kind: "thinking", node, settled: true, text: "hmm" });
const prose = (node: number): Item => ({ key: "n" + node, kind: "prose", node, settled: true, text: "words" });

describe("work", () => {
  it("names a tool by what it does", () => {
    expect(toolKind("bash")).toBe("run");
    expect(toolKind("Read")).toBe("read");
    expect(toolKind("grep")).toBe("search");
    expect(toolKind("edit")).toBe("edit");
    expect(toolKind("mcp__x__bash")).toBe("run");
    expect(toolKind("sparkle")).toBe("other");
  });

  it("titles a group by what happened in it", () => {
    const reads = [tool(1, "read"), tool(2, "read"), tool(3, "grep"), tool(4, "bash")] as Work[];
    expect(stepsTitle(reads, false)).toBe("Explored 2 files, 1 search, ran 1 command");
    expect(stepsTitle(reads, true)).toBe("Exploring 2 files, 1 search, ran 1 command");
    expect(stepsTitle([tool(1, "bash"), tool(2, "bash")], false)).toBe("Ran 2 commands");
    expect(stepsTitle([tool(1, "edit"), tool(2, "read")], false)).toBe("Edited 1 file, explored 1 file");
    expect(stepsTitle([think(1), think(2)] as Work[], false)).toBe("Thought 2 times");
    expect(stepsTitle([think(1)] as Work[], true)).toBe("Thinking");
  });

  it("folds only adjacent work into a group, leaving words and single steps alone", () => {
    const rows = groupWork([prose(0), think(1), tool(2, "bash"), prose(3), tool(4, "bash"), prose(5)]);
    expect(rows.map((r) => r.kind)).toEqual(["prose", "group", "prose", "tool", "prose"]);
    const g = rows[1];
    expect(g && g.kind === "group" && g.items.map((i) => i.key)).toEqual(["n1", "n2"]);
  });

  it("reads the running step as a verb", () => {
    expect(liveVerb(tool(1, "bash", { status: "running", summary: "command=go test ./api/livedoc/..." }))).toBe("Running go test ./api/livedoc/...");
    expect(liveVerb(tool(1, "sparkle", { status: "running" }))).toBe("Calling sparkle");
    expect(liveVerb(think(1))).toBe("Thinking");
    expect(liveVerb(prose(1))).toBe("Writing");
    expect(liveVerb(tool(1, "bash", { summary: "ls" }))).toBe("Working");
    expect(liveVerb(undefined)).toBe("Working");
  });

  it("takes the verb from the running tool and the start from the reader's own send", () => {
    const turn: TurnModel = { key: "t5", turn: 5, input: { at: 1_000_000, parts: [] }, items: [tool(1, "bash", { status: "running", summary: "ls" }), prose(2)], end: null, open: true, sealed: false };
    expect(workOf(turn, 1_005_000)).toEqual({ verb: "Running ls", startedAt: 1_000_000 });
    expect(workOf(turn, 500).startedAt).toBeUndefined();
    expect(workOf({ ...turn, open: false }, 1_005_000).verb).toBe("Working");
    expect(workOf(undefined, 0).verb).toBe("Working");
  });

  it("writes time the way the strip and the finished turn say it", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(75_000)).toBe("1:15");
    expect(formatWorkedTime(63_000)).toBe("1m 3s");
    expect(formatWorkedTime(12_000)).toBe("12s");
    expect(formatWorkedTime(3_840_000)).toBe("1h 4m");
  });
});
