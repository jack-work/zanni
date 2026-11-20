var ordine = (function () {
  'use strict';

  const engine = typeof require === 'function'
    ? require('../strati/strati.js')
    : (typeof self !== 'undefined' ? (self.strati || (self.zanni && self.zanni.strati)) : null);

  function hierarchy(model) {
    const roles = new Map(model.roles.map(r => [r.id, r]));
    if (roles.size !== model.roles.length) throw new Error('Duplicate visible position');
    if (!roles.has(model.root)) throw new Error('Missing visible root');
    const children = new Map(model.roles.map(r => [r.id, []]));
    for (const role of model.roles) {
      if (role.id === model.root) continue;
      if (!roles.has(role.manager)) throw new Error('Missing visible supervisor');
      children.get(role.manager).push(role.id);
    }
    const reached = new Set();
    function visit(id) {
      if (reached.has(id)) throw new Error('Cyclic hierarchy');
      reached.add(id);
      children.get(id).forEach(visit);
    }
    visit(model.root);
    if (reached.size !== roles.size) throw new Error('Disconnected hierarchy');
    return { roles, children };
  }

  function mergeSegments(edges) {
    const groups = new Map();
    for (const edge of edges) {
      for (let i = 1; i < edge.points.length; i++) {
        const a = edge.points[i - 1], b = edge.points[i];
        if (a.x === b.x && a.y === b.y) continue;
        if (a.x !== b.x && a.y !== b.y) throw new Error('Nonorthogonal hierarchy segment');
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
        segments.push({ owner: group.owner, x1: group.vertical ? group.fixed : start, y1: group.vertical ? start : group.fixed, x2: group.vertical ? group.fixed : end, y2: group.vertical ? end : group.fixed });
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

  function finish(nodes, edges, groups = [], compact = false) {
    const segments = mergeSegments(edges);
    return { width: Math.max(compact ? 1124 : 0, ...nodes.map(b => b.x + b.width + 28)), height: Math.max(compact ? 816 : 0, ...nodes.map(b => b.y + b.height + 80)), nodes, edges, segments, junctions: junctions(segments), groups, compact };
  }

  function treeLayout(model) {
    const { children } = hierarchy(model), widths = new Map(), nodes = [], edges = [];
    function measure(id) {
      const branch = children.get(id);
      const width = Math.max(224, branch.reduce((n, child) => n + measure(child), 0) + Math.max(0, branch.length - 1) * 36);
      widths.set(id, width);
      return width;
    }
    measure(model.root);
    function place(id, left, depth) {
      const box = { id, x: left + (widths.get(id) - 224) / 2, y: 32 + depth * 196, width: 224, height: 118 };
      nodes.push(box);
      let cursor = left;
      for (const child of children.get(id)) {
        const next = place(child, cursor, depth + 1), y = box.y + 157;
        edges.push({ from: id, to: child, points: [{ x: box.x + 112, y: box.y + 118 }, { x: box.x + 112, y }, { x: next.x + 112, y }, { x: next.x + 112, y: next.y }] });
        cursor += widths.get(child) + 36;
      }
      return box;
    }
    place(model.root, 28, 0);
    return finish(nodes, edges);
  }

  function layeredLayout(model, options = {}) {
    if (model && Array.isArray(model.nodes) && !model.roles) {
      if (!engine) throw new Error('Missing strati layered engine');
      return engine.layoutLayered(model, options);
    }
    hierarchy(model);
    if (!engine) return treeLayout(model);
    const nodes = model.roles.map((r, i) => ({
      id: r.id,
      width: r.width ?? 224,
      height: r.height ?? (r.id === model.root ? 104 : 118),
      order: i
    }));
    const edges = model.roles.filter(r => r.id !== model.root).map(r => ({ from: r.manager, to: r.id }));
    const result = engine.layoutLayered({ nodes, edges }, {
      width: options.width ?? 1160,
      maxColumns: options.maxColumns ?? 4,
      nodeGap: options.nodeGap ?? 36,
      layerGap: options.layerGap ?? 68,
      padding: options.padding ?? 28,
      sweeps: options.sweeps ?? 24
    });
    return { ...result, groups: [], compact: false };
  }

  function layout(model, options = {}) {
    const { roles, children } = hierarchy(model);
    if (options.layered) return layeredLayout(model, options);
    const team = roles.get(model.expandedTeam);
    if (!team || team.manager !== model.root || children.get(team.id).length !== 2 || model.roles.some(r => r.id !== model.root && r.manager !== model.root && r.manager !== team.id)) {
      return layeredLayout(model, options);
    }
    const staff = children.get(team.id).map(id => roles.get(id));
    const direct = model.roles.filter(r => r.manager === model.root && r.id !== team.id);
    const boxes = new Map();
    boxes.set(model.root, { id: model.root, x: 450, y: 32, width: 224, height: 104 });
    boxes.set(team.id, { id: team.id, x: 90, y: 224, width: 224, height: 118 });
    staff.forEach((r, i) => boxes.set(r.id, { id: r.id, x: 28 + i * 186, y: 420, width: 160, height: 118 }));
    direct.forEach((r, i) => boxes.set(r.id, { id: r.id, x: 440 + i % 3 * 230, y: 224 + Math.floor(i / 3) * 196, width: 200, height: 118, column: i % 3 }));
    const root = boxes.get(model.root), teamBox = boxes.get(team.id), center = b => b.x + b.width / 2;
    const edges = [{ from: model.root, to: team.id, points: [{ x: center(root), y: root.y + root.height }, { x: center(root), y: 178 }, { x: center(teamBox), y: 178 }, { x: center(teamBox), y: teamBox.y }] }];
    for (const r of direct) {
      const b = boxes.get(r.id), gutter = 420 + b.column * 230;
      edges.push({ from: model.root, to: r.id, points: [{ x: center(root), y: root.y + root.height }, { x: center(root), y: 178 }, { x: gutter, y: 178 }, { x: gutter, y: b.y - 24 }, { x: center(b), y: b.y - 24 }, { x: center(b), y: b.y }] });
    }
    for (const r of staff) {
      const b = boxes.get(r.id);
      edges.push({ from: team.id, to: r.id, points: [{ x: center(teamBox), y: teamBox.y + teamBox.height }, { x: center(teamBox), y: 374 }, { x: center(b), y: 374 }, { x: center(b), y: b.y }] });
    }
    return finish([...boxes.values()], edges, [{ id: team.id, x: 16, y: 204, width: 370, height: 414 }], true);
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

  function handoffRoute(graph, edge) {
    const from = graph.nodes.find(n => n.id === edge.from), to = graph.nodes.find(n => n.id === edge.to);
    if (!from || !to || from === to) return null;
    function ports(n) {
      return [
        [{ x: n.x, y: n.y + n.height / 2 }, { x: n.x - 12, y: n.y + n.height / 2 }, 0],
        [{ x: n.x + n.width, y: n.y + n.height / 2 }, { x: n.x + n.width + 12, y: n.y + n.height / 2 }, 0],
        [{ x: n.x + n.width / 2, y: n.y }, { x: n.x + n.width / 2, y: n.y - 12 }, 1],
        [{ x: n.x + n.width / 2, y: n.y + n.height }, { x: n.x + n.width / 2, y: n.y + n.height + 12 }, 1]
      ].filter(([a, b]) => !graph.nodes.some(n => hits(a, b, n)));
    }
    const starts = ports(from), ends = ports(to);
    const xs = [...new Set([...graph.nodes.flatMap(n => [n.x - 12, n.x + n.width + 12]), ...starts.concat(ends).map(p => p[1].x)])].sort((a, b) => a - b);
    const ys = [...new Set([...graph.nodes.flatMap(n => [n.y - 12, n.y + n.height + 12]), ...starts.concat(ends).map(p => p[1].y)])].sort((a, b) => a - b);
    const key = (x, y, axis) => (y * xs.length + x) * 2 + axis;
    const best = new Map(), queue = new Heap();
    for (const port of starts) {
      const x = xs.indexOf(port[1].x), y = ys.indexOf(port[1].y), id = key(x, y, port[2]);
      const state = { x, y, axis: port[2], cost: 12, previous: null, port, id };
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
        const cost = state.cost + 12 + (state.axis === port[2] ? 0 : 24);
        if (cost < total) { winner = state; lastPort = port; total = cost; }
      }
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const x = state.x + dx, y = state.y + dy, axis = dx ? 0 : 1;
        if (x < 0 || x >= xs.length || y < 0 || y >= ys.length) continue;
        const b = { x: xs[x], y: ys[y] };
        if (graph.nodes.some(n => hits(a, b, n))) continue;
        const id = key(x, y, axis), cost = state.cost + Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + (state.axis === axis ? 0 : 24);
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
    const points = [];
    for (const p of path) {
      const a = points.at(-2), b = points.at(-1);
      if (b && p.x === b.x && p.y === b.y) continue;
      if (a && ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y))) points[points.length - 1] = p;
      else points.push(p);
    }
    return { ...edge, points };
  }

  function workerBranch(model, id) {
    const owner = model.roles.find(r => r.id === id);
    if (!owner) return null;
    const roles = [{ ...owner, manager: null }], visited = new Set([id]);
    function append(parent) {
      for (const worker of model.workers || []) if (worker.manager === parent && !visited.has(worker.id)) {
        visited.add(worker.id);
        roles.push(worker);
        append(worker.id);
      }
    }
    append(id);
    return roles.length > 1 ? { root: id, roles } : null;
  }

  function mount(host, options = {}) {
    if (!host || host.ordine) throw new Error('Order view requires an unused host');
    const doc = host.ownerDocument, win = doc.defaultView, ns = 'http://www.w3.org/2000/svg';
    let model = null, graph = null, selected = null, view = 'map', query = '', expanded = false, showHandoffs = true, driftOnly = false;
    let zoom = 1, pan = { x: 0, y: 0 }, frame = 0, destroyed = false;
    const listeners = [];
    function el(tag, text, cls) {
      const n = doc.createElement(tag);
      if (text !== undefined) n.textContent = text;
      if (cls) n.className = cls;
      return n;
    }
    function svg(tag, attrs) {
      const n = doc.createElementNS(ns, tag);
      for (const [key, value] of Object.entries(attrs)) n.setAttribute(key, value);
      return n;
    }
    function listen(target, name, fn, opts) {
      target.addEventListener(name, fn, opts);
      listeners.push(() => target.removeEventListener(name, fn, opts));
    }
    function button(text, action, cls = 'ordine-button') {
      const n = el('button', text, cls);
      n.type = 'button';
      n.onclick = action;
      return n;
    }
    const bar = el('div', undefined, 'ordine-bar'), tabs = el('div', undefined, 'ordine-tabs');
    tabs.setAttribute('role', 'group');
    tabs.setAttribute('aria-label', 'Order views');
    const mapTab = button('Command map', () => setView('map')), ownerTab = button('Who owns what', () => setView('owners'));
    tabs.append(mapTab, ownerTab);
    const tools = el('div', undefined, 'ordine-tools'), searchLabel = el('label', 'Find an owner', 'ordine-find');
    const search = el('input');
    search.type = 'search';
    search.placeholder = 'Owner or capability';
    searchLabel.append(search);
    const handoffs = button('Declared handoffs', () => { showHandoffs = !showHandoffs; renderLines(); syncTools(); });
    const driftToggle = button('Drift only', () => { driftOnly = !driftOnly; renderCards(); syncTools(); });
    const zoomLabel = el('output', '100%', 'ordine-zoom');
    const less = button('−', () => zoomAt(zoom / 1.15)), more = button('+', () => zoomAt(zoom * 1.15));
    less.setAttribute('aria-label', 'Zoom out');
    more.setAttribute('aria-label', 'Zoom in');
    tools.append(driftToggle, handoffs, less, zoomLabel, more, button('Fit', fit));
    bar.append(tabs, searchLabel, tools);
    const status = el('p', 'Waiting for authorized order', 'ordine-status');
    status.setAttribute('role', 'status');
    const body = el('div', undefined, 'ordine-body'), stage = el('div', undefined, 'ordine-stage');
    const viewport = el('div', undefined, 'ordine-viewport'), scene = el('div', undefined, 'ordine-scene');
    viewport.tabIndex = 0;
    viewport.setAttribute('aria-label', 'Command graph. Drag to pan. Use buttons or pinch to zoom.');
    const groups = el('div'), lines = svg('svg', { class: 'ordine-lines', 'aria-hidden': 'true' }), cards = el('div');
    scene.append(groups, lines, cards);
    viewport.append(scene);
    const legend = el('div', undefined, 'ordine-legend');
    legend.append(el('span', '↓ Reports to', 'ordine-legend-command'), el('span', '⇢ UI handoff', 'ordine-legend-ui'), el('span', '⇢ Deployment handoff', 'ordine-legend-deployment'), el('span', 'Declared rules, not message traffic or access grants'));
    const owners = el('div', undefined, 'ordine-owners'), branch = el('section', undefined, 'ordine-branch');
    const details = el('aside', undefined, 'ordine-details');
    details.setAttribute('aria-label', 'Selected owner');
    stage.append(viewport, owners, legend, branch);
    body.append(stage, details);
    host.classList.add('ordine');
    host.replaceChildren(bar, status, body);
    body.hidden = true;

    function roles() { return new Map(model.roles.map(r => [r.id, r])); }
    function driftSummary(d) {
      if (!d) return '';
      if (d.state !== 'ok') return ' · drift check unavailable: ' + (d.reason || 'no answer');
      let differ = 0, unseated = 0, errors = 0;
      for (const id of Object.keys(d.roles)) {
        const r = d.roles[id];
        if (r.unseated) unseated++;
        if (r.status === 'error') errors++;
        else if (r.status !== 'ok') differ++;
      }
      const out = d.outside.length;
      return ' · drift: ' + differ + ' differ, ' + unseated + ' unseated, ' + errors + ' errors' + (out ? ', ' + out + ' outside the order' : '') + (d.generatedAt ? ' (checked ' + d.generatedAt + ')' : '');
    }
    function driftOf(id) { return model && model.drift && model.drift.state === 'ok' ? model.drift.roles[id] || null : null; }
    function driftTag(dr) {
      if (!model || !model.drift) return null;
      if (model.drift.state !== 'ok') return null;
      if (!dr) return null;
      if (dr.unseated) return { text: 'unseated', tone: 'warn' };
      if (dr.status === 'error') return { text: 'check error', tone: 'fail' };
      if (dr.status === 'drift') return { text: 'drift ' + dr.changes.length, tone: 'warn' };
      if (dr.status === 'missing') return { text: 'missing', tone: 'fail' };
      if (dr.status === 'extra') return { text: 'extra', tone: 'warn' };
      return null;
    }
    function driftSection(id) {
      const d = model && model.drift;
      if (!d) return;
      const n = el('section');
      n.append(el('h3', 'Drift from outfit'));
      if (d.state !== 'ok') { n.append(el('p', 'The drift check did not run: ' + (d.reason || 'unavailable') + '. This is not a clean result.')); details.append(n); return; }
      const dr = d.roles[id];
      if (!dr || (dr.status === 'ok' && !dr.unseated)) { n.append(el('p', 'In line with its outfit at ' + (d.generatedAt || 'the last check') + '.')); details.append(n); return; }
      if (dr.unseated) n.append(el('p', 'No holder is seated in this role.'));
      if (dr.status === 'error') n.append(el('p', 'Check error: ' + (dr.error || 'unknown')));
      if (dr.changes.length) {
        const list = el('ul', undefined, 'ordine-drift-list');
        for (const c of dr.changes) {
          const li = el('li');
          li.append(el('code', c.key, 'ordine-drift-key'), el('span', 'now', 'ordine-drift-label'), el('code', c.live, 'ordine-drift-live'), el('span', 'should be', 'ordine-drift-label'), el('code', c.want, 'ordine-drift-want'));
          list.append(li);
        }
        n.append(list);
      }
      details.append(n);
    }
    function matches(role) {
      const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
      const text = [role.title, role.summary, ...(role.owns || [])].filter(Boolean).join(' ').toLocaleLowerCase();
      return words.every(w => text.includes(w));
    }
    function syncTools() {
      mapTab.setAttribute('aria-pressed', String(view === 'map'));
      ownerTab.setAttribute('aria-pressed', String(view === 'owners'));
      handoffs.setAttribute('aria-pressed', String(showHandoffs));
      handoffs.disabled = !selected;
      driftToggle.setAttribute('aria-pressed', String(driftOnly));
      driftToggle.hidden = !(model && model.drift && model.drift.state === 'ok');
      tools.hidden = view !== 'map';
    }
    function applyCamera() {
      scene.style.transform = `translate(${pan.x}px,${pan.y}px) scale(${zoom})`;
      zoomLabel.textContent = Math.round(zoom * 100) + '%';
    }
    function fit() {
      if (!graph || view !== 'map' || !viewport.clientWidth || body.hidden) return;
      zoom = Math.max(.3, Math.min(1, (viewport.clientWidth - 32) / graph.width, (viewport.clientHeight - 32) / graph.height));
      pan = { x: (viewport.clientWidth - graph.width * zoom) / 2, y: Math.max(16, (viewport.clientHeight - graph.height * zoom) / 2) };
      applyCamera();
    }
    function scheduleFit() {
      if (frame) win.cancelAnimationFrame(frame);
      frame = win.requestAnimationFrame(() => { frame = 0; fit(); });
    }
    function zoomAt(value, x = viewport.clientWidth / 2, y = viewport.clientHeight / 2) {
      const old = zoom;
      zoom = Math.max(.2, Math.min(2, value));
      pan = { x: x - (x - pan.x) * zoom / old, y: y - (y - pan.y) * zoom / old };
      applyCamera();
    }
    function setView(next) {
      view = next;
      viewport.hidden = view !== 'map';
      legend.hidden = view !== 'map';
      owners.hidden = view !== 'owners';
      syncTools();
      scheduleFit();
    }
    function polyline(points) { return points.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' '); }
    function tip(points, cls) {
      const a = points.at(-2), b = points.at(-1), angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
      return svg('path', { d: 'M-8,-4L0,0L-8,4', class: cls, transform: `translate(${b.x},${b.y}) rotate(${angle})` });
    }
    function renderLines() {
      if (!graph) return;
      lines.replaceChildren();
      for (const s of graph.segments) lines.append(svg('path', { d: `M${s.x1},${s.y1}L${s.x2},${s.y2}`, class: 'ordine-command' }));
      for (const p of graph.junctions) lines.append(svg('circle', { cx: p.x, cy: p.y, r: 2.1, class: 'ordine-junction' }));
      for (const e of graph.edges) lines.append(tip(e.points, 'ordine-command'));
      if (!selected) return;
      const active = graph.edges.filter(e => e.from === selected || e.to === selected);
      for (const s of mergeSegments(active)) lines.append(svg('path', { d: `M${s.x1},${s.y1}L${s.x2},${s.y2}`, class: 'ordine-active' }));
      for (const e of active) lines.append(tip(e.points, 'ordine-active'));
      if (!showHandoffs) return;
      for (const edge of model.communications || []) if (edge.from === selected) {
        if (edge.kind !== 'ui' && edge.kind !== 'deployment') continue;
        const route = handoffRoute(graph, edge);
        if (!route) continue;
        const cls = 'ordine-handoff ordine-' + edge.kind;
        const path = svg('path', { d: polyline(route.points), class: cls, 'data-from': edge.from, 'data-to': edge.to, 'data-kind': edge.kind });
        const title = svg('title', {});
        title.textContent = edge.label || (edge.kind === 'ui' ? 'UI handoff' : 'Deployment handoff');
        path.append(title);
        lines.append(path, tip(route.points, cls));
      }
    }
    function countLabel(id) {
      const mine = (model.workers || []).filter(w => w.manager === id);
      const lanes = mine.filter(w => w.kind === 'Lane').length, forks = mine.length - lanes;
      return [lanes ? lanes + (lanes === 1 ? ' lane' : ' lanes') : '', forks ? forks + (forks === 1 ? ' visible fork' : ' visible forks') : ''].filter(Boolean).join(' · ');
    }
    function card(role, box, action, root = model.root) {
      const n = button(undefined, action, 'ordine-node');
      n.dataset.role = role.id;
      n.setAttribute('aria-pressed', String(role.id === selected));
      n.classList.toggle('ordine-root', role.id === root);
      n.classList.toggle('ordine-small', box.width < 200);
      n.classList.toggle('ordine-match', !!query && matches(role));
      const dr = driftOf(role.id);
      n.classList.toggle('ordine-quiet', driftOnly && !(dr && dr.status !== 'ok'));
      Object.assign(n.style, { left: box.x + 'px', top: box.y + 'px', width: box.width + 'px', height: box.height + 'px' });
      n.append(el('strong', role.title, 'ordine-name'));
      const parent = roles().get(role.manager);
      n.append(el('span', parent ? 'Reports to ' + parent.title : (role.kind || 'Visible root'), 'ordine-rank'));
      const tag = driftTag(dr);
      if (tag) n.append(el('span', tag.text, 'ordine-drift ordine-drift-' + tag.tone));
      if (role.summary) n.append(el('span', role.summary, 'ordine-summary'));
      const count = (model.workers || []).filter(w => w.manager === role.id).length;
      if (count) n.append(el('span', countLabel(role.id), 'ordine-count'));
      return n;
    }
    function renderCards() {
      cards.replaceChildren();
      const byId = roles();
      for (const box of graph.nodes) cards.append(card(byId.get(box.id), box, () => select(box.id)));
    }
    function renderOwners() {
      owners.replaceChildren();
      for (const role of model.roles.filter(matches)) {
        const n = button(undefined, () => select(role.id), 'ordine-owner');
        n.setAttribute('aria-pressed', String(role.id === selected));
        n.append(el('strong', role.title));
        if (role.summary) n.append(el('span', role.summary));
        owners.append(n);
      }
      if (!owners.childElementCount) owners.append(el('p', 'No visible owner matches.'));
    }
    function section(title, value) {
      const n = el('section');
      n.append(el('h3', title));
      if (Array.isArray(value)) {
        const list = el('ul');
        for (const item of value) list.append(el('li', item));
        n.append(list);
      } else n.append(el('p', value));
      details.append(n);
    }
    function renderDetails() {
      details.replaceChildren();
      details.hidden = !selected;
      body.classList.toggle('ordine-selected', !!selected);
      if (!selected) return;
      const role = roles().get(selected);
      details.append(button('Close details', () => { select(null); cards.querySelector('[data-role]')?.focus(); }), el('h2', role.title));
      const parent = roles().get(role.manager);
      if (parent) details.append(button('Reports to ' + parent.title, () => select(parent.id)));
      if (role.owns?.length) section('Owns', role.owns);
      if (role.boundary) section('Scope boundary', role.boundary);
      if (role.charter) section('Charter', role.charter);
      if (role.lifecycle) section('Lifecycle', role.lifecycle);
      driftSection(role.id);
      if (role.occupant) section('Visible occupant', [role.occupant.handle, role.occupant.mantra].filter(Boolean));
      const edges = (model.communications || []).filter(e => e.from === selected || e.to === selected);
      if (edges.length) section('Declared handoffs', edges.map(e => {
        const from = roles().get(e.from), to = roles().get(e.to);
        return `${from.title} → ${to.title}: ${e.label || (e.kind === 'ui' ? 'UI handoff' : 'Deployment handoff')}`;
      }));
      const workerTree = workerBranch(model, selected);
      if (workerTree) {
        const b = button(expanded ? 'Collapse lanes and forks' : 'Expand lanes and forks', () => { expanded = !expanded; renderDetails(); renderBranch(); });
        b.setAttribute('aria-expanded', String(expanded));
        details.append(b);
      }
      details.append(el('p', role.id, 'ordine-id'));
    }
    function renderBranch() {
      branch.replaceChildren();
      const data = expanded && selected ? workerBranch(model, selected) : null;
      branch.hidden = !data;
      if (!data) return;
      const tree = layeredLayout(data, { width: 880, maxColumns: 3, nodeGap: 30, layerGap: 60, padding: 24 }), byId = new Map(data.roles.map(r => [r.id, r]));
      branch.append(el('h3', 'Lanes and forks: ' + byId.get(selected).title), el('p', 'Lanes from the role form and visible live forks. Neither adds a standing position.'));
      const scroll = el('div', undefined, 'ordine-branch-scroll'), content = el('div', undefined, 'ordine-branch-scene');
      Object.assign(content.style, { width: tree.width + 'px', height: tree.height + 'px' });
      const wires = svg('svg', { width: tree.width, height: tree.height, class: 'ordine-lines', 'aria-hidden': 'true' });
      for (const s of tree.segments) wires.append(svg('path', { d: `M${s.x1},${s.y1}L${s.x2},${s.y2}`, class: 'ordine-command' }));
      for (const edge of tree.edges) wires.append(tip(edge.points, 'ordine-command'));
      content.append(wires);
      for (const box of tree.nodes) {
        const role = byId.get(box.id), n = el('article', undefined, 'ordine-node');
        Object.assign(n.style, { left: box.x + 'px', top: box.y + 'px', width: box.width + 'px', height: box.height + 'px' });
        n.append(el('strong', role.title, 'ordine-name'));
        const parent = byId.get(role.manager);
        if (parent) n.append(el('span', 'Reports to ' + parent.title, 'ordine-rank'));
        if (role.summary) n.append(el('span', role.summary, 'ordine-summary'));
        if (role.lifecycle) n.append(el('span', role.lifecycle, 'ordine-count'));
        content.append(n);
      }
      scroll.append(content);
      branch.append(scroll);
    }
    function select(id) {
      expanded = Boolean(id) && id !== selected && Boolean(workerBranch(model, id));
      selected = id;
      renderCards(); renderLines(); renderOwners(); renderDetails(); renderBranch(); syncTools(); scheduleFit();
      if (options.onSelect) options.onSelect(id);
    }
    function clear() {
      model = null; graph = null; selected = null; expanded = false;
      body.hidden = true;
      cards.replaceChildren(); lines.replaceChildren(); groups.replaceChildren(); owners.replaceChildren(); details.replaceChildren(); branch.replaceChildren();
      query = ''; search.value = ''; search.disabled = true;
      bar.hidden = true;
    }
    function update(state) {
      if (destroyed) throw new Error('Detached order view');
      if (state.status !== 'current') {
        clear();
        const messages = { loading: 'Waiting for authorized order', resyncing: 'Resyncing authorized order', stale: 'Order unavailable: waiting for a current projection', unavailable: 'Order unavailable', empty: 'No owned orders', denied: 'Order unavailable', signedout: 'Sign in to view your order' };
        status.textContent = messages[state.status] || 'Order unavailable';
        return;
      }
      let next;
      try {
        next = layout(state.model);
        const ids = new Set(state.model.roles.map(r => r.id));
        if ((state.model.communications || []).some(e => !ids.has(e.from) || !ids.has(e.to) || !['ui', 'deployment'].includes(e.kind))) throw new Error('Invalid public handoff');
        const workers = state.model.workers || [], workerIds = new Set(workers.map(w => w.id));
        if (workerIds.size !== workers.length || workers.some(w => ids.has(w.id) || (!ids.has(w.manager) && !workerIds.has(w.manager)))) throw new Error('Invalid visible worker');
        const combined = { ...state.model, roles: state.model.roles.concat(workers) };
        hierarchy(combined);
      } catch (_) { clear(); status.textContent = 'Order unavailable: invalid public projection'; return; }
      model = state.model; graph = next;
      if (!model.roles.some(r => r.id === selected)) { selected = null; expanded = false; }
      body.hidden = false; bar.hidden = false; search.disabled = false;
      status.textContent = model.roles.length + ' visible positions' + (state.observedAt ? ' · observed ' + state.observedAt : '') + driftSummary(model.drift);
      scene.style.width = graph.width + 'px'; scene.style.height = graph.height + 'px';
      lines.setAttribute('width', graph.width); lines.setAttribute('height', graph.height); lines.setAttribute('viewBox', `0 0 ${graph.width} ${graph.height}`);
      groups.replaceChildren();
      for (const group of graph.groups) {
        const n = el('div', undefined, 'ordine-group');
        Object.assign(n.style, { left: group.x + 'px', top: group.y + 'px', width: group.width + 'px', height: group.height + 'px' });
        groups.append(n);
      }
      renderCards(); renderLines(); renderOwners(); renderDetails(); renderBranch(); setView(view);
    }
    listen(search, 'input', () => { query = search.value; renderCards(); renderOwners(); });
    listen(host, 'keydown', e => { if (e.key === 'Escape' && selected) { e.stopPropagation(); select(null); } });
    const pointers = new Map();
    let drag = null, pinch = null;
    listen(viewport, 'pointerdown', e => {
      if (e.target.closest('.ordine-node') || (e.pointerType === 'mouse' && e.button !== 0)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      viewport.setPointerCapture(e.pointerId);
      if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom };
        drag = null;
      }
    });
    listen(viewport, 'pointermove', e => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2 && pinch?.distance) {
        const [a, b] = [...pointers.values()], r = viewport.getBoundingClientRect();
        zoomAt(pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y) / pinch.distance, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      } else if (drag) {
        pan = { x: drag.px + e.clientX - drag.x, y: drag.py + e.clientY - drag.y };
        applyCamera();
      }
    });
    function endPointer(e) { pointers.delete(e.pointerId); drag = null; pinch = null; }
    listen(viewport, 'pointerup', endPointer);
    listen(viewport, 'pointercancel', endPointer);
    listen(viewport, 'lostpointercapture', endPointer);
    listen(viewport, 'wheel', e => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const r = viewport.getBoundingClientRect();
      zoomAt(zoom * Math.exp(-e.deltaY * .004), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    const observer = new win.ResizeObserver(scheduleFit);
    observer.observe(viewport);
    view = win.matchMedia('(max-width:680px)').matches ? 'owners' : 'map';
    const api = {
      update,
      detach() {
        destroyed = true;
        observer.disconnect();
        if (frame) win.cancelAnimationFrame(frame);
        listeners.forEach(remove => remove());
        clear(); host.replaceChildren(); host.classList.remove('ordine'); delete host.ordine;
      }
    };
    host.ordine = api;
    update({ status: 'loading' });
    return api;
  }

  function fromForms(snapshot, options = {}) {
    if (!engine) throw new Error('Missing strati layered engine');
    return engine.fromForms(snapshot, options);
  }

  function sameForm(a, b) {
    const x = String(a || '').replace(/^@/, ''), y = String(b || '').replace(/^@/, '');
    if (!x || !y) return false;
    const n = Math.min(x.length, y.length);
    return n >= 8 && x.slice(0, n) === y.slice(0, n);
  }

  function driftFor(model, body) {
    if (!body || typeof body !== 'object' || !Array.isArray(body.roles)) return { state: 'failed', reason: 'unreadable answer', roles: {}, outside: [] };
    const out = { state: 'ok', generatedAt: typeof body.generated_at === 'string' ? body.generated_at : '', source: typeof body.source === 'string' ? body.source : '', roles: {}, outside: [] };
    const known = (model.roles || []).map(r => ({ id: r.id, alias: (r.aliases || []).map(a => a.id) }));
    for (const r of body.roles) {
      if (!r || typeof r.id !== 'string') continue;
      const status = ['ok', 'drift', 'error', 'missing', 'extra'].includes(r.status) ? r.status : 'error';
      const changes = Array.isArray(r.changes) ? r.changes.filter(c => c && typeof c.key === 'string').map(c => ({ key: c.key, live: typeof c.live === 'string' ? c.live : JSON.stringify(c.live === undefined ? null : c.live), want: typeof c.want === 'string' ? c.want : JSON.stringify(c.want === undefined ? null : c.want) })) : [];
      const entry = { status, changes, unseated: r.unseated === true, error: typeof r.error === 'string' ? r.error : '', role: typeof r.role === 'string' ? r.role : '' };
      const hit = known.find(k => sameForm(k.id, r.id) || k.alias.some(a => sameForm(a, r.id)));
      if (!hit) { out.outside.push({ id: r.id, ...entry }); continue; }
      const prior = out.roles[hit.id];
      if (!prior) { out.roles[hit.id] = entry; continue; }
      const rank = ['ok', 'extra', 'missing', 'drift', 'error'];
      prior.changes = prior.changes.concat(entry.changes);
      if (rank.indexOf(entry.status) > rank.indexOf(prior.status)) prior.status = entry.status;
      prior.unseated = prior.unseated || entry.unseated;
      prior.error = prior.error || entry.error;
    }
    return out;
  }

  const REFUSALS = { 401: 'signedout', 403: 'denied', 503: 'unavailable' };

  function feed(view, options = {}) {
    if (!view || typeof view.update !== 'function') throw new Error('Order feed requires a mounted view');
    const fetchFn = options.fetch || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    if (!fetchFn) throw new Error('Order feed requires fetch');
    const url = options.url || 'hierarchy';
    const driftUrl = options.driftUrl === undefined ? '' : options.driftUrl;
    const project = { uiOwner: options.uiOwner, deploymentOwner: options.deploymentOwner, includeInactive: Boolean(options.includeInactive), communications: options.communications };
    let generation = 0, timer = 0, closed = false, orders = [], selected = options.root || '', last = 'loading', driftBody = null, driftReason = '';
    function show(state) {
      last = state.status;
      view.update(state);
      if (options.onState) options.onState(state.status, orders.map(o => o.root));
      return state.status;
    }
    function current() {
      if (!orders.length) return null;
      const chosen = orders.find(o => o.root === selected);
      if (chosen) return chosen;
      const standing = o => o.forms.filter(f => f && f.target_aria && f.state && (f.state.charter || f.state['role-name'])).length;
      return orders.reduce((best, o) => standing(o) > standing(best) || (standing(o) === standing(best) && o.forms.length > best.forms.length) ? o : best, orders[0]);
    }
    function render(observedAt) {
      const order = current();
      if (!order) return show({ status: 'empty' });
      let model;
      try { model = fromForms(order, { ...project, root: order.root }); } catch (_) { return show({ status: 'unavailable' }); }
      if (!model.roles.length) return show({ status: 'empty' });
      if (driftUrl) model.drift = driftBody ? driftFor(model, driftBody) : { state: 'failed', reason: driftReason || 'no answer', roles: {}, outside: [] };
      return show({ status: 'current', model, observedAt });
    }
    let observed = '';
    async function refresh(quiet) {
      if (closed) return 'closed';
      const mine = ++generation;
      if (!(quiet === true && last === 'current')) {
        orders = [];
        show({ status: last === 'loading' ? 'loading' : 'resyncing' });
      }
      let res, body;
      try {
        res = await fetchFn(url, { headers: options.headers || {}, credentials: 'same-origin', cache: 'no-store' });
      } catch (_) {
        return mine === generation && !closed ? show({ status: 'unavailable' }) : 'superseded';
      }
      if (mine !== generation || closed) return 'superseded';
      if (res.status !== 200) return show({ status: REFUSALS[res.status] || 'unavailable' });
      try { body = await res.json(); } catch (_) { body = null; }
      if (mine !== generation || closed) return 'superseded';
      if (!body || typeof body !== 'object') return show({ status: 'unavailable' });
      if (body.status === 'empty') return show({ status: 'empty' });
      if (body.status !== 'current' || !Array.isArray(body.orders)) return show({ status: 'unavailable' });
      if (body.orders.some(o => !o || typeof o.root !== 'string' || !Array.isArray(o.forms))) return show({ status: 'unavailable' });
      orders = body.orders;
      if (driftUrl) {
        driftBody = null;
        driftReason = '';
        try {
          const d = await fetchFn(driftUrl, { headers: options.headers || {}, credentials: 'same-origin', cache: 'no-store' });
          if (mine !== generation || closed) return 'superseded';
          if (d.status !== 200) driftReason = 'HTTP ' + d.status;
          else driftBody = await d.json();
        } catch (_) { driftReason = 'no answer'; }
        if (mine !== generation || closed) return 'superseded';
      }
      observed = typeof body.observed_at === 'string' ? body.observed_at : '';
      return render(observed);
    }
    function select(root) {
      selected = root || '';
      return orders.length ? render(observed) : last;
    }
    function withdraw() {
      generation++;
      orders = [];
      return show({ status: 'signedout' });
    }
    function close() {
      closed = true;
      generation++;
      orders = [];
      if (timer) clearInterval(timer);
      timer = 0;
    }
    if (options.interval > 0) timer = setInterval(() => { refresh(true); }, options.interval);
    if (options.immediate !== false) refresh();
    return { refresh: () => refresh(false), poll: () => refresh(true), select, withdraw, close, roots: () => orders.map(o => o.root), status: () => last };
  }

  return { layout, layeredLayout, treeLayout, mergeSegments, junctions, handoffRoute, workerBranch, fromForms, driftFor, feed, mount };
}());
if (typeof self !== 'undefined') {
  self.ordine = ordine;
  self.zanni = self.zanni || {};
  self.zanni.ordine = ordine;
}
if (typeof module === 'object' && module.exports) module.exports = ordine;
