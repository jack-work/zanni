'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const figchat = require('../assets/figchat/figchat.js');
const speech = require('../assets/figchat/speech.js');
const mock = require('../examples/aria-mock.js');

let failed = 0;
async function test(name, fn) {
  try { await fn(); process.stdout.write('ok   ' + name + '\n'); } catch (e) { failed++; process.stdout.write('FAIL ' + name + '\n' + (e && e.stack || e) + '\n'); }
}

(async () => {
  await test('deep link: store, aria and optional turn round trip', () => {
    assert.deepStrictEqual(figchat.parseRoute('#/local/abc123'), { store: 'local', aria: 'abc123' });
    assert.deepStrictEqual(figchat.parseRoute('#/local/abc123:17'), { store: 'local', aria: 'abc123', turn: 17 });
    assert.deepStrictEqual(figchat.parseRoute('#/local'), { store: 'local', aria: '' });
    assert.strictEqual(figchat.parseRoute('#/'), null);
    assert.strictEqual(figchat.parseRoute('#/a/b:x'), null);
    assert.strictEqual(figchat.routeFor('local', 'abc', 17), '#/local/abc:17');
    assert.strictEqual(figchat.routeFor('local', 'abc'), '#/local/abc');
    assert.strictEqual(figchat.routeFor('', 'abc'), '#/');
    const r = figchat.parseRoute(figchat.routeFor('a b', 'c/d', 3));
    assert.deepStrictEqual(r, { store: 'a b', aria: 'c/d', turn: 3 });
  });

  await test('list: depth follows the parent chain in the daemon order, a missing parent is a root', () => {
    const rows = [{ id: 'a' }, { id: 'b', parent: 'a' }, { id: 'c', parent: 'b' }, { id: 'd', parent: 'gone' }, { id: 'e', parent: 'e' }];
    assert.deepStrictEqual(figchat.depths(rows), { a: 0, b: 1, c: 2, d: 0, e: 0 });
  });

  await test('list: the label prefers the mantra, then handle, then the short id', () => {
    assert.strictEqual(figchat.labelOf({ id: 'abcdef012345', mantra: 'M', handle: 'H', short: 'S' }), 'M');
    assert.strictEqual(figchat.labelOf({ id: 'abcdef012345', handle: 'H' }), 'H');
    assert.strictEqual(figchat.labelOf({ id: 'abcdef012345' }), 'abcdef01');
  });

  await test('mock door: list pages in tree order and says where the next page starts', async () => {
    const core = mock.create({ step: 1 });
    const out = [];
    const conn = core.attach({ text: (s) => out.push(JSON.parse(s)), close() {} });
    conn.receive(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'figaro.list', params: { limit: 8 } }));
    conn.receive(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'figaro.list', params: { limit: 8, before: out[0].result.next_before } }));
    assert.strictEqual(out[0].result.figaros.length, 8);
    assert.ok(out[0].result.next_before);
    assert.ok(out[1].result.figaros.length > 0 && !out[1].result.next_before);
    const ids = out[0].result.figaros.concat(out[1].result.figaros).map((r) => r.id);
    assert.strictEqual(new Set(ids).size, ids.length);
  });

  await test('speech mock: settled prose becomes PCM chunks tagged with turn and node, only when voice is on', async () => {
    const m = speech.mock({ gap: 0 });
    const fns = [];
    const got = [], ended = [];
    const conn = m.open({ aria: 'x', events: (fn) => { fns.push(fn); return () => {}; } }, { chunk: (c) => got.push(c), end: (e) => ended.push(e), error() {} });
    const settled = { type: 'prose.settled', kind: 'prose', turn: 4, node: 2, text: 'Buongiorno signore, largo al factotum della citta' };
    fns[0](settled);
    await new Promise((r) => setTimeout(r, 30));
    assert.strictEqual(got.length, 0, 'voice off speaks nothing');
    conn.voice(true);
    fns[0](settled);
    fns[0]({ type: 'thinking.settled', kind: 'thinking', turn: 4, node: 1, text: 'hmm' });
    await new Promise((r) => setTimeout(r, 80));
    assert.ok(got.length >= 1);
    assert.ok(got.every((c) => c.turn === 4 && c.node === 2 && c.aria === 'x'));
    assert.deepStrictEqual(got.map((c) => c.seq), got.map((_, i) => i));
    assert.ok(got.every((c) => c.pcm.byteLength % 2 === 0 && c.format.rate === 24000 && c.format.bits === 16));
    assert.strictEqual(ended.length, 1);
    assert.strictEqual(ended[0].node, 2);
    fns[0](settled);
    await new Promise((r) => setTimeout(r, 40));
    assert.strictEqual(ended.length, 1, 'a node is spoken once');
  });

  await test('bundle: the shell lists exactly the files it needs and every sum matches', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'figchat-bundle-'));
    cp.execFileSync('node', [path.join(__dirname, '..', 'bin', 'figchat-bundle'), out]);
    const files = [];
    (function walk(d) { fs.readdirSync(d, { withFileTypes: true }).forEach((e) => { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else files.push(path.relative(out, p)); }); }(out));
    ['index.html', 'boot.js', 'figchat.js', 'figchat.css', 'speech.js', 'aria.js', 'aria-source.json', 'nodi.js', 'nodi.css', 'voce.js', 'voce.css', 'SHA256SUMS'].forEach((f) => assert.ok(files.includes(f), f));
    const index = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    (index.match(/(?:src|href)="assets\/[^"]+"/g) || []).forEach((m) => assert.ok(files.includes(m.replace(/^[^"]+"assets\//, '').slice(0, -1)), m));
    fs.rmSync(out, { recursive: true, force: true });
  });

  await test('vendored client: SOURCE.json names the figaro-forms head the bundle was cut from', () => {
    const src = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'assets', 'aria', 'SOURCE.json'), 'utf8'));
    assert.ok(/^[0-9a-f]{40}$/.test(src.sha));
    assert.strictEqual(src.entry, 'figaro-forms/aria');
  });

  process.stdout.write(failed ? failed + ' failed\n' : 'figchat: all passed\n');
  process.exit(failed ? 1 : 0);
})();
