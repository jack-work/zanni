import { glyphs } from "../../index";
import { useAtomValue } from "jotai";
import { routeFor } from "../lib/route";
import { labelOf } from "../lib/roster";
import { forkMarkAtom } from "../state/composer";
import { forkedFromAtom } from "../state/pit";
import { rosterAtom } from "../state/roster";
import type { Attended } from "../state/route";

export function ForkBanner({ attended }: { attended: Attended }) {
  const mark = useAtomValue(forkMarkAtom);
  const from = useAtomValue(forkedFromAtom);
  const rows = useAtomValue(rosterAtom).rows;
  const fresh = mark?.aria === attended.aria ? mark : null;
  const parent = fresh?.parent ?? from;
  if (!parent) return null;
  const label = labelOf(rows.find((r) => r.id === parent)) || parent.slice(0, 8);
  return (
    <p className="fw-fork-banner" role="status" data-fresh={fresh ? "" : undefined}>
      <span className="fw-fork-mark" aria-hidden="true">
        {glyphs.fork}
      </span>
      <span>
        Fork of <a href={routeFor(attended.store, parent)}>{label}</a>
        {fresh && fresh.turn ? " at turn " + fresh.turn : ""}
      </span>
    </p>
  );
}
