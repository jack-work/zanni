import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { edgeProxy } from "./edge";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { Scenario } from "./check";

export interface Unit {
  aria: string;
  door: string;
  headers: Record<string, string>;
  release(): Promise<void>;
}

interface UnitFile {
  root: string;
  bin: string;
  env: Record<string, string>;
}

const gatewayMain = () => `${process.env.FIGARO_FORMS_DIR ?? "/var/tmp/ff-session"}/packages/bridge/dist/gateway-main.js`;

export async function realUnit(scenario: Scenario): Promise<Unit> {
  const file = process.env.PARITY_UNIT;
  if (!file || !existsSync(file)) throw new Error("PARITY_REAL=1 needs PARITY_UNIT=<unit.json> from scripts/parity/unit.py up");
  const unit: UnitFile = JSON.parse(readFileSync(file, "utf8"));
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(FIGARO_|HUSH_|ANTHROPIC_|TMUX$)/.test(k)));
  const env = { ...inherited, ...unit.env } as NodeJS.ProcessEnv;
  const fig = (...args: string[]) => execFileSync(unit.bin, args, { env, encoding: "utf8" });
  const born = JSON.parse(fig("new", "-j").trim().split("\n").pop()!);
  for (const prompt of scenario.setup.seed) fig("send", "--id", born.aria_id, "--", prompt);
  const secretFile = `${unit.root}/edge-secret`;
  writeFileSync(secretFile, randomBytes(40).toString("base64"), { mode: 0o600 });
  const port = await freePort();
  const edgeSock = `${unit.root}/edge-${randomBytes(4).toString("hex")}.sock`;
  const proxy = await edgeProxy(edgeSock, `${unit.env.FIGARO_RUNTIME_DIR}/door.sock`, "gluck");
  const gateway: ChildProcess = spawn(
    "node",
    [gatewayMain(), "--door-url", `ws+unix://${edgeSock}:/door`, "--speech-socket", `${unit.root}/no-speech.sock`, "--admin", "gluck", "--store", "gluck", "--port", String(port), "--peer", "127.0.0.1", "--edge-secret-file", secretFile],
    { env, stdio: ["ignore", "ignore", "pipe"] },
  );
  await new Promise<void>((resolve, reject) => {
    gateway.stderr!.on("data", (d) => /listening on/.test(String(d)) && resolve());
    gateway.on("exit", () => reject(new Error("the gateway exited before listening")));
  });
  return {
    aria: born.aria_id,
    door: `ws://127.0.0.1:${port}/door`,
    headers: { "x-figaro-edge": readFileSync(secretFile, "utf8").trim(), "remote-user": "gluck" },
    release: async () => {
      gateway.kill();
      proxy.close();
    },
  };
}

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
  });
}
