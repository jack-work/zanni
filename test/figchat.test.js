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
    fs.writeFileSync(path.join(dist, 'assets', 'index-AbCd1234.js'), 'export {};\n');
    fs.writeFileSync(path.join(dist, 'assets', 'style-WxYz5678.css'), 'body{}\n');
    const page = (extra) => '<!doctype html><script type="module" src="./assets/index-AbCd1234.js"></script><link rel="stylesheet" href="./assets/style-WxYz5678.css">' + extra;
    fs.writeFileSync(path.join(dist, 'index.html'), page(''));
    const out = path.join(root, 'out');
    const bundle = (target) => cp.execFileSync('node', [path.join(__dirname, '..', 'bin', 'figchat-bundle'), target, dist], { stdio: 'pipe' });
    bundle(out);
    const files = fs.readdirSync(out).sort();
    assert.deepStrictEqual(files, ['SHA256SUMS', 'STATS.json', 'THIRD-PARTY.txt', 'index-AbCd1234.js', 'index.html', 'style-WxYz5678.css']);
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

  await test('bundle: STATS.json lists every file with raw and gzip bytes, flags content-hashed names, and an unhashed asset fails the build', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'figchat-stats-'));
    const dist = path.join(root, 'dist');
    fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(root, 'THIRD-PARTY.txt'), 'notices\n');
    const body = 'export const a = ' + JSON.stringify('x'.repeat(4000)) + ';\n';
    fs.writeFileSync(path.join(dist, 'assets', 'index-AbCd1234.js'), body);
    fs.writeFileSync(path.join(dist, 'assets', 'face-q_-9Zk0a.woff2'), 'font');
    fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><script type="module" src="./assets/index-AbCd1234.js"></script>');
    const bundle = (target) => cp.execFileSync('node', [path.join(__dirname, '..', 'bin', 'figchat-bundle'), target, dist], { stdio: 'pipe' });
    const out = path.join(root, 'out');
    bundle(out);
    const stats = JSON.parse(fs.readFileSync(path.join(out, 'STATS.json'), 'utf8'));
    assert.deepStrictEqual(Object.keys(stats.files).sort(), ['THIRD-PARTY.txt', 'face-q_-9Zk0a.woff2', 'index-AbCd1234.js', 'index.html']);
    const js = stats.files['index-AbCd1234.js'];
    assert.strictEqual(js.raw, Buffer.byteLength(body));
    assert.strictEqual(js.gzip, require('zlib').gzipSync(body, { level: 9 }).length);
    assert.ok(js.gzip < js.raw / 4, 'repetitive text compresses');
    assert.deepStrictEqual(Object.entries(stats.files).filter(([, f]) => f.hashed).map(([n]) => n).sort(), ['face-q_-9Zk0a.woff2', 'index-AbCd1234.js']);
    assert.strictEqual(stats.total.raw, Object.values(stats.files).reduce((n, f) => n + f.raw, 0));
    assert.strictEqual(stats.total.gzip, Object.values(stats.files).reduce((n, f) => n + f.gzip, 0));
    fs.writeFileSync(path.join(dist, 'assets', 'plain.js'), 'x');
    assert.throws(() => bundle(path.join(root, 'bad')), /no content hash/);
    fs.rmSync(root, { recursive: true, force: true });
  });

  const rpc = (conn, out) => {
    let n = 0;
    return (method, params) => {
      const id = ++n;
      conn.receive(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
      return out.find((m) => m.id === id).result;
    };
  };

  await test('mock bench mode: 10000 turns of history page backward in order, and a reply streams at the set frame rate and size', async () => {
    const fresh = mock.create({ step: 1 });
    assert.strictEqual(fresh.arias[fresh.ids.main].turns.length, 26, 'the default history is today\'s fixture');
    const core = mock.create({ history: 10000, pageBytes: 24000, stream: { fps: 50, bytes: 1000, chunk: 50 } });
    const out = [];
    const conn = core.attach({ text: (s) => out.push(JSON.parse(s)), close() {} });
    const call = rpc(conn, out);
    const main = core.ids.main;
    assert.strictEqual(core.arias[main].turns.length, 10000);
    let page = call('figaro.read', { figaro_id: main, backward: true, limit: 24000 });
    assert.strictEqual(page.parts[page.parts.length - 1].turn, 10000);
    assert.ok(page.more.before && JSON.stringify(page).length <= 24000 + 2000);
    for (let i = 0; i < 3; i++) {
      const top = page.parts[0].turn;
      page = call('figaro.read', { figaro_id: main, backward: true, limit: 24000, at: page.prev });
      assert.strictEqual(page.parts[page.parts.length - 1].turn, top - 1, 'the next page ends where the last began');
      page.parts.forEach((p, k) => k && assert.strictEqual(p.turn, page.parts[k - 1].turn + 1));
    }
    const deep = call('figaro.read', { figaro_id: main, backward: true, limit: 24000, at: { turn: 5000, node: 0 } });
    assert.strictEqual(deep.parts[deep.parts.length - 1].turn, 4999);
    call('figaro.follow', { figaro_id: main });
    out.length = 0;
    const stamps = [];
    const live = core.attach({ text: (s) => { const m = JSON.parse(s); if (m.method === 'figaro.aria' && m.params.parts[0].live && m.params.parts[0].live.nodes) stamps.push({ at: Date.now(), delta: m.params.parts[0].live.nodes[0] }); }, close() {} });
    live.receive(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'figaro.qua', params: { figaro_id: main, text: 'go' } }));
    await new Promise((r) => setTimeout(r, 900));
    assert.strictEqual(stamps.length, 20, 'one frame per chunk');
    assert.strictEqual(stamps[0].delta.set.markdown.length, 50);
    stamps.slice(1).forEach((f, k) => assert.strictEqual(f.delta.patch.markdown.at, (k + 1) * 50));
    const mean = (stamps[19].at - stamps[0].at) / 19;
    assert.ok(mean > 12 && mean < 40, 'mean frame gap ' + mean + ' ms for 50 fps');
    const turn = core.arias[main].turns[10000];
    assert.strictEqual(turn.nodes[0].markdown.length, 1000);
    assert.ok(turn.sealed);
  });

  await test('door server: --history, --fps, --bytes and --chunk reach the mock over a real WebSocket', async () => {
    const net = require('net');
    const crypto = require('crypto');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figchat-bench-'));
    const proc = cp.spawn('node', [path.join(__dirname, 'figchat-server.js'), dir, '5', '--history', '300', '--page', '24000', '--fps', '50', '--bytes', '500', '--chunk', '50'], { stdio: ['ignore', 'pipe', 'inherit'] });
    const port = await new Promise((r) => proc.stdout.once('data', (d) => r(Number(String(d).trim()))));
    const sock = net.connect(port, '127.0.0.1');
    await new Promise((r) => sock.once('connect', r));
    sock.write('GET /chat/door HTTP/1.1\r\nHost: 127.0.0.1:' + port + '\r\nOrigin: http://127.0.0.1:' + port + '\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ' + crypto.randomBytes(16).toString('base64') + '\r\n\r\n');
    const msgs = [];
    let buf = Buffer.alloc(0), upgraded = false;
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      if (!upgraded) { const at = buf.indexOf('\r\n\r\n'); if (at < 0) return; upgraded = true; buf = buf.subarray(at + 4); }
      for (;;) {
        if (buf.length < 2) return;
        let len = buf[1] & 127, at = 2;
        if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); at = 4; }
        else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); at = 10; }
        if (buf.length < at + len) return;
        msgs.push({ at: Date.now(), msg: JSON.parse(buf.subarray(at, at + len).toString('utf8')) });
        buf = buf.subarray(at + len);
      }
    });
    const send = (o) => {
      const body = Buffer.from(JSON.stringify(o));
      const mask = crypto.randomBytes(4);
      const head = body.length < 126 ? Buffer.from([0x81, 0x80 | body.length]) : Buffer.from([0x81, 0x80 | 126, body.length >> 8, body.length & 255]);
      sock.write(Buffer.concat([head, mask, Buffer.from(body.map((b, i) => b ^ mask[i % 4]))]));
    };
    const until = async (fn) => { for (let i = 0; i < 200 && !fn(); i++) await new Promise((r) => setTimeout(r, 25)); assert.ok(fn(), 'timed out'); };
    try {
      await until(() => upgraded);
      const main = mock.aid(1);
      send({ jsonrpc: '2.0', id: 1, method: 'figaro.read', params: { figaro_id: main, backward: true, limit: 24000 } });
      await until(() => msgs.some((m) => m.msg.id === 1));
      const parts = msgs.find((m) => m.msg.id === 1).msg.result.parts;
      assert.strictEqual(parts[parts.length - 1].turn, 300);
      send({ jsonrpc: '2.0', id: 2, method: 'figaro.qua', params: { figaro_id: main, text: 'go' } });
      await until(() => msgs.some((m) => m.msg.method === 'figaro.aria' && m.msg.params.parts[0].sealed === true && m.msg.params.parts[0].turn === 301));
      const frames = msgs.filter((m) => m.msg.method === 'figaro.aria' && m.msg.params.parts[0].live && m.msg.params.parts[0].live.nodes);
      assert.strictEqual(frames.length, 10);
      const sealed = msgs.find((m) => m.msg.method === 'figaro.aria' && m.msg.params.parts[0].sealed === true && m.msg.params.parts[0].turn === 301).msg.params.parts[0];
      assert.strictEqual(sealed.nodes[0].markdown.length, 500);
    } finally {
      sock.destroy();
      proc.kill();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  await test('bundle: STATS.json marks what the first load pulls in', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'figchat-initial-'));
    const dist = path.join(root, 'dist');
    const put = (name, text) => fs.writeFileSync(path.join(dist, 'assets', name), text);
    fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(root, 'THIRD-PARTY.txt'), 'notices\n');
    fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><script type="module" src="./assets/index-AbCd1234.js"></script><link rel="stylesheet" href="./assets/style-WxYz5678.css">');
    put('style-WxYz5678.css', 'body{}\n');
    put('shared-Qq11Ww22.js', 'export const a = 1;\n');
    put('typeset-Zz99Yy88.js', 'export const sentinel = "figchat:pretext";\n');
    put('index-AbCd1234.js', 'import { a } from "./shared-Qq11Ww22.js"; export const go = () => import("./typeset-Zz99Yy88.js");\n');
    const bundle = (target) => cp.execFileSync('node', [path.join(__dirname, '..', 'bin', 'figchat-bundle'), target, dist], { stdio: 'pipe' });
    const out = path.join(root, 'out');
    bundle(out);
    const files = JSON.parse(fs.readFileSync(path.join(out, 'STATS.json'), 'utf8')).files;
    const first = Object.keys(files).filter((n) => files[n].initial).sort();
    assert.deepStrictEqual(first, ['index-AbCd1234.js', 'index.html', 'shared-Qq11Ww22.js', 'style-WxYz5678.css']);
    assert.strictEqual(files['typeset-Zz99Yy88.js'].initial, false, 'a dynamic import is not first load');
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

  await test('pcm worklet: tones above 8 kHz are filtered out before 48 kHz drops to 16 kHz, not folded into the band', () => {
    const { Framer } = require('../assets/figchat/pcm-worklet.js');
    const rms = (rate, hz) => {
      const frames = [];
      const f = new Framer(rate, (buf) => frames.push(new Int16Array(buf)));
      let t = 0;
      for (let k = 0; k < Math.floor(rate / 128); k++) {
        const blk = new Float32Array(128);
        for (let i = 0; i < 128; i++) blk[i] = 0.5 * Math.sin(2 * Math.PI * hz * (t++) / rate);
        f.push(blk);
      }
      const all = frames.slice(2).flatMap((x) => [...x]);
      return Math.sqrt(all.reduce((a, v) => a + (v / 32768) * (v / 32768), 0) / all.length);
    };
    const pass = rms(48000, 1000);
    assert.ok(pass > 0.3, 'a 1 kHz tone passes at about its level: ' + pass);
    for (const hz of [10000, 15000, 20000]) assert.ok(rms(48000, hz) < pass * 0.05, hz + ' Hz folds back at ' + rms(48000, hz) + ' against ' + pass);
    assert.ok(rms(48000, 6000) > pass * 0.7, '6 kHz stays in the band');
  });

  await test('vendored client: SOURCE.json names the figaro-forms revision and hash of the tarball, and the lockfile points at it with no integrity on any file: entry, which prefetch-npm-deps would look up in an npm cache', () => {
    const web = path.join(__dirname, '..', 'web');
    const src = JSON.parse(fs.readFileSync(path.join(web, 'vendor', 'SOURCE.json'), 'utf8'));
    assert.ok(/^[0-9a-f]{40}$/.test(src.rev));
    const bytes = fs.readFileSync(path.join(web, 'vendor', src.file));
    assert.strictEqual('sha512-' + require('crypto').createHash('sha512').update(bytes).digest('base64'), src.integrity);
    const lock = JSON.parse(fs.readFileSync(path.join(web, 'package-lock.json'), 'utf8'));
    assert.strictEqual(lock.packages['node_modules/figaro-forms'].resolved, 'file:vendor/' + src.file);
    const pinned = Object.entries(lock.packages).filter(([, e]) => typeof e.resolved === 'string' && e.resolved.startsWith('file:') && 'integrity' in e).map(([k]) => k);
    assert.deepStrictEqual(pinned, []);
  });

  await test('vendor script: bin/figchat-vendor-forms parses and prints its usage', () => {
    const out = require('child_process').execFileSync(process.execPath, [path.join(__dirname, '..', 'bin', 'figchat-vendor-forms'), '--help'], { encoding: 'utf8' });
    assert.ok(out.startsWith('usage: figchat-vendor-forms REF'));
  });

  process.stdout.write(failed ? failed + ' failed\n' : 'figchat: all passed\n');
  process.exit(failed ? 1 : 0);
})();
