import { memo, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Plain } from "./text";

type Engine = typeof import("./typeset-pretext").engine;

let loading: Promise<Engine> | undefined;

export const loadTypeset = (): Promise<Engine> => (loading ??= import("./typeset-pretext").then((m) => m.engine));

interface Box {
  readonly width: number;
  readonly font: string;
  readonly lineHeight: number;
}

export interface TypesetProps {
  readonly text: string;
  readonly lines?: number;
  readonly more?: boolean;
  readonly tail?: string;
  readonly className?: string;
}

export const Typeset = memo(function Typeset({ text, lines: max = Infinity, more = false, tail = "", className }: TypesetProps) {
  const [node, setNode] = useState<HTMLSpanElement | null>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [box, setBox] = useState<Box | null>(null);

  useEffect(() => {
    let on = true;
    void loadTypeset().then((e) => on && setEngine(e));
    return () => {
      on = false;
    };
  }, []);

  useLayoutEffect(() => {
    if (!node || typeof ResizeObserver === "undefined") return;
    const read = (width: number) => {
      const cs = getComputedStyle(node);
      setBox((was) => (was && was.width === width && was.font === cs.font ? was : { width, font: cs.font, lineHeight: parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3 }));
    };
    const watch = new ResizeObserver((entries) => read(entries[0]!.contentRect.width));
    watch.observe(node);
    void document.fonts?.ready.then(() => read(node.clientWidth));
    return () => watch.disconnect();
  }, [node]);

  const prepared = useMemo(() => (engine && box ? engine.prepare(text, box.font) : null), [engine, text, box?.font]);
  let rows: string[] | null = null;
  let cut = false;
  if (engine && box && prepared && box.width > 0) {
    rows = engine.lines(prepared, box.width, box.lineHeight);
    if (rows.length > max || more) {
      cut = true;
      const room = box.width - (tail ? engine.width(engine.prepare(tail, box.font)) : 0);
      rows = engine.lines(prepared, Math.max(room, 1), box.lineHeight).slice(0, max);
      rows[rows.length - 1] = (rows[rows.length - 1] ?? "").trimEnd();
    }
  }

  return (
    <span ref={setNode} className={["zr-ts", className].filter(Boolean).join(" ")} data-set={rows ? "" : undefined}>
      {rows ? (
        rows.map((row, i) => (
          <span key={i} className="zr-ts-line">
            <Plain text={row} />
            {cut && i === rows.length - 1 && <span className="zr-fit-more">{tail}</span>}
          </span>
        ))
      ) : (
        <>
          <Plain text={text} />
          {more && <span className="zr-fit-more">{tail}</span>}
        </>
      )}
    </span>
  );
});
