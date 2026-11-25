import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const roots = ["test/fixtures", "../test/wave1/fixtures"];
const banned: [string, RegExp][] = [
  ["a home directory", /\/home\/|\/Users\//],
  ["an email address", /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.(com|info|org|net|dev|io)\b/],
  ["the owner's name", /gluck/i],
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

describe("fixtures never come from a real store", () => {
  for (const path of roots.flatMap(files)) {
    it(path, () => {
      const text = readFileSync(path, "utf8");
      for (const [what, re] of banned) expect(re.test(text), path + " carries " + what).toBe(false);
    });
  }

  it("the find corpus says it is synthetic", () => {
    expect(JSON.parse(readFileSync("test/fixtures/find/corpus.json", "utf8")).synthetic).toBe(true);
  });
});
