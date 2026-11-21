'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mock = require('../examples/aria-mock.js');
const speech = require('../assets/figchat/speech.js');

const flags = {};
const positional = [];
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) flags[a.slice(2)] = Number(process.argv[++i]);
  else positional.push(a);
}
const dir = positional[0];
const step = positional[1] ? Number(positional[1]) : 15;
const bench = { pageBytes: flags.page || 3000 };
if (flags.history !== undefined) bench.history = flags.history;
if (['fps', 'bytes', 'chunk'].some((k) => flags[k] !== undefined)) bench.stream = Object.fromEntries(['fps', 'bytes', 'chunk'].filter((k) => flags[k] !== undefined).map((k) => [k, flags[k]]));
const fixture = process.env.FIGCHAT_FIXTURE ? JSON.parse(fs.readFileSync(process.env.FIGCHAT_FIXTURE, 'utf8')) : undefined;
const core = mock.create(Object.assign({ step, fixture }, bench));
const seen = { attach: [], upgrades: 0, refused: 0, audio: 0, stt: [], retranscribed: [], says: [], stream: [] };
const expired = new Set([5, 6]);
const sessions = [];
const noteSession = (kind, req, url) => sessions.push({ kind, header: req.headers['x-figchat-session'] || '', query: url.searchParams.get('session') || '' });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' };
const csp = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; media-src 'self' blob:; connect-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

function file(res, rel, extra) {
  const full = path.join(dir, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!full.startsWith(dir) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, Object.assign({ 'Content-Type': types[path.extname(full)] || 'application/octet-stream', 'Referrer-Policy': 'no-referrer' }, extra));
  fs.createReadStream(full).pipe(res);
}

const sockets = new Set();
const gatewayPath = (pathname) => /^\/chat\/(door|audio|stt|attach)(\/|$)/.test(pathname) ? pathname.slice('/chat'.length) : pathname;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  url.pathname = gatewayPath(url.pathname);
  if (url.pathname === '/chat/') { file(res, 'index.html', { 'Content-Security-Policy': csp, 'Cache-Control': 'private, no-cache' }); return; }
  if (url.pathname.startsWith('/chat/assets/')) { file(res, url.pathname.slice('/chat/assets/'.length), { 'Cache-Control': 'private, no-cache' }); return; }
  if (url.pathname === '/__state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ids: core.ids, sent: core.sent || [], interrupts: core.interrupts || [], dropped: core.dropped, upgrades: seen.upgrades, audio: seen.audio, attach: seen.attach, stt: seen.stt, retranscribed: seen.retranscribed, sessions, stream: seen.stream, says: seen.says, calls: core.calls.map((c) => c.method) }));
    return;
  }
  if (url.pathname === '/__drop') {
    const n = core.drop();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ dropped: n }));
    return;
  }
  if (url.pathname === '/attach' && req.method === 'POST') {
    noteSession('attach', req, url);
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const name = req.headers['x-attach-name'];
      const out = core.upload(new Uint8Array(Buffer.concat(chunks)), typeof name === 'string' ? decodeURIComponent(name) : '');
      seen.attach.push({ status: out.status, name: typeof name === 'string' ? decodeURIComponent(name) : '', type: req.headers['content-type'] || '' });
      res.writeHead(out.status, { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' });
      res.end(JSON.stringify(out.body));
    });
    return;
  }
  if (url.pathname === '/stt' && req.method === 'POST') {
    noteSession('stt', req, url);
    let size = 0;
    const type = req.headers['content-type'] || '';
    req.on('data', (c) => { size += c.length; });
    req.on('end', () => {
      seen.stt.push({ type, size, aria: url.searchParams.get('aria') });
      const ok = /^audio\/(webm|mp4|ogg)/.test(type);
      const code = !ok ? 415 : size > 10 * 1024 * 1024 ? 413 : 200;
      res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' });
      res.end(JSON.stringify(code === 200 ? { text: 'what is the crossing count', duration_ms: 1500, audio_id: 'stt-1' } : { error: code === 415 ? 'unsupported audio type' : 'too large' }));
    });
    return;
  }
  if (url.pathname.startsWith('/stt/key/') && req.method === 'POST') {
    noteSession('stt-key', req, url);
    const key = decodeURIComponent(url.pathname.slice('/stt/key/'.length));
    seen.retranscribed.push(key);
    const clip = /\/in$/.test(key);
    res.writeHead(clip ? 200 : 400, { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' });
    res.end(JSON.stringify(clip ? { text: 're-heard words', duration_ms: 900, audio_id: 'stt-1' } : { error: 'not a clip key' }));
    return;
  }
  if (url.pathname.startsWith('/audio/key/')) {
    noteSession(req.headers.range === 'bytes=0-0' ? 'audio-key-status' : 'audio-key', req, url);
    const gone = /:(\d+)\/out$/.exec(decodeURIComponent(url.pathname));
    if (gone && expired.has(Number(gone[1]))) { res.writeHead(404, { 'Cache-Control': 'private, no-store' }); res.end('gone'); return; }
    const pcm = Buffer.concat(speech.chunks('replay').map((b) => Buffer.from(b)));
    const wav = Buffer.alloc(44 + pcm.length);
    wav.write('RIFF', 0); wav.writeUInt32LE(36 + pcm.length, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(24000, 24); wav.writeUInt32LE(48000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(pcm.length, 40);
    pcm.copy(wav, 44);
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    const head = { 'Content-Type': 'audio/wav', 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, no-store' };
    if (!m) { res.writeHead(200, Object.assign(head, { 'Content-Length': wav.length })); res.end(wav); return; }
    const from = m[1] ? Number(m[1]) : 0, to = m[2] ? Math.min(Number(m[2]), wav.length - 1) : wav.length - 1;
    res.writeHead(206, Object.assign(head, { 'Content-Range': 'bytes ' + from + '-' + to + '/' + wav.length, 'Content-Length': to - from + 1 }));
    res.end(wav.subarray(from, to + 1));
    return;
  }
  res.writeHead(404); res.end('no');
});

function frame(opcode, payload) {
  const n = payload.length;
  let head;
  if (n < 126) head = Buffer.from([0x80 | opcode, n]);
  else if (n < 65536) head = Buffer.from([0x80 | opcode, 126, n >> 8, n & 255]);
  else { head = Buffer.alloc(10); head[0] = 0x80 | opcode; head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2); }
  return Buffer.concat([head, payload]);
}

function handshake(req, socket) {
  const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
}

function reader(socket, onText, onBinary) {
  let buf = Buffer.alloc(0);
  socket.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    for (;;) {
      if (buf.length < 2) return;
      let len = buf[1] & 127, at = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); at = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); at = 10; }
      if (buf.length < at + 4 + len) return;
      const mask = buf.subarray(at, at + 4);
      const data = Buffer.from(buf.subarray(at + 4, at + 4 + len));
      for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4];
      const opcode = buf[0] & 15;
      buf = buf.subarray(at + 4 + len);
      if (opcode === 1) onText(data.toString('utf8'));
      else if (opcode === 2 && onBinary) onBinary(data);
      else if (opcode === 8) { socket.end(frame(8, Buffer.alloc(0))); return; }
      else if (opcode === 9) socket.write(frame(10, data));
    }
  });
}

function audioSocket(req, socket, aria) {
  seen.audio++;
  handshake(req, socket);
  sockets.add(socket);
  const send = (o) => { if (!socket.destroyed) socket.write(frame(1, Buffer.from(JSON.stringify(o)))); };
  const turns = {};
  send({ type: 'ready', aria, store: 'gluck' });
  const tap = (e) => {
    if (e.aria !== aria || socket.destroyed) return;
    const key = 'gluck/' + aria + ':' + e.turn + '/out';
    if (e.type === 'begin') { turns[e.turn] = { fed: 0, offset: 0, started: false, node: null }; return; }
    const t = turns[e.turn];
    if (!t) return;
    if (e.type === 'prose') {
      if (t.node !== e.node) { t.node = e.node; t.fed = 0; }
      for (;;) {
        const cut = speech.sentences(e.text, t.fed);
        if (cut < 0) break;
        const piece = e.text.slice(t.fed, cut).trim();
        t.fed = cut;
        if (!piece) continue;
        if (!t.started) { t.started = true; send({ type: 'audio.start', turn: e.turn, key, format: 'pcm', rate: 24000, bits: 16, channels: 1, node: e.node, cursor: e.turn + '.' + (e.node + 1) }); }
        speech.chunks(piece).forEach((pcm) => {
          send({ type: 'audio.chunk', turn: e.turn, node: e.node, cursor: e.turn + '.' + (e.node + 1), offset: t.offset, bytes: pcm.byteLength });
          socket.write(frame(2, Buffer.from(pcm)));
          t.offset += pcm.byteLength;
        });
      }
    } else if (e.type === 'seal' && t.started) {
      if (e.reason === 'interrupted') send({ type: 'audio.cancel', turn: e.turn, key, why: 'interrupt' });
      else send({ type: 'audio.end', turn: e.turn, key });
      delete turns[e.turn];
    }
  };
  core.taps.push(tap);
  const done = () => { sockets.delete(socket); const i = core.taps.indexOf(tap); if (i >= 0) core.taps.splice(i, 1); };
  const say = (turn) => {
    seen.says.push(turn);
    const key = 'gluck/' + aria + ':' + turn + '/out';
    const t = core.arias[aria] && core.arias[aria].turns.find((x) => x.id === turn);
    if (!t) { send({ type: 'error', turn: turn, code: 'bad-turn', text: 'no such turn' }); return; }
    if (!t.sealed) { send({ type: 'error', turn: turn, code: 'open', text: 'the turn is still running' }); return; }
    const node = t.nodes.findIndex((n) => n.type === 'prose' && n.markdown);
    if (node < 0) { send({ type: 'error', turn: turn, code: 'silent', text: 'the turn has no prose' }); return; }
    if (turn === 6) { expired.delete(6); send({ type: 'audio.stored', turn: turn, key: key }); return; }
    const text = t.nodes[node].markdown.split(/(?<=[.!?])\s/)[0];
    let offset = 0;
    send({ type: 'audio.start', turn: turn, key: key, format: 'pcm', rate: 24000, bits: 16, channels: 1, node: node, cursor: turn + '.' + (node + 1), say: true });
    speech.chunks(text).forEach((pcm) => {
      send({ type: 'audio.chunk', turn: turn, node: node, cursor: turn + '.' + (node + 1), offset: offset, bytes: pcm.byteLength });
      socket.write(frame(2, Buffer.from(pcm)));
      offset += pcm.byteLength;
    });
    send({ type: 'audio.end', turn: turn, key: key });
  };
  reader(socket, (text) => { try { const msg = JSON.parse(text); if (msg.type === 'say') say(Number(msg.turn)); else if (msg.type === 'cancel') Object.keys(turns).forEach((k) => { send({ type: 'audio.cancel', turn: Number(k), key: 'gluck/' + aria + ':' + k + '/out', why: 'client' }); delete turns[k]; }); } catch (e) {} });
  socket.on('close', done);
  socket.on('error', done);
}

function sttStream(req, socket, url) {
  const run = { aria: url.searchParams.get('aria'), lang: url.searchParams.get('lang'), at: Date.now(), frames: [], first: 0, ended: false, cancelled: false, closedAt: 0 };
  seen.stream.push(run);
  handshake(req, socket);
  sockets.add(socket);
  const send = (o) => { if (!socket.destroyed) socket.write(frame(1, Buffer.from(JSON.stringify(o)))); };
  const finals = [];
  send({ type: 'ready' });
  const fail = (code, text) => { send({ type: 'error', code, text }); socket.end(frame(8, Buffer.alloc(0))); };
  reader(socket, (text) => {
    let msg;
    try { msg = JSON.parse(text); } catch (e) { fail('bad-request', 'not json'); return; }
    if (msg.type === 'end') {
      run.ended = true;
      send({ type: 'done', audio_id: 'stream-1', duration_ms: run.frames.length * 40, text: finals.join(' ') + (finals.length ? ' ' : '') + 'please' });
      socket.end(frame(8, Buffer.alloc(0)));
    } else if (msg.type === 'cancel') {
      run.cancelled = true;
      socket.end(frame(8, Buffer.alloc(0)));
    } else fail('bad-request', 'unknown frame');
  }, (buf) => {
    if (buf.length % 2 || buf.length > 6400) { fail('bad-request', 'bad pcm frame'); return; }
    if (!run.first) run.first = Date.now();
    run.frames.push(buf.length);
    const n = run.frames.length;
    if (n === 5) send({ type: 'partial', text: 'what is', offset_ms: 0 });
    else if (n === 10) { finals.push('what is the crossing count'); send({ type: 'final', text: 'what is the crossing count', offset_ms: 0, duration_ms: 400 }); }
    else if (n === 12) send({ type: 'partial', text: 'please', offset_ms: 500 });
  });
  socket.on('close', () => { run.closedAt = Date.now(); sockets.delete(socket); });
  socket.on('error', () => sockets.delete(socket));
}

server.on('upgrade', (req, socket) => {
  const url = new URL(req.url, 'http://x');
  url.pathname = gatewayPath(url.pathname);
  const origin = req.headers.origin || '';
  const same = origin === 'http://' + req.headers.host;
  const am = /^\/audio\/([0-9a-f]{32})$/.exec(url.pathname);
  if (same && url.pathname === '/stt/stream' && /^gluck\/[0-9a-f]{32}$/.test(url.searchParams.get('aria') || '')) { noteSession('stt-ws', req, url); sttStream(req, socket, url); return; }
  if (same && am) { noteSession('audio-ws', req, url); audioSocket(req, socket, am[1]); return; }
  if (url.pathname !== '/door' || !same) { seen.refused++; socket.destroy(); return; }
  seen.upgrades++;
  noteSession('door-ws', req, url);
  sockets.add(socket);
  handshake(req, socket);
  const conn = core.attach({
    text: (s) => { if (!socket.destroyed) socket.write(frame(1, Buffer.from(s))); },
    close: () => socket.destroy()
  });
  reader(socket, (text) => conn.receive(text));
  socket.on('close', () => { sockets.delete(socket); conn.close(); });
  socket.on('error', () => { sockets.delete(socket); conn.close(); });
});

server.listen(0, '127.0.0.1', () => { process.stdout.write(String(server.address().port) + '\n'); });
