import { useAtomValue } from "jotai";
import { PHASE_WORDS } from "../lib/roster";
import { linkAtom } from "../state/aria";
import { attendedRowAtom } from "../state/roster";
import { attendedAtom } from "../state/route";

export function StatusBar() {
  const link = useAtomValue(linkAtom);
  const attended = useAtomValue(attendedAtom);
  const row = useAtomValue(attendedRowAtom);
  const word = PHASE_WORDS[link] ?? "";
  const mantra = row?.mantra ?? "";
  return (
    <header className="fw-status" data-link={link}>
      <span className="fw-status-link" role="status">
        {word}
      </span>
      {attended && <span className="fw-status-id">{row?.short || attended.aria.slice(0, 8)}</span>}
      {attended && mantra && <span className="fw-status-mantra">{mantra}</span>}
    </header>
  );
}
