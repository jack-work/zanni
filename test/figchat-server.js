'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mock = require('../examples/aria-mock.js');

const dir = process.argv[2];
const step = process.argv[3] ? Number(process.argv[3]) : 15;
const core = mock.create({ step, pageBytes: 3000 });
const seen = { upgrades: 0, refused: 0 };
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' };
const csp = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; media-src 'self' blob:; connect-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

function file(res, rel, extra) {
  const full = path.join(dir, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!full.startsWith(dir) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, Object.assign({ 'Content-Type': types[path.extname(full)] || 'application/octet-stream', 'Referrer-Policy': 'no-referrer' }, extra));
  fs.createReadStream(full).pipe(res);
}

const sockets = new Set();
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/chat/') { file(res, 'index.html', { 'Content-Security-Policy': csp, 'Cache-Control': 'private, no-cache' }); return; }
  if (url.pathname.startsWith('/chat/assets/')) { file(res, url.pathname.slice('/chat/assets/'.length), { 'Cache-Control': 'private, no-cache' }); return; }
  if (url.pathname === '/__state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ids: core.ids, sent: core.sent || [], interrupts: core.interrupts || [], dropped: core.dropped, upgrades: seen.upgrades, calls: core.calls.map((c) => c.method) }));
    return;
  }
  if (url.pathname === '/__drop') {
    const n = core.drop();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ dropped: n }));
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

server.on('upgrade', (req, socket) => {
  const url = new URL(req.url, 'http://x');
  const origin = req.headers.origin || '';
  if (url.pathname !== '/chat/door' || origin !== 'http://' + req.headers.host) { seen.refused++; socket.destroy(); return; }
  seen.upgrades++;
  sockets.add(socket);
  const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  const conn = core.attach({
    text: (s) => { if (!socket.destroyed) socket.write(frame(1, Buffer.from(s))); },
    close: () => socket.destroy()
  });
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
      if (opcode === 1) conn.receive(data.toString('utf8'));
      else if (opcode === 8) { socket.end(frame(8, Buffer.alloc(0))); return; }
      else if (opcode === 9) socket.write(frame(10, data));
    }
  });
  socket.on('close', () => { sockets.delete(socket); conn.close(); });
  socket.on('error', () => { sockets.delete(socket); conn.close(); });
});

server.listen(0, '127.0.0.1', () => { process.stdout.write(String(server.address().port) + '\n'); });
