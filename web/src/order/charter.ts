import { isObject, type Json, type JsonObject } from "figaro-forms";
import type { TreeNode } from "figaro-forms/aria";

export const TOPOLOGY_FORM = "@topology";

export const SEAT_ORDER = ["king", "knight", "strategist", "lead", "inspector", "edge"] as const;

export interface Chartered {
  readonly seat: string;
  readonly regiment: string;
  readonly reportsTo: string;
  readonly root: string;
  readonly central: boolean;
  readonly abdication: string;
  readonly ttl: string;
  readonly reviewerMaxChildren: number | undefined;
  readonly studies: readonly string[];
}

export interface Fanout {
  readonly min: number | undefined;
  readonly max: number | undefined;
  readonly quota: number | undefined;
}

export interface QueueContract {
  readonly version: string;
  readonly contract: string;
  readonly kinds: readonly string[];
  readonly priority: boolean | undefined;
  readonly states: readonly string[];
}

export interface QueueForm {
  readonly id: string;
  readonly name: string;
  readonly root: string;
  readonly under: string;
  readonly contract: QueueContract | undefined;
}

export interface CharterRole {
  readonly id: string;
  readonly name: string;
  readonly target: string;
  readonly chartered: Chartered;
  readonly fanout: Fanout;
  readonly contract: QueueContract | undefined;
}

export const bare = (id: string): string => id.replace(/^@/, "");

export const formId = (id: string): string => (id === "" ? "" : "@" + bare(id));

export const sameId = (a: string, b: string): boolean => a !== "" && bare(a) === bare(b);

export type Canon = (id: string) => string;

export function canonOf(known: Iterable<string>): Canon {
  const full = [...new Set([...known].map(bare))];
  const set = new Set(full);
  return (id) => {
    const b = bare(id);
    if (b.length < 8 || set.has(b)) return b;
    const hits = full.filter((k) => k.startsWith(b));
    return hits.length === 1 ? hits[0]! : b;
  };
}

const text = (v: Json | undefined): string => (typeof v === "string" ? v : "");

const count = (v: Json | undefined): number | undefined => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);

const strings = (v: Json | undefined): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function charteredOf(v: JsonObject, canon: Canon): Chartered {
  const form = (x: Json | undefined): string => formId(canon(text(x)));
  return {
    seat: text(v.seat),
    regiment: text(v.regiment),
    reportsTo: form(v["reports-to"]),
    root: form(v.root),
    central: v["central-command"] === true,
    abdication: text(v["succession-abdication"]),
    ttl: text(v["succession-ttl"]),
    reviewerMaxChildren: count(v["reviewer-max-children"]),
    studies: strings(v.studies).map(form),
  };
}

function fanoutOf(root: JsonObject): Fanout {
  const system = root.system;
  const fan = isObject(system) ? system.fanout : undefined;
  if (!isObject(fan)) return { min: undefined, max: undefined, quota: undefined };
  return { min: count(fan.min_children), max: count(fan.max_children), quota: count(fan.quota) };
}

function contractOf(root: JsonObject): QueueContract | undefined {
  const c = root["queue-contract"];
  if (!isObject(c)) return undefined;
  return { version: text(c.version), contract: text(c.contract), kinds: strings(c.kinds), priority: typeof c.priority === "boolean" ? c.priority : undefined, states: strings(c.states) };
}

export const QUEUE_FORM_KIND = "queue-form";

export function queueFormOf(id: string, rosterName: string, root: JsonObject, canon: Canon): QueueForm | undefined {
  const chartered = root.chartered;
  if (!isObject(chartered) || chartered.kind !== QUEUE_FORM_KIND) return undefined;
  return {
    id: formId(canon(id)),
    name: text(root.name) || rosterName,
    root: formId(canon(text(chartered.root))),
    under: formId(canon(text(chartered.under))),
    contract: contractOf(root),
  };
}

export function charterRoleOf(id: string, rosterName: string, rosterTarget: string, root: JsonObject, canon: Canon): CharterRole | undefined {
  const chartered = root.chartered;
  if (!isObject(chartered) || chartered.kind === QUEUE_FORM_KIND) return undefined;
  return {
    id: formId(canon(id)),
    name: text(root["role-name"]) || text(root.name) || rosterName,
    target: canon(text(root["target-aria"]) || rosterTarget),
    chartered: charteredOf(chartered, canon),
    fanout: fanoutOf(root),
    contract: contractOf(root),
  };
}

export function overridesOf(root: JsonObject, canon: Canon): Map<string, string> {
  const out = new Map<string, string>();
  for (const [id, parent] of Object.entries(root)) if (typeof parent === "string") out.set(canon(id), canon(parent));
  return out;
}

export interface Atlas {
  readonly nodes: ReadonlyMap<string, TreeNode>;
  readonly parent: ReadonlyMap<string, string>;
  readonly children: ReadonlyMap<string, readonly string[]>;
}

export function atlasOf(nodes: ReadonlyMap<string, TreeNode>, overrides: ReadonlyMap<string, string>, canon: Canon): Atlas {
  const held = new Map<string, TreeNode>();
  for (const n of nodes.values()) held.set(bare(n.id), n);
  const parent = new Map<string, string>();
  const children = new Map<string, string[]>();
  for (const [id, n] of held) {
    const up = overrides.get(id) ?? canon(n.parent ?? "");
    parent.set(id, up);
    if (n.kind === "aria" && n.status === "live") children.set(up, [...(children.get(up) ?? []), id]);
  }
  return { nodes: held, parent, children };
}

export function drawnAncestors(atlas: Atlas, id: string): string[] {
  const out: string[] = [];
  const seen = new Set([bare(id)]);
  let at = atlas.parent.get(bare(id)) ?? "";
  while (at !== "" && !seen.has(at)) {
    out.push(at);
    seen.add(at);
    at = atlas.parent.get(at) ?? "";
  }
  return out;
}

export interface Mismatch {
  readonly declared: string;
  readonly declaredName: string;
  readonly drawnUnder: readonly string[];
}

export interface Study {
  readonly id: string;
  readonly name: string;
  readonly found: boolean;
}

export interface SeatRole {
  readonly role: CharterRole;
  readonly mismatch: Mismatch | undefined;
  readonly queues: readonly QueueForm[];
  readonly studies: readonly Study[];
}

export interface Seat {
  readonly aria: string;
  readonly roles: readonly SeatRole[];
  readonly skipped: number;
  readonly drawnChildren: number;
  readonly children: readonly Seat[];
}

export interface VacantSeat {
  readonly role: CharterRole;
  readonly queues: readonly QueueForm[];
  readonly studies: readonly Study[];
}

export interface Topology {
  readonly central: CharterRole;
  readonly tree: Seat | undefined;
  readonly apart: readonly Seat[];
  readonly vacant: readonly VacantSeat[];
  readonly strays: readonly QueueForm[];
}

const seatRank = (seat: string): number => {
  const at = (SEAT_ORDER as readonly string[]).indexOf(seat);
  return at < 0 ? SEAT_ORDER.length : at;
};

const byRole = (a: CharterRole, b: CharterRole): number => seatRank(a.chartered.seat) - seatRank(b.chartered.seat) || a.chartered.regiment.localeCompare(b.chartered.regiment) || a.name.localeCompare(b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const shortOf = (id: string): string => bare(id).slice(0, 8);

interface Placed {
  readonly aria: string;
  readonly roles: CharterRole[];
  parent: string | undefined;
  skipped: number;
}

const byQueue = (a: QueueForm, b: QueueForm): number => a.name.localeCompare(b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function topologyOf(central: CharterRole, roles: readonly CharterRole[], queueForms: readonly QueueForm[], atlas: Atlas): Topology {
  const named = new Map(roles.map((r) => [bare(r.id), r]));
  const queueNames = new Map(queueForms.map((q) => [bare(q.id), q.name]));
  const mine = queueForms.filter((q) => sameId(q.root, central.id)).sort(byQueue);
  const queuesOf = (role: CharterRole): QueueForm[] => mine.filter((q) => sameId(q.under, role.id));
  const studiesOf = (role: CharterRole): Study[] => role.chartered.studies.map((id) => ({ id, name: queueNames.get(bare(id)) ?? shortOf(id), found: queueNames.has(bare(id)) }));
  const members = roles.filter((r) => sameId(r.chartered.root, central.id) || sameId(r.id, central.id));
  const held = new Map<string, Placed>();
  const vacant: CharterRole[] = [];
  for (const role of members) {
    const node = role.target ? atlas.nodes.get(bare(role.target)) : undefined;
    if (!node || node.kind !== "aria" || node.status !== "live") {
      vacant.push(role);
      continue;
    }
    const aria = bare(node.id);
    const at = held.get(aria);
    if (at) at.roles.push(role);
    else held.set(aria, { aria, roles: [role], parent: undefined, skipped: 0 });
  }
  for (const seat of held.values()) {
    seat.roles.sort(byRole);
    let skipped = 0;
    for (const above of drawnAncestors(atlas, seat.aria)) {
      if (held.has(above)) {
        seat.parent = above;
        seat.skipped = skipped;
        break;
      }
      if (atlas.nodes.get(above)?.kind === "aria") skipped++;
    }
  }

  const kids = new Map<string, Placed[]>();
  for (const seat of held.values()) if (seat.parent) kids.set(seat.parent, [...(kids.get(seat.parent) ?? []), seat]);

  const order = (a: Placed, b: Placed): number => byRole(a.roles[0]!, b.roles[0]!) || (a.aria < b.aria ? -1 : 1);
  const grown = new Set<string>();
  const grow = (seat: Placed): Seat => {
    grown.add(seat.aria);
    const parent = seat.parent ? held.get(seat.parent) : undefined;
    const allowed = new Set([...(parent?.roles ?? []), ...seat.roles].map((r) => bare(r.id)));
    return {
      aria: seat.aria,
      skipped: seat.skipped,
      drawnChildren: atlas.children.get(seat.aria)?.length ?? 0,
      roles: seat.roles.map((role) => {
        const declared = role.chartered.reportsTo;
        const wrong = declared !== "" && !allowed.has(bare(declared));
        return {
          role,
          queues: queuesOf(role),
          studies: studiesOf(role),
          mismatch: wrong ? { declared, declaredName: named.get(bare(declared))?.name ?? shortOf(declared), drawnUnder: (parent?.roles ?? []).map((r) => r.name) } : undefined,
        };
      }),
      children: (kids.get(seat.aria) ?? []).sort(order).map(grow),
    };
  };

  const tops = [...held.values()].filter((s) => !s.parent).sort(order);
  const seatOfCentral = [...held.values()].find((s) => s.roles.some((r) => sameId(r.id, central.id)));
  let leadTop: Placed | undefined = seatOfCentral;
  while (leadTop?.parent) leadTop = held.get(leadTop.parent);
  const tree = leadTop ? grow(leadTop) : undefined;
  const apart = tops.filter((s) => s !== leadTop && !grown.has(s.aria)).map(grow);
  const strays = mine.filter((q) => !members.some((r) => sameId(q.under, r.id)));
  return { central, tree, apart, vacant: vacant.sort(byRole).map((role) => ({ role, queues: queuesOf(role), studies: studiesOf(role) })), strays };
}

export function queueFormsOf(topology: Topology): QueueForm[] {
  const walk = (seat: Seat): QueueForm[] => [...seat.roles.flatMap((r) => r.queues), ...seat.children.flatMap(walk)];
  return [...(topology.tree ? walk(topology.tree) : []), ...topology.apart.flatMap(walk), ...topology.vacant.flatMap((v) => v.queues), ...topology.strays];
}

export function pickCentral(roles: readonly CharterRole[]): CharterRole | undefined {
  const crowns = roles.filter((r) => r.chartered.central);
  const size = (c: CharterRole): number => roles.filter((r) => sameId(r.chartered.root, c.id)).length;
  return crowns.sort((a, b) => size(b) - size(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
}

export type FanoutStanding = "short" | "over" | "within";

export function standing(fanout: Fanout, drawnChildren: number): FanoutStanding {
  if (fanout.max !== undefined && drawnChildren > fanout.max) return "over";
  if (fanout.min !== undefined && drawnChildren < fanout.min) return "short";
  return "within";
}
