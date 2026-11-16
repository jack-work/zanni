'use strict';
const assert = require('node:assert/strict');
const strati = require('../assets/strati/strati.js');
const ordine = require('../assets/ordine/ordine.js');

function hits(p, q, n) {
  return p.x === q.x
    ? p.x > n.x && p.x < n.x + n.width && Math.max(p.y, q.y) > n.y && Math.min(p.y, q.y) < n.y + n.height
    : p.y > n.y && p.y < n.y + n.height && Math.max(p.x, q.x) > n.x && Math.min(p.x, q.x) < n.x + n.width;
}

function validateOrthogonal(result, width) {
  const byId = new Map(result.nodes.map(n => [n.id, n]));
  for (const n of result.nodes) {
    assert.ok(n.x >= 0 && n.x + n.width <= width, `outside width: ${n.id}`);
    assert.ok(n.y >= 0 && n.y + n.height <= result.height, `outside height: ${n.id}`);
    for (const b of result.nodes) {
      if (n.id >= b.id) continue;
      assert.ok(!(n.x < b.x + b.width && n.x + n.width > b.x && n.y < b.y + b.height && n.y + n.height > b.y), `overlap: ${n.id}/${b.id}`);
    }
  }
  for (const e of result.edges) {
    const a = byId.get(e.from), b = byId.get(e.to);
    assert.ok(a.rank < b.rank && a.y + a.height < b.y);
    assert.equal(e.points[0].y, a.y + a.height);
    assert.equal(e.points.at(-1).y, b.y);
    for (let i = 1; i < e.points.length; i++) {
      const p = e.points[i - 1], q = e.points[i];
      assert.ok(p.x === q.x || p.y === q.y, 'nonorthogonal segment');
      assert.ok(q.y >= p.y, 'upward authority edge');
      assert.ok(p.x >= 0 && p.x <= width && q.x >= 0 && q.x <= width);
      for (const n of result.nodes) {
        assert.ok(!hits(p, q, n), `edge ${e.from}/${e.to} passes through ${n.id}`);
      }
    }
  }
  assert.ok(result.metrics.crossingsAfter <= result.metrics.crossingsBefore);
}

const crossing = {
  nodes: ['p', 'q', 'r', 's'].map(id => ({ id, width: 100, height: 60 })),
  edges: [{ from: 'p', to: 's' }, { from: 'q', to: 'r' }]
};
const reduced = strati.layout(crossing, { width: 700 });
assert.equal(reduced.metrics.crossingsBefore, 1);
assert.equal(reduced.metrics.crossingsAfter, 0);
assert.deepEqual(reduced, strati.layout(crossing, { width: 700 }));
validateOrthogonal(reduced, 700);

assert.throws(() => strati.layout({
  nodes: [{ id: 'a', width: 100, height: 50 }, { id: 'b', width: 100, height: 50 }],
  edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }]
}), /cycle/);
assert.throws(() => strati.layout(crossing, { width: 120 }), /Width budget/);
assert.throws(() => strati.layout({ nodes: crossing.nodes, edges: [{ from: 'missing', to: 'p' }] }), /endpoint/);
assert.deepEqual(strati.layout({ nodes: [], edges: [] }).nodes, []);

let seed = 713;
const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
for (let run = 0; run < 24; run++) {
  const count = 12 + Math.floor(random() * 35);
  const graph = {
    nodes: Array.from({ length: count }, (_, i) => ({ id: `n${i}`, width: 180 + Math.floor(random() * 50), height: 65 + Math.floor(random() * 40) })),
    edges: []
  };
  for (let i = 1; i < count; i++) graph.edges.push({ from: `n${Math.floor(random() * i)}`, to: `n${i}` });
  const original = JSON.stringify(graph);
  Object.freeze(graph.nodes);
  Object.freeze(graph.edges);
  for (const width of [320, 620, 900, 1200]) {
    const result = strati.layout(graph, { width });
    validateOrthogonal(result, width);
    assert.equal(JSON.stringify(graph), original);
    assert.deepEqual(result, strati.layout(graph, { width }));
    assert.ok(result.metrics.columns <= 4);
  }
}

const bandedCyclic = {
  nodes: [
    { id: 'ingest', width: 160, height: 48, band: 0 },
    { id: 'store', width: 160, height: 48, band: 0 },
    { id: 'router', width: 160, height: 48, band: 1 },
    { id: 'worker', width: 160, height: 48, band: 1 },
    { id: 'view', width: 160, height: 48, band: 2 }
  ],
  edges: [
    { from: 'ingest', to: 'store' },
    { from: 'ingest', to: 'view' },
    { from: 'store', to: 'router' },
    { from: 'router', to: 'worker' },
    { from: 'worker', to: 'router' },
    { from: 'worker', to: 'view' }
  ]
};
const bundled = strati.layout(bandedCyclic, { routing: 'bundled', allowCycles: true });
assert.equal(bundled.metrics.reversedEdges, 1);
assert.ok(bundled.metrics.dummyCount >= 2);
for (const e of bundled.edges) {
  assert.ok(typeof e.d === 'string' && e.d.startsWith('M') && e.d.includes(' C'));
  assert.ok(Array.isArray(e.waypoints) && e.waypoints.length >= 2);
}
const longEdge = bundled.edges.find(e => e.from === 'ingest' && e.to === 'view');
assert.ok(longEdge.waypoints.length >= 4);
assert.ok(longEdge.skippedLayers >= 2);

const cyclicOrtho = strati.layout(bandedCyclic, { routing: 'orthogonal', allowCycles: true, width: 960 });
assert.equal(cyclicOrtho.metrics.reversedEdges, 1);
for (const e of cyclicOrtho.edges) {
  for (let i = 1; i < e.points.length; i++) {
    const p = e.points[i - 1], q = e.points[i];
    assert.ok(p.x === q.x || p.y === q.y);
    for (const n of cyclicOrtho.nodes) assert.ok(!hits(p, q, n));
  }
}

const secondary = strati.routeOrthogonal(reduced, { from: 's', to: 'q' });
assert.ok(secondary);
for (let i = 1; i < secondary.points.length; i++) {
  const p = secondary.points[i - 1], q = secondary.points[i];
  assert.ok(p.x === q.x || p.y === q.y);
  for (const n of reduced.nodes) assert.ok(!hits(p, q, n));
}

const formsSnapshot = {
  root: '@king',
  forms: [
    { id: '@king', handle: '@mahogany-apple', parent: 'null', target_aria: 'aria-king', state: { 'role-name': 'King of Spain', charter: 'Seat of spain. Governs releases.', system: { apiKey: 'secret-never-copy' }, handoff: '/private/path' } },
    { id: '@coord', handle: '@actress-pledge', parent: '@king', target_aria: 'aria-king', state: { name: 'Coordinador de Spain', charter: 'Deploy queue.' } },
    { id: '@eng', handle: '@urgent-dynamite', parent: '@king', target_aria: 'aria-eng', state: { 'role-name': 'Figaro Engineer', charter: 'Builds and releases figaro.' } },
    { id: '@arq', handle: '@urban-olympics', parent: '@eng', target_aria: 'aria-eng', state: { 'role-name': 'El Arquitecto', lifecycle: { status: 'routing-alias' }, charter: 'Modular runtime plan.' } },
    { id: '@arch', handle: '@shack-aidless', parent: '@eng', target_aria: '', state: { 'role-name': 'El Archivero', lifecycle: { status: 'inactive' }, charter: 'Scratch review docs.' } },
    { id: '@zanni', handle: '@flypaper-atlas', parent: '@king', target_aria: 'aria-zanni', state: { 'role-name': 'Il Zanni', charter: 'Shared visual components.' } },
    { id: '@zap', handle: '@frosting-pushup', parent: '@king', target_aria: 'aria-zap', state: { 'role-name': 'El Zapador', charter: 'Spain executor.' } }
  ],
  topology: {
    'aria-w1': 'aria-eng',
    'aria-w2': 'aria-w1'
  },
  arias: [
    { id: 'aria-king', handle: 'gimmick-olympics', state: 'active', mantra: 'King of Spain: central command' },
    { id: 'aria-eng', handle: 'lukewarm-utmost', state: 'active', mantra: 'Figaro Engineer: issues' },
    { id: 'aria-zanni', handle: 'kleenex-anxiety', state: 'active', mantra: 'Zanni: ship ordine & strati' },
    { id: 'aria-zap', handle: 'tapestry-pageant', state: 'dormant', mantra: 'El Zapador: merges' },
    { id: 'aria-w1', handle: 'settler-shovel', state: 'dormant', mantra: 'Pager topology views' },
    { id: 'aria-w2', handle: 'dozed-eccentric', state: 'active', mantra: 'Layer carve trace' },
    { id: 'aria-old', handle: 'cuisine-vexingly', state: 'dormant', mantra: 'SUCCEEDED: old holder', parent: 'aria-eng' }
  ]
};

const projected = ordine.fromForms(formsSnapshot, { uiOwner: '@flypaper-atlas', deploymentOwner: '@frosting-pushup' });
assert.equal(projected.root, '@king');
assert.deepEqual(projected.roles.map(r => r.id), ['@king', '@eng', '@zanni', '@zap']);
assert.ok(!JSON.stringify(projected).includes('secret-never-copy'));
assert.ok(!JSON.stringify(projected).includes('/private/path'));
assert.equal(projected.workers.length, 2);
assert.ok(projected.communications.some(c => c.from === '@eng' && c.to === '@zanni' && c.kind === 'ui'));
assert.ok(projected.communications.some(c => c.from === '@zanni' && c.to === '@zap' && c.kind === 'deployment'));
const laidOut = ordine.layout(projected);
validateOrthogonal(laidOut, laidOut.width);

const allForms = ordine.fromForms(formsSnapshot, { includeInactive: true });
assert.ok(allForms.roles.some(r => r.id === '@arch'));
validateOrthogonal(ordine.layout(allForms), ordine.layout(allForms).width);

console.log('strati: orthogonal and bundled Sugiyama layout, bands, cycle policy, A* routing and Figaro forms projection pass');
