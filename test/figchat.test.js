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

  await test('speech mock: prose is spoken from its first sentence, tagged with turn, node and cursor, only when voice is on', async () => {
    const m = speech.mock({ gap: 0 });
    let push;
    const got = [], started = [], ended = [], cancelled = [];
    const conn = m.open({ aria: 'x', watch: (fn) => { push = fn; return () => {}; } }, { chunk: (c) => got.push(c), start: (e) => started.push(e), end: (e) => ended.push(e), cancel: (e) => cancelled.push(e), error() {} });
    const turn = (n, text, open) => ({ turn: n, open, items: [{ kind: 'thinking', node: 0, text: 'hmm' }, { kind: 'prose', node: 1, text }], end: null });
    push([turn(3, 'old words.', false)]);
    push([turn(3, 'old words.', false), turn(4, 'First sentence. Second', true)]);
    await new Promise((r) => setTimeout(r, 30));
    assert.strictEqual(got.length, 0, 'voice off speaks nothing');
    conn.voice(true);
    push([turn(3, 'old words.', false), turn(4, 'First sentence. Second one here. Tail', true)]);
    await new Promise((r) => setTimeout(r, 60));
    assert.strictEqual(started.length, 1);
    assert.strictEqual(started[0].turn, 4);
    assert.strictEqual(started[0].node, 1);
    assert.strictEqual(started[0].key, 'mock/x:4/out');
    assert.strictEqual(started[0].rate, 24000);
    assert.ok(got.length >= 1);
    assert.ok(got.every((c) => c.turn === 4 && c.node === 1 && c.cursor === '4.2' && c.pcm.byteLength % 2 === 0 && c.bytes === c.pcm.byteLength));
    assert.deepStrictEqual(got.map((c) => c.offset), got.map((c, i) => got.slice(0, i).reduce((n, x) => n + x.bytes, 0)));
    assert.ok(!m.spoken.some((x) => x.turn === 3), 'history is not spoken');
    push([turn(3, 'old words.', false), turn(4, 'First sentence. Second one here. Tail', false)]);
    await new Promise((r) => setTimeout(r, 80));
    assert.strictEqual(ended.length, 1);
    assert.strictEqual(ended[0].key, 'mock/x:4/out');
    assert.ok(m.spoken.some((x) => x.text === 'Tail'));
    push([turn(3, 'old words.', false), turn(4, 'First sentence. Second one here. Tail', false)]);
    await new Promise((r) => setTimeout(r, 30));
    assert.strictEqual(ended.length, 1, 'a turn is finished once');
  });

  await test('speech gateway: text frames and the binary frame behind audio.chunk become one tagged chunk', () => {
    const socks = [];
    class FakeSocket {
      constructor(url) { this.url = url; this.sent = []; this.l = {}; socks.push(this); }
      addEventListener(n, f) { (this.l[n] = this.l[n] || []).push(f); }
      emit(n, ev) { (this.l[n] || []).forEach((f) => f(ev)); }
      send(x) { this.sent.push(x); }
      close() { this.closed = true; }
    }
    const g = speech.gateway({ WebSocket: FakeSocket, base: 'https://fig.example/chat/', url: 'audio', window: {} });
    const out = [];
    const conn = g.open({ aria: 'c0ffee01c0ffee01c0ffee01c0ffee01' }, { ready: (e) => out.push(['ready', e.store]), start: (e) => out.push(['start', e.turn, e.key, e.node, e.cursor, e.rate]), chunk: (c) => out.push(['chunk', c.turn, c.node, c.cursor, c.offset, c.pcm.byteLength]), end: (e) => out.push(['end', e.key]), cancel: (e) => out.push(['cancel', e.why]), error: (e) => out.push(['error', e.code]) });
    assert.strictEqual(socks.length, 0, 'no socket until voice is on');
    const said = g.open({ aria: 'feedfacefeedfacefeedfacefeedface' }, {});
    said.say(7);
    const sayer = socks.pop();
    assert.deepStrictEqual(sayer.sent, [], 'say waits for the socket to open');
    sayer.readyState = 1;
    sayer.emit('open', {});
    assert.deepStrictEqual(sayer.sent.map((x) => JSON.parse(x)), [{ type: 'say', turn: 7 }], 'say asks the gateway to speak one turn once the socket opens');
    conn.voice(true);
    assert.strictEqual(socks.length, 1);
    assert.strictEqual(socks[0].url, 'wss://fig.example/chat/audio/c0ffee01c0ffee01c0ffee01c0ffee01');
    const t = (o) => socks[0].emit('message', { data: JSON.stringify(o) });
    t({ type: 'ready', aria: 'x', store: 'gluck' });
    t({ type: 'audio.start', turn: 5, key: 'gluck/x:5/out', format: 'pcm', rate: 24000, bits: 16, channels: 1, node: 2, cursor: '5.3' });
    t({ type: 'audio.chunk', turn: 5, node: 2, cursor: '5.3', offset: 0, bytes: 4 });
    socks[0].emit('message', { data: new ArrayBuffer(4) });
    socks[0].emit('message', { data: new ArrayBuffer(4) });
    t({ type: 'audio.chunk', turn: 5, node: 2, cursor: '5.3', offset: 4, bytes: 3 });
    socks[0].emit('message', { data: new ArrayBuffer(3) });
    t({ type: 'audio.end', turn: 5, key: 'gluck/x:5/out' });
    t({ type: 'audio.cancel', turn: 6, key: 'k', why: 'interrupt' });
    t({ type: 'error', turn: 6, code: 'speech', text: 'down' });
    assert.deepStrictEqual(out, [['ready', 'gluck'], ['start', 5, 'gluck/x:5/out', 2, '5.3', 24000], ['chunk', 5, 2, '5.3', 0, 4], ['end', 'gluck/x:5/out'], ['cancel', 'interrupt'], ['error', 'speech']]);
    conn.cancel();
    assert.deepStrictEqual(JSON.parse(socks[0].sent[0]), { type: 'cancel' });
    conn.voice(false);
    assert.ok(socks[0].closed);
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
