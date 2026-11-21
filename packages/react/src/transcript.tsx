import { formatWorkedTime, groupWork, stepsTitle, type Work } from "./work";
import { createContext, memo, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { scrollRoot } from "./follow";
import { PARK_HEIGHT, parkHeight, watchNear } from "./park";
import { Fold } from "./fold";
import { reducedMotion } from "./motion";
import { glyphs } from "./glyphs";
import { nodi, type InputModel, type Item, type ProseItem, type SteeringItem, type ThinkingItem, type ToolItem, type TurnModel, type UnknownItem } from "./zanni";
import { BlockView, Plain } from "./text";
import { cellLine, keyColumns, rowFull, valueLines } from "./deltas";
import type { DeltaCell, DeltaRow } from "./nodi-types";

export type TapKind = "input" | "prose";

export interface TranscriptHooks {
  actions?: (turn: number, playable: boolean, inquiry: boolean) => ReactNode;
  below?: (kind: TapKind, turn: number) => ReactNode;
  nameOf?: (aria: string) => string;
}

export const TranscriptContext = createContext<TranscriptHooks>({});

const CLIP = 4000;
const OUTPUT_LINES = 10;
const SPIN_MS = 80;
const SPINNER = [...glyphs["tool.running"]];

function settled(item: { settled: boolean }): { "data-settled"?: "" } {
  return item.settled ? { "data-settled": "" } : {};
}

function stamp(ms: unknown): string {
  const t = Number(ms);
  return isFinite(t) && t > 0 ? new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
}

export function InputView({ input, turn }: { input: InputModel; turn: number }) {
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
    const state = useRef(nodi.streamState());
    const blocks = useMemo(() => nodi.stream(state.current, item.text, !item.settled), [item.text, item.settled]);
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

export function ThinkingView({ item }: { item: ThinkingItem }) {
  return (
    <Fold open className="nodi-thinking" summary={<span className="nodi-sum-label">Thinking</span>} {...settled(item)}>
      <div className="nodi-thought">
        <Plain text={item.text} />
      </div>
    </Fold>
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

function Spinner() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (reducedMotion()) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % SPINNER.length), SPIN_MS);
    return () => clearInterval(id);
  }, []);
  return <>{SPINNER[frame]}</>;
}

function ToolMark({ item }: { item: ToolItem }) {
  return (
    <span className="nodi-tool-mark" role="img" aria-label={item.status === "running" ? "running" : item.status === "error" ? "failed" : "done"}>
      {item.status === "running" ? <Spinner /> : item.status === "error" ? glyphs["tool.error"] : glyphs["tool.ok"]}
    </span>
  );
}

export function tailLines(text: string, limit: number): { shown: string; total: number } {
  const rows = text.replace(/\n+$/, "").split("\n");
  return rows.length <= limit ? { shown: text, total: rows.length } : { shown: rows.slice(rows.length - limit).join("\n"), total: rows.length };
}

function diffSide(line: string): "file" | "hunk" | "add" | "del" | "" {
  if (line.startsWith("+++") || line.startsWith("---")) return "file";
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "del";
  return "";
}

function DiffLine({ line }: { line: string }) {
  return (
    <span className="nodi-diff-line" data-side={diffSide(line)}>
      <Plain text={line + "\n"} />
    </span>
  );
}

export function ToolView({ item }: { item: ToolItem }) {
  const [all, setAll] = useState(false);
  const shownArgs = item.args || item.input;
  const source = item.body ?? item.output;
  const out = source.length > CLIP ? source.slice(source.length - CLIP) : source;
  const showOut = !!out || item.status !== "running";
  const cut = (item.body === undefined && item.outputBase > 0) || source.length > CLIP;
  const tail = tailLines(out, OUTPUT_LINES);
  const trimmed = !all && tail.shown !== out;
  const body = trimmed ? tail.shown : out;
  const duration = item.ms >= 1000 ? (item.ms / 1000).toFixed(1) + "s" : "";
  return (
    <Fold
      open
      className="nodi-tool"
      data-status={item.status}
      {...settled(item)}
      summary={
        <>
          <ToolMark item={item} />
          <span className="nodi-tool-name">
            <Plain text={item.label || item.name || "tool"} />
          </span>
          <span className="nodi-tool-summary">
            <Plain text={item.head || item.summary} />
          </span>
          <span className="nodi-tool-status">{duration && "[" + duration + "]"}</span>
        </>
      }
    >
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
            {trimmed && (
              <button type="button" className="nodi-more" onClick={() => setAll(true)}>
                {"… last " + OUTPUT_LINES + " of " + tail.total + " lines, show all"}
              </button>
            )}
            <pre className="nodi-pre nodi-tool-out" {...(item.diff ? { "data-diff": "" } : {})}>
              {item.diff && body ? body.split("\n").map((line, i) => <DiffLine key={i} line={line} />) : <Plain text={body || "(no output)"} />}
            </pre>
          </>
        )}
      </div>
    </Fold>
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
    <Fold
      open
      className="zr-work"
      {...(live ? { "data-live": "" } : {})}
      summary={
        <>
          <span className="nodi-sum-label">{stepsTitle(items, live)}</span>
          {ms >= 1000 && <span className="zr-work-time">{formatWorkedTime(ms)}</span>}
        </>
      }
    >
      <div className="zr-work-body">
        {items.map((it) => (it.kind === "thinking" ? <ThinkingView key={it.key} item={it} /> : <ToolView key={it.key} item={it} />))}
      </div>
    </Fold>
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
  pinned?: boolean;
  eager?: boolean;
}

const spokenIn = (s: Speaking | null, turn: number): string => (s && s.turn === turn ? s.node + ":" + s.chars : "");

const HEX_NAME = /^@?[0-9a-f]{8,}$/;

const WIDE = /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6\u{1F300}-\u{1F64F}\u{1F900}-\u{1F9FF}\u{20000}-\u{3FFFD}]/u;

function cellsOf(text: string): number {
  let n = 0;
  for (const ch of text) n += WIDE.test(ch) ? 2 : 1;
  return n;
}

const shown = (cell: DeltaCell, nameOf: TranscriptHooks["nameOf"]): string =>
  cellLine({ present: cell.present, text: cell.present && nameOf && HEX_NAME.test(cell.text) ? nameOf(cell.text) : cell.text });

function Named({ cell, nameOf }: { cell: DeltaCell; nameOf: TranscriptHooks["nameOf"] }) {
  return <Plain text={shown(cell, nameOf)} />;
}

const shortOf = (cell: DeltaCell, nameOf: TranscriptHooks["nameOf"]): string | undefined => (cellsOf(shown(cell, nameOf)) <= 6 ? "" : undefined);

function DeltaEntry({ row, nameOf }: { row: DeltaRow; nameOf: TranscriptHooks["nameOf"] }) {
  const [open, setOpen] = useState(false);
  if (row.banner) {
    return (
      <li className="nodi-delta" data-banner="" title={rowFull(row)}>
        <span className="nodi-delta-glyph">{glyphs.dead}</span>
        <span className="nodi-delta-key">
          <Plain text={row.key} />
        </span>
      </li>
    );
  }
  return (
    <li className="nodi-delta" data-open={open ? "" : undefined}>
      <button type="button" className="nodi-delta-row" aria-expanded={open} title={rowFull(row)} onClick={() => setOpen(!open)}>
        <span className="nodi-delta-glyph">{glyphs.delta}</span>
        <span className="nodi-delta-key">
          <Plain text={row.key} />
        </span>
        <span className="nodi-delta-change">
          <span className="nodi-delta-from" data-short={shortOf(row.from, nameOf)}>
            <Named cell={row.from} nameOf={nameOf} />
          </span>
          <span className="nodi-delta-arrow"> {"->"} </span>
          <span className="nodi-delta-to" data-short={shortOf(row.to, nameOf)}>
            <Named cell={row.to} nameOf={nameOf} />
          </span>
        </span>
      </button>
      {open && (
        <div className="nodi-delta-full">
          {[
            { sign: "-", cell: row.from },
            { sign: "+", cell: row.to },
          ].map((side) => (
            <pre key={side.sign} className="nodi-delta-side" data-side={side.sign}>
              <Plain text={side.sign + " " + valueLines(side.cell).join("\n  ")} />
            </pre>
          ))}
        </div>
      )}
    </li>
  );
}

function DeltaTable({ rows }: { rows: readonly DeltaRow[] }) {
  const hooks = useContext(TranscriptContext);
  const keyw = Math.max(keyColumns(rows), 1);
  return (
    <ul className="nodi-deltas" aria-label="Form changes" style={{ "--nodi-delta-key": keyw + "ch" } as CSSProperties}>
      {rows.map((r, i) => (
        <DeltaEntry key={i + r.key} row={r} nameOf={hooks.nameOf} />
      ))}
    </ul>
  );
}

function TurnContent({ turn: m, speaking }: { turn: TurnModel; speaking: Speaking | null }) {
  const mine = speaking && speaking.turn === m.turn ? speaking : null;
  const rows = useMemo(() => groupWork(m.items), [m.items]);
  const hooks = useContext(TranscriptContext);
  const [deltasOpen, setDeltasOpen] = useState(false);
  const deltas = m.deltas ?? [];
  return (
    <>
      <div className="nodi-turn-head">
        <span className="nodi-turn-no">Turn {m.turn}</span>
        <span className="nodi-turn-marks">
          {m.forkedFrom && <span className="nodi-turn-fork">{glyphs.fork + " " + (hooks.nameOf?.(m.forkedFrom) ?? m.forkedFrom.slice(0, 8))}</span>}
          {deltas.length > 0 && (
            <button type="button" className="nodi-turn-delta" aria-expanded={deltasOpen} aria-label={"Form changes: " + deltas.length} onClick={() => setDeltasOpen(!deltasOpen)}>
              {glyphs.delta}
            </button>
          )}
        </span>
        <span className="nodi-turn-tools">{hooks.actions?.(m.turn, !m.open && m.items.some((i) => i.kind === "prose"), !!m.input && m.input.parts.length > 0)}</span>
      </div>
      {deltasOpen && deltas.length > 0 && <DeltaTable rows={deltas} />}
      <div className="nodi-turn-body">
        {m.input && m.input.parts.length > 0 && <InputView input={m.input} turn={m.turn} />}
        {m.input && m.input.parts.length > 0 && hooks.below?.("input", m.turn)}
        {rows.map((row) => (row.kind === "group" ? <WorkGroup key={row.key} items={row.items} /> : <ItemView key={row.key + row.kind} item={row} turn={m.turn} speaking={mine} />))}
        {!m.open && m.items.some((i) => i.kind === "prose") && hooks.below?.("prose", m.turn)}
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
    </>
  );
}

export const TurnView = memo(
  function TurnView({ turn: m, speaking, fresh, pinned, eager }: TurnViewProps) {
    const state = m.end ? (m.end.kind === "error" ? "failed" : "ended") : m.open ? "open" : "done";
    const li = useRef<HTMLLIElement | null>(null);
    const [near, setNear] = useState(() => !!eager || typeof IntersectionObserver === "undefined");
    const height = useRef(PARK_HEIGHT);
    const shown = !!pinned || near || (!!speaking && speaking.turn === m.turn);
    const showing = useRef(shown);
    showing.current = shown;
    useEffect(() => {
      const el = li.current;
      const root = scrollRoot();
      if (!el || !root || typeof IntersectionObserver === "undefined") return;
      return watchNear(el, root, (isNear, h) => {
        if (!isNear && showing.current) height.current = h;
        setNear(isNear);
      });
    }, []);
    useLayoutEffect(() => {
      if (!shown) parkHeight(m.turn, height.current);
    }, [shown, m.turn]);
    return (
      <li ref={li} className="nodi-turn zr-host" data-turn={m.turn} data-state={state} {...(fresh ? { "data-fresh": "" } : {})} {...(shown ? {} : { "data-parked": "" })}>
        {shown && <TurnContent turn={m} speaking={speaking} />}
      </li>
    );
  },
  (a, b) => a.turn === b.turn && a.fresh === b.fresh && !!a.pinned === !!b.pinned && spokenIn(a.speaking, a.turn.turn) === spokenIn(b.speaking, b.turn.turn),
);
