import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const mock = require("../../examples/aria-mock.js") as { create(o: object): any };
const doc = JSON.parse(readFileSync(join(process.cwd(), "parity", "scenarios.json"), "utf8")) as { labels: Record<string, string>; system: { provider: string } };

const seededBash = (core: any) => core.arias[core.ids.main].turns.flatMap((t: any) => t.nodes).find((n: any) => n.type === "tool" && n.name === "bash");

describe("the fake door in the parity run", () => {
  it("publishes the provider and tool labels that scenarios.json names", () => {
    const core = mock.create({ labels: doc.labels, system: doc.system });
    expect(core.formOf(core.ids.main).system.provider).toBe(doc.system.provider);
    expect(seededBash(core).label).toBe(doc.labels.bash);
  });

  it("takes them from the doc it is given, not from a copy of its own", () => {
    const core = mock.create({ labels: { bash: "%" }, system: { provider: "other" } });
    expect(core.formOf(core.ids.main).system.provider).toBe("other");
    expect(seededBash(core).label).toBe("%");
  });
});
