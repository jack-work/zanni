import { glyphs } from "../../index";
import { useAtomValue } from "jotai";
import { EFFORT_KEY, valueAt } from "../lib/pit-rows";
import { PHASE_WORDS } from "../lib/roster";
import { linkAtom } from "../state/aria";
import { boundStateAtom, forkedFromAtom } from "../state/pit";
import { attendedRowAtom } from "../state/roster";
import { attendedAtom } from "../state/route";

export function StatusBar() {
  const link = useAtomValue(linkAtom);
  const attended = useAtomValue(attendedAtom);
  const row = useAtomValue(attendedRowAtom);
  const bound = useAtomValue(boundStateAtom);
  const forked = useAtomValue(forkedFromAtom);
  const word = PHASE_WORDS[link] ?? "";
  const mantra = valueAt(bound?.root, "mantra") ?? row?.mantra ?? "";
  return (
    <header className="fw-status" data-link={link} data-fork={forked ? "" : undefined} data-effort={valueAt(bound?.root, EFFORT_KEY)}>
      <span className="fw-status-link" role="status">
        {word}
      </span>
      {attended && <span className="fw-status-id">{row?.short || attended.aria.slice(0, 8)}</span>}
      {forked && (
        <span className="fw-status-fork" title="A fork">
          {glyphs.fork}
        </span>
      )}
      {attended && mantra && <span className="fw-status-mantra">{mantra}</span>}
    </header>
  );
}
