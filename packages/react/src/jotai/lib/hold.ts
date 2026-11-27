import type { AriaStream } from "figaro-forms/aria";

export const KEEP_ABOVE = 24;
export const EVICT_BATCH = 24;

interface Numbered {
  readonly turn: number;
}

export function runTop(stream: AriaStream): number | undefined {
  const held = stream.transcript;
  const oldest = held.oldestHeld();
  if (!oldest || held.contiguous(oldest)) return undefined;
  const ranges = held.held().rangesHeld();
  return ranges.length > 1 ? ranges[ranges.length - 1]!.from.turn : undefined;
}

export function farCut(turns: readonly Numbered[], windowTop: number): number {
  const far = windowTop - KEEP_ABOVE;
  return far >= EVICT_BATCH ? (turns[far]?.turn ?? 0) : 0;
}

export function releaseBefore(stream: AriaStream, turn: number): void {
  const held = stream.transcript;
  held.evictBefore({ turn, node: 0 });
  held.setMoreBefore(true);
  const oldest = held.oldestHeld();
  if (oldest) void stream.ensure(oldest, oldest);
}
