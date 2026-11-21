import type { SttReply } from "./stt";
import { SttError } from "./stt";

export type SheetKind = "input" | "prose";

export interface SheetTarget {
  readonly kind: SheetKind;
  readonly store: string;
  readonly aria: string;
  readonly turn: number;
}

export interface SheetContext {
  readonly target: SheetTarget;
  clipKey(direction: "in" | "out"): string;
  play(key: string): void;
  say(note: string): void;
  show(text: string): void;
  transcribe(key: string): Promise<SttReply>;
}

export interface SheetAction {
  readonly id: string;
  readonly label: string;
  run(ctx: SheetContext): void | Promise<void>;
}

const play = (direction: "in" | "out"): SheetAction => ({
  id: "play",
  label: "Play",
  run: (ctx) => ctx.play(ctx.clipKey(direction)),
});

const retranscribe: SheetAction = {
  id: "retranscribe",
  label: "Re-transcribe",
  async run(ctx) {
    ctx.say("Transcribing.");
    try {
      const reply = await ctx.transcribe(ctx.clipKey("in"));
      const text = (reply.text ?? "").trim();
      if (!text) ctx.say("Heard no words.");
      else {
        ctx.say("");
        ctx.show(text);
      }
    } catch (err) {
      if (err instanceof SttError && err.status === 404) ctx.say("No recording for this message.");
      else ctx.say("Not transcribed: " + (err instanceof Error && err.message ? err.message : "network"));
    }
  },
};

export const sheetActions: Readonly<Record<SheetKind, readonly SheetAction[]>> = {
  input: [play("in"), retranscribe],
  prose: [play("out")],
};

export function clipKey(target: SheetTarget, direction: "in" | "out"): string {
  return target.store + "/" + target.aria + ":" + target.turn + "/" + direction;
}
