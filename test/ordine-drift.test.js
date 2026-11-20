'use strict';
const assert = require('node:assert/strict');
const ordine = require('../assets/ordine/ordine.js');

const model = {
  root: '@96447061',
  roles: [
    { id: '@96447061', title: 'King', manager: null },
    { id: '@ee9271497f3823d7f50922bec4899818', title: 'Engineer', manager: '@96447061', aliases: [{ id: '@edea54025f3f3c6c1d8c2b27439d35f3' }] },
    { id: '@62c5c9bf8794ec5b8d1d00d05dd26c69', title: 'Zanni', manager: '@96447061' }
  ]
};
const body = {
  generated_at: '2026-11-20T01:00:00Z', source: 'figaro-apply-roles --check -j',
  roles: [
    { role: 'king', id: '@96447061', status: 'ok', changes: [] },
    { role: 'figaro-engineer', id: '@ee9271497f3823d7f50922bec4899818', status: 'drift', changes: [{ key: 'system.model', live: '"gpt-6.1"', want: '"claude-opus-4-5"' }, { key: 'system.fanout.quota', live: 4, want: 8 }] },
    { role: 'el-arquitecto', id: '@edea54025f3f3c6c1d8c2b27439d35f3', status: 'drift', changes: [{ key: 'name', live: '"x"', want: '"y"' }] },
    { role: 'il-zanni', id: '@62c5c9bf8794ec5b8d1d00d05dd26c69', status: 'drift', unseated: true, changes: [] },
    { role: 'ghost', id: '@ffffffffffffffffffffffffffffffff', status: 'extra', changes: [] },
    { role: 'weird', id: '@96447061aaaa', status: '<script>', changes: 'nope' }
  ]
};
const d = ordine.driftFor(model, body);
assert.equal(d.state, 'ok');
assert.equal(d.roles['@96447061'].status, 'error', 'an unknown status is an error, never ok, and the worst status of a seat wins');
assert.equal(d.roles['@ee9271497f3823d7f50922bec4899818'].changes.length, 3, 'the alias form drift joins its primary seat');
assert.equal(d.roles['@ee9271497f3823d7f50922bec4899818'].changes[1].live, '4', 'values are exact JSON text');
assert.equal(d.roles['@62c5c9bf8794ec5b8d1d00d05dd26c69'].unseated, true);
assert.deepEqual(d.outside.map((o) => o.id), ['@ffffffffffffffffffffffffffffffff']);
assert.equal(ordine.driftFor(model, null).state, 'failed');
assert.equal(ordine.driftFor(model, { roles: 'x' }).state, 'failed');
assert.equal(ordine.driftFor(model, { roles: [{ id: 'short', status: 'drift' }] }).outside.length, 1, 'ids too short to match prefix-wise do not match anything');

function reply(status, json) { return { status, json: async () => json }; }
const order = { root: '@king', forms: [{ id: '@king', parent: null, target_aria: 'a', state: { 'role-name': 'King of Spain' } }, { id: '@kingdeputy1', parent: '@king', target_aria: 'b', state: { 'role-name': 'Deputy' } }], topology: {}, arias: [{ id: 'a', state: 'active' }, { id: 'b', state: 'idle' }] };
const hierarchy = { status: 'current', observed_at: 't', orders: [order] };

(async () => {
  const states = [];
  const view = { update: (s) => states.push(s) };
  const fetchWith = (driftReply) => async (url) => (url === 'hierarchy' ? reply(200, hierarchy) : driftReply(url));
  const feed = ordine.feed(view, { fetch: fetchWith(() => reply(200, { generated_at: 'g', roles: [{ id: '@kingdeputy1', status: 'drift', changes: [{ key: 'k', live: 'a', want: 'b' }] }] })), url: 'hierarchy', driftUrl: 'drift', immediate: false });
  await feed.refresh();
  let last = states.at(-1);
  assert.equal(last.status, 'current');
  assert.equal(last.model.drift.state, 'ok');
  assert.equal(last.model.drift.roles['@kingdeputy1'].changes[0].want, 'b');

  for (const [name, answer] of [['HTTP 502', () => reply(502, {})], ['HTTP 403', () => reply(403, {})], ['no answer', () => { throw new Error('net'); }], ['unreadable', () => reply(200, 'x')]]) {
    const f = ordine.feed({ update: (s) => states.push(s) }, { fetch: fetchWith(answer), url: 'hierarchy', driftUrl: 'drift', immediate: false });
    await f.refresh();
    last = states.at(-1);
    assert.equal(last.status, 'current', name + ': the hierarchy still shows');
    assert.equal(last.model.drift.state, 'failed', name + ': a drift check that did not run is never shown as clean');
    assert.deepEqual(last.model.drift.roles, {});
  }

  const plain = ordine.feed({ update: (s) => states.push(s) }, { fetch: fetchWith(() => { throw new Error('must not be asked'); }), url: 'hierarchy', immediate: false });
  await plain.refresh();
  assert.equal(states.at(-1).model.drift, undefined, 'without driftUrl the page has no drift claim at all');
  console.log('Order drift: seat mapping, exact values, aliases, outside seats, failed checks never clean');
})();
