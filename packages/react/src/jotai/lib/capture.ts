import workletUrl from "../../../../../assets/figchat/pcm-worklet.js?url";
import type { Capture } from "./dictation";
import type { Media } from "./mic";

type Ctor = typeof AudioContext;

function audioContext(): Ctor | undefined {
  return typeof window === "undefined" ? undefined : window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
}

export function browserMedia(): Media {
  const Ctx = audioContext();
  return {
    devices: typeof navigator === "undefined" ? undefined : navigator.mediaDevices,
    streaming: !!Ctx && typeof AudioWorkletNode !== "undefined" && typeof WebSocket !== "undefined",
  };
}

export async function captureFrames(stream: MediaStream, onFrame: (pcm: ArrayBuffer, level: number) => void): Promise<Capture> {
  const Ctx = audioContext()!;
  const ctx = new Ctx({ latencyHint: "interactive" });
  await ctx.audioWorklet.addModule(workletUrl);
  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, "figchat-pcm", { numberOfInputs: 1, numberOfOutputs: 0 });
  node.port.onmessage = (ev: MessageEvent<{ pcm: ArrayBuffer; level: number }>) => onFrame(ev.data.pcm, ev.data.level);
  source.connect(node);
  if (ctx.state === "suspended") await ctx.resume();
  return {
    stop() {
      node.port.onmessage = null;
      source.disconnect();
      node.disconnect();
      void ctx.close();
    },
  };
}
