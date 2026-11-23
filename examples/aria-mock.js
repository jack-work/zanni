(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ariaMock = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var EVIL = '<img src=x onerror="window.__pwned=1">';
  var BIDI = 'gnp.exe\u202Eavaj.txt\u200B';
  var ENC = new TextEncoder();
  var DEC = new TextDecoder();
  var HUGE = 9007199254740991;

  function aid(n) {
    var h = 'c0ffee' + ('0' + n.toString(16)).slice(-2);
    return h + h + h + h;
  }

  function size(v) { return ENC.encode(JSON.stringify(v)).length; }

  function splice(s, at, del, ins) {
    var b = ENC.encode(s);
    return DEC.decode(b.slice(0, at)) + ins + DEC.decode(b.slice(at + del));
  }

  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  var QUESTIONS = [
    'Where did the layered layout pass leave the crossing count?',
    'Summarise the last build failure in two lines.',
    'Run the unit tests for the stream module and tell me what broke.',
    'Draft the commit message for the reconnect fix.',
    'What does the cursor 12.3 mean again?',
    'Check whether the fonts still load under the edge CSP.',
    'Can you list the open branches on keel?',
    'Why is the second page of the transcript empty?',
    'Compare the two layouts and pick one.',
    'Show me the diff for the shell and explain the risky part.',
    'Is the audio chunk tagged with the right node?',
    'Rename the helper and update its callers.'
  ];

  var OPENERS = [
    'Short answer: it is **fine**, with one caveat.',
    'I looked at it. The cause is a stale cursor, not the layout.',
    'Two things changed since the last pass:',
    'Here is what I found.'
  ];

  var BODIES = [
    '\n\n- the reader keeps the *settled* nodes\n- the live node is replaced on every delta\n- a late frame is dropped by version\n\nNothing else moved.',
    '\n\n1. read backward from the end\n2. follow live\n3. resume from the anchor after a drop\n\nThat order leaves no gap.',
    '\n\n```go\nfunc settle(n *Node) bool {\n\treturn n.Round < n.Live\n}\n```\n\nThe function is `settle`, in the livedoc package. See https://example.com/livedoc for the notes.',
    '\n\n> A node is settled only when the round closes.\n\nSo a streamed paragraph can stay open for the whole turn.'
  ];

  var THOUGHTS = [
    'The user wants the crossing count. I should read the layout output before answering and not guess.',
    'Two candidates: a stale cursor or a version gap. The version rule says a gap means read again.',
    'Keep it short. One caveat, then stop.'
  ];

  function seedTurn(i, base, extra) {
    var t = { id: i + 1, inquiry: QUESTIONS[i % QUESTIONS.length], nodes: [], sealed: true, at: base + i * 61000, lastV: 0 };
    var n = t.nodes, at = t.at + 2000;
    var node = function (o) { o.role = o.role || 'output'; o.at = at; at += 900; n.push(o); };
    if (i % 5 === 0) node({ type: 'thinking', markdown: THOUGHTS[i % THOUGHTS.length] });
    if (i % 3 === 0) {
      node({ type: 'prose', markdown: 'Let me look.' });
      var big = i === 6;
      node({
        type: 'tool', name: 'bash', tool_call_id: 'call_' + i, status: i % 9 === 0 ? 'error' : 'ok',
        args: { command: 'go test ./api/livedoc/... -run Settle' }, summary: 'command=go test ./api/livedoc/... -run Settle',
        output: big ? new Array(40).fill('ok  \tfigaro/api/livedoc\t0.213s').join('\n') : i % 9 === 0 ? 'FAIL\tfigaro/api/livedoc\t0.4s\npanic: nil node' : 'ok  \tfigaro/api/livedoc\t0.213s',
        output_base: big ? 1200 : 0, opened_at: at - 600, started_at: at - 500, finished_at: at - 100
      });
    }
    if (i % 7 === 4) node({ type: 'steering', role: 'input', markdown: 'also check the dark theme', sender: aid(9), sender_name: 'Il Zanni' });
    node({ type: 'prose', markdown: OPENERS[i % OPENERS.length] + BODIES[i % BODIES.length] });
    if (i === 5) node({ type: 'sparkle', markdown: 'a node kind nobody planned for', extra: 'shown, not dropped' });
    if (extra) extra(t, node);
    return t;
  }

  function seedMain(base, count) {
    var turns = [];
    for (var i = 0; i < count; i++) turns.push(seedTurn(i, base));
    if (count < 12) return turns;
    turns[2].inquiry = EVIL;
    turns[2].nodes.push({ type: 'prose', role: 'output', at: turns[2].at + 9000, markdown: EVIL + ' and ' + BIDI + ' and [x](javascript:alert(1))' });
    turns[2].nodes.push({ type: 'tool', role: 'output', at: turns[2].at + 9500, name: EVIL, tool_call_id: 'call_evil', status: 'ok', args: { command: EVIL }, summary: 'command=' + EVIL, output: EVIL, output_base: 0 });
    turns[8].inquiry_segments = [
      { name: 'Il Zanni', sender: aid(2), text: 'The pass is ready for review.' },
      { name: 'the King', sender: 'king', text: 'Ship it behind the flag.' },
      { text: 'And tell me when it is up.' }
    ];
    turns[8].inquiry = 'The pass is ready for review.\n\nShip it behind the flag.\n\nAnd tell me when it is up.';
    turns[11].inquiry_segments = [{ name: 'Gluck at the terminal', sender: 'terminal', text: turns[11].inquiry }];
    return turns;
  }

  function seedSmall(count, base, tag) {
    var turns = [];
    for (var i = 0; i < count; i++) turns.push(seedTurn(i + tag, base));
    turns.forEach(function (t, k) { t.id = k + 1; });
    return turns;
  }

  function create(o) {
    o = o || {};
    var step = o.step == null ? 60 : o.step;
    var clock = o.now || function () { return Date.now(); };
    var timers = o.timers || { set: function (f, ms) { return setTimeout(f, ms); }, clear: function (h) { clearTimeout(h); } };
    var core = { conns: [], calls: [], arias: {}, order: [], pageBytes: o.pageBytes || 6000, dropped: 0, taps: [], ids: { main: aid(1), lane: aid(2), spain: aid(3), engineer: aid(4), forms: aid(5) } };
    var metricsOf = {};
    var base = clock() - 4 * 86400000;
    var history = o.history == null ? 26 : o.history;
    var stream = o.stream ? Object.assign({ fps: 30, bytes: 8000, chunk: 64 }, o.stream) : null;
    if (!(history >= 0) || stream && !(stream.fps > 0 && stream.bytes > 0 && stream.chunk > 0)) throw new Error('aria-mock: history, stream.fps, stream.bytes and stream.chunk must be positive numbers');

    function add(id, row, turns) {
      row.id = id;
      row.short = id.slice(0, 8);
      row.kind = row.kind || 'figaro';
      row.created_at = base;
      core.arias[id] = { row: row, turns: turns, run: null, queue: [], dormant: row.state === 'dormant' };
      core.order.push(id);
      metricsOf[id] = { context_tokens: 1200 * turns.length, context_exact: false, tokens_in: 800 * turns.length, tokens_out: 300 * turns.length, cache_read_tokens: 4000, cache_write_tokens: 500 };
    }

    var ids = core.ids;
    if (o.fixture) {
      var walk = function (level, parent) {
        Object.keys(level).forEach(function (handle, i) {
          var n = level[handle];
          var row = { state: n.state === 'active' ? 'idle' : n.state, mantra: n.mantra, handle: handle };
          if (parent) row.parent = parent;
          if (n.role) row.roles = [n.role];
          add(n.id, row, seedSmall(3, base, i + 1));
          core.arias[n.id].fixture = n;
          walk(n.forks || {}, n.id);
        });
      };
      walk(o.fixture.arias.arias, '');
      core.ids = ids = Object.assign({ main: o.fixture.attend }, o.fixture.ids || {});
      core.fixture = o.fixture;
    } else {
    add(ids.main, { state: 'idle', mantra: 'Zanni: ship ordine & Sugiyama layered layout', roles: ['@zanni'], handle: 'zanni' }, seedMain(base - Math.max(0, history - 26) * 61000, history));
    add(ids.lane, { state: 'idle', mantra: 'Frontend Engineer / figchat web', parent: ids.main, roles: ['@lane'] }, seedSmall(4, base, 1));
    var self = aid(2);
    var deltas = {};
    deltas[self + '.phase'] = { form: self, kind: 'bound', event: 'set', prev: 'seed', value: 'canary' };
    deltas[self + '.mantra'] = { form: self, kind: 'bound', event: 'set', prev: new Array(61).join('o'), value: new Array(41).join('n') };
    deltas[self + '.credo'] = { form: self, kind: 'bound', event: 'set', value: 'one\ntwo\nthree' };
    deltas['@f1.status'] = { form: '@f1', kind: 'studied', event: 'set', prev: 'open', value: 'merged' };
    deltas['@f1.brief'] = { form: '@f1', kind: 'studied', event: 'removed', prev: 'ship it' };
    deltas['@f2'] = { form: '@f2', kind: 'studied', event: 'deleted' };
    deltas['@r1.target-aria'] = { form: '@r1', kind: 'role', event: 'set', prev: aid(3), value: aid(4) };
    core.arias[ids.lane].turns[1].formDeltas = deltas;
    add(ids.spain, { state: 'dormant', mantra: 'Backend: spain edge for fig.kelliher.info', parent: ids.main }, seedSmall(2, base, 2));
    add(aid(6), { state: 'idle', mantra: 'Review: livedoc settle', parent: ids.lane }, seedSmall(2, base, 3));
    add(ids.engineer, { state: 'idle', mantra: 'Engineer: aria stream and gateway', roles: ['@engineer'] }, seedSmall(5, base, 4));
    add(ids.forms, { state: 'idle', mantra: 'forms-aria lane', parent: ids.engineer }, seedSmall(3, base, 5));
    for (var k = 7; k <= 13; k++) add(aid(k), { state: 'idle', mantra: 'Scratch ' + (k - 6), parent: k % 2 ? ids.engineer : undefined }, seedSmall(1 + (k % 3), base, k));
    core.arias[aid(13)].row.mantra = EVIL;
    for (var c = 0; c < (o.figaros || 0); c++) {
      var h = (0xfa000000 + c).toString(16);
      var parent = c % 5 === 0 ? undefined : core.order[core.order.length - 1 - (c % 3)];
      add(h + h + h + h, { state: c % 7 === 0 ? 'dormant' : 'idle', mantra: 'Crowd ' + c, parent: parent }, seedSmall(1 + (c % 3), base, c));
    }
    }

    var held = {}, heldSeq = 0, ATTACH_TTL = 15 * 60 * 1000;
    core.attachments = held;
    function sniff(b) {
      var hex = function (i, n) { var o = ''; for (var k = i; k < i + n && k < b.length; k++) o += (b[k] < 16 ? '0' : '') + b[k].toString(16); return o; };
      var ascii = function (i, n) { var o = ''; for (var k = i; k < i + n && k < b.length; k++) o += String.fromCharCode(b[k]); return o; };
      if (hex(0, 8) === '89504e470d0a1a0a' || hex(0, 3) === 'ffd8ff' || ascii(0, 3) === 'GIF' || (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') || (ascii(4, 4) === 'ftyp' && /^(heic|heix|mif1|heif)/.test(ascii(8, 4)))) return 'image';
      if (ascii(0, 5) === '%PDF-') return 'pdf';
      return '';
    }
    core.upload = function (bytes, name) {
      if (!name) return { status: 400, body: { error: 'attach: name the file in X-Attach-Name' } };
      if (!bytes.length) return { status: 400, body: { error: 'attach: the file is empty' } };
      if (bytes.length > 10 * 1024 * 1024) return { status: 413, body: { error: 'attach: over 10 MiB' } };
      var kind = sniff(bytes);
      if (!kind) return { status: 415, body: { error: 'attach a png, jpeg, gif, webp or heic image, or a pdf' } };
      if (Object.keys(held).length >= 16) return { status: 429, body: { error: 'too many attachments waiting to be sent' } };
      var id = 'att' + (++heldSeq).toString(16).padStart(29, '0');
      var text = kind === 'pdf' ? 'Chapter one. ' + name : '';
      var pages = kind === 'pdf' ? 2 : undefined;
      held[id] = { kind: kind, name: name, bytes: bytes.length, images: kind === 'image' ? 1 : 0, pages: pages, text: text, at: clock() };
      var body = { id: id, kind: kind, name: name, bytes: bytes.length, images: held[id].images };
      if (kind === 'pdf') { body.pages = pages; body.text = text.length; }
      return { status: 200, body: body };
    };
    core.ageAttachments = function (ms) { Object.keys(held).forEach(function (k) { held[k].at -= ms; }); };
    function takeAttachments(ids, text) {
      if (!Array.isArray(ids) || ids.length < 1 || ids.length > 8) return { error: 'gateway: attachments is a list of 1 to 8 ids from POST /attach' };
      if (typeof text !== 'string' || !text.trim()) return { error: 'gateway: an attachment is sent with a prompt: give text too' };
      if (new Set(ids).size !== ids.length) return { error: 'gateway: an attachment is named twice' };
      var got = [];
      for (var i = 0; i < ids.length; i++) {
        var h = held[ids[i]];
        if (!h || clock() - h.at > ATTACH_TTL) return { error: 'gateway: an attachment is unknown, already sent or expired' };
        got.push(h);
      }
      var pictures = got.reduce(function (n, h) { return n + h.images; }, 0);
      if (pictures > 4) return { error: 'gateway: the attachments hold ' + pictures + ' images; a message carries at most 4' };
      ids.forEach(function (id) { delete held[id]; });
      return { held: got };
    }
    function reply(conn, id, result) { conn.sink.text(JSON.stringify({ jsonrpc: '2.0', id: id, result: result })); }
    function fail(conn, id, code, message) { conn.sink.text(JSON.stringify({ jsonrpc: '2.0', id: id, error: { code: code, message: message } })); }

    function pushAll(id, method, params) {
      var text = JSON.stringify({ jsonrpc: '2.0', method: method, params: Object.assign({ figaro_id: id }, params) });
      core.conns.slice().forEach(function (c) { if (c.open && c.follows[id]) c.sink.text(text); });
    }

    function metricsNow(id) { return Object.assign({}, metricsOf[id]); }

    function pushPage(id, part) {
      pushAll(id, 'figaro.aria', { parts: [part], more: {}, metrics: metricsNow(id) });
    }

    function partOf(t, from) {
      var part = { turn: t.id, inquiry: t.inquiry, sealed: t.sealed, from: from || 0, at: t.at };
      if (t.inquiry_segments) part.inquiry_segments = clone(t.inquiry_segments);
      if (t.formDeltas) part.formDeltas = clone(t.formDeltas);
      if (t.forked_from) part.forked_from = t.forked_from;
      var nodes = t.nodes.slice(from || 0).map(function (n, i) { return Object.assign({ id: t.id + '.' + ((from || 0) + i) }, clone(n)); });
      if (nodes.length) part.nodes = nodes;
      if (!t.sealed && nodes.length) part.live = { from: 0, v: t.lastV };
      return part;
    }

    function pageOf(a, req) {
      var turns = a.turns, limit = Math.min(req.limit || core.pageBytes, core.pageBytes), parts = [], used = 0, i, part;
      var at = req.at || { turn: 0, node: 0 };
      var page = { more: {}, metrics: metricsNow(a.row.id) };
      if (req.backward) {
        var end = at.turn > 0 && at.turn < HUGE / 2 ? turns.findIndex(function (t) { return t.id >= at.turn; }) : turns.length;
        if (end < 0) end = turns.length;
        for (i = end - 1; i >= 0; i--) {
          part = partOf(turns[i]);
          var s = size(part);
          if (parts.length && used + s > limit) break;
          parts.unshift(part);
          used += s;
        }
        page.parts = parts;
        if (i >= 0) { page.more.before = true; page.prev = { turn: parts[0].turn, node: 0 }; }
        return page;
      }
      var first = at.turn > 0 ? turns.findIndex(function (t) { return t.id >= at.turn; }) : 0;
      if (first < 0) first = turns.length;
      for (i = first; i < turns.length; i++) {
        part = partOf(turns[i], i === first && turns[i].id === at.turn ? at.node : 0);
        var z = size(part);
        if (parts.length && used + z > limit) break;
        parts.push(part);
        used += z;
      }
      page.parts = parts;
      if (i < turns.length) { page.more.after = true; page.next = { turn: turns[i].id, node: 0 }; }
      return page;
    }

    function applyDelta(t, d) {
      while (t.nodes.length <= d.id) t.nodes.push({});
      var n = t.nodes[d.id];
      Object.keys(d.set || {}).forEach(function (k) { n[k] = d.set[k]; });
      (d.unset || []).forEach(function (k) { delete n[k]; });
      Object.keys(d.patch || {}).forEach(function (f) {
        var p = d.patch[f];
        n[f] = splice(typeof n[f] === 'string' ? n[f] : '', p.at, p.del, p.ins);
      });
    }

    function tell(e) { core.taps.slice().forEach(function (fn) { fn(e); }); }

    function emit(a, t, deltas) {
      if (!t.open) t.open = { v: 0 };
      var v = t.open.v++;
      t.lastV = v;
      deltas.forEach(function (d) { applyDelta(t, d); });
      var part = { turn: t.id, sealed: false, from: 0, live: { from: 0, v: v, nodes: deltas } };
      if (v === 0) part.inquiry = t.inquiry;
      metricsOf[a.row.id].context_tokens += 6;
      pushPage(a.row.id, part);
      deltas.forEach(function (d) {
        var n = t.nodes[d.id];
        if (n && n.type === 'prose' && (d.set && d.set.markdown !== undefined || d.patch)) tell({ type: 'prose', aria: a.row.id, turn: t.id, node: d.id, text: n.markdown });
      });
    }

    function closeRound(a, t) {
      if (!t.open) return;
      pushPage(a.row.id, { turn: t.id, inquiry: t.inquiry, sealed: false, from: 0, live: { from: 0, v: t.lastV } });
      t.open = null;
    }

    var MD_REPLY = '# Findings\n\nThe cause is a stale cursor.\n\n- read backward\n- follow live\n\n```go\nfmt.Println(cursor)\n```\n\n| file | lines | note |\n|------|------:|:----:|\n| a.go | 12 | ok |\n| b.go | 7 | slow |\n| c.go | 3 | new |\n\nThat is all.\n';

    var LONG_REPLY = (function () {
      var out = [];
      for (var i = 1; i <= 24; i++) out.push('## Part ' + i + '\n\nThe reader keeps the *settled* nodes and replaces the live one on every delta, so a late frame is dropped by version and nothing else moves. ' + OPENERS[i % OPENERS.length] + BODIES[i % BODIES.length]);
      return out.join('\n\n') + '\n';
    }());

    function pieces(text) { return text.match(/\S+\s*|\s+/g) || []; }

    function streamText(a, t, idx, type, text, chunks) {
      var ps = pieces(text), group = Math.max(1, chunks || 3), ref = { idx: idx };
      var head = ps.slice(0, 2).join('');
      var script = [function () {
        if (ref.idx == null) ref.idx = t.nodes.length;
        emit(a, t, [{ id: ref.idx, set: { type: type, role: 'output', markdown: head } }]);
      }];
      var done = ENC.encode(head).length;
      for (var i = 2; i < ps.length; i += group) {
        (function (piece, at) {
          script.push(function () { emit(a, t, [{ id: ref.idx, patch: { markdown: { at: at, del: 0, ins: piece } } }]); });
        }(ps.slice(i, i + group).join(''), done));
        done += ENC.encode(ps.slice(i, i + group).join('')).length;
      }
      return script;
    }

    function benchText(bytes) {
      var out = '', i = 0;
      while (out.length < bytes) { out += OPENERS[i % OPENERS.length] + BODIES[i % BODIES.length] + '\n\n'; i++; }
      return out.slice(0, bytes);
    }

    function benchPlan(a, t) {
      var body = benchText(stream.bytes), interval = 1000 / stream.fps, frames = Math.ceil(body.length / stream.chunk), t0 = 0, s = [];
      for (var k = 0; k < frames; k++) {
        (function (k) {
          var piece = body.slice(k * stream.chunk, (k + 1) * stream.chunk);
          s.push({
            fn: function () {
              if (k === 0) { t0 = clock(); emit(a, t, [{ id: 0, set: { type: 'prose', role: 'output', markdown: piece } }]); return; }
              emit(a, t, [{ id: 0, patch: { markdown: { at: k * stream.chunk, del: 0, ins: piece } } }]);
            },
            wait: function () { return Math.max(0, t0 + (k + 1) * interval - clock()); }
          });
        }(k));
      }
      return s;
    }

    function plan(a, t, text, attached) {
      if (stream && !/\[error\]/.test(text)) return benchPlan(a, t);
      var s = [], tool = /\[tool\]|run|test|check|build/i.test(text) && !/\[plain\]/.test(text);
      var think = !/\[plain\]/.test(text), n = 0, idx, md = /\[md\]/.test(text), long = /\[long\]/.test(text);
      if (md || long) tool = false;
      if (long) think = false;
      var call = 'call_live' + t.id;
      var gap = function (fn, ms) { s.push({ fn: fn, wait: ms == null ? step : ms }); };
      var seq = function (list) { list.forEach(function (f) { gap(f); }); };
      if (/\[error\]/.test(text)) { gap(function () { a.run.failure = 'error: gateway: HTTP 400: the fake model refused on purpose'; }); return s; }
      if (think) { idx = n++; seq(streamText(a, t, idx, 'thinking', THOUGHTS[t.id % THOUGHTS.length] + ' Then I will answer plainly and name the file.')); }
      idx = n++;
      var said = attached.length ? 'I read ' + attached.map(function (h) { return h.name + (h.kind === 'pdf' ? ' (pdf, ' + h.pages + ' pages)' : ' (image)'); }).join(' and ') + '.' : '';
      seq(streamText(a, t, idx, 'prose', said || (long ? LONG_REPLY : md ? MD_REPLY : tool ? 'Let me look.' : OPENERS[t.id % OPENERS.length] + BODIES[t.id % BODIES.length]), 2));
      if (tool) {
        idx = n++;
        var args = { command: 'go test ./api/livedoc/... -run Settle' };
        var raw = JSON.stringify(args);
        gap(function () { emit(a, t, [{ id: idx, set: { type: 'tool', role: 'output', name: 'bash', status: 'running', tool_call_id: call, opened_at: clock() } }]); });
        gap(function () { emit(a, t, [{ id: idx, set: { input: raw.slice(0, 20) } }]); });
        if (/\[drop\]/.test(text)) gap(function () { core.drop(); });
        gap(function () { emit(a, t, [{ id: idx, set: { input: raw } }]); });
        gap(function () { emit(a, t, [{ id: idx, set: { args: args, summary: 'command=' + args.command }, unset: ['input'] }]); });
        gap(function () { emit(a, t, [{ id: idx, set: { started_at: clock() } }]); });
        gap(function () { emit(a, t, [{ id: idx, set: { output: 'ok  \tfigaro/api/livedoc\t0.213s', finished_at: clock() } }]); }, step * 3);
        gap(function () { emit(a, t, [{ id: idx, set: { status: 'ok' } }]); });
        gap(function () {
          if (!a.queue.length) return;
          closeRound(a, t);
          var deltas = t.nodes.map(function (nd, i) { return { id: i, set: clone(nd) }; });
          deltas.push({ id: t.nodes.length, set: { type: 'steering', role: 'input', markdown: a.queue.shift(), at: clock() } });
          emit(a, t, deltas);
        });
        seq(streamText(a, t, null, 'prose', 'The tool said ok. Settle holds for the whole round, so nothing else moved.', 2));
      }
      return s;
    }

    function seal(a, t, reason) {
      var stamp = clock();
      closeRound(a, t);
      t.nodes.forEach(function (nd) { if (nd.at == null) nd.at = stamp; });
      t.sealed = true;
      t.open = null;
      var part = partOf(t);
      delete part.live;
      var q = a.queue.length;
      pushPage(a.row.id, part);
      a.run = null;
      a.row.state = 'idle';
      a.row.message_count = a.turns.length;
      a.row.last_active = clock();
      pushAll(a.row.id, 'turn.done', q ? { reason: reason, idle: false } : { reason: reason, idle: true });
      tell({ type: 'seal', aria: a.row.id, turn: t.id, reason: reason });
      if (q && reason !== 'interrupted') begin(a, a.queue.shift());
    }

    function begin(a, text, attached) {
      var t = { id: a.turns.length + 1, inquiry: text, nodes: [], sealed: false, at: clock(), lastV: 0, open: null };
      if (a.forkFresh) {
        t.formDeltas = {};
        t.formDeltas[a.row.id + '.system.forked_from'] = { form: a.row.id, kind: 'bound', event: 'set', value: a.forkedFrom };
        t.forked_from = a.forkedFrom;
        a.forkFresh = false;
      }
      a.turns.push(t);
      a.row.state = 'active';
      var run = a.run = { turn: t, script: [], timer: null, failure: '' };
      var opened = { turn: t.id, inquiry: text, sealed: false, from: 0, at: t.at };
      if (t.formDeltas) opened.formDeltas = clone(t.formDeltas);
      if (t.forked_from) opened.forked_from = t.forked_from;
      pushPage(a.row.id, opened);
      tell({ type: 'begin', aria: a.row.id, turn: t.id });
      run.script = plan(a, t, text, attached || []);
      var next = function () {
        if (a.run !== run) return;
        var item = run.script.shift();
        if (run.failure) { seal(a, t, run.failure); return; }
        if (!item) { seal(a, t, 'stop'); return; }
        item.fn();
        run.timer = timers.set(next, typeof item.wait === 'function' ? item.wait() : item.wait);
      };
      run.timer = timers.set(next, step);
    }

    function listRows(req) {
      var limit = Math.max(1, req.limit || 8), start = req.before ? Number(req.before) : 0;
      var slice = core.order.slice(start, start + limit).map(function (id) {
        var a = core.arias[id];
        return Object.assign({}, a.row, { message_count: a.turns.length, state: a.run ? 'active' : a.dormant ? 'dormant' : 'idle' });
      });
      var out = { figaros: slice };
      if (start + limit < core.order.length) out.next_before = String(start + limit);
      return out;
    }

    function fork(id, req) {
      var a = core.arias[id];
      var nid = aid(40 + core.order.length);
      var turns = clone(a.turns.filter(function (t) { return t.sealed && (!req.at_turn || t.id < req.at_turn); }));
      core.arias[nid] = { row: {}, turns: turns, run: null, queue: [], dormant: false };
      core.arias[nid].row = { id: nid, short: nid.slice(0, 8), kind: 'figaro', state: 'idle', mantra: a.row.mantra, handle: 'fork-' + nid.slice(-4), parent: id, created_at: clock() };
      metricsOf[nid] = Object.assign({}, metricsOf[id]);
      core.arias[nid].forkedFrom = id;
      core.arias[nid].forkFresh = true;
      core.order.splice(core.order.indexOf(id) + 1, 0, nid);
      timers.set(function () { pushForm('@arias'); pushForm('@recent'); }, 0);
      return { parent: id, continuation: id, alternative: nid, at: req.at_turn ? 'turn ' + req.at_turn : 'the head' };
    }

    var methods = {
      'angelus.hello': function (c, id) {
        reply(c, id, { version: 1, capabilities: ['qua.images', 'unfollow', 'follow.channels'], node: core.fixture ? Object.keys(core.fixture.troupe)[0] : 'mock-node', principal: { kind: 'user', id: 'gluck@edge.test' } });
      },
      'figaro.form': function (c, id, p) {
        var root = formRoot(p.figaro_id);
        if (!root) { fail(c, id, -32000, 'figaro: form ' + p.figaro_id + ' not found'); return; }
        reply(c, id, { snapshot: root, version: formVer[p.figaro_id] || 1, incarnation: formInc[p.figaro_id] || 1, origin: p.client || '' });
      },
      'figaro.set': function (c, id, p) {
        var a = core.arias[p.figaro_id];
        if (!a) { fail(c, id, -32000, 'figaro: aria ' + p.figaro_id + ' not found'); return; }
        var keys = patchKeys(p.patch || {}, '');
        var reserved = keys.filter(function (k) { return /^(system|runtime)(\.|$)/.test(k) || k === 'name' || k === 'role-name'; });
        if (reserved.length) { fail(c, id, -32020, reserved[0] + ' is reserved: the gateway may not write it'); return; }
        var next = applyPatch(p.patch || {}, formRoot(p.figaro_id));
        a.edited = next;
        if (typeof next.mantra === 'string') a.row.mantra = next.mantra;
        var v = (formVer[p.figaro_id] || 1) + 1;
        formVer[p.figaro_id] = v;
        core.sets = (core.sets || []).concat([{ id: p.figaro_id, keys: keys }]);
        reply(c, id, { ok: true, outcome: 'applied', version: v, set: keys });
        var text = JSON.stringify({ jsonrpc: '2.0', method: 'form.delta', params: { schema: 2, figaro_id: p.figaro_id, version: v, incarnation: formInc[p.figaro_id] || 1, patch: p.patch, origin: p.client || '', seq: p.seq } });
        core.conns.slice().forEach(function (k) { if (k.open && k.follows[p.figaro_id]) k.sink.text(text); });
      },
      'figaro.follow': function (c, id, p) {
        if (formRoot(p.figaro_id) && !core.arias[p.figaro_id]) { c.follows[p.figaro_id] = true; reply(c, id, { ok: true, figaro_id: p.figaro_id }); return; }
        if (!core.arias[p.figaro_id]) { fail(c, id, -32000, 'figaro: aria ' + p.figaro_id + ' not found'); return; }
        c.follows[p.figaro_id] = true;
        reply(c, id, { ok: true, figaro_id: p.figaro_id });
      },
      'figaro.unfollow': function (c, id, p) {
        var had = !!c.follows[p.figaro_id];
        delete c.follows[p.figaro_id];
        reply(c, id, { released: had });
      },
      'figaro.read': function (c, id, p) {
        var a = core.arias[p.figaro_id];
        if (!a) { fail(c, id, -32000, 'figaro: aria ' + p.figaro_id + ' not found'); return; }
        reply(c, id, pageOf(a, p));
      },
      'figaro.qua': function (c, id, p) {
        var a = core.arias[p.figaro_id];
        if (!a) { fail(c, id, -32000, 'figaro: aria ' + p.figaro_id + ' not found'); return; }
        if (a.dormant) { fail(c, id, -32042, 'figaro: aria is dormant'); return; }
        var inquiry = p.text, attached = [];
        if (p.attachments !== undefined) {
          var took = takeAttachments(p.attachments, p.text);
          if (took.error) { fail(c, id, -32602, took.error); return; }
          attached = took.held;
          attached.forEach(function (h) { if (h.kind === 'pdf') inquiry += '\n\n```pdf ' + h.name + ' (' + h.pages + ' pages)\n' + h.text + '\n```'; });
        }
        c.follows[p.figaro_id] = true;
        var active = !!a.run;
        core.sent = (core.sent || []).concat([{ id: p.figaro_id, text: p.text, images: (p.images || []).length + attached.reduce(function (n, h) { return n + h.images; }, 0), attachments: attached.map(function (h) { return h.name; }) }]);
        if (active) a.queue.push(inquiry);
        else begin(a, inquiry, attached);
        reply(c, id, active ? { ok: true, cursor: a.turns.length, active: true } : { ok: true, cursor: a.turns.length });
      },
      'figaro.interrupt': function (c, id, p) {
        var a = core.arias[p.figaro_id];
        if (!a) { fail(c, id, -32000, 'figaro: aria ' + p.figaro_id + ' not found'); return; }
        var cleared = p.queue === 'clear' && a.queue.length > 0;
        if (p.queue === 'clear') a.queue = [];
        var stopped = !!a.run;
        if (stopped) {
          timers.clear(a.run.timer);
          var keep = a.queue.slice();
          a.queue = [];
          seal(a, a.run.turn, 'interrupted');
          if (keep.length) { a.queue = keep.slice(1); begin(a, keep[0]); }
        }
        core.interrupts = (core.interrupts || []).concat([p.queue]);
        reply(c, id, { ok: true, stopped: stopped, cleared: cleared });
      },
      'figaro.fork': function (c, id, p) {
        if (!core.arias[p.figaro_id]) { fail(c, id, -32000, 'figaro: aria ' + p.figaro_id + ' not found'); return; }
        reply(c, id, fork(p.figaro_id, p));
      },
      'angelus.outfits': function (c, id) {
        var names = ['opus5-ant', 'sonn5-kic', 'default'];
        reply(c, id, { default: 'sonn5-kic', names: names, outfits: names.map(function (n) { return { name: n, path: '/home/gluck/.config/figaro/outfits/' + n + '.toml', origin: 'user' }; }) });
      },
      'figaro.list': function (c, id, p) { reply(c, id, listRows(p || {})); }
    };

    var formInc = {};
    var formVer = {};
    function patchKeys(pt, at) {
      var o = pt.object;
      if (!o) return at ? [at] : [];
      var out = [];
      var join = function (k) { return at ? at + '.' + k : k; };
      Object.keys(o.Set || {}).forEach(function (k) { out.push(join(k)); });
      Object.keys(o.Delete || {}).forEach(function (k) { out.push(join(k)); });
      Object.keys(o.Update || {}).forEach(function (k) { out = out.concat(patchKeys(o.Update[k], join(k))); });
      return out;
    }
    function applyPatch(pt, v) {
      if (pt.scalar) return pt.scalar.After;
      if (!pt.object) return v;
      var o = pt.object;
      var base = v && typeof v === 'object' && !Array.isArray(v) ? clone(v) : {};
      Object.keys(o.Delete || {}).forEach(function (k) { delete base[k]; });
      Object.keys(o.Set || {}).forEach(function (k) { base[k] = clone(o.Set[k]); });
      Object.keys(o.Update || {}).forEach(function (k) { base[k] = applyPatch(o.Update[k], base[k]); });
      return base;
    }
    var formLabel = function (row) { return row.handle || row.mantra || row.short; };
    function windowIds() { return o.window ? core.order.slice(0, o.window) : core.order; }
    function cut() { return Math.max(0, core.order.length - windowIds().length); }
    function ariasRoot() {
      var kept = {};
      var rows = windowIds().map(function (id) { kept[id] = true; return core.arias[id].row; });
      var byParent = {};
      rows.forEach(function (r) { var p = r.parent && kept[r.parent] ? r.parent : ''; (byParent[p] = byParent[p] || []).push(r); });
      var used = {};
      function level(parent) {
        var out = {};
        (byParent[parent] || []).forEach(function (r) {
          var label = formLabel(r);
          if (used[label]) label = label + ' ' + r.short;
          used[label] = true;
          var node = { id: r.id, state: r.state, mantra: r.mantra, active_at: r.last_active || r.created_at, ctx: (metricsOf[r.id] || {}).context_tokens || 0, ctx_limit: 1000000 };
          if (r.roles && r.roles.length) node.role = r.roles.join(' ');
          var kids = level(r.id);
          if (Object.keys(kids).length) node.forks = kids;
          out[label] = node;
        });
        return out;
      }
      var root = { arias: level('') };
      if (cut()) root.more = cut();
      return root;
    }
    function recentRoot() {
      var out = {};
      windowIds().forEach(function (id) {
        var r = core.arias[id].row;
        out[r.short] = { id: r.id, handle: r.handle || '', title: r.mantra, state: r.state, active_at: r.last_active || r.created_at };
      });
      if (cut()) out.more = cut();
      return out;
    }
    function formRoot(id) {
      if (id === '@troupe') return core.fixture ? clone(core.fixture.troupe) : { 'mock-node': { self: true, form: '@arias' } };
      if (id === '@arias' && core.fixture) return clone(core.fixture.arias);
      if (id === '@arias') { var root = ariasRoot(); root.roles = {}; return root; }
      if (id === '@recent') return recentRoot();
      var a = core.arias[id];
      if (!a) return null;
      if (a.edited) return clone(a.edited);
      var sys = { model: 'claude-sonnet-5', provider: 'anthropic', thinking_effort: id === core.ids.main ? 'high' : 'medium', cwd: '/home/gluck/dev/zanni' };
      if (a.forkedFrom) sys.forked_from = a.forkedFrom;
      return { mantra: a.row.mantra, system: sys };
    }
    function pushForm(id) {
      formInc[id] = (formInc[id] || 1) + 1;
      var text = JSON.stringify({ jsonrpc: '2.0', method: 'form.delta', params: { schema: 2, figaro_id: id, version: 1, incarnation: formInc[id], patch: {} } });
      core.conns.slice().forEach(function (c) { if (c.open && c.follows[id]) c.sink.text(text); });
    }
    core.pushForm = pushForm;

    core.attach = function (sink) {
      var conn = { sink: sink, follows: {}, open: true };
      core.conns.push(conn);
      return {
        receive: function (text) {
          var f;
          try { f = JSON.parse(text); } catch (e) { return; }
          core.calls.push({ method: f.method, params: f.params });
          var fn = methods[f.method];
          if (!fn) { fail(conn, f.id, -32601, 'method not found: ' + f.method); return; }
          fn(conn, f.id, f.params || {});
        },
        close: function () {
          conn.open = false;
          var i = core.conns.indexOf(conn);
          if (i >= 0) core.conns.splice(i, 1);
        }
      };
    };

    core.drop = function () {
      var all = core.conns.splice(0);
      core.dropped += all.length;
      all.forEach(function (c) { c.open = false; c.sink.close(); });
      return all.length;
    };

    core.dial = function (events) {
      return new Promise(function (resolve) {
        var conn = core.attach({
          text: function (s) { setTimeout(function () { events.message(s); }, 0); },
          close: function () { setTimeout(function () { events.closed('connection dropped'); }, 0); }
        });
        resolve({
          send: function (frame) { setTimeout(function () { conn.receive(frame); }, 0); },
          close: function () { conn.close(); setTimeout(function () { events.closed('closed'); }, 0); }
        });
      });
    };

    core.running = function (id) { return !!core.arias[id].run; };
    return core;
  }

  return { create: create, aid: aid, EVIL: EVIL, BIDI: BIDI, HUGE: HUGE };
}));
