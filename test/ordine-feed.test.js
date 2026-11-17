'use strict';
const assert = require('node:assert/strict');
const ordine = require('../assets/ordine/ordine.js');

function fakeView() {
  const states = [];
  return { states, update(state) { states.push(state); }, last() { return states.at(-1); } };
}

function reply(status, body) {
  return { status, json: async () => { if (body instanceof Error) throw body; return body; } };
}

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

const order = {
  root: '@king',
  forms: [
    { id: '@king', handle: '@mahogany-apple', parent: null, target_aria: 'aria-king', state: { 'role-name': 'King of Spain', charter: 'Seat of spain.' } },
    { id: '@eng', handle: '@urgent-dynamite', parent: '@king', target_aria: 'aria-eng', state: { 'role-name': 'Figaro Engineer' } },
    { id: '@zanni', handle: '@flypaper-atlas', parent: '@king', target_aria: 'aria-zanni', state: { 'role-name': 'Il Zanni' } },
    { id: '@zap', handle: '@frosting-pushup', parent: '@king', target_aria: 'aria-zap', state: { 'role-name': 'El Zapador' } }
  ],
  topology: { 'aria-w1': 'aria-eng' },
  arias: [
    { id: 'aria-king', handle: 'gimmick-olympics', state: 'active' },
    { id: 'aria-eng', handle: 'lukewarm-utmost', state: 'active' },
    { id: 'aria-zanni', handle: 'silicon-ocular', state: 'active' },
    { id: 'aria-zap', handle: 'tapestry-pageant', state: 'dormant' },
    { id: 'aria-w1', handle: 'settler-shovel', state: 'dormant', mantra: 'Pager topology views' }
  ]
};
const second = { root: '@other', forms: [{ id: '@other', parent: null, target_aria: 'aria-o', state: { name: 'Other order' } }], topology: {}, arias: [{ id: 'aria-o', state: 'idle' }] };
const current = { status: 'current', observed_at: '2026-11-17T04:00:00Z', orders: [order, second] };

(async () => {
  const view = fakeView();
  const calls = [];
  const feed = ordine.feed(view, {
    url: 'hierarchy', immediate: false, uiOwner: '@flypaper-atlas', deploymentOwner: '@frosting-pushup',
    fetch: async (url, init) => { calls.push([url, init]); return reply(200, current); }
  });
  assert.equal(await feed.refresh(), 'current');
  assert.equal(calls[0][0], 'hierarchy');
  assert.equal(calls[0][1].cache, 'no-store');
  assert.deepEqual(view.states.map(s => s.status), ['loading', 'current']);
  const model = view.last().model;
  assert.equal(model.root, '@king');
  assert.deepEqual(model.roles.map(r => r.id), ['@king', '@eng', '@zanni', '@zap']);
  assert.deepEqual(model.workers.map(w => w.id), ['aria-w1']);
  assert.ok(model.communications.some(c => c.from === '@eng' && c.to === '@zanni' && c.kind === 'ui'));
  assert.ok(model.communications.some(c => c.from === '@zanni' && c.to === '@zap' && c.kind === 'deployment'));
  assert.equal(view.last().observedAt, '2026-11-17T04:00:00Z');
  assert.deepEqual(feed.roots(), ['@king', '@other']);
  assert.equal(feed.select('@other'), 'current');
  assert.equal(view.last().model.root, '@other');

  async function outcome(res) {
    const v = fakeView();
    const f = ordine.feed(v, { immediate: false, fetch: async () => { if (res instanceof Error) throw res; return res; } });
    const status = await f.refresh();
    assert.equal(v.last().status, status);
    assert.equal(v.last().model, undefined, 'only current carries a model');
    assert.deepEqual(f.roots(), []);
    return status;
  }
  assert.equal(await outcome(reply(200, { status: 'empty', observed_at: 'x' })), 'empty', 'No owned orders');
  assert.equal(await outcome(reply(200, { status: 'current', orders: [] })), 'empty');
  assert.equal(await outcome(reply(401, { status: 'signedout' })), 'signedout');
  assert.equal(await outcome(reply(403, { status: 'denied' })), 'denied');
  assert.equal(await outcome(reply(503, { status: 'unavailable' })), 'unavailable');
  assert.equal(await outcome(reply(500, {})), 'unavailable');
  assert.equal(await outcome(reply(200, new Error('bad json'))), 'unavailable');
  assert.equal(await outcome(reply(200, { status: 'current', orders: [{ root: 7 }] })), 'unavailable');
  assert.equal(await outcome(reply(200, { status: 'current' })), 'unavailable');
  assert.equal(await outcome(new Error('network')), 'unavailable');

  const slow = fakeView();
  const gates = [deferred(), deferred()];
  let n = 0;
  const raced = ordine.feed(slow, { immediate: false, fetch: () => gates[n++].promise });
  const first = raced.refresh();
  const latest = raced.refresh();
  gates[1].resolve(reply(403, { status: 'denied' }));
  assert.equal(await latest, 'denied');
  gates[0].resolve(reply(200, current));
  assert.equal(await first, 'superseded', 'an older reply never restores a withdrawn tree');
  assert.equal(slow.last().status, 'denied');

  const polled = fakeView();
  let answer = reply(200, current);
  const quiet = ordine.feed(polled, { immediate: false, fetch: async () => answer });
  await quiet.refresh();
  const before = polled.states.length;
  await quiet.poll();
  assert.deepEqual(polled.states.slice(before).map(s => s.status), ['current'], 'a quiet poll keeps the tree until its reply');
  answer = reply(403, { status: 'denied' });
  await quiet.poll();
  assert.equal(polled.last().status, 'denied', 'a refused poll withdraws the tree');
  answer = reply(200, current);
  await quiet.refresh();
  assert.equal(quiet.withdraw(), 'signedout');
  assert.deepEqual(quiet.roots(), []);
  quiet.close();
  assert.equal(await quiet.refresh(), 'closed');

  console.log('Order feed: current projection, No owned orders, refusals, malformed replies, stale replies and quiet polls pass');
})().catch(e => { console.error(e); process.exit(1); });
