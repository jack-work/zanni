import type { ReactNode } from "react";
import { isObject, type Json } from "figaro-forms";
import { Fold, Sheet, bytes, stamp } from "zanni-react";
import { instant, sourceHref, type Amendment, type Blob, type Entry } from "./queue";
import type { Standing } from "./derive";
import { Anchor, leaseText, relative, type RowContext } from "./rows";
import { StandingNote } from "./standing";
import type { Link } from "zanni-react/jotai/state/link";

function When({ iso, now }: { iso: string; now: number }) {
  const at = instant(iso);
  if (at === undefined) return <>{iso}</>;
  return (
    <time dateTime={iso} title={iso}>
      {stamp(at)}
      <span className="ord-age"> ({relative(at, now)})</span>
    </time>
  );
}

function BlobLink({ blob }: { blob: Blob }) {
  return (
    <span className="ord-blob" data-field="body-link">
      <Anchor href={blob.uri}>{blob.uri}</Anchor>
      {blob.bytes !== undefined && <span className="ord-age"> {bytes(blob.bytes)}</span>}
      {blob.sha256 && <span className="ord-hash"> sha256 {blob.sha256.slice(0, 12)}</span>}
    </span>
  );
}

function Field({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="ord-field" data-field={name}>
      <dt>{name.replace(/_/g, " ")}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Pointers({ ids, byId, ctx }: { ids: readonly string[]; byId: ReadonlyMap<string, Entry>; ctx: RowContext }) {
  return (
    <ul className="ord-pointers">
      {ids.map((id) => {
        const found = byId.get(id);
        return (
          <li key={id}>
            {found ? (
              <button type="button" className="ord-pointer" onClick={() => ctx.open(id)}>
                {found.title || id}
              </button>
            ) : (
              <span className="ord-nolink">{id}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Amendments({ items, now, nameOf }: { items: readonly Amendment[]; now: number; nameOf: (aria: string) => string }) {
  return (
    <Fold className="ord-amendments" open summary={<span data-field="amendments-count">Amendments ({items.length})</span>}>
      <ol className="ord-amend-list">
        {items.map((a, i) => (
          <li key={i} className="ord-amend" data-field="amendment">
            <div className="ord-amend-head">
              <When iso={a.at} now={now} />
              {a.by && (
                <span>
                  {" "}
                  {a.by.role}
                  {a.by.aria ? " · " + nameOf(a.by.aria) : ""}
                </span>
              )}
            </div>
            <p className="ord-amend-note">{a.note}</p>
            {a.body && <BlobLink blob={a.body} />}
          </li>
        ))}
      </ol>
    </Fold>
  );
}

const EXTRA_DEPTH = 3;

const leafText = (v: Json): string => {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.length === 0 ? "[]" : v.length + " items";
  if (isObject(v)) return Object.keys(v).length === 0 ? "{}" : Object.keys(v).length + " keys";
  return String(v);
};

export function extraRows(extra: Entry["extra"]): [string, string][] {
  const rows: [string, string][] = [];
  const walk = (path: string, v: Json, depth: number): void => {
    if (depth < EXTRA_DEPTH && Array.isArray(v) && v.length > 0) v.forEach((x, i) => walk(path + "." + i, x, depth + 1));
    else if (depth < EXTRA_DEPTH && isObject(v) && Object.keys(v).length > 0) for (const k of Object.keys(v).sort()) walk(path + "." + k, v[k] as Json, depth + 1);
    else rows.push([path, leafText(v)]);
  };
  for (const [k, v] of extra) walk(k, v, 0);
  return rows;
}

export function EntryDetail({ entry, byId, ctx }: { entry: Entry; byId: ReadonlyMap<string, Entry>; ctx: RowContext }) {
  const { now, nameOf } = ctx;
  const lease = leaseText(entry, now);
  const review = entry.review;
  return (
    <div className="ord-detail" data-entry={entry.id}>
      <h2 className="ord-detail-title">{entry.title || entry.id}</h2>
      <dl className="ord-fields">
        <Field name="id">
          <code>{entry.id}</code>
        </Field>
        {entry.kind && <Field name="kind">{entry.kind}</Field>}
        {entry.state && (
          <Field name="state">
            <span data-state={entry.state}>{entry.state}</span>
            {entry.stateAt && (
              <>
                {" since "}
                <When iso={entry.stateAt} now={now} />
              </>
            )}
          </Field>
        )}
        {entry.owner && <Field name="owner">{entry.owner}</Field>}
        {entry.attention && <Field name="attention">{entry.attention}</Field>}
        {entry.claimedBy && (
          <Field name="claimed_by">
            {entry.claimedBy.role}
            {entry.claimedBy.aria ? " · " + nameOf(entry.claimedBy.aria) : ""}
            {entry.claimedBy.at && (
              <>
                {" at "}
                <When iso={entry.claimedBy.at} now={now} />
              </>
            )}
            {entry.claimedBy.leaseUntil && (
              <span data-tone={lease?.tone}>
                {lease?.tone === "lapsed" ? " · lease lapsed at " : " · lease until "}
                <When iso={entry.claimedBy.leaseUntil} now={now} />
              </span>
            )}
          </Field>
        )}
        {entry.priority !== undefined && <Field name="priority">{entry.priority}</Field>}
        {entry.parent && (
          <Field name="parent">
            <Pointers ids={[entry.parent]} byId={byId} ctx={ctx} />
          </Field>
        )}
        {entry.children.length > 0 && (
          <Field name="children">
            <Pointers ids={entry.children} byId={byId} ctx={ctx} />
          </Field>
        )}
        {entry.source && <Field name="source">{sourceHref(entry.source) ? <Anchor href={sourceHref(entry.source)!}>{entry.source}</Anchor> : entry.source}</Field>}
        {entry.requestedBy && (
          <Field name="requested_by">
            {entry.requestedBy.role}
            {entry.requestedBy.aria ? " · " + nameOf(entry.requestedBy.aria) : ""}
          </Field>
        )}
        {entry.principal && <Field name="principal">{entry.principal}</Field>}
        {entry.repo && <Field name="repo">{entry.repo}</Field>}
        {entry.branch && <Field name="branch">{entry.branch}</Field>}
        {entry.commits.length > 0 && (
          <Field name="commits">
            <span className="ord-commits">
              {entry.commits.map((c) => (
                <code key={c}>{c}</code>
              ))}
            </span>
          </Field>
        )}
        {review && (
          <Field name="review">
            <ul className="ord-review">
              {review.needed !== undefined && <li>needed: {review.needed ? "yes" : "no"}</li>}
              {review.commissionedBy && (
                <li>
                  commissioned by {review.commissionedBy.role}
                  {review.commissionedBy.aria ? " · " + nameOf(review.commissionedBy.aria) : ""}
                </li>
              )}
              {review.reviewerRole && <li>reviewer role: {review.reviewerRole}</li>}
              {review.leasedAt && (
                <li>
                  leased <When iso={review.leasedAt} now={now} />
                </li>
              )}
              {review.verdict && <li>verdict: {review.verdict}</li>}
            </ul>
          </Field>
        )}
        {entry.body && (
          <Field name="body">
            <BlobLink blob={entry.body} />
          </Field>
        )}
        {entry.links.length > 0 && (
          <Field name="links">
            <ul className="ord-links">
              {entry.links.map((l) => (
                <li key={l}>
                  <Anchor href={l}>{l}</Anchor>
                </li>
              ))}
            </ul>
          </Field>
        )}
        {extraRows(entry.extra).map(([k, v]) => (
          <Field key={k} name={k}>
            {v}
          </Field>
        ))}
      </dl>
      {entry.amendments.length > 0 && <Amendments items={entry.amendments} now={now} nameOf={nameOf} />}
    </div>
  );
}

export interface EntrySheetProps {
  readonly open: boolean;
  readonly entry: Entry | undefined;
  readonly byId: ReadonlyMap<string, Entry>;
  readonly note: string;
  readonly ctx: RowContext;
  readonly standing: Standing;
  readonly link: Link;
  readonly onClose: () => void;
}

export function EntrySheet({ open, entry, byId, note, ctx, standing, link, onClose }: EntrySheetProps) {
  return (
    <Sheet open={open} onClose={onClose} className="ord-sheet" title={entry ? entry.kind || "entry" : "entry"} label="Work order">
      <div className="ord-sheet-body" data-standing={standing}>
        <StandingNote standing={standing} link={link} />
        {entry ? <EntryDetail entry={entry} byId={byId} ctx={ctx} /> : <p className="ord-note">{note}</p>}
      </div>
    </Sheet>
  );
}
