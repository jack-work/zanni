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
  label: string;
  head: string;
  body: string | undefined;
  diff: boolean;
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

export interface DeltaCell {
  present: boolean;
  text: string;
}

export interface DeltaRow {
  banner: boolean;
  key: string;
  from: DeltaCell;
  to: DeltaCell;
}

export interface TurnModel {
  key: string;
  turn: number;
  input: InputModel | null;
  items: Item[];
  end: TurnEnd | null;
  open: boolean;
  sealed: boolean;
  forkedFrom?: string;
  deltas?: DeltaRow[];
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
