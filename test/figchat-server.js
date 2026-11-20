'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mock = require('../examples/figchat-mock.js');

const dir = process.argv[2];
const core = mock.create({ seed: 'demo', step: 15 });
const seen = { ranges: [], upgrades: 0 };
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };
const csp = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; media-src 'self' blob:; connect-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

function file(res, rel, extra) {
  const full = path.join(dir, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!full.startsWith(dir) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, Object.assign({ 'Content-Type': types[path.extname(full)] || 'application/octet-stream', 'Referrer-Policy': 'no-referrer' }, extra));
  fs.createReadStream(full).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/chat/') {
    file(res, 'index.html', { 'Content-Security-Policy': csp, 'Permissions-Policy': 'microphone=(self)', 'Cache-Control': 'private, no-cache' });
    return;
  }
  if (url.pathname.startsWith('/chat/assets/')) { file(res, url.pathname.slice('/chat/assets/'.length), { 'Cache-Control': 'private, max-age=3600' }); return; }
  if (url.pathname === '/chat/api/clips' && req.method === 'POST') {
    let size = 0;
    req.on('data', (c) => { size += c.length; });
    req.on('end', () => {
      const out = core.clip(req.headers['content-type'] || '', size);
      res.writeHead(out.status, { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' });
      res.end(JSON.stringify(out.json));
    });
    return;
  }
  if (url.pathname.startsWith('/chat/api/')) {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const out = core.handle(req.method, url.pathname + url.search, body);
      res.writeHead(out.status, { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' });
      res.end(JSON.stringify(out.json));
    });
    return;
  }
  if (url.pathname.startsWith('/chat/audio/')) {
    const a = core.audio(decodeURIComponent(url.pathname.slice('/chat/audio/'.length)));
    if (req.headers.range) seen.ranges.push(req.headers.range);
    if (a.status !== 200) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{"error":"no such audio","code":"not_found"}'); return; }
    const all = Buffer.from(a.bytes);
    const head = { 'Content-Type': a.type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, no-store' };
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (!m) { res.writeHead(200, Object.assign(head, { 'Content-Length': all.length })); res.end(all); return; }
    const from = m[1] ? Number(m[1]) : all.length - Number(m[2]);
    const to = m[1] && m[2] ? Math.min(Number(m[2]), all.length - 1) : all.length - 1;
    res.writeHead(206, Object.assign(head, { 'Content-Range': 'bytes ' + from + '-' + to + '/' + all.length, 'Content-Length': to - from + 1 }));
    res.end(all.subarray(from, to + 1));
    return;
  }
  if (url.pathname === '/__state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ posts: core.state.posts, clips: core.state.clips, received: core.state.received, ranges: seen.ranges, upgrades: seen.upgrades }));
    return;
  }
  res.writeHead(404); res.end('no');
});

function frame(opcode, payload) {
  const n = payload.length;
  const head = n < 126 ? Buffer.from([0x80 | opcode, n]) : n < 65536 ? Buffer.from([0x80 | opcode, 126, n >> 8, n & 255]) : null;
  if (!head) throw new Error('frame too large for the test server');
  return Buffer.concat([head, payload]);
}

server.on('upgrade', (req, socket) => {
  const url = new URL(req.url, 'http://x');
  const origin = req.headers.origin || '';
  if (url.pathname !== '/chat/ws' || origin !== 'http://' + req.headers.host || !core.thread(url.searchParams.get('thread'))) { socket.destroy(); return; }
  seen.upgrades++;
  const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  const conn = core.attach(url.searchParams.get('thread'), url.searchParams.get('after'), {
    text: (s) => socket.write(frame(1, Buffer.from(s))),
    binary: (b) => socket.write(frame(2, Buffer.from(b))),
    close: () => socket.destroy()
  });
  let buf = Buffer.alloc(0);
  socket.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    for (;;) {
      if (buf.length < 2) return;
      let len = buf[1] & 127, at = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); at = 4; }
      if (buf.length < at + 4 + len) return;
      const mask = buf.subarray(at, at + 4);
      const data = Buffer.from(buf.subarray(at + 4, at + 4 + len));
      for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4];
      const opcode = buf[0] & 15;
      buf = buf.subarray(at + 4 + len);
      if (opcode === 1) conn.receive(data.toString('utf8'));
      else if (opcode === 8) { socket.end(frame(8, Buffer.alloc(0))); return; }
      else if (opcode === 9) socket.write(frame(10, data));
    }
  });
  socket.on('close', () => conn.close());
  socket.on('error', () => conn.close());
});

server.listen(0, '127.0.0.1', () => { process.stdout.write(String(server.address().port) + '\n'); });
