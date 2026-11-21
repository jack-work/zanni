export type SessionType = "playback" | "play-and-record";

export type AudioPhase = "idle" | "playing" | "recording" | "recording-with-pending";

export interface Held {
  readonly key: string;
  release(): void;
}

export interface SessionDeps {
  setType(type: SessionType): void;
  ping(): void;
}

export class AudioSession {
  private handsFree = false;
  private recording = false;
  private playing = new Set<string>();
  private held: Held[] = [];
  private type: SessionType | undefined;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly deps: SessionDeps) {}

  phase(): AudioPhase {
    if (this.recording) return this.held.length ? "recording-with-pending" : "recording";
    return this.playing.size ? "playing" : "idle";
  }

  isHandsFree(): boolean {
    return this.handsFree;
  }

  heldKeys(): string[] {
    return this.held.map((h) => h.key);
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  apply(): void {
    const want: SessionType = this.handsFree || this.recording ? "play-and-record" : "playback";
    if (this.type !== want) this.type = want;
    this.deps.setType(want);
  }

  setHandsFree(on: boolean): void {
    if (this.handsFree === on) return;
    this.handsFree = on;
    if (!on) this.flush(false);
    this.apply();
    this.tell();
  }

  setRecording(on: boolean): void {
    if (this.recording === on) return;
    this.recording = on;
    this.apply();
    if (!on) this.flush(this.handsFree);
    this.tell();
  }

  arrive(item: Held): void {
    if (this.handsFree && this.recording) {
      this.held.push(item);
      this.tell();
      return;
    }
    if (this.handsFree) this.deps.ping();
    item.release();
  }

  withdraw(key: string): void {
    const before = this.held.length;
    this.held = this.held.filter((h) => h.key !== key);
    if (this.held.length !== before) this.tell();
  }

  clip(key: string, active: boolean): void {
    const had = this.playing.has(key);
    if (active === had) return;
    if (active) this.playing.add(key);
    else this.playing.delete(key);
    this.tell();
  }

  private flush(ping: boolean): void {
    const items = this.held;
    this.held = [];
    if (!items.length) return;
    if (ping) this.deps.ping();
    for (const item of items) item.release();
  }

  private tell(): void {
    for (const fn of [...this.listeners]) fn();
  }
}

export const PING_RATE = 24000;

export function pingPcm(): ArrayBuffer {
  const tones = [
    { hz: 880, ms: 70 },
    { hz: 1320, ms: 90 },
  ];
  const total = tones.reduce((n, t) => n + Math.round((t.ms / 1000) * PING_RATE), 0);
  const out = new Int16Array(total);
  let at = 0;
  for (const t of tones) {
    const n = Math.round((t.ms / 1000) * PING_RATE);
    for (let i = 0; i < n; i++) {
      const edge = Math.min(1, i / 120, (n - 1 - i) / 240);
      out[at++] = Math.round(Math.sin((2 * Math.PI * t.hz * i) / PING_RATE) * 0.2 * edge * 32767);
    }
  }
  return out.buffer;
}
