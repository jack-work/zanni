import type { ReactNode } from "react";
import { duration } from "zanni-react";
import { instant, leaseOf, safeHref, wantsAttention, type Branch, type Entry, type OrderRoute } from "./queue";

export interface RowContext {
  readonly now: number;
  readonly nameOf: (aria: string) => string;
  readonly selected: string | undefined;
  readonly open: (entry: string) => void;
}

export interface PageContext {
  readonly now: number;
  readonly nameOf: (aria: string) => string;
  readonly route: OrderRoute;
  readonly openIn: (node: string, entry: string) => void;
}

export function scoped(page: PageContext, node: string): RowContext {
  return {
    now: page.now,
    nameOf: page.nameOf,
    selected: page.route.node === node ? page.route.entry : undefined,
    open: (entry) => page.openIn(node, entry),
  };
}

export const firstUnit = (ms: number): string => duration(ms).split(" ")[0] ?? "";

export function ago(iso: string, now: number): string {
  const at = instant(iso);
  return at === undefined ? "" : firstUnit(Math.max(0, now - at));
}

export function relative(at: number, now: number): string {
  const delta = now - at;
  if (Math.abs(delta) < 1000) return "now";
  return delta < 0 ? "in " + firstUnit(-delta) : firstUnit(delta) + " ago";
}

export function leaseText(entry: Entry, now: number): { text: string; tone: "live" | "lapsed" } | undefined {
  const lease = leaseOf(entry.claimedBy, now);
  if (lease.kind === "live") return { text: "lease " + firstUnit(lease.leftMs), tone: "live" };
  if (lease.kind === "lapsed") return { text: "lease lapsed " + firstUnit(lease.overMs) + " ago", tone: "lapsed" };
  return undefined;
}

export function Chip({ field, tone, children }: { field: string; tone?: string; children: ReactNode }) {
  return (
    <span className="ord-chip" data-field={field} data-tone={tone}>
      {children}
    </span>
  );
}

export function Anchor({ href, children }: { href: string; children: ReactNode }) {
  const safe = safeHref(href);
  if (!safe) return <span className="ord-nolink">{children}</span>;
  return (
    <a className="ord-link" href={safe} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

function EntryRow({ entry, ctx }: { entry: Entry; ctx: RowContext }) {
  const lease = leaseText(entry, ctx.now);
  const age = ago(entry.stateAt, ctx.now);
  return (
    <button type="button" className="ord-row" data-entry={entry.id} data-kind={entry.kind} data-state={entry.state} data-attention={wantsAttention(entry) ? "owner" : undefined} aria-current={ctx.selected === entry.id ? "true" : undefined} onClick={() => ctx.open(entry.id)}>
      <span className="ord-title" data-field="title">
        {entry.title || entry.id}
      </span>
      <span className="ord-meta">
        <Chip field="kind">{entry.kind || "?"}</Chip>
        <Chip field="state" tone={entry.state}>
          {entry.state || "?"}
          {age && <span className="ord-age"> {age}</span>}
        </Chip>
        {entry.owner && <Chip field="owner">owner {entry.owner}</Chip>}
        {entry.claimedBy && <Chip field="claimed_by">claimed by {ctx.nameOf(entry.claimedBy.aria)}</Chip>}
        {lease && (
          <Chip field="lease" tone={lease.tone}>
            {lease.text}
          </Chip>
        )}
        {entry.priority !== undefined && <Chip field="priority">priority {entry.priority}</Chip>}
        {wantsAttention(entry) && (
          <Chip field="attention" tone="owner">
            attention: owner
          </Chip>
        )}
        {entry.links.length > 0 && <Chip field="links">{entry.links.length === 1 ? "1 link" : entry.links.length + " links"}</Chip>}
        {entry.children.length > 0 && <Chip field="children">{entry.children.length === 1 ? "1 child" : entry.children.length + " children"}</Chip>}
      </span>
    </button>
  );
}

export function Branches({ branches, ctx }: { branches: readonly Branch[]; ctx: RowContext }) {
  return (
    <ul className="ord-tree">
      {branches.map((b) => (
        <li key={b.entry.id} className="ord-item">
          <EntryRow entry={b.entry} ctx={ctx} />
          {b.children.length > 0 && <Branches branches={b.children} ctx={ctx} />}
        </li>
      ))}
    </ul>
  );
}
