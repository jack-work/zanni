import { useMemo } from "react";
import { useAtomValue } from "jotai";
import type { AriaClient } from "figaro-forms/aria";
import { bare, sameId, type CharterRole, type QueueForm, type Seat, type Study, type Topology, type VacantSeat } from "./charter";
import { QueueSection } from "./queue-section";
import { RoleSection } from "./role-section";
import { shortId } from "./roles";
import type { PageContext } from "./rows";
import { readsAtom, treeStateAtom } from "./state";

interface Ground {
  readonly client: AriaClient;
  readonly page: PageContext;
  readonly central: string;
  readonly holderOf: (role: CharterRole) => string;
  readonly nameOfForm: (form: string) => string;
}

function Queues({ queues, ground }: { queues: readonly QueueForm[]; ground: Ground }) {
  if (queues.length === 0) return null;
  return (
    <ul className="ord-forms" data-field="queue-forms">
      {queues.map((q) => (
        <li key={q.id} className="ord-form">
          <QueueSection client={ground.client} queue={q} page={ground.page} />
        </li>
      ))}
    </ul>
  );
}

function RoleCard({ role, mismatch, studies, seat, queues, ground }: { role: CharterRole; mismatch: Seat["roles"][number]["mismatch"]; studies: readonly Study[]; seat: Seat | undefined; queues: readonly QueueForm[]; ground: Ground }) {
  return (
    <>
      <RoleSection facts={{ role, mismatch, studies, seat, central: sameId(role.id, ground.central), centralId: ground.central, holder: ground.holderOf(role), nameOfForm: ground.nameOfForm }} />
      <Queues queues={queues} ground={ground} />
    </>
  );
}

function SeatItem({ seat, ground }: { seat: Seat; ground: Ground }) {
  const first = seat.roles[0]!.role;
  return (
    <li className="ord-seat" data-aria={seat.aria} data-seat={first.chartered.seat || undefined}>
      {seat.roles.map((r) => (
        <RoleCard key={r.role.id} role={r.role} mismatch={r.mismatch} studies={r.studies} seat={seat} queues={r.queues} ground={ground} />
      ))}
      {seat.children.length > 0 && <SeatList seats={seat.children} ground={ground} />}
    </li>
  );
}

function SeatList({ seats, ground }: { seats: readonly Seat[]; ground: Ground }) {
  return (
    <ul className="ord-seats">
      {seats.map((s) => (
        <SeatItem key={s.aria} seat={s} ground={ground} />
      ))}
    </ul>
  );
}

function VacantList({ seats, ground }: { seats: readonly VacantSeat[]; ground: Ground }) {
  return (
    <ul className="ord-seats">
      {seats.map(({ role, queues, studies }) => (
        <li key={role.id} className="ord-seat" data-vacant="">
          <RoleCard role={role} mismatch={undefined} studies={studies} seat={undefined} queues={queues} ground={ground} />
        </li>
      ))}
    </ul>
  );
}

function StrayList({ queues, ground }: { queues: readonly QueueForm[]; ground: Ground }) {
  return (
    <ul className="ord-forms">
      {queues.map((q) => (
        <li key={q.id} className="ord-form">
          <QueueSection client={ground.client} queue={q} page={ground.page} stray={ground.nameOfForm(q.under)} />
        </li>
      ))}
    </ul>
  );
}

export function Topologies({ client, topology, page, overrides }: { client: AriaClient; topology: Topology; page: PageContext; overrides: "applied" | "unreadable" }) {
  const reads = useAtomValue(readsAtom);
  const tree = useAtomValue(treeStateAtom);
  const ground = useMemo<Ground>(() => {
    const names = new Map(reads.flatMap((r) => (r.role ? [[bare(r.role.id), r.role.name] as const] : [])));
    const known = new Set([...(tree?.nodes.keys() ?? [])].map(bare));
    return {
      client,
      page,
      central: topology.central.id,
      nameOfForm: (form) => names.get(bare(form)) ?? shortId(form),
      holderOf: (role) => {
        if (!role.target) return "vacant";
        return known.has(bare(role.target)) ? "held by " + page.nameOf(role.target) : "holder not visible: " + shortId(role.target);
      },
    };
  }, [client, page, reads, tree, topology.central.id]);
  const { tree: lead, apart, vacant, strays } = topology;
  return (
    <div className="ord-roles" data-field="roles" data-central={topology.central.id}>
      <h2 className="ord-h2" data-field="central">
        Central command: {topology.central.name}
      </h2>
      {overrides === "unreadable" && (
        <p className="ord-note" data-field="overrides-note">
          Drawn placement is unreadable: seats sit where their forks put them.
        </p>
      )}
      {lead ? <SeatList seats={[lead]} ground={ground} /> : <p className="ord-note">The central command has no holder.</p>}
      {apart.length > 0 && (
        <section className="ord-group" data-field="apart">
          <h2 className="ord-h2">Chartered here, drawn elsewhere</h2>
          <SeatList seats={apart} ground={ground} />
        </section>
      )}
      {vacant.length > 0 && (
        <section className="ord-group" data-field="vacant">
          <h2 className="ord-h2">Vacant seats</h2>
          <VacantList seats={vacant} ground={ground} />
        </section>
      )}
      {strays.length > 0 && (
        <section className="ord-group" data-field="strays">
          <h2 className="ord-h2">Queue forms under a seat that is not minted</h2>
          <StrayList queues={strays} ground={ground} />
        </section>
      )}
    </div>
  );
}
