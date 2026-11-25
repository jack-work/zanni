import { Button, Glyph, QueueList, clip, useSizeVar, type QueueListRow } from "../../index";
import { QUEUE_GLYPH } from "../lib/status";
import { queueActionsOf, queueMark } from "figaro-forms/aria";
import { useAtomValue, useSetAtom } from "jotai";
import { useMemo, useRef, useState } from "react";
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
  return <Pile rows={rows} first={first} open={open} toggle={() => setOpen((o) => !o)} actions={actions} stopAll={() => void interrupt("clear")} />;
}

interface PileProps {
  rows: QueueListRow[];
  first: QueueListRow;
  open: boolean;
  toggle: () => void;
  actions: NonNullable<ReturnType<typeof queueActionsOf>>;
  stopAll: () => void;
}

function Pile({ rows, first, open, toggle, actions, stopAll }: PileProps) {
  const box = useRef<HTMLDivElement | null>(null);
  useSizeVar(box, "--fw-pile-h");
  return (
    <div ref={box} className="fw-pile" data-open={open ? "" : undefined}>
      <button type="button" className="fw-pile-head" aria-expanded={open} aria-label="Queue" onClick={toggle}>
        <span className="fw-pile-mark"><Glyph glyph={QUEUE_GLYPH} className="fw-pile-glyph" /></span>
        <span className="fw-pile-text">{open ? "Queued" : clip(first.text)}</span>
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
          <Button variant="quiet" size="compact" className="fw-stop-all" onClick={stopAll}>
            Stop all · clear queue
          </Button>
        </div>
      )}
    </div>
  );
}
