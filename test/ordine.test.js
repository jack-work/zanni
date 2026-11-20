'use strict';
const assert = require('node:assert/strict');
const ordine = require('../assets/ordine/ordine.js');

function hits(a, b, n) {
  return a.x === b.x
    ? a.x > n.x && a.x < n.x + n.width && Math.max(a.y, b.y) > n.y && Math.min(a.y, b.y) < n.y + n.height
    : a.y > n.y && a.y < n.y + n.height && Math.max(a.x, b.x) > n.x && Math.min(a.x, b.x) < n.x + n.width;
}
function overlap(a, b) { return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y; }
function inside(a, g) { return a.x >= g.x && a.y >= g.y && a.x + a.width <= g.x + g.width && a.y + a.height <= g.y + g.height; }

function checkGraph(graph, note) {
  const ids = new Set(graph.nodes.map(n => n.id)), boxes = new Map(graph.nodes.map(n => [n.id, n]));
  assert.equal(ids.size, graph.nodes.length, note + ': a node is drawn twice');
  for (const n of graph.nodes) {
    assert.ok(n.x >= 0 && n.x + n.width <= graph.width && n.y >= 0 && n.y + n.height <= graph.height, note + ': ' + n.id + ' leaves the sheet');
    for (const b of graph.nodes) if (n.id < b.id) assert.ok(!overlap(n, b), note + ': ' + n.id + ' overlaps ' + b.id);
  }
  assert.equal(graph.edges.length, graph.nodes.length - 1, note + ': every node but the root has one command stroke');
  for (const e of graph.edges) {
    const from = boxes.get(e.from), to = boxes.get(e.to), first = e.points[0], last = e.points.at(-1);
    assert.ok(from && to, note + ': a stroke names a node that is not drawn');
    assert.ok(first.y === from.y + from.height && first.x > from.x && first.x < from.x + from.width, note + ': a stroke leaves its owner from the foot');
    assert.ok((last.y === to.y && last.x > to.x && last.x < to.x + to.width) || (last.x === to.x && last.y > to.y && last.y < to.y + to.height), note + ': a stroke ends on its node');
    for (let i = 1; i < e.points.length; i++) {
      const a = e.points[i - 1], b = e.points[i];
      assert.ok(a.x === b.x || a.y === b.y, note + ': a stroke is not orthogonal');
      assert.ok(b.y >= a.y, note + ': a command stroke climbs');
      for (const n of graph.nodes) assert.ok(!hits(a, b, n), `${note}: command ${e.from}/${e.to} runs through ${n.id}`);
    }
  }
  for (let i = 0; i < graph.segments.length; i++) {
    const a = graph.segments[i];
    for (const b of graph.segments.slice(i + 1)) {
      const av = a.x1 === a.x2, bv = b.x1 === b.x2;
      if (av === bv) {
        const twice = av ? a.x1 === b.x1 && Math.max(a.y1, b.y1) < Math.min(a.y2, b.y2) : a.y1 === b.y1 && Math.max(a.x1, b.x1) < Math.min(a.x2, b.x2);
        assert.ok(!twice, note + ': a command stroke is drawn twice');
      } else if (a.owner !== b.owner) {
        const h = av ? b : a, v = av ? a : b;
        assert.ok(!(v.x1 >= h.x1 && v.x1 <= h.x2 && h.y1 >= v.y1 && h.y1 <= v.y2), note + ': strokes of two owners cross');
      }
    }
  }
  assert.ok(graph.segments.length <= graph.edges.reduce((n, e) => n + e.points.length - 1, 0));
  for (const g of graph.groups) {
    const members = new Set(graph.edges.filter(e => e.from === g.id).map(e => e.to).concat(g.id));
    for (const n of graph.nodes) assert.equal(inside(n, g), members.has(n.id), `${note}: the region of ${g.id} and ${n.id}`);
    for (const n of graph.nodes) if (!members.has(n.id)) assert.ok(!overlap(n, g), `${note}: ${n.id} sits on the region of ${g.id}`);
    assert.ok(g.caption.y >= Math.max(...graph.nodes.filter(n => members.has(n.id)).map(n => n.y + n.height)), note + ': the caption sits under the last item');
  }
  for (const label of graph.labels) for (const n of graph.nodes) assert.ok(!(label.x >= n.x && label.x <= n.x + n.width && label.y + 16 > n.y && label.y < n.y + n.height), note + ': a label sits on ' + n.id);
}

const approved = {
  root: 'root', expandedTeam: 'systems',
  roles: [
    { id: 'root', title: 'Command', manager: null },
    { id: 'systems', title: 'Systems', manager: 'root' },
    { id: 'methods', title: 'Methods', manager: 'systems' },
    { id: 'ui', title: 'Interface', manager: 'systems' },
    ...Array.from({ length: 8 }, (_, i) => ({ id: 'officer-' + i, title: 'Officer ' + i, manager: 'root' }))
  ]
};
const reference = ordine.layout(approved), at = id => { const { kind, ...box } = reference.nodes.find(n => n.id === id); return box; };
assert.deepEqual(at('root'), { id: 'root', x: 450, y: 32, width: 224, height: 104 });
assert.deepEqual(at('systems'), { id: 'systems', x: 90, y: 224, width: 224, height: 118 });
assert.deepEqual(at('methods'), { id: 'methods', x: 28, y: 420, width: 160, height: 118 });
assert.deepEqual(at('ui'), { id: 'ui', x: 214, y: 420, width: 160, height: 118 });
for (let i = 0; i < 8; i++) assert.deepEqual(at('officer-' + i), { id: 'officer-' + i, x: 440 + i % 3 * 230, y: 224 + Math.floor(i / 3) * 196, width: 200, height: 118 });
assert.deepEqual(reference.edges.find(e => e.to === 'systems').points, [{ x: 562, y: 136 }, { x: 562, y: 178 }, { x: 202, y: 178 }, { x: 202, y: 224 }]);
assert.deepEqual(reference.edges.find(e => e.to === 'officer-4').points, [{ x: 562, y: 136 }, { x: 562, y: 178 }, { x: 650, y: 178 }, { x: 650, y: 396 }, { x: 770, y: 396 }, { x: 770, y: 420 }]);
assert.deepEqual(reference.edges.find(e => e.to === 'ui').points, [{ x: 202, y: 342 }, { x: 202, y: 374 }, { x: 294, y: 374 }, { x: 294, y: 420 }]);
const { caption, staff, lanes, forks, ...region } = reference.groups[0];
assert.deepEqual(region, { id: 'systems', x: 16, y: 204, width: 370, height: 414 });
assert.equal(reference.width, 1124);
assert.equal(reference.segments.length, 26);
assert.equal(reference.junctions.length, 9);
checkGraph(reference, 'approved composition');

function live() {
  const lanes = (lead, names) => names.map(name => ({ name, handle: 'fleet.lane.' + lead + '.' + name }));
  return {
    root: 'king',
    roles: [
      { id: 'king', title: 'King of Spain', manager: null },
      { id: 'backend', title: 'Backend Engineer', manager: 'king', lanes: lanes('backend', ['edge', 'flakes-charter', 'github-watcher', 'identity', 'inspector', 'keel', 'merlin', 'rou2', 'spain-executor']) },
      { id: 'figaro', title: 'Figaro Engineer', manager: 'king', lanes: lanes('figaro', ['approvals-server', 'aria-log', 'authz-carve', 'daemon-releases', 'king-authority']) },
      { id: 'frontend', title: 'Frontend Engineer', manager: 'king', lanes: lanes('frontend', ['approvals-app', 'big-tv', 'order-site', 'scope-ui', 'writer-resume']) },
      { id: 'herald', title: 'Herald', manager: 'king', lanes: lanes('herald', ['threads']) },
      { id: 'release', title: 'Release Engineer', manager: 'king' }
    ],
    workers: [
      { id: 'w1', title: 'glove-cactus', manager: 'backend', lifecycle: 'active' },
      { id: 'w2', title: 'envoy-visor', manager: 'w1', lifecycle: 'idle' },
      { id: 'w3', title: 'old-hand', manager: 'backend', lifecycle: 'dormant' },
      { id: 'w4', title: 'under-old-hand', manager: 'w3', lifecycle: 'active' },
      { id: 'w5', title: 'rhapsody-chute', manager: 'frontend', lifecycle: 'active' },
      { id: 'w6', title: 'kings-own', manager: 'king', lifecycle: 'idle' }
    ]
  };
}
const order = live(), frozen = JSON.stringify(order), overview = ordine.layout(order);
checkGraph(overview, 'overview');
assert.equal(JSON.stringify(order), frozen, 'layout leaves the model alone');
assert.deepEqual(ordine.layout(order), overview, 'layout is deterministic');
assert.deepEqual(ordine.layout(order, { expanded: null }), overview);
assert.deepEqual(ordine.layout(order, { expanded: 'king' }), overview, 'the root does not open');
assert.deepEqual(ordine.layout(order, { expanded: 'w1' }), overview, 'only a lead opens');
assert.deepEqual(overview.nodes.map(n => [n.id, n.kind, n.x, n.y]), [
  ['king', 'root', 450, 32], ['backend', 'lead', 232, 224], ['figaro', 'lead', 462, 224], ['frontend', 'lead', 692, 224], ['herald', 'lead', 232, 420], ['release', 'lead', 462, 420]
]);
const root = overview.nodes[0];
assert.equal(root.x + root.width / 2, overview.width / 2, 'the root sits top centre');
assert.equal(overview.groups.length, 0);
assert.equal(overview.labels.length, 0);
const bare = live();
delete bare.workers;
for (const r of bare.roles) delete r.lanes;
assert.deepEqual(ordine.layout(bare), overview, 'lanes and forks never move the overview');

for (const lead of ['backend', 'figaro', 'frontend', 'herald', 'release']) {
  const open = ordine.layout(order, { expanded: lead });
  checkGraph(open, lead + ' open');
  assert.deepEqual(ordine.layout(order, { expanded: lead }), open);
  assert.deepEqual(open.nodes[0], root, 'the root never moves');
  assert.deepEqual(open.nodes.find(n => n.id === lead), { id: lead, kind: 'lead', x: 90, y: 224, width: 224, height: 118 });
  const others = open.nodes.filter(n => n.kind === 'lead' && n.id !== lead);
  assert.deepEqual(others.map(n => n.id), overview.nodes.filter(n => n.kind === 'lead' && n.id !== lead).map(n => n.id), 'the other leads keep their reading order');
  others.forEach((n, i) => assert.deepEqual([n.x, n.y], [440 + i % 3 * 230, 224 + Math.floor(i / 3) * 196]));
  const m = ordine.members(order, lead);
  assert.deepEqual(open.nodes.filter(n => n.kind === 'lane').map(n => n.id), m.lanes.map(l => l.id));
  assert.deepEqual(open.nodes.filter(n => n.kind === 'fork').map(n => n.id), m.forks.map(f => f.id));
  assert.equal(open.groups.length, 1);
  assert.equal(open.groups[0].id, lead);
  assert.deepEqual(ordine.layout(order, { expanded: null }), overview, 'closing returns the same overview');
}
const backend = ordine.members(order, 'backend');
assert.deepEqual(backend.forks.map(f => f.id), ['w1', 'w2', 'w4'], 'live forks, nested ones after their parent');
assert.deepEqual(backend.resting.map(f => f.id), ['w3'], 'a dormant fork is counted, not drawn');
assert.deepEqual(ordine.members(order, 'king').forks.map(f => f.id), ['w6'], "the root's own forks, not its leads'");
assert.deepEqual(ordine.members(order, 'release'), { staff: [], lanes: [], forks: [], resting: [] });
const opened = ordine.layout(order, { expanded: 'backend' }), box = id => opened.nodes.find(n => n.id === id);
assert.ok(box('w2').x > box('w1').x && box('w2').x + box('w2').width === box('w1').x + box('w1').width, 'a fork of a fork is inset under it');
assert.deepEqual(opened.labels.map(l => l.text), ['Lanes', 'Live forks']);
for (const from of ['figaro', 'frontend', 'herald', 'release']) {
  const route = ordine.handoffRoute(opened, { from, to: 'backend', kind: 'ui' });
  assert.ok(route, 'a handoff finds a way into an open lead');
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1], b = route.points[i];
    assert.ok(a.x === b.x || a.y === b.y);
    for (const n of opened.nodes) assert.ok(!hits(a, b, n), `Handoff ${from} enters ${n.id}`);
  }
}
assert.equal(ordine.handoffRoute(opened, { from: 'king', to: 'hidden' }), null);

let seed = 20261120;
function random(n) { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % n; }
for (let round = 0; round < 160; round++) {
  const model = { root: 'r', roles: [{ id: 'r', title: 'Root', manager: null }], workers: [] }, leads = random(11);
  for (let i = 0; i < leads; i++) {
    const id = 'l' + i;
    model.roles.push({ id, title: 'Lead ' + i, manager: 'r', lanes: Array.from({ length: random(15) }, (_, k) => ({ name: 'lane-' + k, handle: 'fleet.lane.' + k })) });
    for (let s = random(4); s > 0; s--) model.roles.push({ id: id + 's' + s, title: 'Staff', manager: random(3) && s > 1 ? id + 's' + (s - 1) + 'x' : id });
    for (let w = 0, count = random(9); w < count; w++) model.workers.push({ id: id + 'w' + w, title: 'fork', manager: w && random(3) === 0 ? id + 'w' + random(w) : id, lifecycle: ['active', 'idle', 'dormant'][random(3)] });
  }
  model.roles = model.roles.map(r => r.manager && r.manager.endsWith('x') ? { ...r, manager: r.manager.slice(0, -1) } : r);
  const closed = ordine.layout(model);
  checkGraph(closed, 'fuzz ' + round);
  for (let i = 0; i < leads; i++) {
    const open = ordine.layout(model, { expanded: 'l' + i });
    checkGraph(open, 'fuzz ' + round + ' lead ' + i);
    assert.deepEqual(open.nodes[0], closed.nodes[0]);
  }
  assert.deepEqual(ordine.layout(model), closed);
}

assert.throws(() => ordine.layout({ ...approved, roles: [...approved.roles, approved.roles[1]] }), /Duplicate/);
assert.throws(() => ordine.layout({ ...approved, roles: approved.roles.map(r => r.id === 'systems' ? { ...r, manager: 'ui' } : r) }), /Disconnected/);
assert.throws(() => ordine.layout({ root: 'gone', roles: approved.roles }), /Missing visible root/);
const branch = ordine.workerBranch(order, 'backend');
assert.deepEqual(branch.roles.map(r => r.id), ['backend', 'w1', 'w2', 'w3', 'w4']);
assert.equal(ordine.workerBranch(order, 'release'), null);
assert.deepEqual(ordine.charterBlocks('**Owns:**\n- the queue;\n- the cut.\n\n**Never:**\n- deploys.\n\nFiles go\nthrough `cl`.'), [
  { kind: 'heading', text: 'Owns' }, { kind: 'list', items: ['the queue;', 'the cut.'] },
  { kind: 'heading', text: 'Never' }, { kind: 'list', items: ['deploys.'] },
  { kind: 'text', text: 'Files go through `cl`.' }
]);
console.log('Approved composition coordinates; live overview and every lead opened: no overlap, no stroke through a node, none drawn twice, owners never cross, regions hold only their own, closing returns the overview; 160 random orders');
