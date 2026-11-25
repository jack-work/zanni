import { glyphs } from "../../index";
import { ariaFactsAtom } from "figaro-forms/aria/jotai";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useState } from "react";
import { EFFORT_KEY, valueAt } from "../lib/pit-rows";
import { PAUSE_GLYPH, STATUS_SPINNER, ctxLine, stateGlyph } from "../lib/status";
import { contextTokensAtom, endStateAtom, linkAtom, runningAtom, workAtom } from "../state/aria";
import { composerAtom, interruptAtom, keyOf } from "../state/composer";
import { micAtom } from "../state/mic";
import { boundStateAtom, forkOfAtom, pitSnapAtom, treeStateAtom } from "../state/pit";
import { attendedAtom, type Attended } from "../state/route";

function Bar({ attended }: { attended: Attended }) {
  const { client, aria, store } = attended;
  const link = useAtomValue(linkAtom);
  const running = useAtomValue(runningAtom(client, aria));
  const endState = useAtomValue(endStateAtom(client, aria));
  const context = useAtomValue(contextTokensAtom(client, aria));
  const tree = useAtomValue(treeStateAtom);
  const facts = useAtomValue(ariaFactsAtom(client, aria));
  const bound = useAtomValue(boundStateAtom);
  const forkOf = useAtomValue(forkOfAtom);
  const snap = useAtomValue(pitSnapAtom);
  const work = useAtomValue(workAtom(client, aria));
  const composerNote = useAtomValue(composerAtom(keyOf(store, aria))).note;
  const micNote = useAtomValue(micAtom).note;
  const note = composerNote || micNote;
  const interrupt = useSetAtom(interruptAtom);
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % STATUS_SPINNER.length), 80);
    return () => clearInterval(id);
  }, [running]);
  const node = tree?.nodes.get(aria);
  const failed = endState === "failed";
  const interrupted = endState === "interrupted";
  const mantra = facts.mantra ?? valueAt(bound?.root, "mantra") ?? node?.mantra ?? "";
  const handle = node?.handle && node.handle !== mantra ? node.handle : aria.slice(0, 8);
  const used = node?.ctx ?? context;
  const ctx = ctxLine(used, node?.ctxLimit);
  const glyph = stateGlyph({ link, running, failed, interrupted, frame });
  const open = snap !== "closed";
  const line = note || (running ? work.verb : "");
  return (
    <header className="fw-status" data-link={link} data-state={running ? "running" : failed ? "error" : interrupted ? "interrupted" : "done"} data-effort={valueAt(bound?.root, EFFORT_KEY)} data-fork={forkOf ? "" : undefined}>
      {open && (
        <span className="fw-status-pit" aria-hidden="true">
          {glyphs["pit.form"]}
        </span>
      )}
      <span className="fw-status-glyph" role="status" aria-label={link === "live" ? (running ? "running" : "idle") : link}>
        {glyph}
      </span>
      {forkOf && (
        <span className="fw-status-fork" title={"Fork of " + forkOf.name}>
          {glyphs.fork}
        </span>
      )}
      <span className="fw-status-handle">{handle}</span>
      {link === "signedout" && <span className="fw-status-word">Signed out</span>}
      {line ? (
        <span className="fw-status-line" data-kind={note ? "note" : "running"} role="status">
          {line}
        </span>
      ) : (
        mantra && <span className="fw-status-mantra">{mantra}</span>
      )}
      {running && link === "live" && (
        <button type="button" className="fw-status-stop" aria-label="Stop" title="Stop" onClick={() => void interrupt("keep")}>
          {PAUSE_GLYPH}
        </button>
      )}
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
        {link === "signedout" && <span className="fw-status-word">Signed out</span>}
      </header>
    );
  return <Bar attended={attended} />;
}
