import { useAtomValue } from "jotai";
import { controlRows } from "../lib/control-rows";
import { pick, valueAt } from "../lib/pit-rows";
import { endStateAtom, linkAtom, metricsAtom, runningAtom, startedAtom, turnsAtom } from "../state/aria";
import { attendedFactsAtom, boundStateAtom, treeStateAtom } from "../state/pit";
import { attendedRowAtom } from "../state/roster";
import type { Attended } from "../state/route";

const ROUTE_KEY = "runtime.route";
const LIMIT_KEY = "runtime.context.limit";

function routeOf(root: unknown): string[] | undefined {
  const at = pick(root, ROUTE_KEY);
  return Array.isArray(at) ? at.filter((s): s is string => typeof s === "string") : undefined;
}

export function ControlStatus({ attended }: { attended: Attended }) {
  const { client, aria } = attended;
  const link = useAtomValue(linkAtom);
  const running = useAtomValue(runningAtom(client, aria));
  const end = useAtomValue(endStateAtom(client, aria));
  const turns = useAtomValue(turnsAtom(client, aria));
  const metrics = useAtomValue(metricsAtom(client, aria));
  const started = useAtomValue(startedAtom(client, aria));
  const facts = useAtomValue(attendedFactsAtom);
  const bound = useAtomValue(boundStateAtom);
  const tree = useAtomValue(treeStateAtom);
  const row = useAtomValue(attendedRowAtom);
  const node = tree?.nodes.get(aria);
  const limit = pick(bound?.root, LIMIT_KEY);
  const rows = controlRows({
    aria,
    name: row?.handle || node?.handle || aria.slice(0, 8),
    link,
    running,
    end,
    turns: turns.length,
    mantra: facts?.mantra ?? valueAt(bound?.root, "mantra"),
    route: routeOf(bound?.root),
    limit: typeof limit === "number" ? limit : node?.ctxLimit,
    metrics,
    started,
  });
  return (
    <dl className="fw-pit-state fw-pit-status" aria-label="Status" tabIndex={-1} data-autofocus>
      {rows.map((r) => (
        <div key={r.label} className="fw-pit-fact" data-key={r.label}>
          <dt>{r.label}</dt>
          <dd>
            {r.value}
            {r.dim && <span className="fw-pit-dim">{"  " + r.dim}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
