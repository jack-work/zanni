import { PitList, PitRow, glyphs } from "../../index";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useState } from "react";
import { labelOf } from "../lib/roster";
import { olderRosterActionAtom, olderRosterAtom } from "../state/older";
import { goAtom, storeNameAtom } from "../state/route";

export function OlderArias({ shown, more, onVisit }: { shown: ReadonlySet<string>; more: number; onVisit?: () => void }) {
  const [open, setOpen] = useState(false);
  if (more <= 0) return null;
  if (!open) {
    return (
      <PitList label="Older">
        <PitRow glyph={glyphs["pit.form"]} label={more + " older"} action="older" onClick={() => setOpen(true)} />
      </PitList>
    );
  }
  return <OlderRows shown={shown} more={more} onVisit={onVisit} />;
}

function OlderRows({ shown, more, onVisit }: { shown: ReadonlySet<string>; more: number; onVisit?: () => void }) {
  const roster = useAtomValue(olderRosterAtom);
  const page = useSetAtom(olderRosterActionAtom);
  const store = useAtomValue(storeNameAtom);
  const go = useSetAtom(goAtom);
  const rows = roster.rows.filter((r) => !shown.has(r.id));
  const skipping = !roster.loading && roster.next !== undefined && rows.length === 0;
  useEffect(() => {
    if (skipping) void page("more");
  }, [skipping, page]);
  const left = more - rows.length;
  return (
    <>
      <PitList label="Older">
        {rows.map((r) => (
          <PitRow
            key={r.id}
            id={r.id}
            glyph={glyphs["state.idle"]}
            label={labelOf(r)}
            meta={r.state}
            onClick={() => {
              onVisit?.();
              go({ store, aria: r.id });
            }}
          />
        ))}
        {roster.next !== undefined && !roster.loading && left > 0 && rows.length > 0 && <PitRow glyph={glyphs["pit.form"]} label={left + " older"} action="older" onClick={() => void page("more")} />}
      </PitList>
      {roster.loading && <p className="fw-note">Loading</p>}
    </>
  );
}
