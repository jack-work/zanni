import { MAX_CLIP_MS, canRecord, micFault, streamFault, type Media, type MicSnapshot } from "./mic";

export const FINISH_WAIT_MS = 8000;
export const QUEUE_FRAMES = 100;

export interface SocketLike {
  binaryType: string;
  readonly readyState: number;
  onopen: (() => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  send(data: string | ArrayBuffer): void;
  close(code?: number): void;
}

export interface Capture {
  stop(): void;
}

export interface DictationDeps {
  readonly media: Media;
  now(): number;
  open(target: string): SocketLike;
  capture(stream: MediaStream, onFrame: (pcm: ArrayBuffer, level: number) => void): Promise<Capture>;
  recording(on: boolean): void;
  level(value: number): void;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

export function dictationSocketUrl(sttUrl: string, target: string, language: string, base: string = document.baseURI): URL {
  const lang = /^[a-z]{2,3}(-[A-Z]{2})?$/.test(language) ? language : "en-US";
  const u = new URL(sttUrl.replace(/\/$/, "") + "/stream", base);
  u.protocol = u.protocol === "https:" ? "wss:" : u.protocol === "http:" ? "ws:" : u.protocol;
  u.searchParams.set("aria", target);
  u.searchParams.set("lang", lang);
  return u;
}

type ServerFrame = { type?: string; text?: string; code?: string; offset_ms?: number };

export class Dictation {
  private current: MicSnapshot;
  private token = 0;
  private stream: MediaStream | null = null;
  private capture: Capture | null = null;
  private socket: SocketLike | null = null;
  private queue: ArrayBuffer[] = [];
  private finals: string[] = [];
  private partial = "";
  private cap: unknown;
  private finishing: unknown;
  private onText: (text: string, final: boolean) => void = () => {};
  private readonly listeners = new Set<(s: MicSnapshot) => void>();

  constructor(private readonly deps: DictationDeps) {
    this.current = { state: canRecord(deps.media) ? "idle" : "unsupported", began: 0, note: "" };
  }

  snapshot(): MicSnapshot {
    return this.current;
  }

  subscribe(fn: (s: MicSnapshot) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  toggle(target: string, onText: (text: string, final: boolean) => void): void {
    if (this.current.state === "recording") this.stop();
    else if (this.current.state === "idle") this.start(target, onText);
  }

  cancel(): void {
    this.token++;
    this.say("cancel");
    this.teardown();
    if (this.current.state !== "unsupported") this.set({ state: "idle", began: 0, note: "" });
  }

  private set(next: MicSnapshot): void {
    this.current = next;
    for (const fn of [...this.listeners]) fn(next);
  }

  private idle(note: string): void {
    this.set({ state: "idle", began: 0, note });
  }

  private say(type: "end" | "cancel"): void {
    const s = this.socket;
    if (s && s.readyState === 1) s.send(JSON.stringify({ type }));
  }

  private text(): string {
    return [...this.finals, this.partial].filter(Boolean).join(" ");
  }

  private teardown(): void {
    this.deps.clearTimeout(this.cap);
    this.deps.clearTimeout(this.finishing);
    this.capture?.stop();
    this.capture = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    const s = this.socket;
    this.socket = null;
    if (s) {
      s.onopen = s.onmessage = s.onclose = s.onerror = null;
      s.close(1000);
    }
    this.queue = [];
    this.deps.level(0);
    this.deps.recording(false);
  }

  private flush(): void {
    const s = this.socket;
    if (!s || s.readyState !== 1) return;
    for (const frame of this.queue.splice(0)) s.send(frame);
  }

  private frame(token: number, pcm: ArrayBuffer, level: number): void {
    if (token !== this.token) return;
    this.deps.level(level);
    if (this.current.state !== "recording") return;
    const s = this.socket;
    if (s && s.readyState === 1) s.send(pcm);
    else {
      this.queue.push(pcm);
      if (this.queue.length > QUEUE_FRAMES) this.queue.shift();
    }
  }

  private start(target: string, onText: (text: string, final: boolean) => void): void {
    const token = ++this.token;
    const devices = this.deps.media.devices;
    if (!devices) return;
    this.onText = onText;
    this.finals = [];
    this.partial = "";
    this.queue = [];
    this.set({ state: "asking", began: 0, note: "" });
    this.deps.recording(true);
    const socket = this.deps.open(target);
    socket.binaryType = "arraybuffer";
    this.socket = socket;
    socket.onopen = () => {
      if (token === this.token) this.flush();
    };
    socket.onmessage = (ev) => {
      if (token === this.token) this.receive(ev.data);
    };
    socket.onclose = () => {
      if (token !== this.token) return;
      const text = this.text();
      const was = this.current.state;
      this.teardown();
      if (text) this.onText(text, true);
      this.idle(was === "idle" ? "" : text ? "Connection lost; kept what was heard." : "Dictation connection lost.");
    };
    socket.onerror = () => {};
    devices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } }).then(
      (stream) => {
        if (token !== this.token) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        this.stream = stream;
        return this.deps.capture(stream, (pcm, level) => this.frame(token, pcm, level)).then((cap) => {
          if (token !== this.token) {
            cap.stop();
            return;
          }
          this.capture = cap;
          this.set({ state: "recording", began: this.deps.now(), note: "" });
          this.cap = this.deps.setTimeout(() => this.stop(), MAX_CLIP_MS);
        });
      },
    ).catch((err: unknown) => {
      if (token !== this.token) return;
      this.token++;
      this.teardown();
      this.idle(micFault(err));
    });
  }

  private stop(): void {
    if (this.current.state !== "recording") return;
    const token = this.token;
    this.deps.clearTimeout(this.cap);
    this.capture?.stop();
    this.capture = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.deps.level(0);
    this.flush();
    this.say("end");
    this.set({ state: "transcribing", began: 0, note: "Finishing." });
    this.finishing = this.deps.setTimeout(() => {
      if (token !== this.token) return;
      this.finish(this.text(), "Dictation timed out.");
    }, FINISH_WAIT_MS);
  }

  private finish(text: string, emptyNote: string): void {
    this.token++;
    this.teardown();
    if (!text.trim()) {
      this.idle(emptyNote);
      return;
    }
    this.onText(text.trim(), true);
    this.idle("");
  }

  private receive(raw: unknown): void {
    if (typeof raw !== "string") return;
    let f: ServerFrame;
    try {
      f = JSON.parse(raw) as ServerFrame;
    } catch {
      return;
    }
    switch (f.type) {
      case "partial":
        this.partial = (f.text ?? "").trim();
        this.onText(this.text(), false);
        return;
      case "final":
        if (f.text && f.text.trim()) this.finals.push(f.text.trim());
        this.partial = "";
        this.onText(this.text(), false);
        return;
      case "done":
        this.finish(((f.text ?? "") || this.finals.join(" ")).trim(), "Heard no words. Try again.");
        return;
      case "error": {
        const kept = this.text();
        const note = streamFault(f.code ?? "", f.text ?? "");
        this.token++;
        this.teardown();
        if (kept) this.onText(kept, true);
        this.idle(note);
        return;
      }
    }
  }
}
