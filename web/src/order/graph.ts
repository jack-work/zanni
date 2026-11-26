import { bare, drawnAncestors, sameId, standing, type Atlas, type CharterRole, type Mismatch, type QueueForm, type Seat, type Study, type Topology } from "./charter";
import { leaseOf, wantsAttention, type Actor, type Entry } from "./queue";

export const EDGE_KINDS = ["under", "formunder", "target", "study", "lease", "flow"] as const;

export type EdgeKind = (typeof EDGE_KINDS)[number];

export type NodeKind = "role" | "aria" | "queue" | "group";

export type Tone = "" | "central" | "vacant" | "mismatch" | "stray" | "over" | "short";

export interface GraphNode {
  readonly id: string;
  readonly kind: NodeKind;
  readonly label: string;
  readonly sub: string;
  readonly about: string;
  readonly cell: string;
  readonly tone: Tone;
  readonly role?: CharterRole;
  readonly roles?: readonly CharterRole[];
  readonly queue?: QueueForm;
  readonly mismatch?: Mismatch;
  readonly studies?: readonly Study[];
  readonly seat?: Seat;
  readonly forks?: number;
}

export interface GraphEdge {
  readonly a: string;
  readonly b: string;
  readonly kind: EdgeKind;
  readonly label: string;
  readonly count: number;
  readonly lapsed: number;
}

export interface Cell {
  readonly id: string;
  readonly parent: string | undefined;
  readonly roles: readonly string[];
  readonly aria: string | undefined;
  readonly queues: readonly string[];
  readonly group: string | undefined;
}

export interface Graph {
  readonly central: string;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly cells: readonly Cell[];
}

export interface GraphInput {
  readonly topology: Topology;
  readonly atlas: Atlas;
  readonly entries: ReadonlyMap<string, readonly Entry[]>;
  readonly nameOf: (aria: string) => string;
  readonly now: number;
}

const FINISHED = new Set(["done", "cancelled"]);

export const isOpen = (e: Entry): boolean => !FINISHED.has(e.state);

export const forksId = (aria: string): string => "forks:" + bare(aria);

export function edgeLabel(kind: EdgeKind, count: number, lapsed: number): string {
  if (kind === "lease") return "claimed " + count + (lapsed > 0 ? ", " + lapsed + " lapsed" : "");
  if (kind === "flow") return "posts " + count;
  return "";
}

const plural = (n: number, one: string, many: string): string => n + " " + (n === 1 ? one : many);

function fanoutOf(roles: readonly CharterRole[]): CharterRole["fanout"] | undefined {
  return roles.map((r) => r.fanout).find((f) => f.min !== undefined || f.max !== undefined || f.quota !== undefined);
}

function queueSub(queue: QueueForm, entries: readonly Entry[] | undefined): string {
  if (!entries) return "queue form";
  const open = entries.filter(isOpen);
  const attention = open.filter(wantsAttention).length;
  if (open.length === 0) return "queue, empty";
  return open.length + " open" + (attention > 0 ? ", " + attention + " need you" : "") + (queue.contract?.kinds.length ? ", " + queue.contract.kinds.join("/") : "");
}

export function graphOf(input: GraphInput): Graph {
  const { topology, atlas, entries, nameOf, now } = input;
  const central = topology.central;
  const nodes: GraphNode[] = [];
  const edgeMap = new Map<string, GraphEdge>();
  const nodeIds = new Set<string>();
  const formNodes = new Map<string, string>();
  const holderOfRole = new Map<string, string>();
  const roleByName = new Map<string, CharterRole>();
  const cellOfRole = new Map<string, string>();
  const parentRoleOf = new Map<string, string>();
  const ariaCells = new Set<string>();
  const groupOf = new Map<string, string>();
  const cellParent = new Map<string, string | undefined>();

  const add = (n: GraphNode): void => {
    if (nodeIds.has(n.id)) return;
    nodeIds.add(n.id);
    nodes.push(n);
    if (n.kind === "role" || n.kind === "queue") formNodes.set(bare(n.id), n.id);
  };

  const link = (a: string, b: string, kind: EdgeKind, count = 1, lapsed = 0): void => {
    if (a === b) return;
    const key = kind + "|" + a + "|" + b;
    const held = edgeMap.get(key);
    const total = (held?.count ?? 0) + count;
    const late = (held?.lapsed ?? 0) + lapsed;
    edgeMap.set(key, { a, b, kind, label: edgeLabel(kind, total, late), count: total, lapsed: late });
  };

  const queueNode = (q: QueueForm, cell: string, tone: Tone, under: string): GraphNode => ({
    id: q.id,
    kind: "queue",
    label: q.name,
    sub: tone === "stray" ? "queue form, seat not minted" : queueSub(q, entries.get(bare(q.id))),
    about: tone === "stray" ? "Queue form under " + under + ", a seat that is not minted." : "Queue form of " + under + ". Its work orders are listed here.",
    cell,
    tone,
    queue: q,
  });

  const seats: { seat: Seat; parent: string | undefined }[] = [];
  const walk = (seat: Seat, parent: string | undefined): void => {
    seats.push({ seat, parent });
    for (const child of seat.children) walk(child, seat.aria);
  };
  if (topology.tree) walk(topology.tree, undefined);
  for (const apart of topology.apart) walk(apart, undefined);

  const cells: Cell[] = [];

  for (const { seat, parent } of seats) {
    const roles = seat.roles.map((r) => r.role);
    const holder = nameOf(seat.aria);
    const queues: string[] = [];
    for (const r of seat.roles) {
      const isCentral = sameId(r.role.id, central.id);
      add({
        id: r.role.id,
        kind: "role",
        label: "@" + r.role.name,
        sub: r.mismatch ? "role form, not where drawn" : "role form",
        about: "Role form of " + r.role.name + (r.role.chartered.seat ? ", seat " + r.role.chartered.seat : "") + ". It targets " + holder + ".",
        cell: seat.aria,
        tone: isCentral ? "central" : r.mismatch ? "mismatch" : "",
        role: r.role,
        mismatch: r.mismatch,
        studies: r.studies,
      });
      holderOfRole.set(bare(r.role.id), seat.aria);
      cellOfRole.set(bare(r.role.id), seat.aria);
      roleByName.set(r.role.name, r.role);
      if (r.role.chartered.reportsTo) parentRoleOf.set(bare(r.role.id), r.role.chartered.reportsTo);
      for (const q of r.queues) {
        add(queueNode(q, seat.aria, "", r.role.name));
        queues.push(q.id);
      }
    }
    add({
      id: seat.aria,
      kind: "aria",
      label: roles[0]!.name,
      sub: holder + (roles.length > 1 ? ", +" + (roles.length - 1) + " roles" : ""),
      about: holder + " holds " + roles.map((r) => r.name).join(" and ") + (seat.skipped > 0 ? ", skipping " + plural(seat.skipped, "unchartered figaro", "unchartered figaros") : "") + ".",
      cell: seat.aria,
      tone: roles.some((r) => sameId(r.id, central.id)) ? "central" : "",
      roles,
      seat,
    });
    ariaCells.add(seat.aria);
    const direct = seat.children.filter((c) => c.skipped === 0).length;
    const forks = Math.max(0, seat.drawnChildren - direct);
    let group: string | undefined;
    if (forks > 0) {
      const limits = fanoutOf(roles);
      const where = standing(limits ?? { min: undefined, max: undefined, quota: undefined }, seat.drawnChildren);
      group = forksId(seat.aria);
      groupOf.set(seat.aria, group);
      add({
        id: group,
        kind: "group",
        label: "forks",
        sub: limits?.max !== undefined ? forks + " of max " + limits.max : forks + " drawn",
        about: plural(forks, "fork", "forks") + " drawn under " + holder + ", not chartered" + (where === "over" ? "; over the fan-out limit" : where === "short" ? "; under the fan-out minimum" : "") + ".",
        cell: seat.aria,
        tone: where === "within" ? "" : where,
        forks,
      });
    }
    cells.push({ id: seat.aria, parent, roles: roles.map((r) => r.id), aria: seat.aria, queues, group });
    cellParent.set(seat.aria, parent);
  }

  for (const vacant of topology.vacant) {
    const role = vacant.role;
    const queues: string[] = [];
    add({
      id: role.id,
      kind: "role",
      label: "@" + role.name,
      sub: "role form, vacant",
      about: "Role form of " + role.name + (role.chartered.seat ? ", seat " + role.chartered.seat : "") + ". It targets no live figaro.",
      cell: role.id,
      tone: "vacant",
      role,
      studies: vacant.studies,
    });
    cellOfRole.set(bare(role.id), role.id);
    roleByName.set(role.name, role);
    if (role.chartered.reportsTo) parentRoleOf.set(bare(role.id), role.chartered.reportsTo);
    for (const q of vacant.queues) {
      add(queueNode(q, role.id, "", role.name));
      queues.push(q.id);
    }
    cells.push({ id: role.id, parent: undefined, roles: [role.id], aria: undefined, queues, group: undefined });
  }

  for (const q of topology.strays) {
    add(queueNode(q, q.id, "stray", q.under || "no seat"));
    cells.push({ id: q.id, parent: undefined, roles: [], aria: undefined, queues: [q.id], group: undefined });
  }

  const ancestorsOf = (cell: string): string[] => {
    const out: string[] = [];
    const seen = new Set([cell]);
    let at = cellParent.get(cell);
    while (at !== undefined && !seen.has(at)) {
      out.push(at);
      seen.add(at);
      at = cellParent.get(at);
    }
    return out;
  };

  const placed: Cell[] = cells.map((c) => {
    if (c.parent !== undefined) return c;
    const declared = c.roles.length > 0 ? parentRoleOf.get(bare(c.roles[0]!)) : undefined;
    const under = declared ? cellOfRole.get(bare(declared)) : undefined;
    if (under === undefined || under === c.id) return c;
    if (ancestorsOf(under).includes(c.id)) return c;
    cellParent.set(c.id, under);
    return { ...c, parent: under };
  });

  for (const { seat, parent } of seats) {
    for (const r of seat.roles) {
      link(r.role.id, seat.aria, "target");
      const above = r.role.chartered.reportsTo;
      const parentForm = above ? formNodes.get(bare(above)) : undefined;
      if (parentForm && !sameId(parentForm, r.role.id)) link(parentForm, r.role.id, "formunder");
      for (const q of r.queues) link(r.role.id, q.id, "formunder");
      for (const study of r.studies) {
        const studied = formNodes.get(bare(study.id));
        if (studied) link(studied, seat.aria, "study");
      }
    }
    if (parent !== undefined) link(parent, seat.aria, "under");
    const group = groupOf.get(seat.aria);
    if (group) link(seat.aria, group, "under");
  }
  for (const vacant of topology.vacant) {
    const above = vacant.role.chartered.reportsTo;
    const parentForm = above ? formNodes.get(bare(above)) : undefined;
    if (parentForm && !sameId(parentForm, vacant.role.id)) link(parentForm, vacant.role.id, "formunder");
    for (const q of vacant.queues) link(vacant.role.id, q.id, "formunder");
  }

  const resolve = (actor: Actor): string | undefined => {
    const aria = bare(actor.aria);
    if (aria && ariaCells.has(aria)) return aria;
    if (aria) {
      for (const up of drawnAncestors(atlas, aria)) if (ariaCells.has(up)) return groupOf.get(up) ?? up;
    }
    const role = actor.role ? roleByName.get(actor.role) : undefined;
    return role ? holderOfRole.get(bare(role.id)) : undefined;
  };

  for (const node of nodes) {
    if (node.kind !== "queue") continue;
    const list = entries.get(bare(node.id));
    if (!list) continue;
    for (const e of list.filter(isOpen)) {
      const claimant = e.claimedBy ? resolve(e.claimedBy) : undefined;
      if (e.claimedBy && claimant) link(node.id, claimant, "lease", 1, leaseOf(e.claimedBy, now).kind === "lapsed" ? 1 : 0);
      const poster = e.requestedBy ? resolve(e.requestedBy) : undefined;
      if (poster) link(poster, node.id, "flow");
    }
  }

  return { central: central.id, nodes, edges: [...edgeMap.values()], cells: placed };
}

export function nodeAt(graph: Graph, raw: string | undefined): GraphNode | undefined {
  if (!raw) return undefined;
  const b = bare(raw);
  return graph.nodes.find((n) => n.id === raw || bare(n.id) === b);
}

export function cellDepth(cells: readonly Cell[]): Map<string, number> {
  const parent = new Map(cells.map((c) => [c.id, c.parent]));
  const depth = new Map<string, number>();
  const of = (id: string, trail: Set<string>): number => {
    const held = depth.get(id);
    if (held !== undefined) return held;
    const up = parent.get(id);
    const d = up === undefined || trail.has(up) ? 0 : of(up, new Set([...trail, id])) + 1;
    depth.set(id, d);
    return d;
  };
  for (const c of cells) of(c.id, new Set());
  return depth;
}

export function collapse(graph: Graph, depth = 1): Graph {
  const levels = cellDepth(graph.cells);
  const parent = new Map(graph.cells.map((c) => [c.id, c.parent]));
  const keep = (id: string): string => {
    let at = id;
    while ((levels.get(at) ?? 0) > depth) at = parent.get(at) ?? at;
    return at;
  };
  const below = new Map<string, number>();
  for (const c of graph.cells) if (keep(c.id) !== c.id) below.set(keep(c.id), (below.get(keep(c.id)) ?? 0) + 1);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const kept = graph.cells.filter((c) => keep(c.id) === c.id);
  const nodes: GraphNode[] = kept.map((c) => {
    const first = c.roles.length > 0 ? byId.get(c.roles[0]!) : undefined;
    const queue = c.queues.length > 0 ? byId.get(c.queues[0]!) : undefined;
    const aria = c.aria ? byId.get(c.aria) : undefined;
    const label = first?.role?.name ?? queue?.label ?? c.id;
    const n = below.get(c.id) ?? 0;
    const queues = graph.cells.filter((x) => keep(x.id) === c.id).reduce((sum, x) => sum + x.queues.length, 0);
    const sub = !c.aria && first ? "vacant" : [aria?.sub, n > 0 ? plural(n, "seat", "seats") + " below" : "", queues > 0 ? plural(queues, "queue", "queues") : ""].filter(Boolean).join(", ");
    return {
      id: c.id,
      kind: "aria",
      label,
      sub,
      about: first?.about ?? queue?.about ?? "",
      cell: c.id,
      tone: aria?.tone === "central" ? "central" : !c.aria ? (first ? "vacant" : "stray") : "",
      role: first?.role,
      roles: aria?.roles,
      queue: queue?.queue,
      seat: aria?.seat,
    };
  });
  const home = new Map<string, string>();
  for (const n of graph.nodes) home.set(n.id, keep(n.cell));
  const edgeMap = new Map<string, GraphEdge>();
  for (const e of graph.edges) {
    if (e.kind === "target" || e.kind === "formunder") continue;
    const a = home.get(e.a);
    const b = home.get(e.b);
    if (!a || !b || a === b) continue;
    const key = e.kind + "|" + a + "|" + b;
    const held = edgeMap.get(key);
    const count = (held?.count ?? 0) + e.count;
    const lapsed = (held?.lapsed ?? 0) + e.lapsed;
    edgeMap.set(key, { a, b, kind: e.kind, label: e.kind === "under" ? "" : edgeLabel(e.kind, count, lapsed), count, lapsed });
  }
  const cells: Cell[] = kept.map((c) => ({ id: c.id, parent: c.parent, roles: [], aria: c.id, queues: [], group: undefined }));
  return { central: graph.central, nodes, edges: [...edgeMap.values()], cells };
}
