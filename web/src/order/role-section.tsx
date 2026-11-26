import type { ReactNode } from "react";
import { Fold } from "zanni-react";
import { standing, type CharterRole, type Mismatch, type Seat, type Study } from "./charter";
import { orderHash } from "./queue";
import { Chip } from "./rows";

function fanoutText(role: CharterRole, drawn: number | undefined): string {
  const parts: string[] = [];
  if (drawn !== undefined) parts.push(drawn === 1 ? "1 child" : drawn + " children");
  if (role.fanout.min !== undefined) parts.push("min " + role.fanout.min);
  if (role.fanout.max !== undefined) parts.push("max " + role.fanout.max);
  if (role.fanout.quota !== undefined) parts.push("quota " + role.fanout.quota);
  return parts.join(" · ");
}

function hasLimits(role: CharterRole): boolean {
  return role.fanout.min !== undefined || role.fanout.max !== undefined || role.fanout.quota !== undefined;
}

export function mismatchText(m: Mismatch): string {
  const under = m.drawnUnder.length > 0 ? "drawn under " + m.drawnUnder.join(" and ") : "drawn outside the command";
  return under + ", charter says " + m.declaredName;
}

function Fact({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="ord-field" data-field={name}>
      <dt>{name.replace(/_/g, " ")}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Charter({ role, mismatch, nameOfForm }: { role: CharterRole; mismatch: Mismatch | undefined; nameOfForm: (form: string) => string }) {
  const c = role.chartered;
  return (
    <dl className="ord-fields ord-charter">
      {c.reportsTo && (
        <Fact name="reports_to">
          {nameOfForm(c.reportsTo)}
          {mismatch && " (not where it is drawn)"}
        </Fact>
      )}
      {c.abdication && (
        <Fact name="succession">
          {c.abdication}
          {c.ttl && ", ttl " + c.ttl}
        </Fact>
      )}
      {c.reviewerMaxChildren !== undefined && <Fact name="reviewer_limit">{c.reviewerMaxChildren} per reviewer</Fact>}
    </dl>
  );
}

export interface SeatFacts {
  readonly role: CharterRole;
  readonly mismatch: Mismatch | undefined;
  readonly studies: readonly Study[];
  readonly seat: Seat | undefined;
  readonly central: boolean;
  readonly centralId: string;
  readonly holder: string;
  readonly nameOfForm: (form: string) => string;
}

export function RoleSection({ facts }: { facts: SeatFacts }) {
  const { role, mismatch, studies, seat, central, centralId, holder, nameOfForm } = facts;
  const drawn = seat?.drawnChildren;
  const limited = hasLimits(role);
  const tone = limited && drawn !== undefined ? standing(role.fanout, drawn) : "within";
  return (
    <Fold
      className="ord-card ord-role"
      data-role={role.id}
      data-seat={role.chartered.seat || undefined}
      data-regiment={role.chartered.regiment || undefined}
      data-central={central ? "true" : undefined}
      data-mismatch={mismatch ? "true" : undefined}
      summary={
        <span className="ord-role-head">
          <span className="ord-role-name">{role.name}</span>
          <span className="ord-holder" data-field="holder" data-vacant={seat ? undefined : ""}>
            {holder}
          </span>
          <span className="ord-meta ord-seatline">
            {central && <Chip field="central">central command</Chip>}
            {role.chartered.seat && <Chip field="seat">{role.chartered.seat}</Chip>}
            {role.chartered.regiment && <Chip field="regiment">{role.chartered.regiment}</Chip>}
            {limited && (
              <Chip field="fanout" tone={tone === "over" ? "lapsed" : tone === "short" ? "review" : undefined}>
                {fanoutText(role, drawn)}
              </Chip>
            )}
            {seat && seat.skipped > 0 && <Chip field="skipped">{seat.skipped === 1 ? "skips 1 unchartered" : "skips " + seat.skipped + " unchartered"}</Chip>}
            {mismatch && (
              <Chip field="mismatch" tone="owner">
                {mismatchText(mismatch)}
              </Chip>
            )}
            {studies.map((study) => (
              <Chip key={study.id} field="study" tone={study.found ? undefined : "lapsed"}>
                studies{" "}
                {study.found ? (
                  <a className="ord-link" href={orderHash(centralId, study.id)} data-study={study.id}>
                    {study.name}
                  </a>
                ) : (
                  study.name + " (not visible)"
                )}
              </Chip>
            ))}
          </span>
        </span>
      }
    >
      <div className="ord-role-body">
        <Charter role={role} mismatch={mismatch} nameOfForm={nameOfForm} />
      </div>
    </Fold>
  );
}
