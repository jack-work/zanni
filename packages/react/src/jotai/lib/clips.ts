import { SttError, type SttReply } from "./stt";

export function clipKey(store: string, aria: string, turn: number, direction: "in" | "out"): string {
  return store + "/" + aria + ":" + turn + "/" + direction;
}

export type Transcribed = { text: string; note?: undefined } | { text?: undefined; note: string };

export async function transcribeClip(run: () => Promise<SttReply>): Promise<Transcribed> {
  try {
    const text = ((await run()).text ?? "").trim();
    return text ? { text } : { note: "Heard no words." };
  } catch (err) {
    if (err instanceof SttError && err.status === 404) return { note: "No recording for this message." };
    return { note: "Not transcribed: " + (err instanceof Error && err.message ? err.message : "network") };
  }
}
