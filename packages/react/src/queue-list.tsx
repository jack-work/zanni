import { useEffect, useState } from "react";
import { Button } from "./button";
import { PitList, PitRow } from "./pit-row";

export interface QueueListRow {
  readonly id: number;
  readonly text: string;
  readonly mark: string;
}

export type QueueOutcome = string | undefined | void;

export interface QueueListProps {
  rows: readonly QueueListRow[];
  onDrop: (id: number) => Promise<QueueOutcome> | QueueOutcome;
  onEdit: (id: number, text: string) => Promise<QueueOutcome> | QueueOutcome;
  empty?: string;
  grace?: number;
  label?: string;
}

export const QUEUE_ARRIVAL_GRACE_MS = 150;

export const firstLine = (text: string): string => text.split("\n", 1)[0] ?? "";

function useArrivals(rows: readonly QueueListRow[], grace: number): readonly QueueListRow[] {
  const [shown, setShown] = useState<ReadonlySet<number>>(() => new Set(rows.map((r) => r.id)));
  const key = rows.map((r) => r.id).join(",");
  useEffect(() => {
    const fresh = rows.filter((r) => !shown.has(r.id)).map((r) => r.id);
    if (fresh.length === 0) return;
    const reveal = () => setShown((s) => new Set([...s, ...fresh]));
    if (grace <= 0) {
      reveal();
      return;
    }
    const timer = window.setTimeout(reveal, grace);
    return () => window.clearTimeout(timer);
  }, [key, grace]);
  return grace <= 0 ? rows : rows.filter((r) => shown.has(r.id));
}

function Detail({ row, onDrop, onEdit, report }: { row: QueueListRow } & Pick<QueueListProps, "onDrop" | "onEdit"> & { report: (note: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (go: () => Promise<QueueOutcome> | QueueOutcome, done?: () => void) => {
    setBusy(true);
    try {
      const note = await go();
      if (note) report(note);
      else done?.();
    } catch (err) {
      report(err instanceof Error && err.message ? err.message : "network");
    } finally {
      setBusy(false);
    }
  };
  if (draft === null)
    return (
      <div className="zr-queue-detail">
        <p className="zr-queue-text">{row.text}</p>
        <div className="zr-queue-actions">
          <Button size="compact" variant="quiet" onClick={() => setDraft(row.text)}>
            Edit
          </Button>
          <Button size="compact" variant="quiet" disabled={busy} onClick={() => void run(() => onDrop(row.id))}>
            Drop
          </Button>
        </div>
      </div>
    );
  const changed = draft.trim() !== "" && draft !== row.text;
  return (
    <form
      className="zr-queue-detail"
      onSubmit={(ev) => {
        ev.preventDefault();
        if (changed && !busy) void run(() => onEdit(row.id, draft), () => setDraft(null));
      }}
    >
      <textarea className="zr-queue-edit" aria-label="Queued message" value={draft} rows={3} data-autofocus onChange={(e) => setDraft(e.target.value)} />
      <div className="zr-queue-actions">
        <Button size="compact" variant="quiet" onClick={() => setDraft(null)}>
          Cancel
        </Button>
        <Button size="compact" variant="accent" type="submit" disabled={!changed || busy}>
          Save
        </Button>
      </div>
    </form>
  );
}

export function QueueList({ rows, onDrop, onEdit, empty = "message queue is empty", grace = 0, label = "Queue" }: QueueListProps) {
  const visible = useArrivals(rows, grace);
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
  const [note, setNote] = useState("");
  const toggle = (id: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  return (
    <>
      <PitList label={label}>
        {visible.map((r) => (
          <PitRow
            key={r.id}
            id={String(r.id)}
            action="queued"
            className="zr-queue-row"
            glyph={r.mark}
            label={firstLine(r.text)}
            expanded={open.has(r.id)}
            detail={open.has(r.id) ? <Detail row={r} onDrop={onDrop} onEdit={onEdit} report={setNote} /> : undefined}
            onClick={() => toggle(r.id)}
          />
        ))}
      </PitList>
      {note && (
        <p className="zr-queue-note" role="alert">
          {note}
        </p>
      )}
      {visible.length === 0 && <p className="zr-queue-empty">{empty}</p>}
    </>
  );
}
