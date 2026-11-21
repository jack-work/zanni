import { memo, useMemo, type ReactNode } from "react";
import { nodi, type InputModel, type Item, type ProseItem, type SteeringItem, type ThinkingItem, type ToolItem, type TurnModel, type UnknownItem } from "../lib/zanni";
import { BlockView, Plain } from "./text";

const CLIP = 4000;

function settled(item: { settled: boolean }): { "data-settled"?: "" } {
  return item.settled ? { "data-settled": "" } : {};
}

function stamp(ms: unknown): string {
  const t = Number(ms);
  return isFinite(t) && t > 0 ? new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
}

export function InputView({ input }: { input: InputModel }) {
  const first = input.parts[0];
  return (
    <div className="nodi-input" data-from={first ? first.role : "you"}>
      {input.parts.map((p, i) => {
        const when = i === 0 ? stamp(input.at) : "";
        return (
          <div key={i} className="nodi-said" data-from={p.role}>
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
    return (
      <div className="nodi-prose" {...settled(item)} {...(speaking ? { "data-speaking": "" } : {})} {...(speaking && spokenChars !== undefined ? { "data-spoken-chars": String(spokenChars) } : {})}>
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
  actions?: ReactNode;
}

export const TurnView = memo(function TurnView({ turn: m, speaking, actions }: TurnViewProps) {
  const state = m.end ? (m.end.kind === "error" ? "failed" : "ended") : m.open ? "open" : "done";
  const mine = speaking && speaking.turn === m.turn ? speaking : null;
  return (
    <li className="nodi-turn" data-turn={m.turn} data-state={state}>
      <div className="nodi-turn-head">
        <span className="nodi-turn-no">Turn {m.turn}</span>
        <span className="nodi-turn-tools">{actions}</span>
      </div>
      <div className="nodi-turn-body">
        {m.input && m.input.parts.length > 0 && <InputView input={m.input} />}
        {m.items.map((it) => (
          <ItemView key={it.key + it.kind} item={it} turn={m.turn} speaking={mine} />
        ))}
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
});
