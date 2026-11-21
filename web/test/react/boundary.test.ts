import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const src = resolve(import.meta.dirname, "../../../packages/react/src");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? (n === "jotai" ? [] : files(p)) : /\.(ts|tsx)$/.test(n) && n !== "jotai.ts" ? [p] : [];
  });
}

describe("the package boundary", () => {
  it("the root entry never reaches for jotai, figaro-forms values or the app", () => {
    const bad = files(src).filter((f) => /from "(jotai|figaro-forms)[^"]*"/.test(readFileSync(f, "utf8").replace(/import type [^;]*;/g, "")) || /from "\.\/jotai/.test(readFileSync(f, "utf8")));
    expect(bad).toEqual([]);
  });

  it("ships no comments in shipped code", () => {
    const bad = files(src).filter((f) => /^\s*(\/\/|\/\*)/m.test(readFileSync(f, "utf8")));
    expect(bad).toEqual([]);
  });
});
