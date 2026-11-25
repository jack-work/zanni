import type { Facts, NodeFacts } from "./facts";

export interface Step {
  id: string;
  do: Record<string, any>;
  expect: Record<string, any>;
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
  labels?: Record<string, string>;
  system?: Record<string, unknown>;
  provider: unknown;
  scenarios: Scenario[];
}

function matchNode(want: Record<string, any>, got: NodeFacts, structureOnly: boolean, labels: Record<string, string>): string[] {
  const bad: string[] = [];
  for (const k of ["type", "role", "name", "status", "open"]) {
    const expected = k === "name" ? (labels[want.name] ?? want.name) : want[k];
    if (k in want && (got as any)[k] !== expected) bad.push(`${k}: want ${JSON.stringify(expected)} got ${JSON.stringify((got as any)[k])}`);
  }
  if (!structureOnly && "text_contains" in want && !(got.text ?? "").includes(want.text_contains)) bad.push(`text lacks ${want.text_contains}: ${got.text}`);
  if (!structureOnly && "output_contains" in want && !(got.output ?? "").includes(want.output_contains)) bad.push(`output lacks ${want.output_contains}: ${got.output}`);
  return bad;
}

export function check(expect: Record<string, any>, facts: Facts, glyphs: Record<string, string>, structureOnly: boolean, labels: Record<string, string> = {}): string[] {
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
        if (gn) bad.push(...matchNode(wn, gn, structureOnly, labels).map((b) => `turn ${want.turn} node ${i} ${b}`));
      });
      for (const wd of want.deltas ?? []) {
        const hit = (got.deltas ?? []).find((d) => d.key === wd.key);
        if (!hit) {
          bad.push(`turn ${want.turn} delta ${wd.key} missing`);
          continue;
        }
        for (const k of ["old", "new", "header_glyph"] as const) {
          if (k in wd && hit[k] !== wd[k]) bad.push(`turn ${want.turn} delta ${wd.key} ${k}: want ${JSON.stringify(wd[k])} got ${JSON.stringify(hit[k])}`);
        }
      }
    }
  }
  for (const [k, v] of Object.entries(expect.state ?? {})) {
    const have = facts.state?.[k];
    if (have !== v) bad.push(`state ${k}: want ${JSON.stringify(v)} got ${JSON.stringify(have)}`);
  }
  if (expect.tree && JSON.stringify(facts.tree?.edges ?? []) !== JSON.stringify([...expect.tree.edges].sort())) bad.push(`tree edges: want ${JSON.stringify(expect.tree.edges)} got ${JSON.stringify(facts.tree?.edges ?? [])}`);
  if ("pit" in expect) {
    const want = expect.pit as { name: string; rows: string[]; footer?: string; glyph?: string } | null;
    const got = facts.pit;
    if (want === null) {
      if (got) bad.push(`a pit is open: ${JSON.stringify(got.rows)}`);
    } else if (!got) {
      bad.push(`pit ${want.name} is not open`);
    } else {
      let cursor = 0;
      if (want.footer && !got.footer.includes(want.footer)) bad.push(`footer lacks ${JSON.stringify(want.footer)}: ${JSON.stringify(got.footer)}`);
      for (const row of want.rows) {
        const at = got.rows.findIndex((r, i) => i >= cursor && r.includes(row));
        if (at < 0) bad.push(`pit row ${JSON.stringify(row)} missing or out of order in ${JSON.stringify(got.rows)}`);
        else cursor = at + 1;
      }
      if (want.glyph && !got.rows.join("\n").includes(glyphs[want.glyph] ?? "?")) bad.push(`pit glyph ${want.glyph} (${glyphs[want.glyph]}) absent`);
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
