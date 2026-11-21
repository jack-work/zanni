'use strict';
const http = require('http');
const mock = require('../examples/aria-mock.js');

const turns = Number(process.env.BENCH_TURNS || 0);
const assetCache = process.env.BENCH_ASSET_CACHE || '';
let core = null;

function inflate(a, n) {
  const seed = a.turns.filter((t) => t.sealed);
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = JSON.parse(JSON.stringify(seed[i % seed.length]));
    t.id = i + 1;
    t.at = seed[0].at + i * 1000;
    out.push(t);
  }
  a.turns = out;
  a.row.message_count = n;
}

const create = mock.create;
mock.create = function (o) {
  if (process.env.BENCH_PAGE_BYTES) o = Object.assign({}, o, { pageBytes: Number(process.env.BENCH_PAGE_BYTES) });
  core = create(o);
  if (turns) inflate(core.arias[core.ids.main], turns);
  return core;
};

function send(aria, text, count) {
  const conn = core.attach({ text() {}, close() {} });
  for (let i = 0; i < count; i++) conn.receive(JSON.stringify({ jsonrpc: '2.0', id: i + 1, method: 'figaro.qua', params: { figaro_id: aria, text } }));
  conn.close();
}

const METRICS = { context_tokens: 40000, context_exact: false, tokens_in: 20000, tokens_out: 8000, cache_read_tokens: 4000, cache_write_tokens: 500 };
const WORDS = 'the reader keeps settled nodes while the live node grows by one delta per frame and nothing else moves'.split(' ');

function longReply(bytes) {
  const out = [];
  let size = 0, k = 0;
  while (size < bytes) {
    let block;
    if (k % 6 === 3) block = '```go\nfunc settle(n *Node) bool {\n\treturn n.Round < n.Live\n}\n```';
    else if (k % 6 === 5) block = '- ' + WORDS.slice(0, 8).join(' ') + '\n- ' + WORDS.slice(8, 16).join(' ') + '\n- `' + WORDS[k % WORDS.length] + '`';
    else block = Array.from({ length: 40 }, (_, i) => WORDS[(i + k) % WORDS.length]).join(' ') + (k % 2 ? ' **settled**.' : ' *live*.');
    out.push(block);
    size += block.length + 2;
    k++;
  }
  return out.join('\n\n').slice(0, bytes);
}

function pushAria(aria, part, extra) {
  const text = JSON.stringify(Object.assign({ jsonrpc: '2.0' }, extra || { method: 'figaro.aria', params: { figaro_id: aria, parts: [part], more: {}, metrics: METRICS } }));
  core.conns.slice().forEach((c) => { if (c.open && c.follows[aria]) c.sink.text(text); });
}

function stream(aria, bytes, chunk, ms) {
  const a = core.arias[aria];
  const text = longReply(bytes);
  const t = { id: a.turns.length + 1, inquiry: 'bench: a long reply', nodes: [], sealed: false, at: Date.now(), lastV: 0 };
  a.turns.push(t);
  a.run = { turn: t, script: [], timer: null, failure: '' };
  a.row.state = 'active';
  pushAria(aria, { turn: t.id, inquiry: t.inquiry, sealed: false, from: 0, at: t.at });
  let at = 0, v = 0;
  const tick = () => {
    if (at >= text.length) {
      t.sealed = true;
      a.run = null;
      a.row.state = 'idle';
      a.row.message_count = a.turns.length;
      pushAria(aria, { turn: t.id, inquiry: t.inquiry, sealed: true, from: 0, at: t.at, nodes: t.nodes.map((n, i) => Object.assign({ id: t.id + '.' + i }, n)) });
      pushAria(aria, null, { method: 'turn.done', params: { figaro_id: aria, reason: 'stop', idle: true } });
      return;
    }
    const piece = text.slice(at, at + chunk);
    const delta = v === 0 ? { id: 0, set: { type: 'prose', role: 'output', markdown: piece } } : { id: 0, patch: { markdown: { at, del: 0, ins: piece } } };
    if (v === 0) t.nodes.push({ type: 'prose', role: 'output', markdown: piece, at: Date.now() });
    else t.nodes[0].markdown += piece;
    const part = { turn: t.id, sealed: false, from: 0, live: { from: 0, v, nodes: [delta] } };
    if (v === 0) part.inquiry = t.inquiry;
    t.lastV = v++;
    at += piece.length;
    pushAria(aria, part);
    setTimeout(tick, ms);
  };
  setTimeout(tick, ms);
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
  if (url.pathname === '/__bench/stream') {
    stream(aria, Number(url.searchParams.get('bytes') || 20000), Number(url.searchParams.get('chunk') || 40), Number(url.searchParams.get('ms') || 40));
    reply({ ok: true });
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
