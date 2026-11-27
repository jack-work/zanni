import { cellDepth, type Cell, type Graph, type GraphEdge, type GraphNode, type NodeKind } from "./graph";
import { routeWires, type Box, type Pt } from "./graph-route";

export const NODE_HEIGHT: Record<NodeKind, number> = { role: 48, aria: 50, queue: 48, group: 52 };

const ROW = 112;
const BAND_GAP = 20;
const GAP = 36;
const SEAT_GAP = 44;
const ROOT_GAP = 64;
const LABEL_CHAR = 7.4;
const SUB_CHAR = 6.2;
const SIDE = 28;
const MIN_W = 132;
const MAX_W = 224;

export interface Fitted {
  readonly label: string;
  readonly sub: string;
  readonly w: number;
}

const clip = (text: string, chars: number): string => (text.length > chars ? text.slice(0, Math.max(1, chars - 1)) + "…" : text);

export function fitted(n: GraphNode): Fitted {
  const want = Math.max(n.label.length * LABEL_CHAR, n.sub.length * SUB_CHAR) + SIDE;
  const w = Math.ceil(Math.min(MAX_W, Math.max(MIN_W, want)));
  return { label: clip(n.label, Math.floor((w - SIDE) / LABEL_CHAR + 1e-9)), sub: clip(n.sub, Math.floor((w - SIDE) / SUB_CHAR + 1e-9)), w };
}

export interface LaidEdge extends GraphEdge {
  readonly d: string;
  readonly lp: Pt | undefined;
  readonly samples: readonly Pt[];
}

export interface Layout {
  readonly bounds: Box;
  readonly boxes: ReadonlyMap<string, Box>;
  readonly text: ReadonlyMap<string, Fitted>;
  readonly edges: readonly LaidEdge[];
}

interface Placed {
  readonly id: string;
  readonly dx: number;
  readonly row: "role" | "main";
}

interface Geo {
  readonly placed: readonly Placed[];
  readonly lw: number;
  readonly rw: number;
}

export function layoutOf(graph: Graph): Layout {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const text = new Map(graph.nodes.map((n) => [n.id, fitted(n)]));
  const widthOf = (id: string): number => text.get(id)?.w ?? MIN_W;
  const known = (ids: readonly (string | undefined)[]): string[] => ids.filter((id): id is string => id !== undefined && byId.has(id));
  const spanOf = (ids: readonly string[]): number => ids.reduce((sum, id) => sum + widthOf(id), 0) + SEAT_GAP * Math.max(0, ids.length - 1);

  const geoOf = (c: Cell): Geo => {
    const roles = known(c.roles);
    const main = known([c.group, c.aria, ...c.queues]);
    const mainSpan = spanOf(main);
    const ariaAt = c.aria && byId.has(c.aria) ? main.indexOf(c.aria) : -1;
    const ariaLeft = ariaAt < 0 ? 0 : spanOf(main.slice(0, ariaAt)) + (ariaAt > 0 ? SEAT_GAP : 0);
    const anchor = ariaAt < 0 ? mainSpan / 2 : ariaLeft + widthOf(c.aria!) / 2;
    const placed: Placed[] = [];
    let x = 0;
    for (const id of main) {
      placed.push({ id, dx: x - anchor, row: "main" });
      x += widthOf(id) + SEAT_GAP;
    }
    let r = -spanOf(roles) / 2;
    for (const id of roles) {
      placed.push({ id, dx: r, row: "role" });
      r += widthOf(id) + SEAT_GAP;
    }
    let lw = 0;
    let rw = 0;
    for (const p of placed) {
      lw = Math.max(lw, -p.dx);
      rw = Math.max(rw, p.dx + widthOf(p.id));
    }
    return { placed, lw, rw };
  };

  const cells = new Map(graph.cells.map((c) => [c.id, c]));
  const geo = new Map(graph.cells.map((c) => [c.id, geoOf(c)]));
  const kids = new Map<string, Cell[]>();
  const roots: Cell[] = [];
  for (const c of graph.cells) {
    if (c.parent !== undefined && cells.has(c.parent)) kids.set(c.parent, [...(kids.get(c.parent) ?? []), c]);
    else roots.push(c);
  }
  const depth = cellDepth(graph.cells);

  const wide = new Map<string, number>();
  const measure = (c: Cell, trail: ReadonlySet<string>): number => {
    const held = wide.get(c.id);
    if (held !== undefined) return held;
    const next = new Set([...trail, c.id]);
    const below = (kids.get(c.id) ?? []).filter((k) => !next.has(k.id));
    const sum = below.reduce((n, k) => n + measure(k, next), 0) + GAP * Math.max(0, below.length - 1);
    const g = geo.get(c.id)!;
    const w = Math.max(g.lw + g.rw, sum);
    wide.set(c.id, w);
    return w;
  };
  for (const c of roots) measure(c, new Set());

  const anchorOf = new Map<string, number>();
  const place = (c: Cell, left: number, trail: ReadonlySet<string>): void => {
    const next = new Set([...trail, c.id]);
    const below = (kids.get(c.id) ?? []).filter((k) => !next.has(k.id));
    const w = wide.get(c.id) ?? 0;
    const used = below.reduce((n, k) => n + (wide.get(k.id) ?? 0), 0) + GAP * Math.max(0, below.length - 1);
    let at = left + (w - used) / 2;
    for (const k of below) {
      place(k, at, next);
      at += (wide.get(k.id) ?? 0) + GAP;
    }
    const g = geo.get(c.id)!;
    const mid = below.length > 0 ? (anchorOf.get(below[0]!.id)! + anchorOf.get(below[below.length - 1]!.id)!) / 2 : left + w / 2;
    anchorOf.set(c.id, Math.min(left + w - g.rw, Math.max(left + g.lw, mid)));
  };
  let cursor = 0;
  for (const c of roots) {
    place(c, cursor, new Set());
    cursor += (wide.get(c.id) ?? 0) + ROOT_GAP;
  }

  const levels = Math.max(-1, ...graph.cells.map((c) => depth.get(c.id) ?? 0));
  const rowY = new Map<string, number>();
  let y = 0;
  for (let d = 0; d <= levels; d++) {
    const here = graph.cells.filter((c) => (depth.get(c.id) ?? 0) === d);
    for (const row of ["role", "main"] as const) {
      if (!here.some((c) => geo.get(c.id)!.placed.some((p) => p.row === row))) continue;
      rowY.set(d + "|" + row, y + ROW / 2);
      y += ROW;
    }
    y += BAND_GAP;
  }

  const boxes = new Map<string, Box>();
  for (const c of graph.cells) {
    const ax = anchorOf.get(c.id) ?? 0;
    for (const p of geo.get(c.id)!.placed) {
      const h = NODE_HEIGHT[byId.get(p.id)!.kind];
      boxes.set(p.id, { x: ax + p.dx, y: (rowY.get((depth.get(c.id) ?? 0) + "|" + p.row) ?? 0) - h / 2, w: widthOf(p.id), h });
    }
  }

  const live = graph.edges.filter((e) => boxes.has(e.a) && boxes.has(e.b));
  const routes = routeWires(boxes, live);
  const edges: LaidEdge[] = live.map((e, i) => ({ ...e, d: routes[i]!.d, lp: routes[i]!.lp, samples: routes[i]!.samples }));

  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const b of boxes.values()) {
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w);
    y1 = Math.max(y1, b.y + b.h);
  }
  for (const e of edges) {
    for (const p of e.samples) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
  }
  const bounds: Box = boxes.size === 0 ? { x: 0, y: 0, w: 0, h: 0 } : { x: Math.floor(x0), y: Math.floor(y0), w: Math.ceil(x1) - Math.floor(x0), h: Math.ceil(y1) - Math.floor(y0) };
  return { bounds, boxes, text, edges };
}
