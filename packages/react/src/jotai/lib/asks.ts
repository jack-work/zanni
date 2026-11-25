import { duration } from "../../index";

export const STAGES = ["filed", "lane", "ready", "cut", "live", "validated"] as const;
export type Stage = (typeof STAGES)[number];

const OLD_STATES: Readonly<Record<string, Stage>> = { new: "filed", taken: "lane", shipped: "live" };

export interface AskSpan {
  readonly stage: Stage;
  readonly at: number;
  readonly ms: number | undefined;
  readonly current: boolean;
}

export interface Ask {
  readonly id: string;
  readonly text: string;
  readonly owner: string;
  readonly from: string;
  readonly lane: string;
  readonly tag: string;
  readonly box: string;
  readonly note: string;
  readonly stage: Stage;
  readonly stageIndex: number;
  readonly filedAt: number | undefined;
  readonly spans: readonly AskSpan[];
}

const MINUTE = 60_000;

export function lapse(ms: number): string {
  return ms < MINUTE ? "<1m" : duration(ms);
}

export function ageOf(ask: Pick<Ask, "filedAt">, now: number): number | undefined {
  return ask.filedAt === undefined ? undefined : Math.max(0, now - ask.filedAt);
}

function timeOf(v: unknown): number | undefined {
  if (typeof v !== "string") return undefined;
  const t = Date.parse(v);
  return Number.isNaN(t) ? undefined : t;
}

function text(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function stageNamed(v: unknown): number {
  const s = text(v);
  const mapped = OLD_STATES[s] ?? s;
  return STAGES.indexOf(mapped as Stage);
}

export function foldAsk(id: string, order: Record<string, unknown>, now: number): Ask {
  const stages = isObject(order.stages) ? order.stages : {};
  const at: (number | undefined)[] = STAGES.map((s) => timeOf(stages[s]));
  if (at[0] === undefined) at[0] = timeOf(order.filed);
  let reached = -1;
  at.forEach((t, i) => {
    if (t !== undefined) reached = i;
  });
  const stageIndex = Math.max(reached, stageNamed(order.state), 0);
  const spans: AskSpan[] = [];
  let next = -1;
  for (let i = 0; i < STAGES.length; i++) {
    const t = at[i];
    if (t === undefined) continue;
    if (next >= 0) {
      const prev = spans[next]!;
      spans[next] = { ...prev, ms: Math.max(0, t - prev.at) };
    }
    spans.push({ stage: STAGES[i]!, at: t, ms: undefined, current: false });
    next = spans.length - 1;
  }
  const last = spans[spans.length - 1];
  if (last && STAGES.indexOf(last.stage) === stageIndex) {
    spans[spans.length - 1] = { ...last, ms: last.stage === "validated" ? undefined : Math.max(0, now - last.at), current: true };
  }
  return {
    id,
    text: text(order.text),
    owner: text(order.owner),
    from: text(order.from),
    lane: text(order.lane),
    tag: text(order.tag),
    box: text(order.box),
    note: text(order.note),
    stage: STAGES[stageIndex]!,
    stageIndex,
    filedAt: at[0],
    spans,
  };
}

export function compareAsks(a: Ask, b: Ask): number {
  if (a.stageIndex !== b.stageIndex) return a.stageIndex - b.stageIndex;
  if (a.filedAt !== b.filedAt) {
    if (a.filedAt === undefined) return 1;
    if (b.filedAt === undefined) return -1;
    return a.filedAt - b.filedAt;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function foldAsks(root: unknown, now: number): Ask[] {
  const orders = isObject(root) && isObject(root.orders) ? root.orders : {};
  const out: Ask[] = [];
  for (const [id, order] of Object.entries(orders)) if (isObject(order)) out.push(foldAsk(id, order, now));
  return out.sort(compareAsks);
}

export function dwellLabel(span: AskSpan, next: AskSpan | undefined): string {
  const ms = span.ms === undefined ? "" : " " + lapse(span.ms);
  if (span.stage === "filed") return span.current ? "waiting" + ms + " for a lane" : "waited" + ms + " for " + (next?.stage ?? "a lane");
  return "in " + span.stage + ms;
}

export function askedLabel(age: number | undefined): string {
  return age === undefined ? "" : "asked " + lapse(age) + " ago";
}
