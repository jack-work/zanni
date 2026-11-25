import { createRequire } from "node:module";
import pw from "@playwright/test";
import type { Page } from "@playwright/test";
const { test: base, expect } = pw;

const require = createRequire(import.meta.url);
const mock = require("../../examples/aria-mock.js") as { create(o: { step?: number; pageBytes?: number; labels?: Record<string, string>; system?: Record<string, unknown> }): MockCore };

export interface MockCore {
  ids: Record<string, string>;
  arias: Record<string, any>;
  order: string[];
  attach(sink: { text(s: string): void; close(): void }): { receive(t: string): void; close(): void };
  sent?: { id: string; text: string }[];
  formOf(id: string): { system?: Record<string, unknown> } | null;
}

const DIRECTIVES: Record<string, string> = {
  "hello parity": " [plain]",
  "steered work please": " run [quiet] [hold]",
  "steer ack now": " [plain]",
};

export function newFakeAria(source: { labels?: Record<string, string>; system?: Record<string, unknown> } = {}): { core: MockCore; id: string } {
  const core = mock.create({ step: 120, pageBytes: 24000, labels: source.labels, system: source.system });
  const id = core.ids.lane!;
  core.arias[id].turns.length = 0;
  core.arias[id].row.mantra = "";
  return { core, id };
}

export async function fakeRpc(page: Page, core: MockCore): Promise<void> {
  await page.routeWebSocket(/\/rpc/, (ws) => {
    const conn = core.attach({ text: (s) => ws.send(s), close: () => ws.close() });
    ws.onMessage((raw) => {
      const frame = JSON.parse(String(raw));
      if (frame.method === "figaro.qua" && frame.params?.text in DIRECTIVES) frame.params.text += DIRECTIVES[frame.params.text];
      conn.receive(JSON.stringify(frame));
    });
    ws.onClose(() => conn.close());
  });
}

export async function relayRpc(page: Page, upstream: string, headers: Record<string, string>): Promise<void> {
  const WS = require(process.env.PARITY_WS!);
  await page.routeWebSocket(/\/rpc/, (ws) => {
    const up = new WS(upstream, { headers });
    const queued: string[] = [];
    up.on("open", () => queued.splice(0).forEach((m) => up.send(m)));
    up.on("message", (data: Buffer) => ws.send(data.toString()));
    up.on("close", () => ws.close());
    up.on("error", () => ws.close());
    ws.onMessage((m) => (up.readyState === 1 ? up.send(String(m)) : queued.push(String(m))));
    ws.onClose(() => up.close());
  });
}

export async function installFakeVisualViewport(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const target = new EventTarget();
    const vv: any = { width: innerWidth, height: innerHeight, offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0, scale: 1 };
    vv.addEventListener = target.addEventListener.bind(target);
    vv.removeEventListener = target.removeEventListener.bind(target);
    vv.dispatchEvent = target.dispatchEvent.bind(target);
    Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
    (window as any).__vv = {
      set(next: { height?: number; offsetTop?: number }) {
        Object.assign(vv, next);
        target.dispatchEvent(new Event("resize"));
        target.dispatchEvent(new Event("scroll"));
      },
    };
  });
}

export async function fakeSpeech(page: Page): Promise<void> {
  await page.route(/\/stt(\?|$)/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ text: "what is the crossing count", duration_ms: 1500, audio_id: "stt-1" }) }));
  await page.routeWebSocket(/\/audio\//, (ws) => {
    ws.send(JSON.stringify({ type: "ready" }));
  });
}

export const test = base;
export { expect };
