import type { Message } from "figaro-forms/aria";
import type { TurnModel } from "../../index";
import { nodi } from "../../index";

type Msg = Message;

interface View {
  readonly closed?: readonly Msg[];
  readonly open?: Msg;
}

type Ends = Record<number, { reason?: string }>;

interface Held {
  readonly msgs: readonly Msg[];
  readonly reason: string | undefined;
  readonly turn: TurnModel;
}

export interface TurnCache {
  held: Map<number, Held>;
  last: TurnModel[];
}

export const newTurnCache = (): TurnCache => ({ held: new Map(), last: [] });

function sameMsgs(a: readonly Msg[], b: readonly Msg[]): boolean {
  return a.length === b.length && a.every((m, i) => m === b[i]);
}

const FORKED_FROM = ".system.forked_from";

function forkedFromOf(msgs: readonly Msg[]): string | undefined {
  for (const m of msgs) {
    for (const [key, d] of Object.entries(m.formDeltas ?? {})) {
      if (key.endsWith(FORKED_FROM) && d.event !== "removed" && d.event !== "deleted" && typeof d.value === "string") return d.value;
    }
  }
  return undefined;
}

export function turnsOf(view: View, ends: Ends, cache: TurnCache): TurnModel[] {
  const groups = new Map<number, Msg[]>();
  for (const m of view.closed ?? []) {
    const g = groups.get(m.turn);
    if (g) g.push(m);
    else groups.set(m.turn, [m]);
  }
  const open = view.open;
  if (open && !groups.has(open.turn)) groups.set(open.turn, []);
  const held = new Map<number, Held>();
  const out: TurnModel[] = [];
  for (const [turn, closed] of groups) {
    const reason = ends[turn]?.reason;
    const hit = cache.held.get(turn);
    if (hit && hit.reason === reason && !(open && open.turn === turn) && sameMsgs(hit.msgs, closed)) {
      held.set(turn, hit);
      out.push(hit.turn);
      continue;
    }
    const live = open && open.turn === turn ? open : undefined;
    const model = nodi.model({ closed, open: live } as Parameters<typeof nodi.model>[0], ends)[0]!;
    const from = forkedFromOf(live ? [...closed, live] : closed);
    if (from) model.forkedFrom = from;
    const same = hit && JSON.stringify(hit.turn) === JSON.stringify(model);
    const next = same ? hit.turn : model;
    held.set(turn, { msgs: closed, reason, turn: next });
    out.push(next);
  }
  cache.held = held;
  if (out.length === cache.last.length && out.every((t, i) => t === cache.last[i])) return cache.last;
  cache.last = out;
  return out;
}
