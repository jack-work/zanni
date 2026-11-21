import { glyphs, usePit } from "../../index";
import { ariaAtom, ariaFactsAtom } from "figaro-forms/aria/jotai";
import { useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { EFFORT_KEY, valueAt } from "../lib/pit-rows";
import { STATUS_SPINNER, ctxLine, stateGlyph } from "../lib/status";
import { linkAtom, runningAtom, turnsAtom } from "../state/aria";
import { boundStateAtom, forkedFromAtom, treeStateAtom } from "../state/pit";
import { attendedAtom } from "../state/route";

function Bar({ client, aria }: { client: NonNullable<ReturnType<typeof useAtomValue<typeof attendedAtom>>>["client"]; aria: string }) {
  const link = useAtomValue(linkAtom);
  const running = useAtomValue(runningAtom(client, aria));
  const turns = useAtomValue(turnsAtom(client, aria));
  const snap = useAtomValue(ariaAtom(client, aria));
  const tree = useAtomValue(treeStateAtom);
  const facts = useAtomValue(ariaFactsAtom(client, aria));
  const bound = useAtomValue(boundStateAtom);
  const forked = useAtomValue(forkedFromAtom);
  const pit = usePit();
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % STATUS_SPINNER.length), 80);
    return () => clearInterval(id);
  }, [running]);
  const node = tree?.nodes.get(aria);
  const end = turns[turns.length - 1]?.end;
  const failed = end?.kind === "error";
  const interrupted = end?.kind === "end" && /interrupt/i.test(end.text);
  const handle = node?.handle ?? aria.slice(0, 8);
  const mantra = facts.mantra ?? valueAt(bound?.root, "mantra") ?? node?.mantra ?? "";
  const used = node?.ctx ?? snap.metrics?.context_tokens;
  const ctx = ctxLine(used, node?.ctxLimit);
  const glyph = stateGlyph({ link, running, failed, interrupted, frame });
  const open = pit && pit.snap !== "closed";
  return (
    <header className="fw-status" data-link={link} data-fork={forked ? "" : undefined} data-state={running ? "running" : failed ? "error" : interrupted ? "interrupted" : "done"} data-effort={valueAt(bound?.root, EFFORT_KEY)}>
      {open && (
        <span className="fw-status-pit" aria-hidden="true">
          {glyphs["pit.form"]}
        </span>
      )}
      <span className="fw-status-glyph" role="status" aria-label={link === "live" ? (running ? "running" : "idle") : link}>
        {glyph}
      </span>
      <span className="fw-status-handle">{handle}</span>
      {forked && (
        <span className="fw-status-fork" title="A fork">
          {glyphs.fork}
        </span>
      )}
      {mantra && <span className="fw-status-mantra">{mantra}</span>}
      {ctx && <span className="fw-status-ctx">{ctx}</span>}
    </header>
  );
}

export function StatusBar() {
  const attended = useAtomValue(attendedAtom);
  const link = useAtomValue(linkAtom);
  if (!attended)
    return (
      <header className="fw-status" data-link={link}>
        <span className="fw-status-glyph" role="status" aria-label={link}>
          {stateGlyph({ link, running: false, failed: false, frame: 0 })}
        </span>
      </header>
    );
  return <Bar client={attended.client} aria={attended.aria} />;
}
