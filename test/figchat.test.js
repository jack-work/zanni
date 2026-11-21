'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const speech = require('../assets/figchat/speech.js');
const mock = require('../examples/aria-mock.js');

let failed = 0;
async function test(name, fn) {
  try { await fn(); process.stdout.write('ok   ' + name + '\n'); } catch (e) { failed++; process.stdout.write('FAIL ' + name + '\n' + (e && e.stack || e) + '\n'); }
}

(async () => {
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
    const tagged = speech.gateway({ WebSocket: FakeSocket, base: 'https://fig.example/chat/', url: 'audio', window: {}, session: 'abcDEF_-12345678' });
    tagged.open({ aria: 'c0ffee01c0ffee01c0ffee01c0ffee01' }, {}).voice(true);
    assert.strictEqual(socks.pop().url, 'wss://fig.example/chat/audio/c0ffee01c0ffee01c0ffee01c0ffee01?session=abcDEF_-12345678', 'the session id rides the audio upgrade as a query');
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

  await test('bundle: the Vite build is flattened so ./assets/<file> in index.html resolves beside it, and every sum matches', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'figchat-dist-'));
    const dist = path.join(root, 'dist');
    fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(root, 'THIRD-PARTY.txt'), 'notices\n');
    fs.writeFileSync(path.join(dist, 'assets', 'index-abc.js'), 'export {};\n');
    fs.writeFileSync(path.join(dist, 'assets', 'style-abc.css'), 'body{}\n');
    const page = (extra) => '<!doctype html><script type="module" src="./assets/index-abc.js"></script><link rel="stylesheet" href="./assets/style-abc.css">' + extra;
    fs.writeFileSync(path.join(dist, 'index.html'), page(''));
    const out = path.join(root, 'out');
    const bundle = (target) => cp.execFileSync('node', [path.join(__dirname, '..', 'bin', 'figchat-bundle'), target, dist], { stdio: 'pipe' });
    bundle(out);
    const files = fs.readdirSync(out).sort();
    assert.deepStrictEqual(files, ['SHA256SUMS', 'THIRD-PARTY.txt', 'index-abc.js', 'index.html', 'style-abc.css']);
    const index = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    (index.match(/(?:src|href)="\.\/assets\/[^"]+"/g) || []).forEach((m) => assert.ok(files.includes(m.replace(/^[^"]+"\.\/assets\//, '').slice(0, -1)), m));
    fs.readFileSync(path.join(out, 'SHA256SUMS'), 'utf8').trim().split('\n').forEach((line) => {
      const [sum, name] = line.split('  ');
      assert.strictEqual(require('crypto').createHash('sha256').update(fs.readFileSync(path.join(out, name))).digest('hex'), sum, name);
    });
    ['<script>alert(1)</script>', '<style>b{}</style>', '<p style="color:red">x</p>', '<p onclick="x()">x</p>'].forEach((bad) => {
      fs.writeFileSync(path.join(dist, 'index.html'), page(bad));
      assert.throws(() => bundle(path.join(root, 'bad')), /inline script or style/, bad);
    });
    fs.rmSync(root, { recursive: true, force: true });
  });

  await test('pcm worklet: any input rate becomes 40 ms frames of 16 kHz s16le with a level, and the tone survives', () => {
    const { Framer, FRAME_SAMPLES } = require('../assets/figchat/pcm-worklet.js');
    assert.strictEqual(FRAME_SAMPLES, 640);
    for (const rate of [48000, 44100, 16000]) {
      const frames = [];
      const f = new Framer(rate, (buf, level) => frames.push({ buf, level }));
      let t = 0;
      for (let k = 0; k < Math.floor(rate / 128); k++) {
        const blk = new Float32Array(128);
        for (let i = 0; i < 128; i++) blk[i] = 0.3 * Math.sin(2 * Math.PI * 440 * (t++) / rate);
        f.push(blk);
      }
      assert.ok(frames.length >= 23 && frames.length <= 25, rate + ' Hz gave ' + frames.length + ' frames');
      assert.ok(frames.every((x) => x.buf.byteLength === 1280), 'every frame is 40 ms of s16le');
      assert.ok(frames.every((x) => x.level > 0.9), 'a loud tone reads as a high level');
      const pcm = Int16Array.from(frames.flatMap((x) => [...new Int16Array(x.buf)]));
      let crossings = 0;
      for (let i = 1; i < pcm.length; i++) if (pcm[i - 1] <= 0 && pcm[i] > 0) crossings++;
      const hz = crossings / (pcm.length / 16000);
      assert.ok(Math.abs(hz - 440) < 25, rate + ' Hz input keeps its pitch: ' + hz);
    }
    const quiet = [];
    new Framer(48000, (b, l) => quiet.push(l)).push(new Float32Array(48000));
    assert.ok(quiet.length >= 24 && quiet.every((l) => l === 0), 'silence reads as level zero');
  });

  await test('vendored client: SOURCE.json names the figaro-forms revision the tarball was cut from, and the lockfile pins it', () => {
    const web = path.join(__dirname, '..', 'web');
    const src = JSON.parse(fs.readFileSync(path.join(web, 'vendor', 'SOURCE.json'), 'utf8'));
    assert.ok(/^[0-9a-f]{40}$/.test(src.rev));
    assert.ok(fs.existsSync(path.join(web, 'vendor', src.file)));
    const lock = JSON.parse(fs.readFileSync(path.join(web, 'package-lock.json'), 'utf8'));
    assert.strictEqual(lock.packages['node_modules/figaro-forms'].resolved, 'file:vendor/' + src.file);
    assert.strictEqual(lock.packages['node_modules/figaro-forms'].integrity, src.integrity);
  });

  process.stdout.write(failed ? failed + ' failed\n' : 'figchat: all passed\n');
  process.exit(failed ? 1 : 0);
})();
