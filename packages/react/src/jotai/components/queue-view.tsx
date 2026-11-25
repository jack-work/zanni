import { QUEUE_ARRIVAL_GRACE_MS, QueueList, type QueueListRow, type QueueOutcome } from "../../index";
import { queueActionsOf, queueMark, type QueueResult } from "figaro-forms/aria";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { attendedRunningAtom } from "../state/aria";
import { queueStateAtom } from "../state/pit";
import { attendedAtom } from "../state/route";

function refusal(verb: string, id: number, r: QueueResult | undefined): QueueOutcome {
  if (!r || r.outcome === "deleted" || r.outcome === "updated") return undefined;
  return `queue ${verb} ${id}: ${r.reason ?? r.outcome}${r.detail ? ` (${r.detail})` : ""}`;
}

export function QueueView() {
  const attended = useAtomValue(attendedAtom);
  const queue = useAtomValue(queueStateAtom);
  const running = useAtomValue(attendedRunningAtom);
  const actions = useMemo(() => (attended ? queueActionsOf(attended.client, attended.aria) : undefined), [attended]);
  const rows: QueueListRow[] = useMemo(() => (queue?.rows ?? []).map((r) => ({ id: r.id, text: r.text, mark: queueMark(r) })), [queue?.rows]);
  if (!attended || !actions) return <p className="zr-queue-empty">No aria.</p>;
  if (queue?.error && rows.length === 0) return <p className="zr-queue-empty">{"No queue: " + queue.error}</p>;
  if (!queue?.ready && rows.length === 0) return <p className="zr-queue-empty">Loading the queue.</p>;
  return (
    <QueueList
      rows={rows}
      grace={running ? 0 : QUEUE_ARRIVAL_GRACE_MS}
      onDrop={async (id) => refusal("rm", id, (await actions.drop(id)).results.find((r) => r.id === id))}
      onEdit={async (id, text) => refusal("edit", id, (await actions.edit(id, text)).result)}
    />
  );
}
