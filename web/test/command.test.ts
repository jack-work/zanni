import { describe, expect, it } from "vitest";
import { NO_SUGGESTIONS, applyCandidate, forkSpecOf, keysOf, pathOf, planOf, suggest, tokenize, type Sources } from "zanni-react/jotai";

const src: Sources = {
  arias: [
    { id: "c0ffee01".repeat(4), label: "Zanni: ship ordine" },
    { id: "c0ffee02".repeat(4), label: "Frontend Engineer" },
  ],
  keys: ["mantra", "system.model", "tools.shell", "runtime.pid", "name"],
  outfits: ["opus5-ant", "sonn5-kic"],
};

describe("tokenize", () => {
  it("splits on blanks and honours quotes and backslashes, keeping where each word began", () => {
    expect(tokenize(`set mantra "two words" 'and  more' a\\ b`).map((t) => t.text)).toEqual(["set", "mantra", "two words", "and  more", "a b"]);
    expect(tokenize("  fork   12").map((t) => t.at)).toEqual([2, 9]);
    expect(tokenize("")).toEqual([]);
    expect(tokenize(`say ""`).map((t) => t.text)).toEqual(["say", ""]);
  });
});

describe("planOf", () => {
  it("runs the pager's verbs with what the web honours", () => {
    const p = planOf("fork :12 --stay -- try again");
    expect(p).toMatchObject({ kind: "run", args: [":12"], flags: { stay: true }, prompt: "try again" });
    expect(planOf("new -O sonn5-kic")).toMatchObject({ kind: "run", flags: { outfit: "sonn5-kic" }, prompt: undefined });
    expect(planOf("ls")).toMatchObject({ kind: "run", doc: { name: "list" } });
    expect(planOf("set mantra x")).toMatchObject({ kind: "run", args: ["mantra", "x"] });
    expect(planOf("set --id abc mantra x")).toMatchObject({ kind: "run", flags: { id: "abc" } });
  });

  it("keeps the whole prompt after -- as typed", () => {
    expect(planOf(`send -- say   "hi"  there`)).toMatchObject({ kind: "run", prompt: `say   "hi"  there` });
  });

  it("says why a verb is refused, in the catalog's words", () => {
    const kill = planOf("kill");
    expect(kill).toMatchObject({ kind: "refused" });
    expect((kill as { why: string }).why).toMatch(/delegated door refuses/);
    expect((planOf("replay") as { why: string }).why).toMatch(/^replay: /);
    expect((planOf("frobnicate") as { why: string }).why).toBe("frobnicate: no such command. :help lists them.");
    expect((planOf("comment") as { why: string }).why).toBe("comment: figaro web does not write comments yet");
  });

  it("refuses a flag the web does not take, and a missing argument with the usage", () => {
    expect((planOf("fork -O opus5-ant") as { why: string }).why).toMatch(/does not take -O/);
    expect((planOf("send -S a=b -- hi") as { why: string }).why).toMatch(/does not take -S \(text only/);
    expect((planOf("set mantra") as { why: string }).why).toBe("usage: set [--id <id>] <key> <value>");
    expect((planOf("new -O") as { why: string }).why).toMatch(/takes a value/);
    expect((planOf("new sonn5") as { why: string }).why).toMatch(/name outfits with -O/);
    expect((planOf("set a b -- c") as { why: string }).why).toMatch(/no prompt after --/);
    expect(planOf("   ")).toEqual({ kind: "none" });
  });
});

describe("forkSpecOf", () => {
  it("reads a bare number as a turn of the open aria, and id:turn", () => {
    expect(forkSpecOf("")).toEqual({ aria: undefined, turn: undefined });
    expect(forkSpecOf("12")).toEqual({ aria: "12", turn: undefined });
    expect(forkSpecOf(":12")).toEqual({ aria: undefined, turn: 12 });
    expect(forkSpecOf("c0ffee01:7")).toEqual({ aria: "c0ffee01", turn: 7 });
    expect(forkSpecOf("c0ffee01")).toEqual({ aria: "c0ffee01", turn: undefined });
    expect(forkSpecOf(":7")).toEqual({ aria: undefined, turn: 7 });
    expect(forkSpecOf("c0ffee01:x")).toMatch(/not <id>\[:<turn>\]/);
    expect(forkSpecOf("c0ffee01:7.2")).toMatch(/node fork point/);
  });
});

describe("pathOf and keysOf", () => {
  const root = { mantra: "m", tools: { shell: true, list: ["a", "b"] }, system: { model: "x" } };
  it("walks objects and list indexes", () => {
    expect(pathOf(root, "tools.shell")).toEqual({ found: true, value: true });
    expect(pathOf(root, "tools.list.1")).toEqual({ found: true, value: "b" });
    expect(pathOf(root, "tools.list.9").found).toBe(false);
    expect(pathOf(root, "nope.deeper").found).toBe(false);
    expect(pathOf(root, "mantra.x").found).toBe(false);
  });

  it("lists leaf keys, and leaves out the ones the door will not write when asked", () => {
    expect(keysOf(root, false)).toEqual(["mantra", "system.model", "tools.list", "tools.shell"]);
    expect(keysOf(root, true)).toEqual(["mantra", "tools.list", "tools.shell"]);
    expect(keysOf(undefined, false)).toEqual([]);
  });
});

describe("suggest", () => {
  it("offers the verbs that run first, then the ones that cannot with their reasons", () => {
    expect(suggest("", src).items.every((c) => !c.off)).toBe(true);
    const re = suggest("re", src).items;
    expect(re.findIndex((c) => c.off)).toBeGreaterThan(0);
    expect(re.slice(0, re.findIndex((c) => c.off)).every((c) => !c.off)).toBe(true);
    expect(suggest("fo", src).items[0]!.text).toBe("fork");
    const kill = suggest("ki", src).items.find((c) => c.text === "kill")!;
    expect(kill.off).toMatch(/delegated door/);
  });

  it("completes arias, keys, outfits and subcommands from what the page already knows", () => {
    expect(suggest("attend zan", src).items.map((c) => c.label)).toEqual(["Zanni: ship ordine"]);
    expect(suggest("fork ", src).items.map((c) => c.label)).toEqual(["Zanni: ship ordine", "Frontend Engineer"]);
    expect(suggest("set ", src).items.map((c) => c.text)).toEqual(["mantra", "tools.shell"]);
    expect(suggest("set mantra ", src).items).toEqual([]);
    expect(suggest("new -O s", src).items.map((c) => c.text)).toEqual(["sonn5-kic", "opus5-ant"]);
    expect(suggest("state s", src).items.map((c) => c.text)).toContain("set");
    expect(suggest("get s", src).items.map((c) => c.text)).toContain("system.model");
    expect(suggest("help fo", src).items.map((c) => c.text)).toContain("fork");
  });

  it("shows usage for the verb and the reason when it cannot run, and nothing after --", () => {
    expect(suggest("fork ", src).hint).toMatchObject({ usage: expect.stringContaining("fork"), refusal: "" });
    expect(suggest("kill ", src).hint!.refusal).toMatch(/delegated door/);
    expect(suggest("fork 3 -- some ", src)).toMatchObject({ items: [] });
    expect(suggest("zzz ", src).hint!.refusal).toBe("zzz: no such command");
    expect(NO_SUGGESTIONS.items).toEqual([]);
  });
});

describe("applyCandidate", () => {
  const item = (text: string) => ({ text, label: text, help: "", off: "" });
  it("replaces the word being typed, or appends after a blank, quoting what needs it", () => {
    expect(applyCandidate("fo", item("fork"))).toBe("fork ");
    expect(applyCandidate("fork ", item("c0ffee01"))).toBe("fork c0ffee01 ");
    expect(applyCandidate("new -O so", item("sonn5-kic"))).toBe("new -O sonn5-kic ");
    expect(applyCandidate("set ", item("a b"))).toBe('set "a b" ');
  });
});
