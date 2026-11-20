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


  const SHEET = { width: 1124, axis: 562, bus: 178, top: 224, pitch: 230, row: 196, columns: 3 };
  const STAFF = { width: 160, height: 118, lead: 32, drop: 46, columns: [28, 214] };
  const ROWS = { rail: 32, x: 50, width: 324, gap: 6, lane: 34, fork: 52 };

  function members(model, id) {
    const { roles, children } = hierarchy(model), owner = roles.get(id);
    if (!owner) return { staff: [], lanes: [], forks: [], resting: [] };
    const staff = [];
    if (id !== model.root) (function walk(parent) { for (const child of children.get(parent)) { staff.push(roles.get(child)); walk(child); } }(id));
    const lanes = [];
    for (const role of [owner, ...staff]) for (const lane of role.lanes || []) {
      if (!lane || typeof lane.name !== 'string' || !lane.name) continue;
      const key = role.id + '#lane:' + lane.name;
      if (!lanes.some(l => l.id === key)) lanes.push({ id: key, owner: role.id, name: lane.name, handle: typeof lane.handle === 'string' ? lane.handle : '' });
    }
    const forks = [], resting = [], seen = new Set();
    function gather(parent) {
      for (const worker of model.workers || []) if (worker.manager === parent && !seen.has(worker.id)) {
        seen.add(worker.id);
        (String(worker.lifecycle || '').toLowerCase() === 'dormant' ? resting : forks).push(worker);
        gather(worker.id);
      }
    }
    for (const role of [owner, ...staff]) gather(role.id);
    return { staff, lanes, forks, resting };
  }

  function layout(model, options = {}) {
    const { children } = hierarchy(model), leads = children.get(model.root);
    const wanted = options.expanded === undefined ? model.expandedTeam : options.expanded;
    const expanded = leads.includes(wanted) ? wanted : null;
    const nodes = [{ id: model.root, kind: 'root', x: 450, y: 32, width: 224, height: 104 }], edges = [], groups = [], labels = [];
    const axis = SHEET.axis, foot = 136, grid = leads.filter(id => id !== expanded);
    const columns = expanded ? SHEET.columns : Math.max(1, Math.min(SHEET.columns, grid.length));
    const left = expanded ? 440 : axis - (columns * 200 + (columns - 1) * 30) / 2;
    grid.forEach((id, i) => {
      const column = i % columns, box = { id, kind: 'lead', x: left + column * SHEET.pitch, y: SHEET.top + Math.floor(i / columns) * SHEET.row, width: 200, height: 118 };
      const gutter = box.x - 20, centre = box.x + 100;
      nodes.push(box);
      edges.push({ from: model.root, to: id, points: [{ x: axis, y: foot }, { x: axis, y: SHEET.bus }, { x: gutter, y: SHEET.bus }, { x: gutter, y: box.y - 24 }, { x: centre, y: box.y - 24 }, { x: centre, y: box.y }] });
    });
    if (expanded) {
      const lead = { id: expanded, kind: 'lead', x: 90, y: SHEET.top, width: 224, height: 118 }, trunk = 202, base = lead.y + lead.height;
      nodes.push(lead);
      edges.push({ from: model.root, to: expanded, points: [{ x: axis, y: foot }, { x: axis, y: SHEET.bus }, { x: trunk, y: SHEET.bus }, { x: trunk, y: lead.y }] });
      const inside = members(model, expanded);
      let cursor = base;
      inside.staff.forEach((role, i) => {
        const column = i % 2;
        if (!column) cursor += STAFF.lead;
        const bus = cursor, box = { id: role.id, kind: 'staff', x: STAFF.columns[column], y: bus + STAFF.drop, width: STAFF.width, height: STAFF.height };
        nodes.push(box);
        edges.push({ from: expanded, to: role.id, points: [{ x: trunk, y: base }, { x: trunk, y: bus }, { x: box.x + 80, y: bus }, { x: box.x + 80, y: box.y }] });
        if (column || i === inside.staff.length - 1) cursor = box.y + box.height;
      });
      const workers = new Map((model.workers || []).map(w => [w.id, w]));
      function depth(item) {
        let n = 0;
        for (let w = workers.get(item.manager); w && n < 3; w = workers.get(w.manager)) n++;
        return n;
      }
      let turn = null;
      function rows(kind, items, text) {
        if (!items.length) return;
        if (turn === null) { turn = cursor + 18; cursor += 14; }
        labels.push({ kind, x: ROWS.x, y: cursor + 16, text });
        cursor += 40;
        items.forEach((item, i) => {
          if (i) cursor += ROWS.gap;
          const inset = kind === 'fork' ? depth(item) * 16 : 0, box = { id: item.id, kind, x: ROWS.x + inset, y: cursor, width: ROWS.width - inset, height: ROWS[kind] }, mid = box.y + box.height / 2;
          nodes.push(box);
          edges.push({ from: expanded, to: item.id, points: [{ x: trunk, y: base }, { x: trunk, y: turn }, { x: ROWS.rail, y: turn }, { x: ROWS.rail, y: mid }, { x: box.x, y: mid }] });
          cursor = box.y + box.height;
        });
      }
      rows('lane', inside.lanes, 'Lanes');
      rows('fork', inside.forks, 'Live forks');
      groups.push({ id: expanded, x: 16, y: 204, width: 370, height: cursor + 80 - 204, caption: { x: 34, y: cursor + 18, width: 334 }, staff: inside.staff.length, lanes: inside.lanes.length, forks: inside.forks.length });
    }
    const segments = mergeSegments(edges);
    const height = Math.max(...nodes.map(b => b.y + b.height + 80), ...groups.map(g => g.y + g.height + 28));
    return { width: SHEET.width, height, nodes, edges, segments, junctions: junctions(segments), groups, labels, expanded, compact: true };
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


  function clock(value) {
    if (typeof value === 'string') return value;
    if (typeof value !== 'number' || !isFinite(value)) return '';
    const d = new Date(value), two = n => String(n).padStart(2, '0');
    return two(d.getHours()) + ':' + two(d.getMinutes()) + ':' + two(d.getSeconds());
  }

  function charterBlocks(text) {
    const blocks = [];
    for (const raw of String(text || '').split('\n')) {
      const line = raw.trim(), last = blocks.at(-1);
      if (!line) { blocks.push(null); continue; }
      const heading = /^\*\*([^*]+?):?\*\*:?$/.exec(line) || /^#+\s+(.+)$/.exec(line);
      if (heading) blocks.push({ kind: 'heading', text: heading[1] });
      else if (/^[-*] /.test(line)) {
        if (last && last.kind === 'list') last.items.push(line.slice(2));
        else blocks.push({ kind: 'list', items: [line.slice(2)] });
      } else if (last && last.kind === 'text') last.text += ' ' + line;
      else blocks.push({ kind: 'text', text: line });
    }
    return blocks.filter(Boolean);
  }

  const MESSAGES = { loading: 'Waiting for the authorized order', resyncing: 'Resyncing the authorized order', stale: 'Order unavailable: waiting for a current projection', unavailable: 'Order unavailable', empty: 'No owned orders', denied: 'Order unavailable', signedout: 'Sign in to view your order' };

  function mount(host, options = {}) {
    if (!host || host.ordine) throw new Error('Order view requires an unused host');
    const doc = host.ownerDocument, win = doc.defaultView, ns = 'http://www.w3.org/2000/svg';
    let model = null, graph = null, selected = null, expanded = null, view = 'map', query = '', showHandoffs = false, driftOnly = false;
    let zoom = 1, pan = { x: 0, y: 0 }, held = false, frame = 0, destroyed = false, signature = '', counts = '', sheet = 0;
    const listeners = [];
    const still = win.matchMedia('(prefers-reduced-motion: reduce)'), narrow = win.matchMedia('(max-width: 1160px)');
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
    function button(text, action, cls = 'z2-btn', tipText) {
      const n = el('button', text, cls);
      n.type = 'button';
      n.addEventListener('click', action);
      if (tipText) n.setAttribute('data-tip-text', tipText);
      return n;
    }
    function tipped(n, title, text) {
      if (!text) return n;
      n.setAttribute('data-tip-title', title);
      n.setAttribute('data-tip-text', text);
      return n;
    }
    function place(n, box) {
      Object.assign(n.style, { left: box.x + 'px', top: box.y + 'px', width: box.width + 'px', height: box.height + 'px' });
      return n;
    }
    function move(n, frames, delay = 0) {
      if (still.matches || typeof n.animate !== 'function') return;
      n.animate(frames, { duration: 190, delay, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' });
    }
    if (win.z2 && typeof win.z2.tips === 'function' && !doc.documentElement.ordineTips) doc.documentElement.ordineTips = win.z2.tips({ lockDelay: 700 });

    const mast = el('header', undefined, 'ordine-mast z2-scope');
    const crumb = el('span', '', 'ordine-crumb'), status = el('span', MESSAGES.loading, 'ordine-status');
    status.setAttribute('role', 'status');
    const live = el('span', undefined, 'ordine-live');
    live.append(el('i', undefined, 'ordine-dot'), status);
    const find = el('label', undefined, 'z2-field ordine-find'), search = el('input');
    search.type = 'search';
    search.placeholder = 'Owner, lane or capability';
    search.autocomplete = 'off';
    find.append(el('span', 'Find', 'ordine-find-label'), search);
    mast.append(el('span', options.title || 'Order', 'ordine-mark'), crumb, find, live);

    const head = el('div', undefined, 'ordine-head'), sub = el('p', '', 'ordine-sub');
    head.append(el('p', 'Command structure', 'ordine-eyebrow'), el('h1', options.heading || 'Standing order', 'ordine-title'), sub);

    const shell = el('section', undefined, 'ordine-shell'), bar = el('div', undefined, 'ordine-bar'), tabs = el('div', undefined, 'z2-seg ordine-tabs');
    tabs.setAttribute('role', 'group');
    tabs.setAttribute('aria-label', 'Order views');
    const mapTab = button('Command map', () => setView('map'), 'z2-seg-b'), ownerTab = button('Who owns what', () => setView('owners'), 'z2-seg-b');
    tabs.append(mapTab, ownerTab);
    const tools = el('div', undefined, 'ordine-tools');
    const driftToggle = button('Drift only', () => { driftOnly = !driftOnly; render(); }, 'z2-btn', 'Dim every seat that matches its outfit.');
    const handoffs = button('Handoffs', () => { showHandoffs = !showHandoffs; renderLines(); syncTools(); }, 'z2-btn', 'Draw the declared UI and deployment handoffs of the selected role. Declared rules, not message traffic or access.');
    const zoomLabel = el('output', '100%', 'ordine-zoom');
    const less = button('−', () => zoomAt(zoom / 1.15), 'z2-btn ordine-step', 'Zoom out.'), more = button('+', () => zoomAt(zoom * 1.15), 'z2-btn ordine-step', 'Zoom in.');
    less.setAttribute('aria-label', 'Zoom out');
    more.setAttribute('aria-label', 'Zoom in');
    tools.append(driftToggle, handoffs, less, zoomLabel, more, button('Fit', () => { held = false; fit(); }, 'z2-btn', 'Fit the chart to the panel.'));
    bar.append(tabs, tools);

    const body = el('div', undefined, 'ordine-body'), stage = el('div', undefined, 'ordine-stage');
    const viewport = el('div', undefined, 'ordine-viewport'), scene = el('div', undefined, 'ordine-scene');
    viewport.tabIndex = 0;
    viewport.setAttribute('aria-label', 'Command map. Drag to pan. Use the buttons or pinch to zoom.');
    const groups = el('div'), lines = svg('svg', { class: 'ordine-lines', 'aria-hidden': 'true' }), cards = el('div');
    scene.append(groups, lines, cards);
    const meta = el('p', '', 'ordine-meta'), hint = el('p', 'Select a lead to open its lanes and live forks', 'ordine-hint');
    viewport.append(scene, meta, hint);
    const legend = el('div', undefined, 'ordine-legend');
    legend.append(el('span', 'Reports to', 'ordine-legend-command'), el('span', 'Lane', 'ordine-legend-lane'), el('span', 'Live fork', 'ordine-legend-fork'), el('span', 'UI handoff', 'ordine-legend-ui'), el('span', 'Deployment handoff', 'ordine-legend-deployment'), el('span', 'A fork is temporary work, never another standing role.', 'ordine-legend-note'));
    const owners = el('div', undefined, 'ordine-owners');
    const details = el('aside', undefined, 'ordine-details');
    details.setAttribute('aria-label', 'Selected owner');
    stage.append(viewport, owners, legend);
    body.append(stage, details);
    shell.append(bar, body);
    host.classList.add('ordine');
    const blank = el('p', MESSAGES.loading, 'ordine-blank');
    blank.setAttribute('aria-hidden', 'true');
    host.replaceChildren(mast, blank, head, shell);
    shell.hidden = true;
    head.hidden = true;

    function roles() { return new Map(model.roles.map(r => [r.id, r])); }
    function leads() { return model.roles.filter(r => r.manager === model.root).map(r => r.id); }
    function driftSummary(d) {
      if (!d) return '';
      if (d.state !== 'ok') return 'Drift check unavailable: ' + (d.reason || 'no answer');
      let differ = 0, unseated = 0, errors = 0;
      for (const id of Object.keys(d.roles)) {
        const r = d.roles[id];
        if (r.unseated) unseated++;
        if (r.status === 'error') errors++;
        else if (r.status !== 'ok') differ++;
      }
      const out = d.outside.length;
      return 'Drift: ' + differ + ' differ, ' + unseated + ' unseated, ' + errors + ' errors' + (out ? ', ' + out + ' outside the order' : '') + (d.generatedAt ? ' (checked ' + d.generatedAt + ')' : '');
    }
    function driftOf(id) { return model && model.drift && model.drift.state === 'ok' ? model.drift.roles[id] || null : null; }
    function driftTag(dr) {
      if (!dr) return null;
      if (dr.unseated) return { text: 'unseated', tone: 'warn' };
      if (dr.status === 'error') return { text: 'unchecked', tone: 'fail' };
      if (dr.status === 'drift') return { text: 'drift ' + dr.changes.length, tone: 'warn' };
      if (dr.status === 'missing') return { text: 'missing', tone: 'fail' };
      if (dr.status === 'extra') return { text: 'extra', tone: 'warn' };
      return null;
    }
    function seat(role) {
      const state = String(role.lifecycle || '').replace(/^Seat /, '').toLocaleLowerCase();
      return { handle: role.occupant && role.occupant.handle ? role.occupant.handle : '', state: ['active', 'idle', 'dormant'].includes(state) ? state : '' };
    }
    function tally(inside) {
      const parts = [];
      if (inside.staff.length) parts.push(inside.staff.length + ' staff');
      if (inside.lanes.length) parts.push(inside.lanes.length + (inside.lanes.length === 1 ? ' lane' : ' lanes'));
      if (inside.forks.length) parts.push(inside.forks.length + (inside.forks.length === 1 ? ' live fork' : ' live forks'));
      return parts.join(' · ');
    }
    function matches(role) {
      const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
      const inside = members(model, role.id);
      const text = [role.title, role.summary, role.charter, role.handle, role.occupant && role.occupant.handle, role.occupant && role.occupant.mantra, ...(role.owns || []), ...inside.lanes.flatMap(l => [l.name, l.handle]), ...inside.forks.flatMap(f => [f.title, f.summary])].filter(Boolean).join(' ').toLocaleLowerCase();
      return words.every(w => text.includes(w));
    }
    function syncTools() {
      mapTab.setAttribute('aria-pressed', String(view === 'map'));
      ownerTab.setAttribute('aria-pressed', String(view === 'owners'));
      handoffs.setAttribute('aria-pressed', String(showHandoffs));
      handoffs.hidden = !(model && (model.communications || []).length);
      handoffs.disabled = !selected;
      driftToggle.setAttribute('aria-pressed', String(driftOnly));
      driftToggle.hidden = !(model && model.drift && model.drift.state === 'ok');
      tools.hidden = view !== 'map';
      hint.hidden = !!expanded;
    }
    function applyCamera() {
      scene.style.transform = `translate(${pan.x}px,${pan.y}px) scale(${zoom})`;
      zoomLabel.textContent = Math.round(zoom * 100) + '%';
    }
    function fit() {
      if (!graph || view !== 'map' || !viewport.clientWidth || shell.hidden) return;
      const room = Math.max(560, Math.min(920, win.innerHeight - 250));
      if (!held) zoom = Math.max(.55, Math.min(1, (viewport.clientWidth - 32) / graph.width, (room - 76) / sheet));
      const tall = Math.max(room, Math.ceil(graph.height * zoom) + 76) + 'px';
      if (viewport.style.height !== tall) viewport.style.height = tall;
      const spare = viewport.clientWidth - graph.width * zoom, open = graph.groups[0];
      if (!held) pan = { x: spare < 0 && open ? 8 - open.x * zoom : spare / 2, y: 16 };
      applyCamera();
    }
    function scheduleFit() {
      if (frame) win.cancelAnimationFrame(frame);
      frame = win.requestAnimationFrame(() => { frame = 0; fit(); });
    }
    function zoomAt(value, x = viewport.clientWidth / 2, y = viewport.clientHeight / 2) {
      const old = zoom;
      held = true;
      zoom = Math.max(.2, Math.min(2, value));
      pan = { x: x - (x - pan.x) * zoom / old, y: y - (y - pan.y) * zoom / old };
      applyCamera();
    }
    function setView(next) {
      view = next;
      viewport.hidden = view !== 'map';
      legend.hidden = view !== 'map';
      owners.hidden = view !== 'owners';
      renderOwners(); renderDetails(); syncTools(); scheduleFit();
    }
    function polyline(points) { return points.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' '); }
    function tip(points, cls) {
      const a = points.at(-2), b = points.at(-1), angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
      return svg('path', { d: 'M-8,-4L-1,0L-8,4Z', class: cls + ' ordine-tip', transform: `translate(${b.x},${b.y}) rotate(${angle})` });
    }
    function renderLines() {
      if (!graph) return;
      lines.replaceChildren();
      for (const s of graph.segments) lines.append(svg('path', { d: `M${s.x1},${s.y1}L${s.x2},${s.y2}`, class: 'ordine-command' }));
      for (const p of graph.junctions) lines.append(svg('circle', { cx: p.x, cy: p.y, r: 2.4, class: 'ordine-junction' }));
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
    function rank(role) {
      const s = seat(role), n = el('span', undefined, 'ordine-rank'), parent = roles().get(role.manager);
      if (s.state) n.append(el('i', undefined, 'ordine-dot ordine-' + s.state));
      n.append(el('span', s.handle || (parent ? 'Reports to ' + parent.title : (role.kind || 'Visible root'))));
      const tag = model.drift && model.drift.state === 'ok' ? driftTag(driftOf(role.id)) : null;
      if (tag) n.append(el('span', tag.text, 'ordine-drift ordine-drift-' + tag.tone));
      else if (s.state) n.append(el('span', s.state, 'ordine-state'));
      return n;
    }
    function roleCard(role, box) {
      const n = place(el('article', undefined, 'ordine-node ordine-' + box.kind), box), inside = members(model, role.id), dr = driftOf(role.id);
      n.dataset.role = role.id;
      n.classList.toggle('ordine-open', role.id === expanded);
      n.classList.toggle('ordine-picked', role.id === selected);
      n.classList.toggle('ordine-match', !!query.trim() && matches(role));
      n.classList.toggle('ordine-quiet', driftOnly && !(dr && dr.status !== 'ok'));
      const pick = button(undefined, () => choose(role.id), 'ordine-pick');
      pick.setAttribute('aria-pressed', String(role.id === selected));
      pick.append(el('strong', role.title, 'ordine-name'), rank(role));
      if (role.summary) pick.append(el('span', role.summary, 'ordine-summary'));
      tipped(pick, role.title, [role.summary, role.occupant && role.occupant.mantra ? 'Holder says: ' + role.occupant.mantra : ''].filter(Boolean).join(' '));
      n.append(pick);
      const count = tally(inside);
      if (box.kind === 'lead' && count) {
        const fold = button(undefined, () => toggle(role.id), 'ordine-fold', role.id === expanded ? 'Close this lead and return to the overview.' : 'Open the lanes and live forks of this lead.');
        fold.setAttribute('aria-expanded', String(role.id === expanded));
        fold.setAttribute('aria-label', (role.id === expanded ? 'Close ' : 'Open ') + role.title + ': ' + count);
        fold.append(el('span', undefined, 'z2-caret'), el('span', count));
        n.append(fold);
      }
      return n;
    }
    function laneRow(lane, box) {
      const n = place(el('div', undefined, 'ordine-node ordine-lane'), box);
      n.tabIndex = 0;
      n.dataset.item = lane.id;
      n.append(el('span', lane.name, 'ordine-lane-name'), el('span', lane.handle, 'ordine-handle'));
      return tipped(n, lane.name, lane.handle ? 'Lane index ' + lane.handle + '. Entries about this lane are cited under that captains-log handle.' : 'This lane names no captains-log index.');
    }
    function forkLine(fork) {
      const state = String(fork.lifecycle || '').toLocaleLowerCase(), top = el('span', undefined, 'ordine-fork-top');
      top.append(el('i', undefined, 'ordine-dot ordine-' + (['active', 'idle', 'dormant'].includes(state) ? state : 'dormant')), el('span', fork.title, 'ordine-handle'), el('span', state, 'ordine-fork-state'));
      return top;
    }
    function forkTip(fork) {
      const all = new Map(model.roles.concat(model.workers || []).map(r => [r.id, r])), parent = all.get(fork.manager);
      return [fork.summary || 'No mantra.', parent ? 'Fork of ' + parent.title + '.' : '', fork.lifecycle ? 'State: ' + fork.lifecycle + '.' : ''].filter(Boolean).join(' ');
    }
    function forkRow(fork, box) {
      const n = place(el('div', undefined, 'ordine-node ordine-fork'), box);
      n.tabIndex = 0;
      n.dataset.item = fork.id;
      n.append(forkLine(fork), el('span', fork.summary || 'No mantra', 'ordine-fork-task'));
      return tipped(n, fork.title, forkTip(fork));
    }
    function renderCards(before) {
      const focus = doc.activeElement && cards.contains(doc.activeElement) ? doc.activeElement : null;
      const focusId = focus ? (focus.closest('[data-role]') || focus).dataset.role || focus.dataset.item : null, focusFold = !!(focus && focus.classList.contains('ordine-fold'));
      cards.replaceChildren();
      groups.replaceChildren();
      const byId = roles(), inside = graph.expanded ? members(model, graph.expanded) : { lanes: [], forks: [] };
      const items = new Map(inside.lanes.concat(inside.forks).map(x => [x.id, x]));
      for (const group of graph.groups) {
        const n = place(el('div', undefined, 'ordine-group'), group), total = tally(members(model, group.id));
        const caption = el('div', undefined, 'ordine-caption');
        Object.assign(caption.style, { left: group.caption.x - group.x + 'px', top: group.caption.y - group.y + 'px', width: group.caption.width + 'px' });
        caption.append(el('strong', total ? total + '.' : 'No lanes or live forks.'), el('p', group.lanes || group.forks ? 'A lane is standing work with a captains-log index. A fork is temporary.' : 'Standing staff under this lead.'));
        n.append(caption);
        groups.append(n);
        if (before) move(n, [{ opacity: 0 }, { opacity: 1 }], 60);
      }
      for (const label of graph.labels) {
        const n = el('span', label.text, 'ordine-label');
        Object.assign(n.style, { left: label.x + 'px', top: label.y + 'px' });
        groups.append(n);
        if (before) move(n, [{ opacity: 0 }, { opacity: 1 }], 90);
      }
      let fresh = 0;
      for (const box of graph.nodes) {
        const n = box.kind === 'lane' ? laneRow(items.get(box.id), box) : box.kind === 'fork' ? forkRow(items.get(box.id), box) : roleCard(byId.get(box.id), box);
        cards.append(n);
        if (!before) continue;
        const was = before.get(box.id);
        if (was && (was.x !== box.x || was.y !== box.y)) move(n, [{ transform: `translate(${was.x - box.x}px,${was.y - box.y}px)` }, { transform: 'none' }]);
        else if (!was) move(n, [{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }], 60 + Math.min(fresh++, 10) * 16);
      }
      if (before) move(lines, [{ opacity: 0 }, { opacity: 1 }], 110);
      if (focusId) {
        const again = [...cards.querySelectorAll('[data-role],[data-item]')].find(n => (n.dataset.role || n.dataset.item) === focusId);
        const target = again && (again.dataset.item ? again : again.querySelector(focusFold ? '.ordine-fold' : '.ordine-pick') || again.querySelector('.ordine-pick'));
        if (target) target.focus({ preventScroll: true });
      }
    }
    function inner(role, into) {
      const inside = members(model, role.id);
      if (inside.lanes.length) {
        const list = el('ul', undefined, 'ordine-lanes');
        for (const lane of inside.lanes) {
          const li = el('li');
          li.append(el('span', lane.name, 'ordine-lane-name'), el('span', lane.handle, 'ordine-handle'));
          list.append(li);
        }
        into.append(el('h3', inside.lanes.length === 1 ? 'Lane' : 'Lanes'), list);
      }
      if (inside.forks.length) {
        const list = el('ul', undefined, 'ordine-forks');
        for (const fork of inside.forks) {
          const li = el('li');
          li.append(forkLine(fork), el('span', fork.summary || 'No mantra', 'ordine-fork-task'));
          list.append(li);
        }
        into.append(el('h3', 'Live forks'), list);
      }
      return inside;
    }
    function renderOwners() {
      owners.replaceChildren();
      if (!model || view !== 'owners') return;
      for (const role of model.roles.filter(matches)) {
        const n = el('article', undefined, 'ordine-owner'), inside = members(model, role.id), count = tally(inside);
        n.dataset.owner = role.id;
        n.classList.toggle('ordine-picked', role.id === selected);
        const pick = button(undefined, () => choose(role.id === selected ? null : role.id), 'ordine-pick');
        pick.setAttribute('aria-expanded', String(role.id === selected));
        pick.append(el('strong', role.title, 'ordine-name'), rank(role));
        if (role.summary) pick.append(el('span', role.summary, 'ordine-summary'));
        if (count) pick.append(el('span', count, 'ordine-count'));
        n.append(pick);
        owners.append(n);
      }
      if (!owners.childElementCount) owners.append(el('p', 'No visible owner matches.', 'ordine-none'));
    }
    function section(title, fill) {
      const n = el('section');
      n.append(el('h3', title));
      fill(n);
      details.append(n);
      return n;
    }
    function prose(into, text) {
      for (const block of charterBlocks(text)) {
        if (block.kind === 'heading') into.append(el('h4', block.text));
        else if (block.kind === 'list') {
          const list = el('ul');
          for (const item of block.items) list.append(rich(el('li'), item));
          into.append(list);
        } else into.append(rich(el('p'), block.text));
      }
    }
    function rich(into, text) {
      String(text).replace(/\*\*/g, '').split('`').forEach((part, i) => { if (part) into.append(i % 2 ? el('code', part) : doc.createTextNode(part)); });
      return into;
    }
    function driftSection(id) {
      const d = model && model.drift;
      if (!d) return;
      section('Drift from outfit', n => {
        if (d.state !== 'ok') { n.append(el('p', 'The drift check did not run: ' + (d.reason || 'unavailable') + '. This is not a clean result.')); return; }
        const dr = d.roles[id];
        if (!dr || (dr.status === 'ok' && !dr.unseated)) { n.append(el('p', 'In line with its outfit at ' + (d.generatedAt || 'the last check') + '.')); return; }
        if (dr.unseated) n.append(el('p', 'No holder is seated in this role.'));
        if (dr.status === 'error') n.append(el('p', 'Check error: ' + (dr.error || 'unknown')));
        if (!dr.changes.length) return;
        const list = el('ul', undefined, 'ordine-drift-list');
        for (const c of dr.changes) {
          const li = el('li');
          li.append(el('code', c.key, 'ordine-drift-key'), el('span', 'now', 'ordine-drift-label'), el('code', c.live, 'ordine-drift-live'), el('span', 'should be', 'ordine-drift-label'), el('code', c.want, 'ordine-drift-want'));
          list.append(li);
        }
        n.append(list);
      });
    }
    function renderRoster() {
      const byId = roles(), top = el('div', undefined, 'ordine-details-top');
      top.append(el('span', 'The order', 'ordine-eyebrow'));
      details.append(top, el('h2', byId.get(model.root).title), el('p', 'Select a role to read its charter, lanes and live forks.', 'ordine-reports'));
      const list = el('ul', undefined, 'ordine-roster');
      for (const role of model.roles.filter(r => r.id === model.root || r.manager === model.root)) {
        const li = el('li'), pick = button(undefined, () => choose(role.id), 'ordine-roster-pick');
        pick.append(el('span', role.title, 'ordine-lane-name'), el('span', tally(members(model, role.id)) || seat(role).handle, 'ordine-handle'));
        li.append(pick);
        list.append(li);
      }
      section('Roles', n => n.append(list));
      if (model.drift) section('Drift from outfit', n => n.append(el('p', driftSummary(model.drift))));
    }
    function renderDetails() {
      details.replaceChildren();
      const inline = view === 'owners' && narrow.matches;
      details.hidden = !model || (!selected && narrow.matches);
      body.classList.toggle('ordine-selected', !details.hidden && !inline);
      if (!selected || !model) {
        if (details.parentNode !== body) body.append(details);
        if (!details.hidden) renderRoster();
        return;
      }
      const role = roles().get(selected), tile = inline ? [...owners.children].find(n => n.dataset.owner === selected) : null;
      if (tile) tile.append(details);
      else if (details.parentNode !== body) body.append(details);
      const top = el('div', undefined, 'ordine-details-top');
      top.append(el('span', role.id === model.root ? 'Commander' : 'Accountable owner', 'ordine-eyebrow'), button('Close', () => { choose(null); const first = cards.querySelector('.ordine-pick'); if (first) first.focus(); }, 'z2-btn ordine-close'));
      details.append(top, el('h2', role.title));
      const parent = roles().get(role.manager), s = seat(role), line = el('p', undefined, 'ordine-reports');
      if (parent) line.append(el('span', 'Reports to '), button(parent.title, () => choose(parent.id), 'ordine-link'));
      if (s.handle) line.append(el('span', (parent ? ' · held by ' : 'Held by ') + s.handle + (s.state ? ', ' + s.state : ''), 'ordine-held'));
      if (line.childNodes.length) details.append(line);
      if (role.occupant && role.occupant.mantra) details.append(el('p', role.occupant.mantra, 'ordine-mantra'));
      if (role.charter) section('Charter', n => prose(n, role.charter));
      else if (role.summary) section('Summary', n => n.append(el('p', role.summary)));
      if (role.owns && role.owns.length && !(role.charter || '').includes(role.owns[0])) section('Owns', n => { const list = el('ul'); for (const item of role.owns) list.append(el('li', item)); n.append(list); });
      if (role.boundary) section('Scope boundary', n => n.append(el('p', role.boundary)));
      const holder = el('section'), inside = inner(role, holder);
      if (holder.childNodes.length) details.append(holder);
      if (inside.staff.length) section('Standing staff', n => { const list = el('ul'); for (const r of inside.staff) list.append(el('li', r.title)); n.append(list); });
      driftSection(role.id);
      const edges = (model.communications || []).filter(e => e.from === selected || e.to === selected);
      if (edges.length) section('Declared handoffs', n => {
        const list = el('ul');
        for (const e of edges) list.append(el('li', `${roles().get(e.from).title} → ${roles().get(e.to).title}: ${e.label || (e.kind === 'ui' ? 'UI handoff' : 'Deployment handoff')}`));
        n.append(list);
      });
      if (leads().includes(role.id) && tally(inside) && view === 'map') {
        const b = button(expanded === role.id ? 'Return to the overview' : 'Open lanes and forks on the map', () => toggle(role.id));
        b.setAttribute('aria-expanded', String(expanded === role.id));
        details.append(b);
      }
      details.append(el('p', [role.handle, role.id].filter(Boolean).join(' · '), 'ordine-id'));
    }
    function render(before) {
      scene.style.width = graph.width + 'px'; scene.style.height = graph.height + 'px';
      lines.setAttribute('width', graph.width); lines.setAttribute('height', graph.height); lines.setAttribute('viewBox', `0 0 ${graph.width} ${graph.height}`);
      renderCards(before); renderLines(); renderOwners(); renderDetails(); syncTools(); fit();
    }
    function relayout() {
      const before = new Map(graph.nodes.map(b => [b.id, b]));
      graph = layout(model, { expanded });
      render(before);
      if (options.onSelect) options.onSelect(selected, expanded);
    }
    function choose(id) {
      selected = id;
      if (!id || id === model.root) expanded = null;
      else if (leads().includes(id) && tally(members(model, id))) expanded = id;
      relayout();
    }
    function toggle(id) {
      expanded = expanded === id ? null : id;
      selected = id;
      relayout();
    }
    function clear(text) {
      model = null; graph = null; selected = null; expanded = null; signature = '';
      shell.hidden = true; head.hidden = true; blank.hidden = false; blank.textContent = text;
      cards.replaceChildren(); lines.replaceChildren(); groups.replaceChildren(); owners.replaceChildren(); details.replaceChildren();
      query = ''; search.value = ''; search.disabled = true;
      crumb.textContent = ''; meta.textContent = ''; sub.textContent = '';
      live.dataset.state = 'off';
      status.textContent = text;
    }
    function update(state) {
      if (destroyed) throw new Error('Detached order view');
      if (state.status !== 'current') { clear(MESSAGES[state.status] || 'Order unavailable'); return; }
      let next, keep = expanded;
      try {
        const ids = new Set(state.model.roles.map(r => r.id));
        if (!ids.has(keep) || state.model.roles.find(r => r.id === keep).manager !== state.model.root) keep = null;
        next = layout(state.model, { expanded: model ? keep : (options.expanded === undefined ? state.model.expandedTeam || null : options.expanded) });
        if ((state.model.communications || []).some(e => !ids.has(e.from) || !ids.has(e.to) || !['ui', 'deployment'].includes(e.kind))) throw new Error('Invalid public handoff');
        const workers = state.model.workers || [], workerIds = new Set(workers.map(w => w.id));
        if (workerIds.size !== workers.length || workers.some(w => ids.has(w.id) || (!ids.has(w.manager) && !workerIds.has(w.manager)))) throw new Error('Invalid visible worker');
        if (state.model.roles.some(r => r.lanes !== undefined && (!Array.isArray(r.lanes) || r.lanes.some(l => !l || typeof l.name !== 'string')))) throw new Error('Invalid lane');
        hierarchy({ ...state.model, roles: state.model.roles.concat(workers) });
      } catch (_) { clear('Order unavailable: invalid public projection'); return; }
      const seen = clock(state.observedAt), mark = JSON.stringify(state.model);
      status.textContent = 'Live' + (seen ? ' · observed ' + seen : '');
      live.dataset.state = 'live';
      if (mark === signature) return;
      const first = !model, before = model && graph ? new Map(graph.nodes.map(b => [b.id, b])) : null;
      model = state.model; graph = next; signature = mark; expanded = next.expanded; sheet = layout(model, { expanded: null }).height;
      if (!model.roles.some(r => r.id === selected)) selected = null;
      shell.hidden = false; head.hidden = false; blank.hidden = true; search.disabled = false;
      const all = leads().map(id => members(model, id)), lanes = all.reduce((n, m) => n + m.lanes.length, 0), forks = all.reduce((n, m) => n + m.forks.length, 0);
      counts = model.roles.length + (model.roles.length === 1 ? ' role' : ' roles') + (lanes ? ' · ' + lanes + ' lanes' : '') + (forks ? ' · ' + forks + ' live forks' : '');
      crumb.textContent = roles().get(model.root).title;
      sub.textContent = counts + '. Temporary work stays with its owner.';
      meta.textContent = driftSummary(model.drift);
      meta.hidden = !meta.textContent;
      if (first) { viewport.hidden = view !== 'map'; legend.hidden = view !== 'map'; owners.hidden = view !== 'owners'; }
      render(before);
    }
    listen(search, 'input', () => { query = search.value; renderCards(); renderOwners(); renderDetails(); });
    listen(search, 'keydown', e => {
      if (e.key !== 'Enter' || !model) return;
      const found = model.roles.filter(matches);
      if (query.trim() && found.length === 1) choose(found[0].id);
    });
    listen(host, 'keydown', e => { if (e.key === 'Escape' && (selected || expanded) && e.target !== search) { e.stopPropagation(); choose(null); } });
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
      } else if (drag && (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 3 || held)) {
        held = true;
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
    listen(narrow, 'change', () => { if (model) { renderOwners(); renderDetails(); scheduleFit(); } });
    const observer = new win.ResizeObserver(scheduleFit);
    observer.observe(viewport);
    listen(win, 'resize', scheduleFit);
    view = options.view || (win.matchMedia('(max-width:680px)').matches ? 'owners' : 'map');
    const api = {
      update,
      select: id => { if (model && (id === null || model.roles.some(r => r.id === id))) choose(id); },
      expand: id => { if (model && (id === null || leads().includes(id))) { expanded = id; if (id) selected = id; relayout(); } },
      show: next => { if (next === 'map' || next === 'owners') setView(next); },
      detach() {
        destroyed = true;
        observer.disconnect();
        if (frame) win.cancelAnimationFrame(frame);
        listeners.forEach(remove => remove());
        clear(''); host.replaceChildren(); host.classList.remove('ordine'); delete host.ordine;
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
      observed = typeof body.observed_at === 'string' || typeof body.observed_at === 'number' ? body.observed_at : '';
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

  function auto(doc) {
    const made = [];
    for (const host of doc.querySelectorAll('[data-ordine]')) {
      if (host.ordine) continue;
      const d = host.dataset, view = mount(host, { title: d.ordineTitle, heading: d.ordineHeading });
      const bound = feed(view, { url: d.ordine || 'hierarchy', driftUrl: d.ordineDrift || '', root: d.ordineRoot || '', uiOwner: d.ordineUiOwner, deploymentOwner: d.ordineDeploymentOwner, interval: Number(d.ordineInterval) || 0 });
      doc.addEventListener('visibilitychange', () => { if (!doc.hidden) bound.poll(); });
      made.push({ view, feed: bound });
    }
    return made;
  }

  return { layout, members, mergeSegments, junctions, handoffRoute, workerBranch, charterBlocks, fromForms, driftFor, feed, mount, auto };
}());
if (typeof self !== 'undefined') {
  self.ordine = ordine;
  self.zanni = self.zanni || {};
  self.zanni.ordine = ordine;
  if (self.document) {
    if (self.document.readyState === 'loading') self.document.addEventListener('DOMContentLoaded', () => ordine.auto(self.document));
    else ordine.auto(self.document);
  }
}
if (typeof module === 'object' && module.exports) module.exports = ordine;
