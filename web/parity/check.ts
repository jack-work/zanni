import type { Facts, NodeFacts } from "./facts";

export interface Step {
  id: string;
  do: Record<string, any>;
  expect: Record<string, any>;
  expect_fake?: Record<string, any>;
}

export interface Scenario {
  id: string;
  title: string;
  slice: string;
  setup: { aria: string; seed: string[] };
  steps: Step[];
}

export interface Doc {
  version: number;
  provider: unknown;
  scenarios: Scenario[];
}

function matchNode(want: Record<string, any>, got: NodeFacts, structureOnly: boolean): string[] {
  const bad: string[] = [];
  for (const k of ["type", "role", "name", "status", "open"]) {
    if (k in want && (got as any)[k] !== want[k]) bad.push(`${k}: want ${JSON.stringify(want[k])} got ${JSON.stringify((got as any)[k])}`);
  }
  if (!structureOnly && "text_contains" in want && !(got.text ?? "").includes(want.text_contains)) bad.push(`text lacks ${want.text_contains}: ${got.text}`);
  if (!structureOnly && "output_contains" in want && !(got.output ?? "").includes(want.output_contains)) bad.push(`output lacks ${want.output_contains}: ${got.output}`);
  return bad;
}

export function check(expect: Record<string, any>, facts: Facts, glyphs: Record<string, string>, structureOnly: boolean): string[] {
  const bad: string[] = [];
  if ("running" in expect && facts.running !== expect.running) bad.push(`running: want ${expect.running} got ${facts.running}`);
  if (expect.turns) {
    const have = new Map(facts.turns.map((t) => [t.turn, t]));
    if (expect.turns.length !== have.size) bad.push(`turn count: want ${expect.turns.length} got ${have.size}`);
    for (const want of expect.turns) {
      const got = have.get(want.turn);
      if (!got) {
        bad.push(`turn ${want.turn} missing`);
        continue;
      }
      if (!structureOnly && got.inquiry !== want.inquiry) bad.push(`turn ${want.turn} inquiry: want ${want.inquiry} got ${got.inquiry}`);
      if (got.nodes.length !== want.nodes.length) bad.push(`turn ${want.turn} node count: want ${want.nodes.length} got ${got.nodes.length} (${got.nodes.map((n) => n.type)})`);
      want.nodes.forEach((wn: Record<string, any>, i: number) => {
        const gn = got.nodes[i];
        if (gn) bad.push(...matchNode(wn, gn, structureOnly).map((b) => `turn ${want.turn} node ${i} ${b}`));
      });
    }
  }
  for (const text of expect.screen?.contains ?? []) {
    if (!structureOnly && !facts.screen.text.includes(text)) bad.push(`screen lacks ${text}`);
  }
  const gaps = new Set((expect.web_gaps ?? []).map((g: { glyph: string }) => g.glyph));
  for (const name of expect.glyphs_on_screen ?? []) {
    if (gaps.has(name)) continue;
    if (!facts.screen.text.includes(glyphs[name] ?? "?")) bad.push(`glyph ${name} (${glyphs[name]}) not on screen`);
  }
  return bad;
}
