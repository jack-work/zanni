(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.figchatMock = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var RATE = 24000;
  var CHUNK = 4096;
  var EVIL = '<img src=x onerror="window.__pwned=1">';

  function chirp(seconds) {
    var n = Math.round(seconds * RATE), out = new Int16Array(n), phase = 0;
    for (var i = 0; i < n; i++) {
      var t = i / n;
      phase += 2 * Math.PI * (330 + 330 * t) / RATE;
      var edge = Math.min(1, i / 240, (n - 1 - i) / 240);
      out[i] = Math.round(Math.sin(phase) * 0.25 * edge * 32767);
    }
    return new Uint8Array(out.buffer);
  }

  function wav(pcm) {
    var out = new Uint8Array(44 + pcm.length), v = new DataView(out.buffer);
    var tag = function (at, s) { for (var i = 0; i < 4; i++) out[at + i] = s.charCodeAt(i); };
    tag(0, 'RIFF'); v.setUint32(4, 36 + pcm.length, true); tag(8, 'WAVE'); tag(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    tag(36, 'data'); v.setUint32(40, pcm.length, true);
    out.set(pcm, 44);
    return out;
  }

  function pieces(text) {
    return text.match(/<[^>]*>|\S+\s*|\s+/g) || [];
  }

  function iso(ms) { return new Date(ms).toISOString(); }

  var MIN = 60000;

  function turnsFor(count, now, extra) {
    var out = [];
    for (var i = 1; i <= count; i++) {
      var reply = 'Answer ' + i + '. Short and to the point.';
      out.push({
        id: i, at: iso(now - (count - i + 1) * 3 * MIN), prompt: 'Question ' + i + '?', reply: reply,
        tools: [], done: true, cursor: { turn: i, text: reply.length, started: i, ended: i }
      });
    }
    if (extra) extra(out);
    return out;
  }

  function kingTurns(now) {
    return turnsFor(120, now, function (t) {
      t[116].tools = [{ id: 'k1', name: 'calendar.today', args: '{}', result: '4 entries' }];
      t[116].reply = 'Three shaves before noon, then the Count at one.\nShall I read you the list?';
      t[116].audio_id = 'seed-reply';
      t[117].prompt = 'Yes, and note that Rosina moved to Thursday.';
      t[117].prompt_audio_id = 'seed-clip';
      t[118].reply = 'Noted. Thursday at ten for Rosina.';
      t[118].audio_id = 'seed-expired';
      t[119].from = 'lane order-ui';
      t[119].prompt = 'Status of the order site?';
      t[119].reply = 'Pushed, checks green.';
    });
  }

  function row(id, title, depth, parent, st, ago, roles, turns, extra) {
    return Object.assign({ id: id, handle: roles && roles[0] ? roles[0] : '', title: title, mantra: '', roles: roles || [], parent: parent || '', depth: depth, state: st, last_turn: ago, turns: turns || [] }, extra || {});
  }

  function seed(kind, now) {
    if (kind === 'empty') return { spain: [], gluck: [] };
    if (kind === 'hostile') {
      var long = new Array(600).join('0123456789');
      var bad = [
        { id: 'T1', at: iso(now - 9 * MIN), prompt: EVIL + ' and a \u200Bzero width and \u0000 nul', reply: 'Markup stays text: ' + EVIL + '\n<script>window.__pwned=2</script>\n' + long, tools: [{ id: 't1', name: EVIL, args: EVIL, result: EVIL }, { id: 't2', name: 'bash', args: '{}', error: EVIL }], done: true, cursor: { turn: 1, text: 10, started: 1, ended: 1 } }
      ];
      bad[0].id = 1;
      return { spain: [
        row('aa01', 'Hostile ' + EVIL + ' \u202Eeltit', 0, '', 'idle', iso(now - MIN), ['@' + EVIL], bad),
        row('aa02', long, 1, 'aa01', 'idle', iso(now - 2 * MIN), [], [])
      ], gluck: [] };
    }
    var spain = [
      row('wick-sushi', 'King of Spain', 0, '', 'active', iso(now - 4 * MIN), ['@King of Spain'], kingTurns(now)),
      row('anklet-aerosol', 'Chat-aria A-E choices for Gluck', 1, 'wick-sushi', 'dormant', iso(now - 26 * 60 * MIN), [], turnsFor(3, now)),
      row('arsonist-grill', 'Figaro Engineer', 1, 'wick-sushi', 'active', iso(now - MIN), ['@Figaro Engineer'], turnsFor(6, now)),
      row('aardvark-thaw', '#126 follow focus', 2, 'arsonist-grill', 'idle', iso(now - 24 * 60 * MIN), [], turnsFor(4, now)),
      row('abundant-lecturer', 'Read the chat-follow lane brief', 2, 'arsonist-grill', 'active', iso(now - 2 * MIN), [], turnsFor(5, now)),
      row('again-myspace', 'review scope slice 2', 2, 'arsonist-grill', 'reaped', iso(now - 3 * 60 * MIN), [], []),
      row('degree-frosting', 'King delegation lane', 2, 'arsonist-grill', 'idle', iso(now - 10 * 60 * MIN), [], turnsFor(2, now)),
      row('lantern-bishop', 'Backend Engineer', 1, 'wick-sushi', 'idle', iso(now - 40 * MIN), ['@Backend Engineer'], turnsFor(3, now)),
      row('merlin-tally', 'keel lane', 2, 'lantern-bishop', 'idle', iso(now - 5 * 60 * MIN), [], turnsFor(2, now)),
      row('verdant-olive', 'Herald', 0, '', 'idle', iso(now - 3 * 24 * 60 * MIN), ['@Herald'], turnsFor(3, now))
    ];
    for (var i = 0; i < 40; i++) spain.push(row('spare-' + ('0' + i).slice(-2), 'Scratch ' + i, 0, '', 'idle', iso(now - (4 + i) * 24 * 60 * MIN), [], []));
    return { spain: spain, gluck: [row('desk-main', 'Gluck desk', 0, '', 'idle', iso(now - 80 * MIN), [], turnsFor(2, now))] };
  }

  function create(opts) {
    opts = opts || {};
    var now = opts.now || function () { return Date.now(); };
    var set = opts.setTimeout || function (fn, ms) { return setTimeout(fn, ms); };
    var clear = opts.clearTimeout || function (t) { clearTimeout(t); };
    var rows = seed(opts.seed || 'demo', now());
    var state = {
      stores: [{ id: 'spain', label: 'Spain', online: true }, { id: 'gluck', label: 'Gluck', online: opts.gluckOnline === true }],
      rows: rows,
      audio: { 'seed-reply': wav(chirp(3.2)), 'seed-clip': wav(chirp(1.6)), 'seed-expired': null },
      sockets: [],
      posts: [],
      cancels: [],
      forks: [],
      attaches: [],
      clips: [],
      transcript: 'A mock transcript.',
      received: [],
      step: opts.step == null ? 40 : opts.step,
      seconds: opts.seconds || 2.4,
      status: 0,
      oddFrameAt: -1,
      speechFails: false,
      serial: 0,
      seq: 0,
      pages: []
    };
    var seqOf = {};

    function storeOf(id) {
      for (var i = 0; i < state.stores.length; i++) if (state.stores[i].id === id) return state.stores[i];
      return null;
    }

    function ariaOf(store, id) {
      var list = rows[store] || [];
      for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
      return null;
    }

    function emit(a, frame, voiceOnly) {
      var tid = frame.turn;
      var t = a.turns[a.turns.length - 1];
      frame.cursor = { turn: tid, text: t && t.id === tid ? t.reply.length : 0, started: a.started, ended: a.ended };
      var str = [frame.cursor.turn, frame.cursor.text, frame.cursor.started, frame.cursor.ended].join('.');
      a.log.push({ seq: ++state.seq, frame: frame, voiceOnly: !!voiceOnly });
      seqOf[a.store + '/' + a.id + '/' + str] = state.seq;
      if (a.log.length > 400) a.log.shift();
      var text = JSON.stringify(frame);
      state.sockets.slice().forEach(function (s) {
        if (s.store === a.store && s.aria === a.id && (!voiceOnly || s.voice)) s.sink.text(text);
      });
    }

    function emitBinary(a, bytes) {
      state.sockets.slice().forEach(function (s) {
        if (s.store === a.store && s.aria === a.id && s.voice) s.sink.binary(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      });
    }

    function replyTo(text) {
      if (/^markdown/i.test(text)) return ['## The list\n\n', 'Three things, **two of them `sharp`**:\n\n1. the razor\n2. the *strop*\n\n```sh\nls -la <b>\n```\n\nSee [the almanac](https://example.org/a?b=1), not [this](javascript:alert(1)).\nAll is sharp.'];
      return ['You said: ' + text + '. ', 'I checked the clock for you. It is a fine day in Seville,\nand the razor is sharp.'];
    }

    function run(a, asked, from, clipId) {
      if (a.running) { a.queue.push([asked, from, clipId]); return; }
      a.running = true;
      var id = a.turns.length ? a.turns[a.turns.length - 1].id + 1 : 1;
      var t = { id: id, at: iso(now()), prompt: asked, reply: '', tools: [], done: false, cursor: null };
      if (from) t.from = from;
      if (clipId) t.prompt_audio_id = clipId;
      var speak = state.sockets.some(function (s) { return s.store === a.store && s.aria === a.id && s.voice; });
      var parts = replyTo(asked);
      var pcm = speak ? chirp(state.seconds) : new Uint8Array(0);
      var chunks = [];
      for (var at = 0; at < pcm.length; at += CHUNK) chunks.push(pcm.subarray(at, Math.min(pcm.length, at + CHUNK)));
      var sent = 0;
      var steps = [];
      var delta = function (piece) {
        return function () { t.reply += piece; emit(a, { type: 'message.delta', turn: id, text: piece }); };
      };
      var sound = function () {
        return function () {
          for (var burst = 0; burst < 2; burst++) {
            var c = chunks.shift();
            if (!c) return;
            if (sent === state.oddFrameAt) c = c.subarray(0, c.length - 1);
            sent++;
            emitBinary(a, c);
          }
        };
      };
      steps.push(function () { a.turns.push(t); a.started++; var f = { type: 'turn.start', turn: id, prompt: asked }; if (from) f.from = from; if (clipId) f.prompt_audio_id = clipId; emit(a, f); });
      pieces(parts[0]).forEach(function (p) { steps.push(delta(p)); });
      if (speak) steps.push(function () { emit(a, { type: 'audio.start', turn: id, format: 'pcm', rate: RATE, bits: 16, channels: 1 }, true); });
      steps.push(function () {
        t.tools.push({ id: 't1', name: 'bash', args: '{"command":"date"}' });
        emit(a, { type: 'tool.start', turn: id, tool_id: 't1', name: 'bash', args: '{"command":"date"}' });
      });
      for (var k = 0; k < 4 && speak; k++) steps.push(sound());
      steps.push(function () {
        t.tools[0].result = 'Fri Nov 20 07:00:00 EST 2026';
        emit(a, { type: 'tool.end', turn: id, tool_id: 't1', result: t.tools[0].result });
      });
      pieces(parts[1]).forEach(function (p) {
        steps.push(delta(p));
        if (speak) steps.push(sound());
      });
      steps.push(function () {
        t.done = true;
        a.ended++;
        emit(a, { type: 'turn.end', turn: id, text: t.reply });
      });
      for (var rest = chunks.length; rest > 0 && speak; rest--) steps.push(sound());
      if (speak) steps.push(function () {
        if (state.speechFails) { emit(a, { type: 'error', turn: id, code: 'speech', text: 'synthesis stopped' }, true); return; }
        var audio = 'a' + (++state.serial);
        state.audio[audio] = wav(pcm);
        t.audio_id = audio;
        emit(a, { type: 'audio.end', turn: id, audio_id: audio });
      });
      steps.push(function () {
        a.running = false;
        a.last_turn = iso(now());
        var next = a.queue.shift();
        if (next) run(a, next[0], next[1], next[2]);
      });
      var go = function () {
        var step = steps.shift();
        if (!step) return;
        step();
        a.timer = set(go, state.step);
      };
      a.timer = set(go, state.step);
    }

    function prepare(a, store) {
      if (a.log) return a;
      a.store = store;
      a.log = [];
      a.queue = [];
      a.running = false;
      a.started = a.turns.length;
      a.ended = a.turns.length;
      return a;
    }

    function fail(status, code, error) { return { status: status, json: { error: error, code: code } }; }

    function handle(method, path, body) {
      if (state.status) return fail(state.status, 'mock', 'mock failure');
      var url = path.split('?'), q = {};
      (url[1] || '').split('&').forEach(function (kv) { var p = kv.split('='); if (p[0]) q[p[0]] = decodeURIComponent(p[1] || ''); });
      var m, req = {};
      if (body) { try { req = JSON.parse(body); } catch (e) { return fail(400, 'bad_request', 'bad json'); } }
      if (url[0] === '/chat/api/stores' && method === 'GET') return { status: 200, json: { stores: state.stores.map(function (x) { return { id: x.id, label: x.label, online: x.online }; }) } };
      if (url[0] === '/chat/api/clips' && method === 'POST') return clip('audio/webm', 1);
      if ((m = /^\/chat\/api\/clips\/([^/]+)\/retranscribe$/.exec(url[0])) && method === 'POST') {
        return state.audio[decodeURIComponent(m[1])] ? { status: 200, json: { text: 'A mock transcript, again.' } } : fail(404, 'not_found', 'no such audio');
      }
      m = /^\/chat\/api\/stores\/([^/]+)\/arias(?:\/([^/]+)(?:\/(turns|send|cancel))?)?$/.exec(url[0]);
      if (!m) return fail(404, 'not_found', 'no route');
      var store = decodeURIComponent(m[1]), id = m[2] && decodeURIComponent(m[2]), verb = m[3];
      var st = storeOf(store);
      if (!st) return fail(404, 'not_found', 'no such store');
      if (!st.online) return fail(503, 'store_offline', 'store is offline');
      var list = rows[store];
      if (!id) {
        if (method === 'GET') {
          var from = Number(q.before) || 0, limit = Number(q.limit) > 0 ? Math.min(200, Number(q.limit)) : 30;
          state.pages.push({ store: store, before: q.before || '', limit: limit });
          var slice = list.slice(from, from + limit).map(function (x) {
            var o = Object.assign({}, x);
            delete o.turns; delete o.log; delete o.queue; delete o.timer; delete o.store; delete o.running; delete o.started; delete o.ended;
            return o;
          });
          var out = { arias: slice };
          if (from + limit < list.length) out.next_before = String(from + limit);
          return { status: 200, json: out };
        }
        if (method === 'POST') {
          var parent = req.fork_of ? ariaOf(store, req.fork_of) : list[0];
          if (req.fork_of && !parent) return fail(404, 'aria_gone', 'no such aria');
          var nid = 'fork-' + (++state.serial);
          var at = parent ? list.indexOf(parent) + 1 : 0;
          while (parent && at < list.length && list[at].depth > parent.depth) at++;
          var fresh = row(nid, String(req.title || '').trim() || 'New fork', parent ? parent.depth + 1 : 0, parent ? parent.id : '', 'idle', iso(now()), [], []);
          list.splice(at, 0, fresh);
          state.forks.push({ store: store, fork_of: req.fork_of || '', title: req.title || '' });
          return { status: 200, json: { id: nid } };
        }
      }
      var a = ariaOf(store, id);
      if (!a || a.state === 'reaped') return fail(404, 'aria_gone', 'no such aria');
      prepare(a, store);
      if (verb === 'turns' && method === 'GET') {
        var before = Number(q.before) || 0, lim = Number(q.limit) > 0 ? Math.min(200, Number(q.limit)) : 20;
        var older = a.turns.filter(function (x) { return !before || x.id < before; });
        var got = older.slice(-lim).map(function (x) { return JSON.parse(JSON.stringify(Object.assign({}, x, { cursor: x.cursor || { turn: x.id, text: x.reply.length, started: a.started, ended: x.done ? a.ended : a.ended } }))); });
        state.pages.push({ store: store, aria: id, before: q.before || '', limit: lim });
        return { status: 200, json: { turns: got, more: older.length > lim } };
      }
      if (verb === 'send' && method === 'POST') {
        if (!String(req.text || '').trim()) return fail(400, 'bad_request', 'text is required');
        if (req.clip_id && !state.audio[req.clip_id]) return fail(400, 'bad_request', 'unknown clip');
        state.posts.push({ store: store, aria: id, body: req });
        if (a.running) state.posts[state.posts.length - 1].steered = true;
        else run(a, req.text, 'Gluck (figchat)', req.clip_id);
        return { status: 200, json: { state: 'accepted' } };
      }
      if (verb === 'cancel' && method === 'POST') {
        state.cancels.push({ store: store, aria: id });
        if (a.running) {
          clear(a.timer);
          a.running = false;
          var t = a.turns[a.turns.length - 1];
          t.done = true;
          a.ended++;
          emit(a, { type: 'turn.end', turn: t.id, text: t.reply });
        }
        return { status: 200, json: { state: 'accepted' } };
      }
      return fail(404, 'not_found', 'no route');
    }

    function clip(type, size) {
      state.clips.push({ type: type, size: size });
      if (state.status) return { status: state.status, json: { error: 'mock failure', code: 'mock' } };
      if (!/^audio\/(webm|ogg|mp4)(;|$)/.test(type)) return { status: 415, json: { error: 'record as audio/webm, audio/ogg or audio/mp4', code: 'unsupported_type' } };
      if (!size) return { status: 502, json: { error: 'speech: http 400: empty clip', code: 'speech' } };
      var id = 'clip' + (++state.serial);
      state.audio[id] = wav(chirp(1));
      return { status: 200, json: { clip_id: id, text: state.transcript, duration_ms: 1000, audio_id: id } };
    }

    function audio(id) {
      var bytes = state.audio[id];
      return bytes ? { status: 200, bytes: bytes, type: 'audio/wav' } : { status: 404, bytes: null, type: '' };
    }

    function attach(store, aria, cursor, sink) {
      var a = ariaOf(store, aria);
      var s = { store: store, aria: aria, cursor: cursor, voice: false, sink: sink };
      state.attaches.push({ store: store, aria: aria, cursor: cursor || '' });
      state.sockets.push(s);
      if (a && a.log && cursor && seqOf[store + '/' + aria + '/' + cursor] != null) {
        var after = seqOf[store + '/' + aria + '/' + cursor];
        a.log.forEach(function (e) { if (e.seq > after && !e.voiceOnly) sink.text(JSON.stringify(e.frame)); });
      }
      return {
        receive: function (text) {
          var f;
          try { f = JSON.parse(text); } catch (e) { return; }
          state.received.push(f);
          if (f.type === 'voice') s.voice = !!f.on;
          if (f.type === 'cancel') handle('POST', '/chat/api/stores/' + encodeURIComponent(store) + '/arias/' + encodeURIComponent(aria) + '/cancel', '{}');
        },
        close: function () {
          var i = state.sockets.indexOf(s);
          if (i >= 0) state.sockets.splice(i, 1);
        }
      };
    }

    function drop() {
      state.sockets.splice(0).forEach(function (s) { s.sink.close(); });
    }

    function inject(store, aria, text, from) {
      var a = ariaOf(store, aria);
      prepare(a, store);
      run(a, text, from || 'terminal', '');
    }

    function setOnline(id, on) {
      storeOf(id).online = !!on;
      if (!on) {
        state.sockets.filter(function (s) { return s.store === id; }).forEach(function (s) { s.sink.text(JSON.stringify({ type: 'offline' })); });
        state.sockets.filter(function (s) { return s.store === id; }).forEach(function (s) { s.sink.close(); });
        state.sockets = state.sockets.filter(function (s) { return s.store !== id; });
      }
    }

    return { state: state, handle: handle, clip: clip, audio: audio, attach: attach, drop: drop, inject: inject, setOnline: setOnline, aria: function (store, id) { return ariaOf(store, id); }, hasAria: function (store, id) { return !!ariaOf(store, id); } };
  }

  function transport(core, win) {
    var urls = {};
    var enc = encodeURIComponent;
    var answer = function (method, path, body) {
      return new Promise(function (resolve, reject) {
        var res = core.handle(method, path, body === undefined ? '' : JSON.stringify(body));
        if (res.status === 200) { resolve(JSON.parse(JSON.stringify(res.json))); return; }
        var e = new Error(res.json.error);
        e.status = res.status;
        e.code = res.json.code;
        reject(e);
      });
    };
    var qs = function (q, names) {
      var parts = [];
      names.forEach(function (n) { if (q && q[n] != null && q[n] !== '') parts.push(n + '=' + enc(q[n])); });
      return parts.length ? '?' + parts.join('&') : '';
    };
    var base = function (store, aria) { return '/chat/api/stores/' + enc(store) + '/arias/' + enc(aria); };
    return {
      stores: function () { return answer('GET', '/chat/api/stores'); },
      arias: function (store, q) { return answer('GET', '/chat/api/stores/' + enc(store) + '/arias' + qs(q, ['before', 'limit', 'q'])); },
      turns: function (store, aria, q) { return answer('GET', base(store, aria) + '/turns' + qs(q, ['before', 'limit'])); },
      send: function (store, aria, body) { return answer('POST', base(store, aria) + '/send', body); },
      cancel: function (store, aria) { return answer('POST', base(store, aria) + '/cancel', {}); },
      createAria: function (store, body) { return answer('POST', '/chat/api/stores/' + enc(store) + '/arias', body || {}); },
      clip: function (blob) {
        return new Promise(function (resolve, reject) {
          var res = core.clip(blob.type, blob.size);
          if (res.status === 200) { resolve(res.json); return; }
          var e = new Error(res.json.error);
          e.status = res.status;
          e.code = res.json.code;
          reject(e);
        });
      },
      audioURL: function (id) {
        if (urls[id]) return urls[id];
        var a = core.audio(id);
        urls[id] = win.URL.createObjectURL(new win.Blob(a.bytes ? [a.bytes] : [], { type: a.type || 'audio/wav' }));
        return urls[id];
      },
      audioStatus: function (id) { return Promise.resolve(core.audio(id).status); },
      connect: function (store, aria, cursor, h) {
        var open = false, shut = false, conn = null;
        win.setTimeout(function () {
          if (shut) return;
          var st = core.state.stores.filter(function (x) { return x.id === store; })[0];
          if (!st || !st.online) { shut = true; h.close({ code: 1006 }); return; }
          open = true;
          conn = core.attach(store, aria, cursor, {
            text: function (s) { if (open && !shut) h.frame(JSON.parse(s)); },
            binary: function (b) { if (open && !shut) h.binary(b); },
            close: function () { if (!shut) { shut = true; h.close({ code: 1006 }); } }
          });
          h.open();
        }, 0);
        return {
          send: function (frame) {
            if (!open || shut) return false;
            conn.receive(JSON.stringify(frame));
            return true;
          },
          close: function () { shut = true; if (conn) conn.close(); }
        };
      }
    };
  }

  return { create: create, transport: transport, chirp: chirp, wav: wav, pieces: pieces, EVIL: EVIL, RATE: RATE, CHUNK: CHUNK };
}));
