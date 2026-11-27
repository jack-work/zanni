import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const script = join(import.meta.dirname, "live", "snapshot.sh");
const haveJq = spawnSync("jq", ["--version"]).status === 0;

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "order-snapshot-"));
  mkdirSync(join(dir, "bin"));
  mkdirSync(join(dir, "forms"));
  mkdirSync(join(dir, "tmp"));
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

const put = (id: string, value: unknown): void => writeFileSync(join(dir, "forms", id), JSON.stringify(value));

function stubFigaro(): void {
  const path = join(dir, "bin", "figaro");
  writeFileSync(path, '#!/usr/bin/env bash\nid=$4\nf="$FORMS/$id"\n[ -f "$f" ] || { echo "no such form $id" >&2; exit 1; }\ncat "$f"\n');
  chmodSync(path, 0o755);
}

function run(): { status: number | null; out: string } {
  const out = join(dir, "out", "snapshot.json");
  const r = spawnSync("bash", [script], { env: { ...process.env, PATH: join(dir, "bin") + ":" + process.env.PATH, FORMS: join(dir, "forms"), TMPDIR: join(dir, "tmp"), ORDER_LIVE_SNAPSHOT: out }, encoding: "utf8" });
  return { status: r.status, out };
}

function seed(): void {
  put("@arias", { arias: { zed: { id: "@aa", kind: "figaro", mantra: "a task title" }, seat: { id: "@r1", kind: "form", name: "Seat" }, queue: { id: "@q1", kind: "form" }, prompt: { id: "@p1", kind: "form" }, gone: { id: "@g1", kind: "form" } } });
  put("@topology", { aa: "bb" });
  put("@r1", { name: "Seat", "role-name": "Seat", "target-aria": "@aa", chartered: { seat: "lead", root: "@c" }, system: { fanout: { quota: 2 }, handoff: "private", env: { TOKEN: "x" } }, prompt: "do the private thing", notes: "free text" });
  put("@q1", { name: "Q", chartered: { kind: "queue-form", root: "@c" }, "queue-contract": { kinds: ["work"] }, queue: { e1: { title: "t", state: "posted" } }, scratch: "kept out" });
  put("@p1", { name: "Prompt form", prompt: "never needed", system: { env: { SECRET: "x" } } });
}

describe.skipIf(!haveJq)("the live snapshot script", () => {
  it("writes @arias, @topology and the chartered forms, with only the keys the page reads", () => {
    seed();
    stubFigaro();
    const { status, out } = run();
    expect(status).toBe(0);
    const snap = JSON.parse(readFileSync(out, "utf8"));
    expect(Object.keys(snap).sort()).toEqual(["arias", "forms", "taken", "topology"]);
    expect(Object.keys(snap.forms).sort()).toEqual(["@q1", "@r1"]);
    expect(snap.forms["@r1"]).toEqual({ name: "Seat", "role-name": "Seat", "target-aria": "@aa", chartered: { seat: "lead", root: "@c" }, system: { fanout: { quota: 2 } } });
    expect(snap.forms["@q1"]).toEqual({ name: "Q", chartered: { kind: "queue-form", root: "@c" }, "queue-contract": { kinds: ["work"] }, queue: { e1: { title: "t", state: "posted" } } });
    expect(JSON.stringify(snap)).not.toMatch(/private|SECRET|TOKEN|never needed|kept out/);
  });

  it("writes the snapshot owner-only", () => {
    seed();
    stubFigaro();
    expect(statSync(run().out).mode & 0o777).toBe(0o600);
  });

  it("leaves nothing in the temp directory, on success or when a step fails", () => {
    seed();
    stubFigaro();
    expect(run().status).toBe(0);
    expect(readdirSync(join(dir, "tmp"))).toEqual([]);
    rmSync(join(dir, "forms", "@topology"));
    const failed = run();
    expect(failed.status).not.toBe(0);
    expect(readdirSync(join(dir, "tmp"))).toEqual([]);
    expect(readdirSync(join(dir, "out")).filter((f) => f.endsWith(".partial"))).toEqual([]);
  });
});
