import { createRequire } from "node:module";
import { AriaClient } from "figaro-forms/aria";
import type { Dial } from "figaro-forms";

const require = createRequire(import.meta.url);
export const mock = require("../../examples/aria-mock.js") as {
  create(o: { step?: number; pageBytes?: number }): MockCore;
  EVIL: string;
  BIDI: string;
};

export interface MockCore {
  ids: Record<"main" | "lane" | "spain" | "engineer" | "forms", string>;
  dial: Dial;
  sent?: { id: string; text: string }[];
  interrupts?: string[];
  calls: { method: string; params: Record<string, unknown> }[];
  dropped: number;
  drop(): number;
  running(id: string): boolean;
}

export const EVIL = mock.EVIL;
export const BIDI = mock.BIDI;

export function mockDoor(step = 1, pageBytes = 3000): { core: MockCore; client: AriaClient } {
  const core = mock.create({ step, pageBytes });
  const client = new AriaClient({ dial: core.dial, pageBytes: 24000, retryMinMs: 20, retryMaxMs: 40 });
  return { core, client };
}
