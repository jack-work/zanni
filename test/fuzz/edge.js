'use strict';
const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');

const [bundle, gatewayPort, secret, admin] = process.argv.slice(2);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' };
const csp = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; media-src 'self' blob:; connect-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const gated = /^\/chat\/(door|audio|stt|attach)(\/|$)/;

function serve(res, rel) {
  const full = path.join(bundle, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!full.startsWith(bundle) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(full)] || 'application/octet-stream', 'Content-Security-Policy': csp, 'Cache-Control': 'private, no-cache' });
  fs.createReadStream(full).pipe(res);
}

const signed = (headers) => Object.assign({}, headers, { 'x-figaro-edge': secret, 'remote-user': admin });
const strip = (url) => url.replace(/^\/chat/, '');

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://x').pathname;
  if (pathname === '/chat/') { serve(res, 'index.html'); return; }
  if (pathname.startsWith('/chat/assets/')) { serve(res, pathname.slice('/chat/assets/'.length)); return; }
  if (!gated.test(pathname)) { res.writeHead(404); res.end('no'); return; }
  const up = http.request({ host: '127.0.0.1', port: Number(gatewayPort), method: req.method, path: strip(req.url), headers: signed(req.headers) }, (r) => {
    res.writeHead(r.statusCode, r.headers);
    r.pipe(res);
  });
  up.on('error', () => { res.writeHead(502); res.end('gateway down'); });
  req.pipe(up);
});

server.on('upgrade', (req, socket, head) => {
  const pathname = new URL(req.url, 'http://x').pathname;
  if (!gated.test(pathname)) { socket.destroy(); return; }
  const up = net.connect(Number(gatewayPort), '127.0.0.1', () => {
    const h = signed(req.headers);
    let raw = req.method + ' ' + strip(req.url) + ' HTTP/1.1\r\n';
    Object.keys(h).forEach((k) => { raw += k + ': ' + h[k] + '\r\n'; });
    up.write(raw + '\r\n');
    if (head && head.length) up.write(head);
    up.pipe(socket);
    socket.pipe(up);
  });
  up.on('error', () => socket.destroy());
  socket.on('error', () => up.destroy());
  socket.on('close', () => up.destroy());
  up.on('close', () => socket.destroy());
});

server.listen(0, '127.0.0.1', () => { process.stdout.write(String(server.address().port) + '\n'); });
