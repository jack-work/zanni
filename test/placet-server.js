'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const mock = require('../examples/placet-mock.js');

const dir = process.argv[2];
const origin = process.argv[3] || '';
const api = mock.create(mock.demo(Date.now()));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };
const csp = "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'";

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/v1/')) {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (req.method === 'POST') {
        if ((req.headers['content-type'] || '').split(';')[0] !== 'application/json') { res.writeHead(415); res.end('{"error":"not json"}'); return; }
        if (origin && req.headers.origin !== origin) { res.writeHead(403); res.end('{"error":"cross-origin post refused"}'); return; }
      }
      const out = api.handle(req.method, url.pathname, body);
      res.writeHead(out.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(out.json));
    });
    return;
  }
  if (url.pathname === '/__posts') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(api.state.posts)); return; }
  if (url.pathname.startsWith('/app/')) {
    const rel = url.pathname.slice(5) || 'index.html';
    const file = path.join(dir, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('no'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Content-Security-Policy': csp, 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
    return;
  }
  res.writeHead(404); res.end('no');
});
server.listen(0, '127.0.0.1', () => { process.stdout.write(String(server.address().port) + '\n'); });
