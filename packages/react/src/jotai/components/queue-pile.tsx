import { Button, Glyph, QueueList, firstLine, glyphs, type QueueListRow } from "../../index";
import { queueActionsOf, queueMark } from "figaro-forms/aria";
import { useAtomValue, useSetAtom } from "jotai";
import { useMemo, useState } from "react";
import { refusal } from "./queue-view";
import { attendedRunningAtom } from "../state/aria";
import { interruptAtom } from "../state/composer";
import { queueStateAtom } from "../state/pit";
import { attendedAtom } from "../state/route";

export function QueuePile() {
  const attended = useAtomValue(attendedAtom);
  const queue = useAtomValue(queueStateAtom);
  const running = useAtomValue(attendedRunningAtom);
  const interrupt = useSetAtom(interruptAtom);
  const [open, setOpen] = useState(false);
  const actions = useMemo(() => (attended ? queueActionsOf(attended.client, attended.aria) : undefined), [attended]);
  const rows: QueueListRow[] = useMemo(() => (queue?.rows ?? []).map((r) => ({ id: r.id, text: r.text, mark: queueMark(r) })), [queue?.rows]);
  const first = rows[0];
  if (!attended || !actions || !running || !first) return null;
  return (
    <div className="fw-pile" data-open={open ? "" : undefined}>
      <button type="button" className="fw-pile-head" aria-expanded={open} aria-label="Queue" onClick={() => setOpen((o) => !o)}>
        <span className="fw-pile-mark"><Glyph glyph={glyphs["pit.queue"]} className="fw-pile-glyph" /></span>
        <span className="fw-pile-text">{open ? "Queued" : firstLine(first.text)}</span>
        <span className="fw-pile-count">{"x" + rows.length}</span>
      </button>
      {open && (
        <div className="fw-pile-body">
          <QueueList
            rows={rows}
            empty=""
            onDrop={async (id) => refusal("rm", id, (await actions.drop(id)).results.find((r) => r.id === id))}
            onEdit={async (id, text) => refusal("edit", id, (await actions.edit(id, text)).result)}
          />
          <Button variant="quiet" size="compact" className="fw-stop-all" onClick={() => void interrupt("clear")}>
            Stop all · clear queue
          </Button>
        </div>
      )}
    </div>
  );
}
