'use strict';
const http = require('http');
const mock = require('../examples/aria-mock.js');

const assetCache = process.env.BENCH_ASSET_CACHE || '';
let core = null;

let held = null;
let listening = null;
const emit = http.Server.prototype.emit;
http.Server.prototype.emit = function (name, ...args) {
  if (name === 'upgrade') {
    listening = this;
    if (held) {
      held.push(args);
      return true;
    }
  }
  return emit.call(this, name, ...args);
};

const create = mock.create;
mock.create = function (o) {
  core = create(o);
  return core;
};

function send(aria, text, count) {
  const conn = core.attach({ text() {}, close() {} });
  for (let i = 0; i < count; i++) conn.receive(JSON.stringify({ jsonrpc: '2.0', id: i + 1, method: 'figaro.qua', params: { figaro_id: aria, text } }));
  conn.close();
}

function bench(req, res) {
  const url = new URL(req.url, 'http://x');
  const reply = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  const aria = url.searchParams.get('aria') || core.ids.main;
  if (url.pathname === '/__bench/send') {
    send(aria, url.searchParams.get('text') || 'stream the run build please', Number(url.searchParams.get('count') || 1));
    reply({ ok: true });
    return true;
  }
  if (url.pathname === '/__bench/hold') {
    if (url.searchParams.get('on') === '0') {
      const queued = held || [];
      held = null;
      for (const args of queued) emit.call(listening, 'upgrade', ...args);
      reply({ released: queued.length });
    } else {
      held = held || [];
      reply({ holding: true });
    }
    return true;
  }
  if (url.pathname === '/__bench/status') {
    const a = core.arias[aria];
    const sealed = a.turns.filter((t) => t.sealed);
    const last = sealed[sealed.length - 1];
    reply({ running: !!a.run, queued: a.queue.length, turns: a.turns.length, last_bytes: last ? Buffer.byteLength(JSON.stringify({ inquiry: last.inquiry, nodes: last.nodes })) : 0 });
    return true;
  }
  return false;
}

const createServer = http.createServer;
http.createServer = function (handler) {
  return createServer.call(http, (req, res) => {
    if (bench(req, res)) return;
    if (assetCache && req.url.startsWith('/chat/assets/')) {
      const writeHead = res.writeHead;
      res.writeHead = function (code, headers) {
        if (headers && headers['Cache-Control']) headers['Cache-Control'] = assetCache;
        return writeHead.call(this, code, headers);
      };
    }
    handler(req, res);
  });
};
