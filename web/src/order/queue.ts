import { isObject, type Json, type JsonObject } from "figaro-forms";

export interface Actor {
  readonly role: string;
  readonly aria: string;
}

export interface Claim extends Actor {
  readonly at: string;
  readonly leaseUntil: string;
}

export interface Blob {
  readonly uri: string;
  readonly sha256: string;
  readonly bytes: number | undefined;
}

export interface Amendment {
  readonly at: string;
  readonly by: Actor | undefined;
  readonly note: string;
  readonly body: Blob | undefined;
}

export interface Review {
  readonly needed: boolean | undefined;
  readonly commissionedBy: Actor | undefined;
  readonly reviewerRole: string;
  readonly leasedAt: string;
  readonly verdict: string;
}

export interface Entry {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly state: string;
  readonly stateAt: string;
  readonly parent: string;
  readonly children: readonly string[];
  readonly amendments: readonly Amendment[];
  readonly source: string;
  readonly requestedBy: Actor | undefined;
  readonly owner: string;
  readonly claimedBy: Claim | undefined;
  readonly principal: string;
  readonly priority: number | undefined;
  readonly repo: string;
  readonly branch: string;
  readonly commits: readonly string[];
  readonly review: Review | undefined;
  readonly attention: string;
  readonly body: Blob | undefined;
  readonly links: readonly string[];
  readonly extra: readonly (readonly [string, Json])[];
}

export interface Branch {
  readonly entry: Entry;
  readonly children: readonly Branch[];
}

export const QUEUE_KEY = "queue";

const KNOWN = new Set(["id", "kind", "title", "state", "state_at", "parent", "children", "amendments", "source", "requested_by", "owner", "claimed_by", "principal", "priority", "repo", "branch", "commits", "review", "attention", "body", "links"]);

const text = (v: Json | undefined): string => (typeof v === "string" ? v : "");

const strings = (v: Json | undefined): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function actorOf(v: Json | undefined): Actor | undefined {
  if (!isObject(v)) return undefined;
  return { role: text(v.role), aria: text(v.aria) };
}

function blobOf(v: Json | undefined): Blob | undefined {
  if (!isObject(v)) return undefined;
  const uri = text(v.uri);
  if (!uri) return undefined;
  return { uri, sha256: text(v.sha256), bytes: typeof v.bytes === "number" ? v.bytes : undefined };
}

function claimOf(v: Json | undefined): Claim | undefined {
  const actor = actorOf(v);
  if (!actor || !isObject(v)) return undefined;
  return { ...actor, at: text(v.at), leaseUntil: text(v.lease_until) };
}

function amendmentsOf(v: Json | undefined): Amendment[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isObject).map((a) => ({ at: text(a.at), by: actorOf(a.by), note: text(a.note), body: blobOf(a.body) }));
}

function reviewOf(v: Json | undefined): Review | undefined {
  if (!isObject(v)) return undefined;
  return {
    needed: typeof v.needed === "boolean" ? v.needed : undefined,
    commissionedBy: actorOf(v.commissioned_by),
    reviewerRole: text(v.reviewer_role),
    leasedAt: text(v.leased_at),
    verdict: text(v.verdict),
  };
}

export function entryOf(id: string, raw: JsonObject): Entry {
  return {
    id,
    kind: text(raw.kind),
    title: text(raw.title),
    state: text(raw.state),
    stateAt: text(raw.state_at),
    parent: text(raw.parent),
    children: strings(raw.children),
    amendments: amendmentsOf(raw.amendments),
    source: text(raw.source),
    requestedBy: actorOf(raw.requested_by),
    owner: text(raw.owner),
    claimedBy: claimOf(raw.claimed_by),
    principal: text(raw.principal),
    priority: typeof raw.priority === "number" ? raw.priority : undefined,
    repo: text(raw.repo),
    branch: text(raw.branch),
    commits: strings(raw.commits),
    review: reviewOf(raw.review),
    attention: text(raw.attention),
    body: blobOf(raw.body),
    links: strings(raw.links),
    extra: Object.keys(raw)
      .filter((k) => !KNOWN.has(k))
      .sort()
      .map((k) => [k, raw[k] as Json] as const),
  };
}

export function entriesOf(root: JsonObject | undefined): Entry[] {
  const queue = root?.[QUEUE_KEY];
  if (!isObject(queue)) return [];
  return Object.keys(queue)
    .sort()
    .flatMap((id) => {
      const raw = queue[id];
      return isObject(raw) ? [entryOf(id, raw)] : [];
    });
}

export function byQueueOrder(a: Entry, b: Entry): number {
  const pa = a.priority ?? 0;
  const pb = b.priority ?? 0;
  if (pa !== pb) return pb - pa;
  const ta = instant(a.stateAt) ?? Infinity;
  const tb = instant(b.stateAt) ?? Infinity;
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function orderedBy(declared: readonly string[], siblings: Entry[]): Entry[] {
  const held = new Map(siblings.map((e) => [e.id, e]));
  const first: Entry[] = [];
  for (const id of declared) {
    const e = held.get(id);
    if (e) {
      first.push(e);
      held.delete(id);
    }
  }
  return [...first, ...[...held.values()].sort(byQueueOrder)];
}

export function forestOf(entries: readonly Entry[]): Branch[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const declaredBy = new Map<string, string>();
  for (const e of entries) for (const c of e.children) if (byId.has(c) && c !== e.id && !declaredBy.has(c)) declaredBy.set(c, e.id);

  const parentOf = (e: Entry): string => {
    if (e.parent && e.parent !== e.id && byId.has(e.parent)) return e.parent;
    return declaredBy.get(e.id) ?? "";
  };

  const kids = new Map<string, Entry[]>();
  for (const e of entries) {
    const p = parentOf(e);
    kids.set(p, [...(kids.get(p) ?? []), e]);
  }

  const seen = new Set<string>();
  const grow = (e: Entry): Branch => {
    seen.add(e.id);
    const children = orderedBy(e.children, kids.get(e.id) ?? []).filter((c) => !seen.has(c.id));
    return { entry: e, children: children.map(grow) };
  };

  const roots = (kids.get("") ?? []).sort(byQueueOrder).map(grow);
  const stray = entries.filter((e) => !seen.has(e.id)).sort(byQueueOrder);
  for (const e of stray) if (!seen.has(e.id)) roots.push(grow(e));
  return roots;
}

export function flatten(forest: readonly Branch[]): Entry[] {
  return forest.flatMap((b) => [b.entry, ...flatten(b.children)]);
}

export function stateCounts(entries: readonly Entry[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const e of entries) counts.set(e.state, (counts.get(e.state) ?? 0) + 1);
  return [...counts];
}

export function wantsAttention(e: Entry): boolean {
  return e.attention === "owner";
}

export function instant(iso: string): number | undefined {
  if (!iso) return undefined;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? undefined : t;
}

export type Lease = { kind: "none" } | { kind: "live"; leftMs: number } | { kind: "lapsed"; overMs: number };

export function leaseOf(claim: Claim | undefined, now: number): Lease {
  const until = claim ? instant(claim.leaseUntil) : undefined;
  if (until === undefined) return { kind: "none" };
  return until > now ? { kind: "live", leftMs: until - now } : { kind: "lapsed", overMs: now - until };
}

export function safeHref(link: string): string | undefined {
  try {
    const url = new URL(link);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export interface OrderRoute {
  readonly role: string | undefined;
  readonly entry: string | undefined;
}

export function parseOrderRoute(hash: string): OrderRoute {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const decode = (s: string | undefined): string | undefined => {
    if (!s) return undefined;
    try {
      return decodeURIComponent(s);
    } catch {
      return undefined;
    }
  };
  return { role: decode(parts[0]), entry: decode(parts[1]) };
}

export function orderHash(role: string | undefined, entry?: string): string {
  if (!role) return "#/";
  return "#/" + encodeURIComponent(role) + (entry ? "/" + encodeURIComponent(entry) : "");
}
