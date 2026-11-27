import type { Layout } from "../../src/order/graph-layout";

type P = [number, number];

const bez = (p0: P, p1: P, p2: P, p3: P, t: number): P => {
  const u = 1 - t;
  return [0, 1].map((i) => u ** 3 * p0[i]! + 3 * u * u * t * p1[i]! + 3 * u * t * t * p2[i]! + t ** 3 * p3[i]!) as P;
};

export function pathPoints(d: string): P[] {
  return [...d.matchAll(/-?[\d.]+,-?[\d.]+/g)].map((m) => m[0].split(",").map(Number) as P);
}

export function curveSamples(d: string): P[] {
  const nums = pathPoints(d);
  let p = nums[0]!;
  const segs = nums.slice(1);
  const out: P[] = [];
  for (let k = 0; k + 2 < segs.length; k += 3) {
    const [c1, c2, q] = [segs[k]!, segs[k + 1]!, segs[k + 2]!];
    for (let t = 0; t <= 20; t++) out.push(bez(p, c1, c2, q, t / 20));
    p = q;
  }
  return out;
}

export function nodeCrossings(layout: Layout): string[] {
  const bad: string[] = [];
  for (const e of layout.edges) {
    const samples = curveSamples(e.d);
    for (const [id, b] of layout.boxes) {
      if (id === e.a || id === e.b) continue;
      if (samples.some((s) => b.x + 2 < s[0] && s[0] < b.x + b.w - 2 && b.y + 2 < s[1] && s[1] < b.y + b.h - 2)) bad.push(e.a + " -> " + e.b + " (" + e.kind + ") through " + id);
    }
  }
  return bad;
}

export function overlaps(layout: Layout): string[] {
  const out: string[] = [];
  const all = [...layout.boxes];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const [ia, a] = all[i]!;
      const [ib, b] = all[j]!;
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) out.push(ia + " overlaps " + ib);
    }
  }
  return out;
}

export function strayEnds(layout: Layout): string[] {
  const out: string[] = [];
  const near = (p: P, id: string): boolean => {
    const b = layout.boxes.get(id)!;
    const dx = Math.max(b.x - p[0], 0, p[0] - (b.x + b.w));
    const dy = Math.max(b.y - p[1], 0, p[1] - (b.y + b.h));
    return Math.hypot(dx, dy) < 1.5;
  };
  for (const e of layout.edges) {
    const pts = pathPoints(e.d);
    if (!near(pts[0]!, e.a)) out.push(e.a + " -> " + e.b + " does not start on " + e.a);
    if (!near(pts[pts.length - 1]!, e.b)) out.push(e.a + " -> " + e.b + " does not end on " + e.b);
  }
  return out;
}
