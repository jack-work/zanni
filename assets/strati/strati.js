var strati = (function () {
  'use strict';

  function simplify(points) {
    const out = [];
    for (const p of points) {
      if (out.length && out.at(-1).x === p.x && out.at(-1).y === p.y) continue;
      if (out.length > 1) {
        const a = out.at(-2), b = out.at(-1);
        if ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y)) out.pop();
      }
      out.push(p);
    }
    return out;
  }

  function mergeSegments(edges) {
    const groups = new Map();
    for (const edge of edges) {
      const pts = edge.points || [];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        if (a.x === b.x && a.y === b.y) continue;
        if (a.x !== b.x && a.y !== b.y) throw new Error('Nonorthogonal segment');
        const vertical = a.x === b.x, fixed = vertical ? a.x : a.y;
        const start = Math.min(vertical ? a.y : a.x, vertical ? b.y : b.x);
        const end = Math.max(vertical ? a.y : a.x, vertical ? b.y : b.x);
        const key = JSON.stringify([edge.from, vertical, fixed]);
        if (!groups.has(key)) groups.set(key, { owner: edge.from, vertical, fixed, intervals: [] });
        groups.get(key).intervals.push([start, end]);
      }
    }
    const segments = [];
    for (const group of groups.values()) {
      group.intervals.sort((a, b) => a[0] - b[0]);
      const merged = [];
      for (const interval of group.intervals) {
        const last = merged.at(-1);
        if (last && interval[0] <= last[1]) last[1] = Math.max(last[1], interval[1]);
        else merged.push(interval.slice());
      }
      for (const [start, end] of merged) {
        segments.push({
          owner: group.owner,
          x1: group.vertical ? group.fixed : start,
          y1: group.vertical ? start : group.fixed,
          x2: group.vertical ? group.fixed : end,
          y2: group.vertical ? end : group.fixed
        });
      }
    }
    return segments;
  }

  function junctions(segments) {
    const candidates = new Map();
    for (const a of segments) for (const b of segments) {
      if (a.owner !== b.owner || a.x1 === a.x2 || b.y1 === b.y2) continue;
      const x = b.x1, y = a.y1;
      if (x < a.x1 || x > a.x2 || y < b.y1 || y > b.y2) continue;
      const key = JSON.stringify([a.owner, x, y]);
      if (!candidates.has(key)) candidates.set(key, { owner: a.owner, x, y, directions: new Set() });
      const p = candidates.get(key);
      if (x > a.x1) p.directions.add('left');
      if (x < a.x2) p.directions.add('right');
      if (y > b.y1) p.directions.add('up');
      if (y < b.y2) p.directions.add('down');
    }
    return [...candidates.values()].filter(p => p.directions.size > 2).map(({ owner, x, y }) => ({ owner, x, y }));
  }

  function hits(a, b, box) {
    return a.x === b.x
      ? a.x > box.x && a.x < box.x + box.width && Math.max(a.y, b.y) > box.y && Math.min(a.y, b.y) < box.y + box.height
      : a.y > box.y && a.y < box.y + box.height && Math.max(a.x, b.x) > box.x && Math.min(a.x, b.x) < box.x + box.width;
  }

  class Heap {
    constructor() { this.items = []; }
    push(item) {
      const a = this.items;
      a.push(item);
      let i = a.length - 1;
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (a[parent].cost <= item.cost) break;
        a[i] = a[parent];
        i = parent;
      }
      a[i] = item;
    }
    pop() {
      const a = this.items, first = a[0], last = a.pop();
      if (!a.length) return first;
      let i = 0;
      while (i * 2 + 1 < a.length) {
        let child = i * 2 + 1;
        if (child + 1 < a.length && a[child + 1].cost < a[child].cost) child++;
        if (last.cost <= a[child].cost) break;
        a[i] = a[child];
        i = child;
      }
      a[i] = last;
      return first;
    }
  }

  function routeOrthogonal(graph, edge, options = {}) {
    const clearance = options.clearance ?? 12;
    const bendPenalty = options.bendPenalty ?? 24;
    const from = graph.nodes.find(n => n.id === edge.from), to = graph.nodes.find(n => n.id === edge.to);
    if (!from || !to || from === to) return null;
    function ports(n) {
      return [
        [{ x: n.x, y: n.y + n.height / 2 }, { x: n.x - clearance, y: n.y + n.height / 2 }, 0],
        [{ x: n.x + n.width, y: n.y + n.height / 2 }, { x: n.x + n.width + clearance, y: n.y + n.height / 2 }, 0],
        [{ x: n.x + n.width / 2, y: n.y }, { x: n.x + n.width / 2, y: n.y - clearance }, 1],
        [{ x: n.x + n.width / 2, y: n.y + n.height }, { x: n.x + n.width / 2, y: n.y + n.height + clearance }, 1]
      ].filter(([a, b]) => !graph.nodes.some(n => hits(a, b, n)));
    }
    const starts = ports(from), ends = ports(to);
    if (!starts.length || !ends.length) return null;
    const xs = [...new Set([...graph.nodes.flatMap(n => [n.x - clearance, n.x + n.width + clearance]), ...starts.concat(ends).map(p => p[1].x)])].sort((a, b) => a - b);
    const ys = [...new Set([...graph.nodes.flatMap(n => [n.y - clearance, n.y + n.height + clearance]), ...starts.concat(ends).map(p => p[1].y)])].sort((a, b) => a - b);
    const key = (x, y, axis) => (y * xs.length + x) * 2 + axis;
    const best = new Map(), queue = new Heap();
    for (const port of starts) {
      const x = xs.indexOf(port[1].x), y = ys.indexOf(port[1].y), id = key(x, y, port[2]);
      const state = { x, y, axis: port[2], cost: clearance, previous: null, port, id };
      best.set(id, state);
      queue.push(state);
    }
    let winner = null, lastPort = null, total = Infinity;
    while (queue.items.length) {
      const state = queue.pop();
      if (best.get(state.id) !== state) continue;
      if (state.cost >= total) break;
      const a = { x: xs[state.x], y: ys[state.y] };
      for (const port of ends) if (a.x === port[1].x && a.y === port[1].y) {
        const cost = state.cost + clearance + (state.axis === port[2] ? 0 : bendPenalty);
        if (cost < total) { winner = state; lastPort = port; total = cost; }
      }
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const x = state.x + dx, y = state.y + dy, axis = dx ? 0 : 1;
        if (x < 0 || x >= xs.length || y < 0 || y >= ys.length) continue;
        const b = { x: xs[x], y: ys[y] };
        if (graph.nodes.some(n => hits(a, b, n))) continue;
        const id = key(x, y, axis), cost = state.cost + Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + (state.axis === axis ? 0 : bendPenalty);
        if (best.has(id) && best.get(id).cost <= cost) continue;
        const next = { x, y, axis, cost, previous: state, id };
        best.set(id, next);
        queue.push(next);
      }
    }
    if (!winner) return null;
    const path = [];
    let first = winner;
    for (let p = winner; p; p = p.previous) { path.unshift({ x: xs[p.x], y: ys[p.y] }); first = p; }
    path.unshift(first.port[0]);
    path.push(lastPort[0]);
    return { ...edge, points: simplify(path) };
  }

  function assignBandRanks(ids, links, compare, allowCycles) {
    const adj = new Map(ids.map(id => [id, []]));
    for (const [i, e] of links.entries()) adj.get(e.from).push({ to: e.to, idx: i });
    const state = new Map(), back = new Set();
    function dfs(u) {
      state.set(u, 1);
      for (const { to, idx } of adj.get(u)) {
        if (state.get(to) === 1) back.add(idx);
        else if (!state.has(to)) dfs(to);
      }
      state.set(u, 2);
    }
    for (const id of ids.slice().sort(compare)) if (!state.has(id)) dfs(id);
    if (back.size && !allowCycles) throw new Error('Command graph contains a cycle; authority edges are not reversed');
    const dagParents = new Map(ids.map(id => [id, 0]));
    const dagChildren = new Map(ids.map(id => [id, []]));
    for (const [i, e] of links.entries()) {
      const from = back.has(i) ? e.to : e.from;
      const to = back.has(i) ? e.from : e.to;
      if (from === to) continue;
      dagChildren.get(from).push(to);
      dagParents.set(to, dagParents.get(to) + 1);
    }
    const depth = new Map(ids.map(id => [id, 0]));
    const ready = ids.filter(id => !dagParents.get(id)).sort(compare);
    const ordered = [];
    while (ready.length) {
      const u = ready.shift();
      ordered.push(u);
      for (const v of dagChildren.get(u)) {
        if (depth.get(v) < depth.get(u) + 1) depth.set(v, depth.get(u) + 1);
        dagParents.set(v, dagParents.get(v) - 1);
        if (!dagParents.get(v)) {
          ready.push(v);
          ready.sort(compare);
        }
      }
    }
    if (ordered.length !== ids.length) throw new Error('Command graph contains a cycle; authority edges are not reversed');
    return { depth, backCount: back.size, backIndices: back };
  }

  function layoutLayered(graph, options = {}) {
    const routing = options.routing === 'bundled' ? 'bundled' : 'orthogonal';
    const padding = options.padding ?? 24;
    const gap = options.nodeGap ?? (routing === 'bundled' ? 28 : 30);
    const layerGap = options.layerGap ?? (routing === 'bundled' ? 74 : 54);
    const sweeps = options.sweeps ?? 24;
    const dummyWidth = options.dummyWidth ?? 8;
    const allowCycles = Boolean(options.allowCycles);
    const maxColumns = options.maxColumns ?? (routing === 'bundled' ? Infinity : 4);
    if (layerGap < 32) throw new Error('Layer gap must leave room for routing tracks');

    const nodes = (graph.nodes || []).map((n, order) => ({
      ...n,
      width: n.width ?? n.w ?? 200,
      height: n.height ?? n.h ?? 80,
      order: n.order ?? order,
      band: n.band ?? 0
    }));
    const byId = new Map(nodes.map(n => [n.id, n]));
    if (byId.size !== nodes.length) throw new Error('Duplicate layout node');
    if (!nodes.length) {
      const emptyW = options.width ?? 0;
      return {
        nodes: [],
        edges: [],
        segments: [],
        junctions: [],
        layers: [],
        width: emptyW,
        height: 0,
        metrics: { crossingsBefore: 0, crossingsAfter: 0, dummyCount: 0, columns: 0, physicalLayers: 0, logicalLayers: 0, reversedEdges: 0 }
      };
    }
    for (const n of nodes) {
      if (!(n.width > 0 && n.height > 0)) throw new Error('Positive node dimensions required');
      n.parents = [];
      n.children = [];
      n.depth = 0;
    }

    const edges = (graph.edges || []).map((e, i) => ({ ...e, id: e.id ?? `edge-${i}` }));
    for (const e of edges) {
      if (!byId.has(e.from) || !byId.has(e.to)) throw new Error('Unknown layout endpoint');
      if (e.from === e.to && !allowCycles) throw new Error('Command graph contains a cycle; authority edges are not reversed');
      if (e.from !== e.to) {
        byId.get(e.from).children.push(e.to);
        byId.get(e.to).parents.push(e.from);
      }
    }

    const compare = (a, b) => {
      const na = byId.get(a), nb = byId.get(b);
      if (na && nb) return na.order - nb.order || String(a).localeCompare(String(b));
      return String(a).localeCompare(String(b));
    };

    const bands = [...new Set(nodes.map(n => n.band))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    let depthOffset = 0, reversedEdges = 0;
    const reversedSet = new Set();
    if (bands.length === 1) {
      const res = assignBandRanks(nodes.map(n => n.id), edges, compare, allowCycles);
      for (const [id, d] of res.depth) byId.get(id).depth = d;
      reversedEdges = res.backCount;
      for (const idx of res.backIndices) reversedSet.add(edges[idx].id);
      depthOffset = Math.max(...res.depth.values()) + 1;
    } else {
      for (const band of bands) {
        const ids = nodes.filter(n => n.band === band).map(n => n.id);
        const idSet = new Set(ids);
        const localEdges = edges.filter(e => idSet.has(e.from) && idSet.has(e.to));
        const res = assignBandRanks(ids, localEdges, compare, allowCycles);
        let maxLocal = 0;
        for (const [id, d] of res.depth) {
          byId.get(id).depth = depthOffset + d;
          if (d > maxLocal) maxLocal = d;
        }
        reversedEdges += res.backCount;
        for (const idx of res.backIndices) reversedSet.add(localEdges[idx].id);
        depthOffset += maxLocal + 1;
      }
      for (const e of edges) {
        const a = byId.get(e.from), b = byId.get(e.to);
        if (a.depth > b.depth && !reversedSet.has(e.id)) {
          if (!allowCycles) throw new Error('Command graph contains a cycle; authority edges are not reversed');
          reversedSet.add(e.id);
          reversedEdges++;
        }
      }
    }

    const cellWidth = Math.max(...nodes.map(n => n.width));
    const requestedWidth = options.width ?? (routing === 'orthogonal' ? 1200 : undefined);
    if (requestedWidth !== undefined && cellWidth + padding * 2 > requestedWidth) {
      throw new Error('Width budget cannot fit a node');
    }
    const fitCols = requestedWidth !== undefined
      ? Math.max(1, Math.floor((requestedWidth - padding * 2 + gap) / (cellWidth + gap)))
      : Infinity;
    const capCols = Number.isFinite(maxColumns) ? Math.max(1, maxColumns) : Infinity;
    const wrapLimit = Math.min(fitCols, capCols);

    const depthLayers = [];
    for (const n of nodes) (depthLayers[n.depth] ??= []).push(n.id);
    const layers = [];
    for (const layer of depthLayers) {
      if (!layer) continue;
      layer.sort(compare);
      if (Number.isFinite(wrapLimit)) {
        for (let i = 0; i < layer.length; i += wrapLimit) layers.push(layer.slice(i, i + wrapLimit));
      } else {
        layers.push(layer.slice());
      }
    }
    layers.forEach((layer, rank) => layer.forEach(id => { byId.get(id).rank = rank; }));

    const expanded = layers.map(layer => layer.slice());
    const rankOf = new Map();
    expanded.forEach((layer, rank) => layer.forEach(id => rankOf.set(id, rank)));
    const widthOf = new Map(nodes.map(n => [n.id, n.width]));
    const up = new Map(), down = new Map();
    const linkSegments = [];
    const chains = [];
    let dummyCount = 0;

    function addAdj(hi, lo) {
      const dList = down.get(hi) ?? down.set(hi, []).get(hi);
      if (!dList.includes(lo)) dList.push(lo);
      const uList = up.get(lo) ?? up.set(lo, []).get(lo);
      if (!uList.includes(hi)) uList.push(hi);
      linkSegments.push({ from: hi, to: lo });
    }

    const bundleDummies = routing === 'bundled';
    for (const [i, e] of edges.entries()) {
      if (e.from === e.to) {
        chains.push({ edge: e, pts: [e.from, e.to] });
        continue;
      }
      const ra = byId.get(e.from).rank, rb = byId.get(e.to).rank;
      if (ra === rb) {
        chains.push({ edge: e, pts: [e.from, e.to] });
        continue;
      }
      const step = rb > ra ? 1 : -1;
      const pts = [e.from];
      for (let r = ra + step; r !== rb; r += step) {
        const dId = bundleDummies
          ? `\u0000d:${step > 0 ? 'dn' : 'up'}:${e.to}:${r}`
          : `\u0000dummy-${i}-${r}`;
        if (!rankOf.has(dId)) {
          rankOf.set(dId, r);
          widthOf.set(dId, dummyWidth);
          expanded[r].push(dId);
          dummyCount++;
        }
        pts.push(dId);
      }
      pts.push(e.to);
      for (let k = 1; k < pts.length; k++) {
        const x = pts[k - 1], y = pts[k];
        const rx = rankOf.get(x), ry = rankOf.get(y);
        if (rx < ry) addAdj(x, y);
        else if (ry < rx) addAdj(y, x);
      }
      chains.push({ edge: e, pts });
    }

    function positions(order) {
      const pos = new Map();
      order.forEach(layer => layer.forEach((id, idx) => pos.set(id, idx)));
      return pos;
    }

    function crossingCount(order) {
      const pos = positions(order);
      let count = 0;
      for (let r = 0; r + 1 < order.length; r++) {
        const segs = linkSegments.filter(s => rankOf.get(s.from) === r);
        for (let i = 0; i < segs.length; i++) {
          for (let j = i + 1; j < segs.length; j++) {
            const a = segs[i], b = segs[j];
            if ((pos.get(a.from) - pos.get(b.from)) * (pos.get(a.to) - pos.get(b.to)) < 0) count++;
          }
        }
      }
      return count;
    }

    const crossingsBefore = crossingCount(expanded);
    let best = expanded.map(l => l.slice()), bestScore = crossingsBefore;
    for (let sweep = 0; sweep < sweeps; sweep++) {
      const downward = sweep % 2 === 0;
      const start = downward ? 1 : expanded.length - 2;
      const end = downward ? expanded.length : -1;
      for (let r = start; r !== end; r += downward ? 1 : -1) {
        const pos = positions(expanded);
        const old = new Map(expanded[r].map((id, idx) => [id, idx]));
        const scores = new Map(expanded[r].map(id => {
          const adj = (downward ? up : down).get(id) ?? [];
          return [id, adj.length ? adj.reduce((s, m) => s + pos.get(m), 0) / adj.length : old.get(id)];
        }));
        expanded[r].sort((a, b) => scores.get(a) - scores.get(b) || old.get(a) - old.get(b));
      }
      const score = crossingCount(expanded);
      if (score < bestScore) {
        best = expanded.map(l => l.slice());
        bestScore = score;
      }
    }

    const orderedReal = best.map(layer => layer.filter(id => byId.has(id)));
    const maxRowLen = Math.max(1, ...orderedReal.map(l => l.length));
    const columns = Number.isFinite(wrapLimit) ? Math.min(wrapLimit, Math.max(maxRowLen, wrapLimit)) : maxRowLen;

    if (routing === 'bundled') {
      const work = best.map(layer => {
        const connected = layer.filter(id => (up.get(id)?.length || down.get(id)?.length));
        const lonely = layer.filter(id => !(up.get(id)?.length || down.get(id)?.length));
        return connected.concat(lonely);
      });
      const xCenter = new Map();
      for (const layer of work) {
        let cur = 0;
        for (const id of layer) {
          const w = widthOf.get(id);
          xCenter.set(id, cur + w / 2);
          cur += w + gap;
        }
      }
      const isDummy = id => typeof id === 'string' && id.startsWith('\u0000');
      const pairGap = (a, b) => {
        const da = isDummy(a), db = isDummy(b);
        const g = da && db ? 8 : da || db ? 16 : gap;
        return (widthOf.get(a) + widthOf.get(b)) / 2 + g;
      };
      const pairWeight = (a, b) => {
        const da = isDummy(a), db = isDummy(b);
        return da && db ? 8 : da || db ? 2 : 1;
      };
      function placeLayer(layer, want, wts) {
        if (!layer.length) return;
        const off = [];
        let cur = 0;
        for (let i = 0; i < layer.length; i++) {
          if (i) cur += pairGap(layer[i - 1], layer[i]);
          off.push(cur);
        }
        const blocks = [];
        for (let i = 0; i < layer.length; i++) {
          const id = layer[i];
          blocks.push([want.get(id) - off[i], wts.get(id), 1]);
          while (blocks.length > 1 && blocks[blocks.length - 2][0] > blocks[blocks.length - 1][0]) {
            const [v2, w2, c2] = blocks.pop();
            const [v1, w1, c1] = blocks.pop();
            blocks.push([(v1 * w1 + v2 * w2) / (w1 + w2), w1 + w2, c1 + c2]);
          }
        }
        let idx = 0;
        for (const [v, , count] of blocks) {
          for (let c = 0; c < count; c++) {
            xCenter.set(layer[idx], v + off[idx]);
            idx++;
          }
        }
      }
      const nrank = work.length;
      for (let it = 0; it < 80; it++) {
        let ranks, nbrMaps;
        if (it % 3 === 0) {
          ranks = Array.from({ length: Math.max(0, nrank - 1) }, (_, i) => i + 1);
          nbrMaps = [up];
        } else if (it % 3 === 1) {
          ranks = Array.from({ length: Math.max(0, nrank - 1) }, (_, i) => nrank - 2 - i);
          nbrMaps = [down];
        } else {
          ranks = Array.from({ length: nrank }, (_, i) => i);
          nbrMaps = [up, down];
        }
        for (const r of ranks) {
          const layer = work[r];
          const want = new Map(), wts = new Map();
          for (const id of layer) {
            let tw = 0, tx = 0;
            for (const mp of nbrMaps) {
              for (const m of mp.get(id) ?? []) {
                const w = pairWeight(id, m);
                tw += w;
                tx += w * xCenter.get(m);
              }
            }
            const hasAny = Boolean(up.get(id)?.length || down.get(id)?.length);
            const lonely = !hasAny && layer[0] !== id;
            want.set(id, tw ? tx / tw : (lonely ? -1e6 : xCenter.get(id)));
            wts.set(id, tw ? tw : (lonely ? 1e-6 : 0.5));
          }
          placeLayer(layer, want, wts);
        }
      }
      let minLeft = Infinity, maxRight = -Infinity;
      for (const [id, xc] of xCenter) {
        const half = widthOf.get(id) / 2;
        if (xc - half < minLeft) minLeft = xc - half;
      }
      for (const [id, xc] of xCenter) {
        const shifted = xc + padding - minLeft;
        xCenter.set(id, shifted);
        const half = widthOf.get(id) / 2;
        if (shifted + half > maxRight) maxRight = shifted + half;
      }
      const rowTop = [], rowHeight = [];
      let y = padding;
      for (let r = 0; r < nrank; r++) {
        rowTop[r] = y;
        const realInRow = orderedReal[r];
        const h = realInRow.length ? Math.max(...realInRow.map(id => byId.get(id).height)) : 46;
        rowHeight[r] = h;
        realInRow.forEach((id, colIdx) => {
          const n = byId.get(id);
          n.column = colIdx;
          n.x = xCenter.get(id) - n.width / 2;
          n.y = y + (h - n.height) / 2;
        });
        y += h + layerGap;
      }
      const totalWidth = Math.max(requestedWidth ?? 0, Math.ceil(maxRight + padding));
      const totalHeight = Math.max(0, y - layerGap + padding);

      const portBuckets = new Map();
      const chainRecords = chains.map(c => {
        const p = c.pts;
        const a = p[0], b = p[p.length - 1];
        if (a === b) {
          const na = byId.get(a);
          const pt = { x: Math.round((na.x + na.width) * 10) / 10, y: Math.round((na.y + na.height / 2) * 10) / 10 };
          return { ...c, sa: 'r', sb: 'r', portA: pt, portB: pt };
        }
        const first = p[1], last = p[p.length - 2];
        const ra = rankOf.get(a), rf = rankOf.get(first), rb = rankOf.get(b), rl = rankOf.get(last);
        const sa = rf > ra ? 'b' : rf < ra ? 't' : (xCenter.get(b) > xCenter.get(a) ? 'r' : 'l');
        const sb = rl < rb ? 't' : rl > rb ? 'b' : (xCenter.get(b) > xCenter.get(a) ? 'l' : 'r');
        const rec = { ...c, sa, sb, portA: null, portB: null };
        const keyA = `${a}\u0000${sa}`, keyB = `${b}\u0000${sb}`;
        (portBuckets.get(keyA) ?? portBuckets.set(keyA, []).get(keyA)).push({ sortX: xCenter.get(first), rec, end: 'portA' });
        (portBuckets.get(keyB) ?? portBuckets.set(keyB, []).get(keyB)).push({ sortX: xCenter.get(last), rec, end: 'portB' });
        return rec;
      });

      for (const [key, list] of portBuckets) {
        const [nodeId, side] = key.split('\u0000');
        const box = byId.get(nodeId);
        list.sort((u, v) => u.sortX - v.sortX);
        list.forEach((item, idx) => {
          const f = (idx + 1) / (list.length + 1);
          let px, py;
          if (side === 'b' || side === 't') {
            const inset = Math.min(10, box.width * 0.15);
            px = box.x + inset + (box.width - inset * 2) * f;
            py = side === 'b' ? box.y + box.height : box.y;
          } else {
            px = side === 'r' ? box.x + box.width : box.x;
            py = box.y + box.height * f;
          }
          item.rec[item.end] = { x: Math.round(px * 10) / 10, y: Math.round(py * 10) / 10 };
        });
      }

      const routed = chainRecords.map(rec => {
        const mids = rec.pts.slice(1, -1).map(dId => {
          const r = rankOf.get(dId);
          return {
            x: Math.round(xCenter.get(dId) * 10) / 10,
            y: Math.round((rowTop[r] + rowHeight[r] / 2) * 10) / 10
          };
        });
        const waypoints = [rec.portA, ...mids, rec.portB];
        let d = `M${waypoints[0].x},${waypoints[0].y}`;
        if (rec.sa === 'l' || rec.sa === 'r') {
          const p0 = waypoints[0], p1 = waypoints[waypoints.length - 1];
          const mx = Math.round(((p0.x + p1.x) / 2) * 10) / 10;
          d += ` C${mx},${p0.y} ${mx},${p1.y} ${p1.x},${p1.y}`;
        } else {
          for (let i = 1; i < waypoints.length; i++) {
            const p0 = waypoints[i - 1], p1 = waypoints[i];
            const k = (p1.y - p0.y) / 2;
            const c1y = Math.round((p0.y + k) * 10) / 10;
            const c2y = Math.round((p1.y - k) * 10) / 10;
            d += ` C${p0.x},${c1y} ${p1.x},${c2y} ${p1.x},${p1.y}`;
          }
        }
        const mid = waypoints.length > 2
          ? waypoints[Math.floor(waypoints.length / 2)]
          : {
              x: Math.round(((waypoints[0].x + waypoints[1].x) / 2) * 10) / 10,
              y: Math.round(((waypoints[0].y + waypoints[1].y) / 2) * 10) / 10
            };
        const ra = byId.get(rec.edge.from).rank, rb = byId.get(rec.edge.to).rank;
        return {
          ...rec.edge,
          points: waypoints,
          waypoints,
          d,
          mid,
          sourceSide: rec.sa,
          targetSide: rec.sb,
          skippedLayers: Math.max(0, Math.abs(rb - ra) - 1),
          reversed: reversedSet.has(rec.edge.id)
        };
      });

      return {
        nodes: nodes.map(n => ({ id: n.id, x: n.x, y: n.y, width: n.width, height: n.height, rank: n.rank, depth: n.depth, column: n.column, band: n.band })),
        edges: routed,
        segments: [],
        junctions: [],
        layers: orderedReal,
        width: totalWidth,
        height: totalHeight,
        metrics: {
          crossingsBefore,
          crossingsAfter: bestScore,
          dummyCount,
          columns: maxRowLen,
          physicalLayers: orderedReal.length,
          logicalLayers: depthLayers.filter(Boolean).length,
          reversedEdges
        }
      };
    }

    const usedCols = Math.max(1, ...orderedReal.map(l => l.length));
    const gridCols = Number.isFinite(wrapLimit) ? wrapLimit : usedCols;
    const contentWidth = gridCols * cellWidth + Math.max(0, gridCols - 1) * gap;
    const outWidth = requestedWidth ?? (contentWidth + padding * 2);
    const origin = (outWidth - contentWidth) / 2;
    const rowTop = [], rowBottom = [];
    let y = padding;
    for (const [rank, layer] of orderedReal.entries()) {
      rowTop[rank] = y;
      const height = Math.max(...layer.map(id => byId.get(id).height));
      const start = Math.floor((gridCols - layer.length) / 2);
      for (const [i, id] of layer.entries()) {
        const n = byId.get(id);
        n.column = start + i;
        n.x = origin + n.column * (cellWidth + gap) + (cellWidth - n.width) / 2;
        n.y = y;
        if (rank === 0 && layer.length === 1) n.x = (outWidth - n.width) / 2;
      }
      rowBottom[rank] = y + height;
      y += height + layerGap;
    }

    const rightEdge = origin + contentWidth;
    const rawChannels = Array.from({ length: gridCols + 1 }, (_, i) => {
      if (i === 0) return Math.max(origin / 2, origin - gap / 2);
      if (i === gridCols) return Math.min((rightEdge + outWidth) / 2, rightEdge + gap / 2);
      return origin - gap / 2 + i * (cellWidth + gap);
    });
    const channels = rawChannels.filter(x => x > 2 && x < outWidth - 2);
    const trunks = new Map();
    for (const n of nodes) {
      const relevant = edges.filter(e => e.from === n.id && e.to !== n.id).map(e => byId.get(e.to));
      if (!relevant.length) continue;
      const sx = n.x + n.width / 2;
      const targets = relevant.map(t => t.x + t.width / 2);
      const score = x => Math.abs(sx - x) + targets.reduce((sum, tx) => sum + Math.abs(tx - x), 0);
      trunks.set(n.id, channels.reduce((bestCh, x) => score(x) < score(bestCh) ? x : bestCh, channels[0]));
    }
    const trunkGroups = new Map();
    for (const [id, x] of trunks) (trunkGroups.get(x) ?? trunkGroups.set(x, []).get(x)).push(id);
    for (const [x, ids] of trunkGroups) {
      ids.sort(compare);
      const clearance = Math.min(gap - 12, (x < origin ? x * 2 : x > rightEdge ? (outWidth - x) * 2 : gap) - 8);
      const localSpread = Math.max(0, Math.min(20, clearance));
      const step = ids.length > 1 ? Math.min(6, localSpread / (ids.length - 1)) : 0;
      ids.forEach((id, i) => trunks.set(id, x + (i - (ids.length - 1) / 2) * step));
    }

    const sourceRows = new Map(), targetRows = new Map();
    for (const e of edges) {
      if (e.from === e.to) continue;
      const a = byId.get(e.from), b = byId.get(e.to);
      (sourceRows.get(a.rank) ?? sourceRows.set(a.rank, new Set()).get(a.rank)).add(a.id);
      (targetRows.get(b.rank) ?? targetRows.set(b.rank, new Set()).get(b.rank)).add(a.id);
    }
    const bandBudget = Math.max(4, Math.floor((layerGap - 28) / 2));
    function trackOffset(rows, rank, id) {
      const set = rows.get(rank);
      if (!set) return 12;
      const ids = [...set].sort(compare);
      return 10 + (ids.length > 1 ? ids.indexOf(id) * bandBudget / (ids.length - 1) : 0);
    }

    const routed = edges.map(e => {
      const a = byId.get(e.from), b = byId.get(e.to);
      const sx = a.x + a.width / 2, tx = b.x + b.width / 2;
      if (a.id === b.id) {
        const pts = simplify([
          { x: a.x + a.width, y: a.y + a.height / 2 },
          { x: a.x + a.width + 12, y: a.y + a.height / 2 },
          { x: a.x + a.width + 12, y: a.y + a.height + 12 },
          { x: sx, y: a.y + a.height + 12 },
          { x: sx, y: a.y + a.height }
        ]);
        return { ...e, points: pts, skippedLayers: 0, reversed: true };
      }
      if (b.rank === a.rank) {
        const drop = rowBottom[a.rank] + trackOffset(sourceRows, a.rank, a.id);
        const pts = simplify([
          { x: sx, y: a.y + a.height },
          { x: sx, y: drop },
          { x: tx, y: drop },
          { x: tx, y: b.y + b.height }
        ]);
        return { ...e, points: pts, skippedLayers: 0, reversed: reversedSet.has(e.id) };
      }
      if (b.rank < a.rank) {
        const exitUp = rowTop[a.rank] - trackOffset(sourceRows, a.rank, a.id);
        const entryUp = rowBottom[b.rank] + trackOffset(targetRows, b.rank, a.id);
        const channel = trunks.get(a.id);
        const pts = a.rank === b.rank + 1
          ? [{ x: sx, y: a.y }, { x: sx, y: exitUp }, { x: tx, y: exitUp }, { x: tx, y: b.y + b.height }]
          : [{ x: sx, y: a.y }, { x: sx, y: exitUp }, { x: channel, y: exitUp }, { x: channel, y: entryUp }, { x: tx, y: entryUp }, { x: tx, y: b.y + b.height }];
        return { ...e, points: simplify(pts), skippedLayers: a.rank - b.rank - 1, reversed: true };
      }
      const exit = rowBottom[a.rank] + trackOffset(sourceRows, a.rank, a.id);
      const entry = rowTop[b.rank] - trackOffset(targetRows, b.rank, a.id);
      const channel = trunks.get(a.id);
      const pts = b.rank === a.rank + 1
        ? [{ x: sx, y: a.y + a.height }, { x: sx, y: exit }, { x: tx, y: exit }, { x: tx, y: b.y }]
        : [{ x: sx, y: a.y + a.height }, { x: sx, y: exit }, { x: channel, y: exit }, { x: channel, y: entry }, { x: tx, y: entry }, { x: tx, y: b.y }];
      return { ...e, points: simplify(pts), skippedLayers: b.rank - a.rank - 1, reversed: reversedSet.has(e.id) };
    });

    const segments = mergeSegments(routed);
    const totalHeight = Math.max(y - layerGap + padding, ...routed.flatMap(e => e.points.map(p => p.y + padding)));
    return {
      nodes: nodes.map(n => ({ id: n.id, x: n.x, y: n.y, width: n.width, height: n.height, rank: n.rank, depth: n.depth, column: n.column, band: n.band })),
      edges: routed,
      segments,
      junctions: junctions(segments),
      layers: orderedReal,
      width: outWidth,
      height: totalHeight,
      metrics: {
        crossingsBefore,
        crossingsAfter: bestScore,
        dummyCount,
        columns: usedCols,
        physicalLayers: orderedReal.length,
        logicalLayers: depthLayers.filter(Boolean).length,
        reversedEdges
      }
    };
  }

  function cleanParent(value) {
    return value && value !== 'null' ? String(value) : null;
  }

  function summarizeCharter(text) {
    if (!text || typeof text !== 'string') return '';
    const line = text.replace(/\s+/g, ' ').trim();
    const stop = line.indexOf('. ');
    const first = stop > 0 && stop <= 120 ? line.slice(0, stop + 1) : line;
    return first.length > 120 ? first.slice(0, 117).trimEnd() + '...' : first;
  }

  function fromForms(snapshot, options = {}) {
    const rawForms = Array.isArray(snapshot) ? snapshot : (snapshot?.forms || []);
    const topology = (!Array.isArray(snapshot) && snapshot?.topology) || {};
    const arias = (!Array.isArray(snapshot) && snapshot?.arias) || [];
    const includeInactive = Boolean(options.includeInactive);
    const foldAliases = options.foldAliases !== false;
    const includeReportsTo = options.includeReportsTo !== false;
    const nodeWidth = options.nodeWidth ?? 224;
    const nodeHeight = options.nodeHeight ?? 118;
    const rootHeight = options.rootHeight ?? 104;

    const ariaById = new Map();
    for (const a of arias) {
      if (a && a.id) ariaById.set(String(a.id), a);
    }

    const sanitized = new Map();
    for (const item of rawForms) {
      if (!item || !item.id) continue;
      const state = item.state && typeof item.state === 'object' ? item.state : item;
      const id = String(item.id);
      if (sanitized.has(id)) throw new Error('Duplicate form id: ' + id);
      const title = String(state['role-name'] || state.name || item.name || state.title || item.handle || id).trim();
      const targetAria = cleanParent(item.target_aria ?? state['target-aria'] ?? state.target_aria);
      const rawParent = cleanParent(item.parent ?? state.parent);
      const reportsTo = includeReportsTo ? cleanParent(state['reports-to'] ?? item['reports-to']) : null;
      const lc = state.lifecycle ?? item.lifecycle;
      const lifecycleStatus = typeof lc === 'string' ? lc : (lc && typeof lc === 'object' ? String(lc.status || '') : '');
      const charter = typeof state.charter === 'string' ? state.charter.replace(/\s+/g, ' ').trim() : '';
      const summary = typeof state.summary === 'string' ? state.summary.trim() : summarizeCharter(charter);
      const owns = Array.isArray(state.owns) ? state.owns.map(String) : (summary ? [summary] : []);
      sanitized.set(id, {
        id,
        handle: item.handle ? String(item.handle) : '',
        title,
        rawParent,
        reportsTo,
        targetAria,
        lifecycleStatus,
        charter,
        summary,
        owns,
        boundary: typeof state.boundary === 'string' ? state.boundary.trim() : '',
        kind: typeof state.kind === 'string' ? state.kind.trim() : ''
      });
    }

    function resolveKnownId(ref) {
      if (!ref) return null;
      if (sanitized.has(ref)) return ref;
      for (const f of sanitized.values()) {
        if (f.handle === ref || (ref.startsWith('@') && ref.length >= 6 && f.id.startsWith(ref))) return f.id;
      }
      return null;
    }

    for (const f of sanitized.values()) {
      f.parentId = resolveKnownId(f.rawParent) || resolveKnownId(f.reportsTo);
    }

    let rootId = resolveKnownId(options.root ?? snapshot?.root);
    if (!rootId) {
      const roots = [...sanitized.values()].filter(f => !f.parentId && f.targetAria);
      rootId = roots[0]?.id ?? [...sanitized.keys()][0] ?? null;
    }
    if (!rootId || !sanitized.has(rootId)) throw new Error('Missing visible root form');

    const inSubtree = new Map();
    function depthFromRoot(id, trail = new Set()) {
      if (id === rootId) return 0;
      if (inSubtree.has(id)) return inSubtree.get(id);
      if (trail.has(id)) throw new Error('Cyclic form hierarchy');
      const f = sanitized.get(id);
      if (!f || !f.parentId) {
        inSubtree.set(id, -1);
        return -1;
      }
      trail.add(id);
      const pd = depthFromRoot(f.parentId, trail);
      trail.delete(id);
      const d = pd >= 0 ? pd + 1 : -1;
      inSubtree.set(id, d);
      return d;
    }

    const candidates = [];
    for (const f of sanitized.values()) {
      const d = depthFromRoot(f.id);
      if (d >= 0) {
        f.treeDepth = d;
        candidates.push(f);
      }
    }

    const aliasRedirect = new Map();
    const aliasesOnPrimary = new Map();
    if (foldAliases) {
      const byTarget = new Map();
      for (const f of candidates) {
        if (!f.targetAria) continue;
        (byTarget.get(f.targetAria) ?? byTarget.set(f.targetAria, []).get(f.targetAria)).push(f);
      }
      for (const [ariaId, group] of byTarget) {
        if (group.length < 2) continue;
        const occ = ariaById.get(ariaId);
        const mantra = (occ?.mantra || '').toLowerCase();
        const sorted = group.slice().sort((a, b) => {
          const aAlias = a.lifecycleStatus === 'routing-alias' ? 1 : 0;
          const bAlias = b.lifecycleStatus === 'routing-alias' ? 1 : 0;
          if (aAlias !== bAlias) return aAlias - bAlias;
          if (a.treeDepth !== b.treeDepth) return a.treeDepth - b.treeDepth;
          const aMatch = mantra && mantra.startsWith(a.title.toLowerCase()) ? 0 : 1;
          const bMatch = mantra && mantra.startsWith(b.title.toLowerCase()) ? 0 : 1;
          if (aMatch !== bMatch) return aMatch - bMatch;
          const aCh = a.charter ? 0 : 1, bCh = b.charter ? 0 : 1;
          if (aCh !== bCh) return aCh - bCh;
          return a.id.localeCompare(b.id);
        });
        const primary = sorted[0];
        for (let i = 1; i < sorted.length; i++) {
          aliasRedirect.set(sorted[i].id, primary.id);
          (aliasesOnPrimary.get(primary.id) ?? aliasesOnPrimary.set(primary.id, []).get(primary.id)).push(sorted[i]);
        }
      }
      for (const f of candidates) {
        if (f.lifecycleStatus === 'routing-alias' && !aliasRedirect.has(f.id) && f.parentId) {
          const target = aliasRedirect.get(f.parentId) || f.parentId;
          aliasRedirect.set(f.id, target);
          (aliasesOnPrimary.get(target) ?? aliasesOnPrimary.set(target, []).get(target)).push(f);
        }
      }
    }

    function canonicalId(id) {
      let cur = id;
      const seen = new Set();
      while (aliasRedirect.has(cur) && !seen.has(cur)) {
        seen.add(cur);
        cur = aliasRedirect.get(cur);
      }
      return cur;
    }

    rootId = canonicalId(rootId);
    const activeSet = new Set();
    for (const f of candidates) {
      if (aliasRedirect.has(f.id)) continue;
      const inactive = f.lifecycleStatus === 'inactive' || (!f.targetAria && f.id !== rootId);
      if (inactive && !includeInactive) continue;
      activeSet.add(f.id);
    }
    activeSet.add(rootId);

    const roles = [];
    for (const f of candidates) {
      if (!activeSet.has(f.id)) continue;
      let manager = null;
      if (f.id !== rootId) {
        let p = f.parentId ? canonicalId(f.parentId) : rootId;
        const seen = new Set([f.id]);
        while (p && !activeSet.has(p) && !seen.has(p)) {
          seen.add(p);
          const pf = sanitized.get(p);
          p = pf?.parentId ? canonicalId(pf.parentId) : rootId;
        }
        manager = p && activeSet.has(p) && p !== f.id ? p : rootId;
      }
      const occ = f.targetAria ? ariaById.get(f.targetAria) : null;
      const aliasForms = aliasesOnPrimary.get(f.id) || [];
      const owns = f.owns.slice();
      for (const al of aliasForms) {
        owns.push('Alias: ' + al.title + (al.handle ? ' (' + al.handle + ')' : ''));
      }
      const inactive = f.lifecycleStatus === 'inactive' || (!f.targetAria && f.id !== rootId);
      const lifecycleLabel = f.lifecycleStatus
        ? f.lifecycleStatus
        : (occ?.state ? 'Seat ' + occ.state : (inactive ? 'Unbound' : 'Standing'));
      roles.push({
        id: f.id,
        handle: f.handle || undefined,
        title: f.title,
        manager,
        summary: f.summary || (f.handle || undefined),
        owns: owns.length ? owns : undefined,
        boundary: f.boundary || undefined,
        charter: f.charter || undefined,
        kind: f.id === rootId ? (f.kind || 'Visible root') : (f.kind || undefined),
        lifecycle: lifecycleLabel,
        occupant: occ
          ? { handle: occ.handle || occ.id.slice(0, 8), mantra: occ.mantra || '' }
          : (f.targetAria ? { handle: f.targetAria.slice(0, 8), mantra: '' } : undefined),
        aliases: aliasForms.length ? aliasForms.map(a => ({ id: a.id, handle: a.handle, title: a.title })) : undefined
      });
    }

    const holderToRole = new Map();
    for (const f of candidates) {
      if (activeSet.has(f.id) && f.targetAria && !holderToRole.has(f.targetAria)) {
        holderToRole.set(f.targetAria, f.id);
      }
    }

    const workers = [];
    if (options.includeWorkers !== false && arias.length) {
      const parentAriaOf = a => {
        if (Object.prototype.hasOwnProperty.call(topology, a.id)) {
          return cleanParent(topology[a.id]);
        }
        return cleanParent(a.parent);
      };
      const eligible = arias.filter(a => {
        if (!a || !a.id || holderToRole.has(a.id)) return false;
        if (a.state === 'retired' || a.state === 'reaped') return false;
        if (!options.includeSucceeded && typeof a.mantra === 'string' && a.mantra.startsWith('SUCCEEDED:')) return false;
        return true;
      });
      const byAria = new Map(eligible.map(a => [a.id, a]));
      const memoOwner = new Map();
      function resolveWorkerParent(id, trail = new Set()) {
        if (memoOwner.has(id)) return memoOwner.get(id);
        if (trail.has(id)) return null;
        const a = byAria.get(id);
        if (!a) return null;
        const p = parentAriaOf(a);
        if (!p) { memoOwner.set(id, null); return null; }
        if (holderToRole.has(p)) {
          const roleId = holderToRole.get(p);
          memoOwner.set(id, roleId);
          return roleId;
        }
        if (byAria.has(p)) {
          trail.add(id);
          const upOwner = resolveWorkerParent(p, trail);
          trail.delete(id);
          const res = upOwner ? p : null;
          memoOwner.set(id, res);
          return res;
        }
        memoOwner.set(id, null);
        return null;
      }
      for (const a of eligible) {
        const manager = resolveWorkerParent(a.id);
        if (!manager) continue;
        workers.push({
          id: a.id,
          title: a.handle || a.id.slice(0, 8),
          manager,
          summary: a.mantra || 'Transient aria',
          lifecycle: a.state || 'live'
        });
      }
    }

    const communications = [];
    const rawComms = snapshot?.communications || options.communications || [];
    const visibleIds = new Set(roles.map(r => r.id));
    for (const c of rawComms) {
      const from = canonicalId(resolveKnownId(c.from) || c.from);
      const to = canonicalId(resolveKnownId(c.to) || c.to);
      if (visibleIds.has(from) && visibleIds.has(to) && from !== to && (c.kind === 'ui' || c.kind === 'deployment')) {
        communications.push({ from, to, kind: c.kind, label: c.label });
      }
    }
    const uiOwner = canonicalId(resolveKnownId(options.uiOwner) || '');
    const deployOwner = canonicalId(resolveKnownId(options.deploymentOwner) || '');
    if (visibleIds.has(uiOwner)) {
      for (const r of roles) {
        if (r.id !== rootId && r.id !== uiOwner && !communications.some(c => c.from === r.id && c.to === uiOwner && c.kind === 'ui')) {
          communications.push({ from: r.id, to: uiOwner, kind: 'ui', label: 'Declared UI handoff' });
        }
      }
    }
    if (visibleIds.has(deployOwner)) {
      for (const r of roles) {
        if (r.id !== rootId && r.id !== deployOwner && !communications.some(c => c.from === r.id && c.to === deployOwner && c.kind === 'deployment')) {
          communications.push({ from: r.id, to: deployOwner, kind: 'deployment', label: 'Declared deployment handoff' });
        }
      }
    }

    const graphNodes = roles.map((r, i) => ({
      id: r.id,
      width: nodeWidth,
      height: r.id === rootId ? rootHeight : nodeHeight,
      order: i
    }));
    const graphEdges = roles.filter(r => r.manager).map(r => ({ from: r.manager, to: r.id }));

    return {
      root: rootId,
      expandedTeam: options.expandedTeam ? canonicalId(resolveKnownId(options.expandedTeam) || options.expandedTeam) : undefined,
      roles,
      workers,
      communications,
      nodes: graphNodes,
      edges: graphEdges
    };
  }

  return {
    layout: layoutLayered,
    layoutLayered,
    mergeSegments,
    junctions,
    routeOrthogonal,
    fromForms
  };
}());

if (typeof self !== 'undefined') {
  self.strati = strati;
  self.zanni = self.zanni || {};
  self.zanni.strati = strati;
}
if (typeof module === 'object' && module.exports) module.exports = strati;
