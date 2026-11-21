import type { View } from "figaro-forms/aria";

export interface Reveal {
  plain?: string;
  mark?: string;
}

export type Span =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "a"; text: string; href: string }
  | { kind: "b" | "i"; spans: Span[] };

export type Block =
  | { kind: "p"; text: string }
  | { kind: "code"; lang: string; text: string; open: boolean }
  | { kind: "h"; level: number; text: string }
  | { kind: "hr" }
  | { kind: "ul" | "ol"; start: number; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "table"; align: string[]; head: string[]; rows: string[][] };

export interface BlockStream {
  text: string;
  live: boolean;
  blocks: Block[];
  offsets: number[];
}

export type Role = "you" | "aria" | "caller";

export interface InputPart {
  role: Role;
  label: string;
  text: string;
}

export interface InputModel {
  at: number | string | undefined;
  parts: InputPart[];
}

interface ItemBase {
  key: string;
  node: number;
  settled: boolean;
}

export interface ProseItem extends ItemBase {
  kind: "prose";
  text: string;
}
export interface ThinkingItem extends ItemBase {
  kind: "thinking";
  text: string;
}
export interface SteeringItem extends ItemBase {
  kind: "steering";
  text: string;
  role: Role;
  label: string;
}
export interface ToolItem extends ItemBase {
  kind: "tool";
  name: string;
  status: "running" | "ok" | "error";
  summary: string;
  args: string;
  input: string;
  output: string;
  outputBase: number;
  ms: number;
}
export interface UnknownItem extends ItemBase {
  kind: "unknown";
  type: string;
  text: string;
}
export type Item = ProseItem | ThinkingItem | SteeringItem | ToolItem | UnknownItem;

export interface TurnEnd {
  kind: "end" | "error";
  text: string;
}

export interface TurnModel {
  key: string;
  turn: number;
  input: InputModel | null;
  items: Item[];
  end: TurnEnd | null;
  open: boolean;
  sealed: boolean;
}

export interface NodiApi {
  reveal(text: string): Reveal[];
  blocks(text: string, live?: boolean): Block[];
  streamState(): BlockStream;
  stream(state: BlockStream, text: string, live: boolean): Block[];
  spans(text: string, depth?: number): Span[];
  model(view: View | undefined, ends: Record<number, { reason?: string }>): TurnModel[];
  metricsLine(m: unknown): string;
}

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
}

export type SpeechFault = "bad-turn" | "open" | "silent" | "busy" | "speech" | (string & {});

export interface SpeechHandlers {
  ready?(e: { aria: string; store: string }): void;
  start?(e: SpeechStart): void;
  chunk?(c: SpeechChunk): void;
  end?(e: { aria: string; turn: number; key: string }): void;
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
