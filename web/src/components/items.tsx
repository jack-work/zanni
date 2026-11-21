import { useSetAtom } from "jotai";
import { formatWorkedTime, groupWork, stepsTitle, type Work } from "../lib/work";
import { memo, useMemo, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import type { SheetKind } from "../lib/sheet";
import { openSheetAtom } from "../state/sheet";
import { nodi, type InputModel, type Item, type ProseItem, type SteeringItem, type ThinkingItem, type ToolItem, type TurnModel, type UnknownItem } from "../lib/zanni";
import { BlockView, Plain } from "./text";
import { TurnActions } from "./turn-actions";

const CLIP = 4000;

function settled(item: { settled: boolean }): { "data-settled"?: "" } {
  return item.settled ? { "data-settled": "" } : {};
}

const NOT_A_TAP = "a, button, summary, input, textarea, .voce";

function useTap(kind: SheetKind, turn: number) {
  const open = useSetAtom(openSheetAtom);
  return {
    tabIndex: 0,
    "aria-haspopup": "dialog" as const,
    onClick: (ev: MouseEvent<HTMLElement>) => {
      if ((ev.target as Element).closest(NOT_A_TAP)) return;
      if (window.getSelection()?.toString()) return;
      open({ kind, turn });
    },
    onKeyDown: (ev: KeyboardEvent<HTMLElement>) => {
      if (ev.target !== ev.currentTarget || (ev.key !== "Enter" && ev.key !== " ")) return;
      ev.preventDefault();
      open({ kind, turn });
    },
  };
}

function stamp(ms: unknown): string {
  const t = Number(ms);
  return isFinite(t) && t > 0 ? new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
}

export function InputView({ input, turn }: { input: InputModel; turn: number }) {
  const tap = useTap("input", turn);
  const first = input.parts[0];
  return (
    <div className="nodi-input" data-from={first ? first.role : "you"}>
      {input.parts.map((p, i) => {
        const when = i === 0 ? stamp(input.at) : "";
        return (
          <div key={i} className="nodi-said fw-tap" data-from={p.role} {...tap}>
            <div className="nodi-by">
              <span className="nodi-who">
                <Plain text={p.label} />
              </span>
              {when && <span className="nodi-when">{when}</span>}
            </div>
            <div className="nodi-said-text">
              <Plain text={p.text} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export interface ProseProps {
  item: ProseItem;
  turn: number;
  speaking: boolean;
  spokenChars: number | undefined;
}

export const ProseView = memo(
  function ProseView({ item, turn, speaking, spokenChars }: ProseProps) {
    const blocks = useMemo(() => nodi.blocks(item.text), [item.text]);
    const tap = useTap("prose", turn);
    return (
      <div className="nodi-prose fw-tap" {...tap} {...settled(item)} {...(speaking ? { "data-speaking": "" } : {})} {...(speaking && spokenChars !== undefined ? { "data-spoken-chars": String(spokenChars) } : {})}>
        <div className="nodi-text">
          {blocks.map((b, i) => (
            <BlockView key={i} block={b} />
          ))}
        </div>
        <div className="nodi-voice" data-voice-slot={turn + ":" + item.node} />
      </div>
    );
  },
  (a, b) => a.item.text === b.item.text && a.item.settled === b.item.settled && a.speaking === b.speaking && a.spokenChars === b.spokenChars && a.turn === b.turn,
);

function Caret({ children }: { children: ReactNode }) {
  return (
    <summary className="nodi-sum">
      <span className="nodi-caret" />
      {children}
    </summary>
  );
}

export function ThinkingView({ item }: { item: ThinkingItem }) {
  return (
    <details className="nodi-thinking" {...settled(item)}>
      <Caret>
        <span className="nodi-sum-label">Thinking</span>
      </Caret>
      <div className="nodi-thought">
        <Plain text={item.text} />
      </div>
    </details>
  );
}

export function SteeringView({ item }: { item: SteeringItem }) {
  return (
    <div className="nodi-steering" data-from={item.role} {...settled(item)}>
      <div className="nodi-by">
        <span className="nodi-steer-tag">Steered by</span>
        <span className="nodi-who">
          <Plain text={item.label} />
        </span>
      </div>
      <div className="nodi-said-text">
        <Plain text={item.text} />
      </div>
    </div>
  );
}

export function toolStatusWord(item: ToolItem): string {
  let label = item.status === "running" ? "running" : item.status === "error" ? "failed" : "done";
  if (item.ms >= 1000) label += " " + (item.ms / 1000).toFixed(1) + "s";
  return label;
}

export function ToolView({ item }: { item: ToolItem }) {
  const shownArgs = item.args || item.input;
  const out = item.output.length > CLIP ? item.output.slice(item.output.length - CLIP) : item.output;
  const showOut = !!out || item.status !== "running";
  const cut = item.outputBase > 0 || item.output.length > CLIP;
  return (
    <details className="nodi-tool" data-status={item.status} {...settled(item)}>
      <Caret>
        <span className="nodi-tool-name">
          <Plain text={item.name || "tool"} />
        </span>
        <span className="nodi-tool-summary">
          <Plain text={item.summary} />
        </span>
        <span className="nodi-tool-status">{toolStatusWord(item)}</span>
      </Caret>
      <div className="nodi-tool-body">
        {shownArgs && (
          <>
            <div className="nodi-label">Arguments</div>
            <pre className="nodi-pre nodi-tool-args">
              <Plain text={shownArgs} />
            </pre>
          </>
        )}
        {showOut && (
          <>
            <div className="nodi-label">Result</div>
            {cut && <div className="nodi-clipped">Earlier output was clipped.</div>}
            <pre className="nodi-pre nodi-tool-out">
              <Plain text={out || "(no output)"} />
            </pre>
          </>
        )}
      </div>
    </details>
  );
}

export function UnknownView({ item }: { item: UnknownItem }) {
  return (
    <div className="nodi-unknown" {...settled(item)}>
      <div className="nodi-label">
        <Plain text={"Unknown node: " + item.type} />
      </div>
      {item.text && (
        <pre className="nodi-pre">
          <Plain text={item.text} />
        </pre>
      )}
    </div>
  );
}

export function WorkGroup({ items }: { items: Work[] }) {
  const live = items.some((i) => (i.kind === "tool" ? i.status === "running" : !i.settled));
  const ms = items.reduce((n, i) => n + (i.kind === "tool" ? i.ms : 0), 0);
  return (
    <details className="fw-work" {...(live ? { "data-live": "" } : {})}>
      <Caret>
        <span className="nodi-sum-label">{stepsTitle(items, live)}</span>
        {ms >= 1000 && <span className="fw-work-time">{formatWorkedTime(ms)}</span>}
      </Caret>
      <div className="fw-work-body">
        {items.map((it) => (it.kind === "thinking" ? <ThinkingView key={it.key} item={it} /> : <ToolView key={it.key} item={it} />))}
      </div>
    </details>
  );
}

export interface Speaking {
  readonly turn: number;
  readonly node: number;
  readonly chars: number | undefined;
}

function ItemView({ item, turn, speaking }: { item: Item; turn: number; speaking: Speaking | null }) {
  switch (item.kind) {
    case "prose": {
      const on = !!speaking && speaking.turn === turn && speaking.node === item.node;
      return <ProseView item={item} turn={turn} speaking={on} spokenChars={on ? speaking.chars : undefined} />;
    }
    case "thinking":
      return <ThinkingView item={item} />;
    case "steering":
      return <SteeringView item={item} />;
    case "tool":
      return <ToolView item={item} />;
    case "unknown":
      return <UnknownView item={item} />;
  }
}

export interface TurnViewProps {
  turn: TurnModel;
  speaking: Speaking | null;
  fresh: boolean;
}

const spokenIn = (s: Speaking | null, turn: number): string => (s && s.turn === turn ? s.node + ":" + s.chars : "");

export const TurnView = memo(
  function TurnView({ turn: m, speaking, fresh }: TurnViewProps) {
  const state = m.end ? (m.end.kind === "error" ? "failed" : "ended") : m.open ? "open" : "done";
  const mine = speaking && speaking.turn === m.turn ? speaking : null;
  const rows = useMemo(() => groupWork(m.items), [m.items]);
  return (
    <li className="nodi-turn" data-turn={m.turn} data-state={state} {...(fresh ? { "data-fresh": "" } : {})}>
      <div className="nodi-turn-head">
        <span className="nodi-turn-no">Turn {m.turn}</span>
        <span className="nodi-turn-tools">
          <TurnActions turn={m.turn} />
        </span>
      </div>
      <div className="nodi-turn-body">
        {m.input && m.input.parts.length > 0 && <InputView input={m.input} turn={m.turn} />}
        {rows.map((row) => (row.kind === "group" ? <WorkGroup key={row.key} items={row.items} /> : <ItemView key={row.key + row.kind} item={row} turn={m.turn} speaking={mine} />))}
        {m.end &&
          (m.end.kind === "error" ? (
            <p className="nodi-error" role="alert">
              <Plain text={"Turn failed: " + m.end.text} />
            </p>
          ) : (
            <p className="nodi-end">
              <Plain text={"Turn ended: " + m.end.text} />
            </p>
          ))}
      </div>
    </li>
  );
  },
  (a, b) => a.turn === b.turn && a.fresh === b.fresh && spokenIn(a.speaking, a.turn.turn) === spokenIn(b.speaking, b.turn.turn),
);
