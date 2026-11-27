import type { AriaStream } from "figaro-forms/aria";

export function runTop(stream: AriaStream): number | undefined {
  const held = stream.transcript;
  const oldest = held.oldestHeld();
  if (!oldest || held.contiguous(oldest)) return undefined;
  const ranges = held.held().rangesHeld();
  return ranges.length > 1 ? ranges[ranges.length - 1]!.from.turn : undefined;
}

export function releaseBefore(stream: AriaStream, turn: number): void {
  const held = stream.transcript;
  held.evictBefore({ turn, node: 0 });
  held.setMoreBefore(true);
  const oldest = held.oldestHeld();
  if (oldest) void stream.ensure(oldest, oldest);
}
