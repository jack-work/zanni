'use strict';
const assert = require('node:assert/strict');
const ordine = require('../assets/ordine/ordine.js');

function model() {
  return {
    root: 'root', expandedTeam: 'systems',
    roles: [
      { id: 'root', title: 'Command', manager: null },
      { id: 'systems', title: 'Systems', manager: 'root' },
      { id: 'methods', title: 'Methods', manager: 'systems' },
      { id: 'ui', title: 'Interface', manager: 'systems' },
      ...Array.from({ length: 7 }, (_, i) => ({ id: 'officer-' + i, title: 'Officer ' + i, manager: 'root' }))
    ]
  };
}
const data = model(), original = JSON.stringify(data), graph = ordine.layout(data);
assert.equal(graph.compact, true);
assert.equal(graph.nodes.length, 11);
assert.equal(graph.edges.length, 10);
assert.deepEqual(graph.nodes.find(n => n.id === 'root'), { id: 'root', x: 450, y: 32, width: 224, height: 104 });
assert.deepEqual(graph.nodes.find(n => n.id === 'systems'), { id: 'systems', x: 90, y: 224, width: 224, height: 118 });
assert.deepEqual(graph.nodes.find(n => n.id === 'ui'), { id: 'ui', x: 214, y: 420, width: 160, height: 118 });
assert.equal(JSON.stringify(data), original);
assert.deepEqual(ordine.layout(data), graph);
function hits(a, b, n) {
  return a.x === b.x
    ? a.x > n.x && a.x < n.x + n.width && Math.max(a.y, b.y) > n.y && Math.min(a.y, b.y) < n.y + n.height
    : a.y > n.y && a.y < n.y + n.height && Math.max(a.x, b.x) > n.x && Math.min(a.x, b.x) < n.x + n.width;
}
function checkGraph(graph) {
  for (const n of graph.nodes) {
    assert.ok(n.x >= 0 && n.x + n.width <= graph.width && n.y >= 0 && n.y + n.height <= graph.height);
    for (const b of graph.nodes) if (n.id < b.id) assert.ok(!(n.x < b.x + b.width && n.x + n.width > b.x && n.y < b.y + b.height && n.y + n.height > b.y));
  }
  for (const e of graph.edges) for (let i = 1; i < e.points.length; i++) {
    const a = e.points[i - 1], b = e.points[i];
    assert.ok(a.x === b.x || a.y === b.y);
    for (const n of graph.nodes) assert.ok(!hits(a, b, n), `Hierarchy ${e.from}/${e.to} enters ${n.id}`);
  }
}
checkGraph(graph);
for (const role of data.roles) for (const target of ['ui', 'officer-3']) {
  if (role.id === target) continue;
  const edge = { from: role.id, to: target, kind: target === 'ui' ? 'ui' : 'deployment' };
  const route = ordine.handoffRoute(graph, edge);
  assert.ok(route);
  assert.equal(route.from, role.id);
  assert.equal(route.to, target);
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1], b = route.points[i];
    assert.ok(a.x === b.x || a.y === b.y);
    for (const n of graph.nodes) assert.ok(!hits(a, b, n), `Handoff ${role.id}/${target} enters ${n.id}`);
  }
}
assert.equal(ordine.handoffRoute(graph, { from: 'root', to: 'hidden' }), null);
const deeper = model();
deeper.roles.push({ id: 'deeper', title: 'Another visible tier', manager: 'methods' });
assert.equal(ordine.layout(deeper).compact, false);
checkGraph(ordine.layout(deeper));
assert.throws(() => ordine.layout({ ...data, roles: [...data.roles, data.roles[1]] }), /Duplicate/);
assert.throws(() => ordine.layout({ ...data, roles: data.roles.map(r => r.id === 'systems' ? { ...r, manager: 'ui' } : r) }), /Disconnected/);
const workers = [
  { id: 'w1', title: 'One-off', manager: 'officer-1' },
  { id: 'w2', title: 'Nested one-off', manager: 'w1' },
  { id: 'other', title: 'Different owner', manager: 'officer-2' }
];
const branch = ordine.workerBranch({ ...data, workers }, 'officer-1');
assert.deepEqual(branch.roles.map(r => r.id), ['officer-1', 'w1', 'w2']);
checkGraph(ordine.treeLayout(branch));
assert.equal(ordine.workerBranch({ ...data, workers }, 'ui'), null);
console.log('Approved overview geometry, hierarchy, directional handoffs and nested transient expansion pass');
