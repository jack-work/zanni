import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? sources(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}

const SINKS = /dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML|document\.write|new Function|\beval\(/;

it("no source reaches an HTML-parsing sink", () => {
  const bad = sources(join(import.meta.dirname, "..", "src")).filter((p) => SINKS.test(readFileSync(p, "utf8")));
  expect(bad).toEqual([]);
});

it("the check can fail: a planted sink is found", () => {
  expect(SINKS.test("el.insertAdjacentHTML('beforeend', x)")).toBe(true);
  expect(SINKS.test("<div dangerouslySetInnerHTML={{ __html: x }} />")).toBe(true);
});
