export const MAX_CLIP_MS = 5 * 60000;

export type MicState = "unsupported" | "idle" | "asking" | "recording" | "transcribing";

export interface MicSnapshot {
  readonly state: MicState;
  readonly began: number;
  readonly note: string;
}

export interface Media {
  readonly devices: Pick<MediaDevices, "getUserMedia"> | undefined;
  readonly streaming: boolean;
}

export function micFault(err: unknown): string {
  const name = err && typeof err === "object" && "name" in err ? String((err as { name: unknown }).name) : "";
  const message = err instanceof Error ? err.message : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Microphone blocked. Allow it for this site in the browser settings, then tap Record again.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No microphone found.";
  if (name === "NotReadableError" || name === "AbortError") return "The microphone is busy or not readable.";
  return "Could not record: " + (message || name || "unknown error");
}

export function canRecord(media: Media): boolean {
  return !!media.devices && typeof media.devices.getUserMedia === "function" && media.streaming;
}

export function joinDictation(draft: string, text: string): string {
  return (draft.trim() ? draft.replace(/\s*$/, " ") : "") + text;
}

export function streamFault(code: string, text: string): string {
  switch (code) {
    case "busy":
      return "Dictation is busy. Try again in a moment.";
    case "idle":
      return "No sound was heard.";
    case "too-long":
      return "Stopped at the length limit.";
    case "bad-request":
      return "Dictation refused this request.";
    case "speech":
    case "unreachable":
      return "Dictation is not available right now.";
    default:
      return "Dictation failed: " + (text || code);
  }
}
