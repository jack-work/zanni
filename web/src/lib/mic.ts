export const MAX_CLIP_MS = 5 * 60000;

export type MicState = "unsupported" | "idle" | "asking" | "recording" | "transcribing";

export interface MicSnapshot {
  readonly state: MicState;
  readonly began: number;
  readonly note: string;
}

export interface Media {
  readonly devices: Pick<MediaDevices, "getUserMedia"> | undefined;
  readonly Recorder: typeof MediaRecorder | undefined;
}

export interface MicDeps {
  readonly media: Media;
  now(): number;
  transcribe(blob: Blob, target: string): Promise<{ text?: string }>;
  recording(on: boolean): void;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

export function micType(Recorder: Media["Recorder"]): string {
  const wanted = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"];
  if (!Recorder || typeof Recorder.isTypeSupported !== "function") return "";
  return wanted.find((t) => Recorder.isTypeSupported(t)) ?? "";
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
  return !!media.devices && typeof media.devices.getUserMedia === "function" && !!media.Recorder;
}

export function joinDictation(draft: string, text: string): string {
  return (draft.trim() ? draft.replace(/\s*$/, " ") : "") + text;
}

export class Mic {
  private current: MicSnapshot;
  private token = 0;
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private cap: unknown;
  private readonly listeners = new Set<(s: MicSnapshot) => void>();

  constructor(private readonly deps: MicDeps) {
    this.current = { state: canRecord(deps.media) ? "idle" : "unsupported", began: 0, note: "" };
  }

  snapshot(): MicSnapshot {
    return this.current;
  }

  subscribe(fn: (s: MicSnapshot) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  toggle(target: string, onText: (text: string) => void): void {
    if (this.current.state === "recording") this.stop();
    else if (this.current.state === "idle") this.start(target, onText);
  }

  cancel(): void {
    this.token++;
    this.stop();
    this.release();
    if (this.current.state !== "unsupported") this.set({ state: "idle", began: 0, note: "" });
  }

  private set(next: MicSnapshot): void {
    this.current = next;
    for (const fn of [...this.listeners]) fn(next);
  }

  private idle(note: string): void {
    this.set({ state: "idle", began: 0, note });
  }

  private release(): void {
    this.deps.clearTimeout(this.cap);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.recorder = null;
    this.deps.recording(false);
  }

  private stop(): void {
    if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
  }

  private start(target: string, onText: (text: string) => void): void {
    const token = ++this.token;
    const { media } = this.deps;
    this.set({ state: "asking", began: 0, note: "" });
    this.deps.recording(true);
    const devices = media.devices;
    const Recorder = media.Recorder;
    if (!devices || !Recorder) return;
    devices.getUserMedia({ audio: true }).then(
      (stream) => {
        if (token !== this.token) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        this.stream = stream;
        const type = micType(Recorder);
        const r = type ? new Recorder(stream, { mimeType: type }) : new Recorder(stream);
        this.recorder = r;
        this.chunks = [];
        const began = this.deps.now();
        r.addEventListener("dataavailable", (ev) => {
          if (ev.data && ev.data.size) this.chunks.push(ev.data);
        });
        r.addEventListener("stop", () => this.recorded(token, r.mimeType || type || "audio/webm", target, onText));
        r.start();
        this.set({ state: "recording", began, note: "" });
        this.cap = this.deps.setTimeout(() => this.stop(), MAX_CLIP_MS);
      },
      (err: unknown) => {
        this.deps.recording(false);
        if (token === this.token) this.idle(micFault(err));
      },
    ).catch((err: unknown) => {
      if (token !== this.token) return;
      this.release();
      this.idle(micFault(err));
    });
  }

  private recorded(token: number, type: string, target: string, onText: (text: string) => void): void {
    if (token !== this.token) return;
    const chunks = this.chunks;
    this.release();
    const blob = new Blob(chunks, { type });
    if (!blob.size) {
      this.idle("Nothing was recorded.");
      return;
    }
    this.set({ state: "transcribing", began: 0, note: "Transcribing." });
    Promise.resolve()
      .then(() => this.deps.transcribe(blob, target))
      .then(
        (res) => {
          if (token !== this.token) return;
          const text = String((res && res.text) || "").trim();
          if (!text) this.idle("Heard no words. Try again.");
          else {
            onText(text);
            this.idle("");
          }
        },
        (err: unknown) => {
          if (token === this.token) this.idle("Not transcribed: " + (err instanceof Error && err.message ? err.message : "network"));
        },
      );
  }
}
