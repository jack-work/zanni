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

  function seed(kind, now) {
    var min = 60000;
    var say = function (id, role, text, at, extra) {
      return Object.assign({ id: id, role: role, text: text, created: iso(at), tools: [] }, extra || {});
    };
    if (kind === 'empty') return [];
    if (kind === 'hostile') {
      var long = new Array(600).join('0123456789');
      return [
        { id: 'aa01', title: 'Hostile ' + EVIL + ' \u202Eeltit', updated: iso(now - min), messages: [
          say(1, 'user', EVIL + ' and a \u200Bzero width and \u0000 nul', now - 9 * min),
          say(2, 'assistant', 'Markup stays text: ' + EVIL + '\n<script>window.__pwned=2</script>\n' + long, now - 8 * min, {
            tools: [{ id: 't1', name: EVIL, args: EVIL, result: EVIL }, { id: 't2', name: 'bash', args: '{}', error: EVIL }]
          })
        ] },
        { id: 'aa02', title: long, updated: iso(now - 2 * min), messages: [] }
      ];
    }
    var many = [];
    for (var i = 1; i <= 120; i++) {
      many.push(say(i, i % 2 ? 'user' : 'assistant', i % 2 ? 'Question ' + Math.ceil(i / 2) + '?' : 'Answer ' + (i / 2) + '. Short and to the point.', now - (200 - i) * min));
    }
    return [
      { id: 'c0ffee01', title: 'Razors and schedules', updated: iso(now - 4 * min), messages: [
        say(1, 'user', 'Good morning. What is on for today?', now - 30 * min),
        say(2, 'assistant', 'Three shaves before noon, then the Count at one.\nShall I read you the list?', now - 29 * min, {
          audio_id: 'seed-reply', tools: [{ id: 't1', name: 'calendar.today', args: '{}', result: '4 entries' }]
        }),
        say(3, 'user', 'Yes, and note that Rosina moved to Thursday.', now - 6 * min, { audio_id: 'seed-clip' }),
        say(4, 'assistant', 'Noted. Thursday at ten for Rosina.', now - 5 * min, { audio_id: 'seed-expired' })
      ] },
      { id: 'c0ffee02', title: 'A long thread', updated: iso(now - 80 * min), messages: many },
      { id: 'c0ffee03', title: '', updated: iso(now - 3 * 24 * 60 * min), messages: [] }
    ];
  }

  function create(opts) {
    opts = opts || {};
    var now = opts.now || function () { return Date.now(); };
    var set = opts.setTimeout || function (fn, ms) { return setTimeout(fn, ms); };
    var clear = opts.clearTimeout || function (t) { clearTimeout(t); };
    var state = {
      threads: seed(opts.seed || 'demo', now()),
      audio: { 'seed-reply': wav(chirp(3.2)), 'seed-clip': wav(chirp(1.6)), 'seed-expired': null },
      sockets: [],
      posts: [],
      received: [],
      step: opts.step == null ? 40 : opts.step,
      seconds: opts.seconds || 2.4,
      status: 0,
      silent: false,
      oddFrameAt: -1,
      speechFails: false,
      serial: 0
    };

    function thread(id) {
      for (var i = 0; i < state.threads.length; i++) if (state.threads[i].id === id) return state.threads[i];
      return null;
    }

    function emit(t, frame, voiceOnly) {
      var text = JSON.stringify(frame);
      state.sockets.slice().forEach(function (s) {
        if (s.thread === t.id && (!voiceOnly || s.voice)) s.sink.text(text);
      });
    }

    function emitBinary(t, bytes) {
      state.sockets.slice().forEach(function (s) {
        if (s.thread === t.id && s.voice) s.sink.binary(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      });
    }

    function replyTo(text) {
      return ['You said: ' + text + '. ', 'I checked the clock for you. It is a fine day in Seville,\nand the razor is sharp.'];
    }

    function turn(t, asked) {
      if (t.running) return;
      t.running = true;
      var id = t.messages.length ? t.messages[t.messages.length - 1].id + 1 : 1;
      var msg = { id: id, thread: t.id, role: 'assistant', text: '', created: iso(now()), tools: [] };
      t.messages.push(msg);
      var speak = state.sockets.some(function (s) { return s.thread === t.id && s.voice; });
      var parts = replyTo(asked);
      var pcm = speak ? chirp(state.seconds) : new Uint8Array(0);
      var chunks = [];
      for (var at = 0; at < pcm.length; at += CHUNK) chunks.push(pcm.subarray(at, Math.min(pcm.length, at + CHUNK)));
      var sent = 0;
      var steps = [];
      var text = '';
      var tools = [];
      var delta = function (piece) {
        return function () { text += piece; emit(t, { type: 'message.delta', id: id, text: piece }); };
      };
      var sound = function () {
        return function () {
          for (var burst = 0; burst < 2; burst++) {
            var c = chunks.shift();
            if (!c) return;
            if (sent === state.oddFrameAt) c = c.subarray(0, c.length - 1);
            sent++;
            emitBinary(t, c);
          }
        };
      };
      steps.push(function () { emit(t, { type: 'message.start', id: id, role: 'assistant' }); });
      pieces(parts[0]).forEach(function (p) { steps.push(delta(p)); });
      if (speak) steps.push(function () { emit(t, { type: 'audio.start', message_id: id, format: 'pcm', rate: RATE, bits: 16, channels: 1 }, true); });
      steps.push(function () {
        tools.push({ id: 't1', name: 'bash', args: '{"command":"date"}' });
        emit(t, { type: 'tool.start', id: id, tool_id: 't1', name: 'bash', args: '{"command":"date"}' });
      });
      for (var k = 0; k < 4 && speak; k++) steps.push(sound());
      steps.push(function () {
        tools[0].result = 'Fri Nov 20 07:00:00 EST 2026';
        emit(t, { type: 'tool.end', id: id, tool_id: 't1', result: tools[0].result, error: '' });
      });
      pieces(parts[1]).forEach(function (p) {
        steps.push(delta(p));
        if (speak) steps.push(sound());
      });
      steps.push(function () {
        msg.text = text;
        msg.tools = tools;
        emit(t, { type: 'message.end', id: id });
      });
      for (var rest = chunks.length; rest > 0 && speak; rest--) steps.push(sound());
      if (speak) steps.push(function () {
        if (state.speechFails) { emit(t, { type: 'error', message_id: id, code: 'speech', text: 'synthesis stopped' }, true); return; }
        var audio = 'a' + (++state.serial);
        state.audio[audio] = wav(pcm);
        msg.audio_id = audio;
        emit(t, { type: 'audio.end', message_id: id, audio_id: audio }, true);
      });
      steps.push(function () { t.running = false; t.updated = iso(now()); });
      var run = function () {
        var step = steps.shift();
        if (!step) return;
        step();
        t.timer = set(run, state.step);
      };
      t.timer = set(run, state.step);
    }

    function handle(method, path, body) {
      if (state.status) return { status: state.status, json: { error: 'mock failure', code: 'mock' } };
      var url = path.split('?'), q = {};
      (url[1] || '').split('&').forEach(function (kv) { var p = kv.split('='); if (p[0]) q[p[0]] = decodeURIComponent(p[1] || ''); });
      var m, t, req = {};
      if (body) { try { req = JSON.parse(body); } catch (e) { return { status: 400, json: { error: 'bad json', code: 'bad_request' } }; } }
      if (url[0] === '/chat/api/threads' && method === 'GET') {
        return { status: 200, json: { threads: state.threads.map(function (x) { return { id: x.id, title: x.title, updated: x.updated }; }) } };
      }
      if (url[0] === '/chat/api/threads' && method === 'POST') {
        t = { id: 'feed' + ('0000' + (++state.serial)).slice(-4), title: String(req.title || '').trim(), updated: iso(now()), messages: [] };
        state.threads.push(t);
        return { status: 200, json: { id: t.id } };
      }
      if ((m = /^\/chat\/api\/threads\/([^/]+)\/messages$/.exec(url[0]))) {
        t = thread(decodeURIComponent(m[1]));
        if (!t) return { status: 404, json: { error: 'no such thread', code: 'not_found' } };
        if (method === 'GET') {
          var before = Number(q.before) || 0, limit = Number(q.limit) > 0 ? Math.min(200, Number(q.limit)) : 50;
          var list = t.messages.filter(function (x) { return !before || x.id < before; });
          var out = { messages: list.slice(-limit).map(function (x) { return Object.assign({ thread: t.id }, x); }) };
          if (list.length > limit) out.next_before = out.messages[0].id;
          return { status: 200, json: out };
        }
        if (method === 'POST') {
          if (!String(req.text || '').trim()) return { status: 400, json: { error: 'text is required', code: 'bad_request' } };
          var id = t.messages.length ? t.messages[t.messages.length - 1].id + 1 : 1;
          var msg = { id: id, role: 'user', text: req.text, created: iso(now()), tools: [] };
          if (req.clip_id) msg.audio_id = req.clip_id;
          t.messages.push(msg);
          t.updated = msg.created;
          state.posts.push({ thread: t.id, body: req });
          if (!state.silent) turn(t, req.text);
          return { status: 200, json: { id: id, state: 'accepted' } };
        }
      }
      if (url[0] === '/chat/api/clips' && method === 'POST') {
        var clip = 'clip' + (++state.serial);
        state.audio[clip] = wav(chirp(1));
        return { status: 200, json: { clip_id: clip, text: 'A mock transcript.', duration_ms: 1000, audio_id: clip } };
      }
      if ((m = /^\/chat\/api\/clips\/([^/]+)\/retranscribe$/.exec(url[0])) && method === 'POST') {
        return state.audio[decodeURIComponent(m[1])] ? { status: 200, json: { text: 'A mock transcript, again.' } } : { status: 404, json: { error: 'no such audio', code: 'not_found' } };
      }
      return { status: 404, json: { error: 'no route', code: 'not_found' } };
    }

    function audio(id) {
      var bytes = state.audio[id];
      return bytes ? { status: 200, bytes: bytes, type: 'audio/wav' } : { status: 404, bytes: null, type: '' };
    }

    function attach(threadId, after, sink) {
      var s = { thread: threadId, after: after, voice: false, sink: sink };
      state.sockets.push(s);
      return {
        receive: function (text) {
          var f;
          try { f = JSON.parse(text); } catch (e) { return; }
          state.received.push(f);
          if (f.type === 'voice') s.voice = !!f.on;
          if (f.type === 'cancel') {
            var t = thread(threadId);
            if (t && t.running) { clear(t.timer); t.running = false; emit(t, { type: 'message.end', id: t.messages[t.messages.length - 1].id }); }
          }
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

    return { state: state, handle: handle, audio: audio, attach: attach, drop: drop, thread: thread };
  }

  function transport(core, win) {
    var urls = {};
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
    var enc = encodeURIComponent;
    return {
      threads: function () { return answer('GET', '/chat/api/threads'); },
      createThread: function (title) { return answer('POST', '/chat/api/threads', title ? { title: title } : {}); },
      messages: function (thread, q) {
        return answer('GET', '/chat/api/threads/' + enc(thread) + '/messages?limit=' + ((q && q.limit) || 50) + (q && q.before != null ? '&before=' + enc(q.before) : ''));
      },
      send: function (thread, body) { return answer('POST', '/chat/api/threads/' + enc(thread) + '/messages', body); },
      audioURL: function (id) {
        if (urls[id]) return urls[id];
        var a = core.audio(id);
        urls[id] = win.URL.createObjectURL(new win.Blob(a.bytes ? [a.bytes] : [], { type: a.type || 'audio/wav' }));
        return urls[id];
      },
      audioStatus: function (id) { return Promise.resolve(core.audio(id).status); },
      connect: function (thread, after, h) {
        var open = false, shut = false;
        var conn = core.attach(thread, after, {
          text: function (s) { if (open && !shut) h.frame(JSON.parse(s)); },
          binary: function (b) { if (open && !shut) h.binary(b); },
          close: function () { if (!shut) { shut = true; h.close({ code: 1006 }); } }
        });
        win.setTimeout(function () {
          if (shut) return;
          open = true;
          h.open();
        }, 0);
        return {
          send: function (frame) {
            if (!open || shut) return false;
            conn.receive(JSON.stringify(frame));
            return true;
          },
          close: function () { shut = true; conn.close(); }
        };
      }
    };
  }

  return { create: create, transport: transport, chirp: chirp, wav: wav, pieces: pieces, EVIL: EVIL, RATE: RATE, CHUNK: CHUNK };
}));
