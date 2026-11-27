import { useMemo } from "react";
import { useAtomValue } from "jotai";
import type { AriaClient } from "figaro-forms/aria";
import { boundFormAtom } from "figaro-forms/aria/jotai";
import type { QueueForm } from "./charter";
import { entriesOf, forestOf, stateCounts, wantsAttention, type Entry } from "./queue";
import { Anchor, Branches, Chip, scoped, type PageContext } from "./rows";

export function useRoleQueue(client: AriaClient, formId: string) {
  const form = useAtomValue(boundFormAtom(client, formId));
  const entries = useMemo(() => entriesOf(form.root), [form.root]);
  const forest = useMemo(() => forestOf(entries), [entries]);
  return { form, entries, forest };
}

function formNote(form: ReturnType<typeof useRoleQueue>["form"]): string {
  if (form.refusal) return "This queue form is closed to you.";
  if (form.phase === "gone") return "This queue form is gone.";
  if (form.phase === "incompatible") return "This queue form cannot be read by this page.";
  if (form.phase === "failed") return "Could not read this queue form.";
  if (!form.ready) return "Loading…";
  return "";
}

function Counts({ entries }: { entries: readonly Entry[] }) {
  const counts = stateCounts(entries);
  const attention = entries.filter(wantsAttention).length;
  return (
    <span className="ord-counts" data-field="counts">
      {counts.map(([state, n]) => (
        <span key={state} className="ord-count" data-state={state}>
          {n} {state}
        </span>
      ))}
      {attention > 0 && (
        <span className="ord-count" data-state="attention">
          {attention} need attention
        </span>
      )}
    </span>
  );
}

function ContractLine({ queue }: { queue: QueueForm }) {
  const c = queue.contract;
  if (!c) return null;
  return (
    <p className="ord-contract" data-field="queue_contract">
      {c.version && c.version + ": "}
      {c.kinds.join(", ") || "no kinds"}
      {c.priority !== undefined && (c.priority ? ", by priority" : ", no priority")}
      {c.contract && (
        <>
          {" "}
          <Anchor href={c.contract}>contract</Anchor>
        </>
      )}
    </p>
  );
}

export function QueueDetail({ client, queue, page }: { client: AriaClient; queue: QueueForm; page: PageContext }) {
  const { form, entries, forest } = useRoleQueue(client, queue.id);
  const note = formNote(form);
  return (
    <div className="og-queue" data-queue={queue.id}>
      <Counts entries={entries} />
      <ContractLine queue={queue} />
      {note && <p className="ord-note">{note}</p>}
      {!note && entries.length === 0 && <p className="ord-note">No work orders.</p>}
      {forest.length > 0 && <Branches branches={forest} ctx={scoped(page, queue.id)} />}
    </div>
  );
}
