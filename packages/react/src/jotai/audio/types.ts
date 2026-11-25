export interface PcmFormat {
  format: string;
  rate: number;
  bits: number;
  channels: number;
}

export interface VocePlayer {
  el: HTMLElement;
  start(format: PcmFormat): boolean;
  push(data: ArrayBuffer): boolean;
  end(audioId: string): void;
  fail(): void;
  stop(): void;
  play(): void;
  pause(): void;
  destroy(): void;
  speaking(): boolean;
  state(): string;
}

export interface VoceOptions {
  audioId: string;
  src(key: string): string;
  status(key: string): Promise<number>;
  label?: string;
  change?(state: string, event: string): void;
}

export interface VoceApi {
  create(doc: Document, opts: VoceOptions): VocePlayer;
  unlock(win?: Window): unknown;
  record(win: Window, on: boolean): void;
}

export interface SpeechChunk {
  aria: string;
  turn: number;
  node: number;
  chars?: number;
  cursor: string;
  offset: number;
  bytes: number;
  pcm: ArrayBuffer;
}

export interface SpeechStart extends PcmFormat {
  aria: string;
  turn: number;
  key: string;
  node: number;
  cursor: string;
  say?: boolean;
  partial?: boolean;
}

export type SpeechFault = "bad-turn" | "open" | "silent" | "busy" | "speech" | (string & {});

export interface SpeechHandlers {
  ready?(e: { aria: string; store: string }): void;
  start?(e: SpeechStart): void;
  chunk?(c: SpeechChunk): void;
  end?(e: { aria: string; turn: number; key: string; partial?: boolean }): void;
  stored?(e: { aria: string; turn: number; key?: string }): void;
  cancel?(e: { aria: string; turn: number; key: string; why: string }): void;
  error?(e: { aria: string; turn?: number; code: SpeechFault; text: string }): void;
}

export interface SpeechSession {
  voice(on: boolean): void;
  say(turn: number): void;
  cancel(): void;
  close(): void;
}

export interface SpeechTransport {
  open(ctx: { aria: string }, handlers: SpeechHandlers): SpeechSession;
}

export interface SpeechApi {
  gateway(opts: { url: string; window?: Window; base?: string; session?: string | (() => string) }): SpeechTransport;
  none(): SpeechTransport;
}
