import type { EdgeKind } from "./graph";

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface Pt {
  readonly x: number;
  readonly y: number;
}

export interface Wire {
  readonly a: string;
  readonly b: string;
  readonly kind: EdgeKind;
  readonly label: string;
}

export interface Route {
  readonly d: string;
  readonly lp: Pt | undefined;
  readonly samples: readonly Pt[];
}

type Side = "top" | "bottom" | "left" | "right";

type Cubic = readonly [Pt, Pt, Pt, Pt];

interface Rect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

interface End {
  readonly pt: Pt;
  readonly n: Pt;
}

export const PAD = 12;
const FILLET = 14;
const BEND = 36;
const KAPPA = 0.5523;
const EPS = 1e-6;
const SAMPLES = 20;
const BOW = 18;
const UNNATURAL = 90;
const KIND_RANK: Record<EdgeKind, number> = { under: 0, formunder: 1, target: 2, study: 3, lease: 4, flow: 5 };

const SIDE_NORMAL: Record<Side, Pt> = { top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const SIDES: readonly Side[] = ["bottom", "top", "right", "left"];

const rectOf = (b: Box, by: number): Rect => ({ x0: b.x - by, y0: b.y - by, x1: b.x + b.w + by, y1: b.y + b.h + by });
const centre = (b: Box): Pt => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const dist = (p: Pt, q: Pt): number => Math.hypot(p.x - q.x, p.y - q.y);
const add = (p: Pt, q: Pt, k = 1): Pt => ({ x: p.x + q.x * k, y: p.y + q.y * k });
const lerp = (p: Pt, q: Pt, t: number): Pt => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
const round = (n: number): number => Math.round(n * 10) / 10;

export function crossesRect(p: Pt, q: Pt, r: Rect): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const clip = (pn: number, qn: number): boolean => {
    if (Math.abs(pn) < EPS) return qn > EPS;
    const t = qn / pn;
    if (pn < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  return clip(-dx, p.x - r.x0) && clip(dx, r.x1 - p.x) && clip(-dy, p.y - r.y0) && clip(dy, r.y1 - p.y) && t1 - t0 > EPS;
}

const inside = (p: Pt, r: Rect): boolean => p.x > r.x0 + EPS && p.x < r.x1 - EPS && p.y > r.y0 + EPS && p.y < r.y1 - EPS;

function cubicAt(c: Cubic, t: number): Pt {
  const u = 1 - t;
  const [p0, p1, p2, p3] = c;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

function sample(path: readonly Cubic[]): Pt[] {
  const out: Pt[] = [];
  for (const c of path) for (let i = 0; i <= SAMPLES; i++) out.push(cubicAt(c, i / SAMPLES));
  return out;
}

function lineAsCubic(p: Pt, q: Pt): Cubic {
  return [p, lerp(p, q, 1 / 3), lerp(p, q, 2 / 3), q];
}

function pathLength(points: readonly Pt[]): number {
  let n = 0;
  for (let i = 1; i < points.length; i++) n += dist(points[i - 1]!, points[i]!);
  return n;
}

function turns(points: readonly Pt[]): number {
  let sum = 0;
  for (let i = 1; i + 1 < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const c = points[i + 1]!;
    const u = { x: b.x - a.x, y: b.y - a.y };
    const v = { x: c.x - b.x, y: c.y - b.y };
    const lu = Math.hypot(u.x, u.y);
    const lv = Math.hypot(v.x, v.y);
    if (lu < EPS || lv < EPS) continue;
    const cos = Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / (lu * lv)));
    sum += Math.acos(cos) / (Math.PI / 2);
  }
  return sum;
}

function simplify(points: readonly Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && dist(last, p) < EPS) continue;
    out.push(p);
  }
  for (let i = 1; i + 1 < out.length; ) {
    const a = out[i - 1]!;
    const b = out[i]!;
    const c = out[i + 1]!;
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    const dot = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y);
    if (Math.abs(cross) < 1e-3 && dot > 0) out.splice(i, 1);
    else i++;
  }
  return out;
}

function rounded(points: readonly Pt[]): Cubic[] {
  const pts = simplify(points);
  const out: Cubic[] = [];
  let at = pts[0]!;
  for (let i = 1; i < pts.length; i++) {
    const v = pts[i]!;
    const next = pts[i + 1];
    if (!next) {
      out.push(lineAsCubic(at, v));
      break;
    }
    const d1 = dist(at, v);
    const d2 = dist(v, next);
    const r = Math.min(FILLET, d1 / 2, d2 / 2);
    const a = lerp(v, at, r / d1);
    const b = lerp(v, next, r / d2);
    out.push(lineAsCubic(at, a));
    out.push([a, lerp(a, v, KAPPA), lerp(b, v, KAPPA), b]);
    at = b;
  }
  return out;
}

function pathData(path: readonly Cubic[]): string {
  const first = path[0]![0];
  return "M" + round(first.x) + "," + round(first.y) + path.map((c) => " C" + [c[1], c[2], c[3]].map((p) => round(p.x) + "," + round(p.y)).join(" ")).join("");
}

class Heap {
  private readonly items: [number, number][] = [];
  push(cost: number, id: number): void {
    const a = this.items;
    a.push([cost, id]);
    let i = a.length - 1;
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (a[up]![0] <= a[i]![0]) break;
      [a[up], a[i]] = [a[i]!, a[up]!];
      i = up;
    }
  }
  pop(): [number, number] | undefined {
    const a = this.items;
    if (a.length === 0) return undefined;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l]![0] < a[m]![0]) m = l;
        if (r < a.length && a[r]![0] < a[m]![0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i]!, a[m]!];
        i = m;
      }
    }
    return top;
  }
}

class Field {
  readonly padded: readonly Rect[];
  readonly corners: Pt[] = [];
  readonly links: [number, number][][] = [];

  constructor(boxes: ReadonlyMap<string, Box>) {
    this.padded = [...boxes.values()].map((box) => rectOf(box, PAD));
    for (const r of this.padded) {
      for (const p of [{ x: r.x0, y: r.y0 }, { x: r.x1, y: r.y0 }, { x: r.x1, y: r.y1 }, { x: r.x0, y: r.y1 }]) {
        if (!this.padded.some((o) => o !== r && inside(p, o))) this.corners.push(p);
      }
    }
    for (let i = 0; i < this.corners.length; i++) this.links.push([]);
    for (let i = 0; i < this.corners.length; i++) {
      for (let j = i + 1; j < this.corners.length; j++) {
        if (this.clear(this.corners[i]!, this.corners[j]!)) {
          const d = dist(this.corners[i]!, this.corners[j]!);
          this.links[i]!.push([j, d]);
          this.links[j]!.push([i, d]);
        }
      }
    }
  }

  clear(p: Pt, q: Pt): boolean {
    return !this.padded.some((r) => crossesRect(p, q, r));
  }

  shortest(from: Pt, to: Pt): Pt[] | undefined {
    if (this.clear(from, to)) return [from, to];
    const n = this.corners.length;
    const nodes = [...this.corners, from, to];
    const S = n;
    const T = n + 1;
    const reach = (p: Pt): [number, number][] => {
      const out: [number, number][] = [];
      for (let i = 0; i < n; i++) if (this.clear(p, this.corners[i]!)) out.push([i, dist(p, this.corners[i]!)]);
      return out;
    };
    const fromS = reach(from);
    const toT = new Map(reach(to));
    const best = new Array<number>(n + 2).fill(Infinity);
    const prev = new Array<number>(n + 2).fill(-1);
    const heap = new Heap();
    best[S] = 0;
    heap.push(0, S);
    for (let it = heap.pop(); it; it = heap.pop()) {
      const [cost, u] = it;
      if (cost > best[u]!) continue;
      if (u === T) break;
      const edges: [number, number][] = u === S ? fromS : [...this.links[u]!, ...(toT.has(u) ? ([[T, toT.get(u)!]] as [number, number][]) : [])];
      for (const [v, w] of edges) {
        if (cost + w < best[v]!) {
          best[v] = cost + w;
          prev[v] = u;
          heap.push(cost + w, v);
        }
      }
    }
    if (!Number.isFinite(best[T]!)) return undefined;
    const out: Pt[] = [];
    for (let at = T; at !== -1; at = prev[at]!) out.push(nodes[at]!);
    return out.reverse();
  }
}

function endOf(box: Box, side: Side, offset: number): End {
  const n = SIDE_NORMAL[side];
  const c = centre(box);
  if (side === "top") return { pt: { x: c.x + offset, y: box.y }, n };
  if (side === "bottom") return { pt: { x: c.x + offset, y: box.y + box.h }, n };
  if (side === "left") return { pt: { x: box.x, y: c.y + offset }, n };
  return { pt: { x: box.x + box.w, y: c.y + offset }, n };
}

interface Plan {
  readonly path: readonly Cubic[];
  readonly cost: number;
}

function plan(field: Field, boxes: ReadonlyMap<string, Box>, a: string, b: string, ea: End, eb: End): Plan | undefined {
  const others = [...boxes].filter(([id]) => id !== a && id !== b).map(([, box]) => rectOf(box, 6));
  const clearOf = (path: readonly Cubic[]): boolean => {
    const pts = sample(path);
    for (let i = 1; i < pts.length; i++) if (others.some((r) => crossesRect(pts[i - 1]!, pts[i]!, r))) return false;
    return true;
  };
  const k = Math.max(20, Math.min(140, dist(ea.pt, eb.pt) * 0.45));
  const smooth: Cubic = [ea.pt, add(ea.pt, ea.n, k), add(eb.pt, eb.n, k), eb.pt];
  const away = (box: Box, e: End): boolean => {
    const c = centre(box);
    return (e.pt.x - c.x) * e.n.x + (e.pt.y - c.y) * e.n.y >= 0;
  };
  const lo = { x: Math.min(ea.pt.x, eb.pt.x) - BOW, y: Math.min(ea.pt.y, eb.pt.y) - BOW };
  const hi = { x: Math.max(ea.pt.x, eb.pt.x) + BOW, y: Math.max(ea.pt.y, eb.pt.y) + BOW };
  const tight = (path: readonly Cubic[]): boolean => sample(path).every((p) => p.x >= lo.x && p.x <= hi.x && p.y >= lo.y && p.y <= hi.y);
  if (away(boxes.get(a)!, ea) && away(boxes.get(b)!, eb) && tight([smooth]) && clearOf([smooth])) return { path: [smooth], cost: pathLength(sample([smooth])) };
  const stubA = add(ea.pt, ea.n, PAD);
  const stubB = add(eb.pt, eb.n, PAD);
  const via = field.shortest(stubA, stubB);
  if (!via) return undefined;
  const points = [ea.pt, ...via, eb.pt];
  const path = rounded(points);
  return { path, cost: pathLength(points) + BEND * turns(points) + 24 };
}

function labelAt(path: readonly Cubic[], text: string, boxes: ReadonlyMap<string, Box>): Pt | undefined {
  if (!text) return undefined;
  const pts = sample(path);
  const total = pathLength(pts);
  const width = text.length * 6.6 + 8;
  const free = (p: Pt): boolean => {
    const r: Rect = { x0: p.x - width / 2, y0: p.y - 9, x1: p.x + width / 2, y1: p.y + 9 };
    for (const b of boxes.values()) {
      const o = rectOf(b, 0);
      if (r.x0 < o.x1 && r.x1 > o.x0 && r.y0 < o.y1 && r.y1 > o.y0) return false;
    }
    return true;
  };
  const at = (fraction: number): Pt => {
    let left = total * fraction;
    for (let i = 1; i < pts.length; i++) {
      const d = dist(pts[i - 1]!, pts[i]!);
      if (left <= d || i === pts.length - 1) return lerp(pts[i - 1]!, pts[i]!, d === 0 ? 0 : Math.min(1, left / d));
      left -= d;
    }
    return pts[pts.length - 1]!;
  };
  for (const f of [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74]) {
    const p = at(f);
    if (free(p)) return { x: round(p.x), y: round(p.y) };
  }
  const p = at(0.5);
  return { x: round(p.x), y: round(p.y) };
}

function natural(a: Box, b: Box): [Side, Side][] {
  if (b.y >= a.y + a.h) return [["bottom", "top"]];
  if (a.y >= b.y + b.h) return [["top", "bottom"]];
  if (b.x >= a.x + a.w) return [["right", "left"]];
  if (a.x >= b.x + b.w) return [["left", "right"]];
  return [];
}

function candidates(from: Box, to: Box): Side[] {
  const c = centre(from);
  const t = centre(to);
  const v = { x: t.x - c.x, y: t.y - c.y };
  const len = Math.hypot(v.x, v.y) || 1;
  return SIDES.filter((s) => (SIDE_NORMAL[s].x * v.x + SIDE_NORMAL[s].y * v.y) / len > -0.01);
}

export function routeWires(boxes: ReadonlyMap<string, Box>, wires: readonly Wire[]): Route[] {
  const field = new Field(boxes);
  const chosen: { sa: Side; sb: Side }[] = [];
  const fallback = (w: Wire): { sa: Side; sb: Side } => {
    const a = boxes.get(w.a)!;
    const b = boxes.get(w.b)!;
    const dy = centre(b).y - centre(a).y;
    return dy >= 0 ? { sa: "bottom", sb: "top" } : { sa: "top", sb: "bottom" };
  };

  wires.forEach((w) => {
    const a = boxes.get(w.a);
    const b = boxes.get(w.b);
    if (!a || !b || w.a === w.b) {
      chosen.push({ sa: "bottom", sb: "top" });
      return;
    }
    let best: { sa: Side; sb: Side; cost: number } | undefined;
    for (const sa of candidates(a, b)) {
      for (const sb of candidates(b, a)) {
        const p = plan(field, boxes, w.a, w.b, endOf(a, sa, 0), endOf(b, sb, 0));
        const cost = p ? p.cost + (natural(a, b).some(([x, y]) => x === sa && y === sb) ? 0 : UNNATURAL) : Infinity;
        if (p && (!best || cost < best.cost - 1e-6)) best = { sa, sb, cost };
      }
    }
    chosen.push(best ?? fallback(w));
  });

  const lanes = new Map<string, { index: number; key: number; rank: number; end: "a" | "b" }[]>();
  wires.forEach((w, index) => {
    const a = boxes.get(w.a);
    const b = boxes.get(w.b);
    if (!a || !b || w.a === w.b) return;
    const sides = chosen[index]!;
    const put = (id: string, side: Side, other: Box, end: "a" | "b"): void => {
      const o = centre(other);
      const key = side === "top" || side === "bottom" ? o.x : o.y;
      const slot = id + "|" + side;
      lanes.set(slot, [...(lanes.get(slot) ?? []), { index, key, rank: KIND_RANK[w.kind], end }]);
    };
    put(w.a, sides.sa, b, "a");
    put(w.b, sides.sb, a, "b");
  });
  const offsets = new Map<string, number>();
  for (const [slot, list] of lanes) {
    const [id, side] = [slot.slice(0, slot.lastIndexOf("|")), slot.slice(slot.lastIndexOf("|") + 1) as Side];
    const box = boxes.get(id)!;
    const span = side === "top" || side === "bottom" ? box.w : box.h;
    list.sort((p, q) => p.key - q.key || p.rank - q.rank || p.index - q.index);
    const step = list.length > 1 ? Math.min(16, (span - 28) / (list.length - 1)) : 0;
    list.forEach((item, i) => offsets.set(item.index + "|" + item.end, (i - (list.length - 1) / 2) * step));
  }

  return wires.map((w, index) => {
    const a = boxes.get(w.a);
    const b = boxes.get(w.b);
    if (!a || !b || w.a === w.b) return { d: "M0,0 C0,0 0,0 0,0", lp: undefined, samples: [] };
    const sides = chosen[index]!;
    const ea = endOf(a, sides.sa, offsets.get(index + "|a") ?? 0);
    const eb = endOf(b, sides.sb, offsets.get(index + "|b") ?? 0);
    const p = plan(field, boxes, w.a, w.b, ea, eb) ?? { path: rounded([ea.pt, eb.pt]), cost: 0 };
    return { d: pathData(p.path), lp: labelAt(p.path, w.label, boxes), samples: sample(p.path) };
  });
}
