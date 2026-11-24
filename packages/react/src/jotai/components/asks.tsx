import { PitList, PitRow, glyphs } from "../../index";
import { useAtomValue } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { ageOf, askedLabel, dwellLabel, formatSpan, foldAsks, type Ask, type Stage } from "../lib/asks";
import { asksStateAtom } from "../state/asks";

const STAGE_GLYPH: Record<Stage, string> = {
  filed: glyphs["state.idle"],
  lane: glyphs["state.running"],
  ready: glyphs["queue.committing"],
  cut: glyphs["queue.committing"],
  live: glyphs["state.here"],
  validated: glyphs["tool.ok"],
};

const TICK_MS = 60_000;

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function when(at: number): string {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function Spans({ ask }: { ask: Ask }) {
  return (
    <>
      {ask.spans.map((s, i) => (
        <span key={s.stage} className="fw-ask-span" data-stage={s.stage} data-current={s.current ? "" : undefined}>
          {i > 0 && " · "}
          {dwellLabel(s, ask.spans[i + 1])}
        </span>
      ))}
    </>
  );
}

function Detail({ ask }: { ask: Ask }) {
  const facts: [string, string][] = [
    ["Ask", ask.text],
    ["From", ask.from],
    ["Owner", ask.owner],
    ["Lane", ask.lane],
    ["Tag", ask.tag],
    ["Box", ask.box],
    ["Note", ask.note],
  ];
  return (
    <div className="zr-pit-detail fw-ask-detail">
      <dl className="fw-pit-state">
        {facts
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="fw-pit-fact">
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        {ask.spans.map((s) => (
          <div key={s.stage} className="fw-pit-fact" data-stage={s.stage}>
            <dt>{s.stage}</dt>
            <dd>{when(s.at) + (s.ms !== undefined ? "  " + formatSpan(s.ms) : "")}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function AsksList({ asks, now }: { asks: readonly Ask[]; now: number }) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  return (
    <PitList label="Asks">
      {asks.map((a) => {
        const age = ageOf(a, now);
        return (
          <PitRow
            key={a.id}
            id={a.id}
            action="ask"
            className="fw-ask"
            glyph={STAGE_GLYPH[a.stage]}
            label={a.text || a.id}
            meta={askedLabel(age)}
            sub={
              <>
                <span className="fw-ask-owner">{a.owner || "no owner"}</span>
                <span className="fw-ask-stage" data-stage={a.stage}>
                  {" · " + a.stage}
                </span>
                <span className="fw-ask-spans">
                  <Spans ask={a} />
                </span>
              </>
            }
            expanded={open.has(a.id)}
            detail={<Detail ask={a} />}
            onClick={() => toggle(a.id)}
          />
        );
      })}
    </PitList>
  );
}

export function useAsks(): { asks: Ask[]; now: number; ready: boolean; error: string | undefined } {
  const form = useAtomValue(asksStateAtom);
  const now = useNow();
  const asks = useMemo(() => foldAsks(form?.root, now), [form?.root, now]);
  return { asks, now, ready: !!form?.ready, error: form?.error };
}

export function AsksView() {
  const { asks, now, ready, error } = useAsks();
  return (
    <>
      {asks.length === 0 && <p className="fw-note">{error ? "No asks: " + error : ready ? "No asks filed." : "Loading the asks."}</p>}
      <AsksList asks={asks} now={now} />
    </>
  );
}
