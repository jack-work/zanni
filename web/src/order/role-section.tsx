import { useMemo } from "react";
import { useAtomValue } from "jotai";
import type { AriaClient } from "figaro-forms/aria";
import { boundFormAtom } from "figaro-forms/aria/jotai";
import { Fold } from "zanni-react";
import { entriesOf, forestOf, stateCounts, wantsAttention, type Entry } from "./queue";
import type { RoleRow } from "./roles";
import { Branches, scoped, type PageContext } from "./rows";

export function useRoleQueue(client: AriaClient, roleId: string) {
  const form = useAtomValue(boundFormAtom(client, roleId));
  const entries = useMemo(() => entriesOf(form.root), [form.root]);
  const forest = useMemo(() => forestOf(entries), [entries]);
  return { form, entries, forest };
}

function formNote(form: ReturnType<typeof useRoleQueue>["form"]): string {
  if (form.refusal) return "This role form is closed to you.";
  if (form.phase === "gone") return "This role form is gone.";
  if (form.phase === "incompatible") return "This role form cannot be read by this page.";
  if (form.phase === "failed") return "Could not read this role form.";
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

export function RoleSection({ client, role, page }: { client: AriaClient; role: RoleRow; page: PageContext }) {
  const { form, entries, forest } = useRoleQueue(client, role.id);
  const note = formNote(form);
  return (
    <Fold className="ord-role" data-role={role.id} open={entries.length > 0 || undefined} summary={
      <span className="ord-role-head">
        <span className="ord-role-name">{role.name}</span>
        <span className="ord-holder" data-field="holder" data-vacant={role.holder ? undefined : ""}>
          {role.holder ? "held by " + role.holder.name : "vacant"}
        </span>
        <Counts entries={entries} />
      </span>
    }>
      <div className="ord-role-body">
        {note && <p className="ord-note">{note}</p>}
        {!note && entries.length === 0 && <p className="ord-note">No work orders.</p>}
        {forest.length > 0 && <Branches branches={forest} ctx={scoped(page, role.id)} />}
      </div>
    </Fold>
  );
}
