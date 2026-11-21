import { Button } from "zanni-react";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { labelOf } from "../lib/roster";
import { routeFor } from "../lib/route";
import { attendedAtom, storeNameAtom } from "../state/route";
import { depthsAtom, rosterActionAtom, rosterAtom, rosterLoadedAtom } from "../state/roster";
import { Plain } from "./text";

export function Roster() {
  const roster = useAtomValue(rosterAtom);
  const loaded = useAtomValue(rosterLoadedAtom);
  const depth = useAtomValue(depthsAtom);
  const store = useAtomValue(storeNameAtom);
  const attended = useAtomValue(attendedAtom);
  const act = useSetAtom(rosterActionAtom);

  useEffect(() => {
    const visible = () => {
      if (document.visibilityState === "visible") void act("refresh");
    };
    document.addEventListener("visibilitychange", visible);
    return () => document.removeEventListener("visibilitychange", visible);
  }, [act]);

  let note = !loaded ? (roster.error !== undefined ? "Could not load arias: " + (roster.error instanceof Error ? roster.error.message : "network") : "Loading arias.") : roster.rows.length ? "" : "No arias.";
  if (loaded && roster.refused) note = (note ? note + " " : "") + roster.refused + " hidden by policy.";

  return (
    <nav className="fw-side" aria-label="Arias">
      <div className="fw-side-head">
        <h2 className="fw-h2">Arias</h2>
        <Button variant="outline" className="fw-new" onClick={() => void act("refresh")}>
          Refresh
        </Button>
      </div>
      <ul className="fw-threads">
        {roster.rows.map((r) => (
          <li key={r.id} className="fw-row">
            <a className="fw-thread" href={routeFor(store, r.id)} data-id={r.id} data-state={r.state || ""} data-depth={Math.min(6, depth[r.id] ?? 0)} {...(attended && attended.aria === r.id ? { "aria-current": "page" as const } : {})}>
              <span className="fw-thread-title">
                <Plain text={labelOf(r)} />
              </span>
              <span className="fw-thread-when">
                <Plain text={(r.state || "") + (r.message_count != null ? " \u00b7 " + r.message_count : "")} />
              </span>
            </a>
          </li>
        ))}
      </ul>
      {roster.next && (
        <Button variant="quiet" size="compact" className="fw-older fw-more" onClick={() => void act("more")}>
          More arias
        </Button>
      )}
      {note && <p className="fw-note">{note}</p>}
    </nav>
  );
}
