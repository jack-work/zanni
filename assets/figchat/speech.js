(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.zanni = root.zanni || {};
    root.zanni.figchatSpeech = api;
    root.figchatSpeech = api;
  }
}(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  var FORMAT = { format: 'pcm', rate: 24000, bits: 16, channels: 1 };
  var SENTENCE = /[.!?\u2026]+["')\]]*(?:\s|$)|\n/;

  function sine(seconds, hz) {
    var n = Math.max(1, Math.round(seconds * FORMAT.rate)), out = new Int16Array(n), phase = 0;
    for (var i = 0; i < n; i++) {
      var t = i / n;
      phase += 2 * Math.PI * (hz + 120 * t) / FORMAT.rate;
      var edge = Math.min(1, i / 240, (n - 1 - i) / 240);
      out[i] = Math.round(Math.sin(phase) * 0.22 * edge * 32767);
    }
    return out.buffer;
  }

  function seconds(text) {
    var words = (String(text).match(/\S+/g) || []).length;
    return Math.max(0.3, Math.min(4, words * 0.12));
  }

  function chunks(text) {
    var all = new Uint8Array(sine(seconds(text), 300 + (String(text).length % 7) * 40)), size = 4800, out = [];
    for (var at = 0; at < all.length; at += size) out.push(all.slice(at, Math.min(all.length, at + size)).buffer);
    return out;
  }

  function sentences(text, from) {
    var rest = text.slice(from), m = SENTENCE.exec(rest);
    return m ? from + m.index + m[0].length : -1;
  }

  function keyOf(store, aria, turn) { return store + '/' + aria + ':' + turn + '/out'; }

  function parseFrame(raw) {
    var f;
    try { f = JSON.parse(raw); } catch (e) { return null; }
    return f && typeof f.type === 'string' ? f : null;
  }

  function none() {
    return { open: function () { return { voice: function () {}, cancel: function () {}, close: function () {} }; } };
  }

  function mock(opts) {
    opts = opts || {};
    var gap = opts.gap == null ? 20 : opts.gap;
    var store = opts.store || 'mock';
    var schedule = opts.setTimeout || function (f, ms) { return setTimeout(f, ms); };
    var spoken = [];
    return {
      spoken: spoken,
      open: function (ctx, h) {
        var on = false, closed = false, turns = {}, queue = [], busy = false;
        function pump() {
          if (busy || closed) return;
          var job = queue.shift();
          if (!job) return;
          busy = true;
          job(function () { busy = false; schedule(pump, 0); });
        }
        function speak(t, node, cursor, text) {
          var list = chunks(text);
          queue.push(function (done) {
            if (closed || t.cancelled) { done(); return; }
            if (!t.started) {
              t.started = true;
              h.start({ aria: ctx.aria, turn: t.turn, key: keyOf(store, ctx.aria, t.turn), format: FORMAT.format, rate: FORMAT.rate, bits: FORMAT.bits, channels: FORMAT.channels, node: node, cursor: cursor });
            }
            var i = 0;
            (function next() {
              if (closed || t.cancelled) { done(); return; }
              if (i >= list.length) { done(); return; }
              var pcm = list[i++];
              h.chunk({ aria: ctx.aria, turn: t.turn, node: node, cursor: cursor, offset: t.offset, bytes: pcm.byteLength, pcm: pcm });
              t.offset += pcm.byteLength;
              schedule(next, gap);
            }());
          });
          pump();
        }
        function finish(t) {
          queue.push(function (done) {
            if (!closed && !t.cancelled && t.started) h.end({ aria: ctx.aria, turn: t.turn, key: keyOf(store, ctx.aria, t.turn), audio_id: keyOf(store, ctx.aria, t.turn) });
            done();
          });
          pump();
        }
        var off = ctx.events(function (e) {
          if (closed) return;
          if (e.type === 'input') { turns[e.turn] = { turn: e.turn, fed: 0, offset: 0, started: false, cancelled: false, nodeSeen: {} }; return; }
          var t = turns[e.turn];
          if (!t || !on) return;
          if (e.type === 'prose.delta' || e.type === 'prose.settled') {
            if (t.node != null && t.node !== e.node) { t.node = e.node; t.fed = 0; }
            if (t.node == null) t.node = e.node;
            var text = e.text, settled = e.type === 'prose.settled';
            for (;;) {
              var cut = sentences(text, t.fed);
              if (cut < 0) break;
              var piece = text.slice(t.fed, cut).trim();
              t.fed = cut;
              if (piece) { spoken.push({ aria: ctx.aria, turn: t.turn, node: e.node, text: piece }); speak(t, e.node, e.cursor, piece); }
            }
            if (settled && t.fed < text.length) {
              var tail = text.slice(t.fed).trim();
              t.fed = text.length;
              if (tail) { spoken.push({ aria: ctx.aria, turn: t.turn, node: e.node, text: tail }); speak(t, e.node, e.cursor, tail); }
            }
          } else if (e.type === 'turn.end' || e.type === 'turn.error') {
            if (e.type === 'turn.error') { t.cancelled = true; h.cancel({ aria: ctx.aria, turn: t.turn, key: keyOf(store, ctx.aria, t.turn), why: 'interrupt' }); }
            else if (e.reason === 'interrupted') { t.cancelled = true; h.cancel({ aria: ctx.aria, turn: t.turn, key: keyOf(store, ctx.aria, t.turn), why: 'interrupt' }); }
            else finish(t);
          }
        });
        h.ready && h.ready({ aria: ctx.aria, store: store });
        return {
          voice: function (v) {
            on = !!v;
            if (!on) Object.keys(turns).forEach(function (k) { if (turns[k].started && !turns[k].cancelled && !turns[k].ended) { turns[k].cancelled = true; h.cancel({ aria: ctx.aria, turn: turns[k].turn, key: keyOf(store, ctx.aria, turns[k].turn), why: 'client' }); } });
          },
          cancel: function () { Object.keys(turns).forEach(function (k) { turns[k].cancelled = true; }); },
          close: function () { closed = true; off(); }
        };
      }
    };
  }

  function gateway(opts) {
    opts = opts || {};
    var win = opts.window || root;
    var Socket = opts.WebSocket || (win && win.WebSocket);
    var base = opts.url || 'audio';
    var wait = opts.backoff || function (n) { return Math.min(10000, 500 * Math.pow(2, n)); };
    var timers = { set: opts.setTimeout || function (f, ms) { return win.setTimeout(f, ms); }, clear: opts.clearTimeout || function (t) { win.clearTimeout(t); } };
    function urlFor(aria) {
      var u = new URL(base.replace(/\/$/, '') + '/' + encodeURIComponent(aria), opts.base || win.document.baseURI);
      u.protocol = u.protocol === 'https:' ? 'wss:' : u.protocol === 'http:' ? 'ws:' : u.protocol;
      return u.href;
    }
    return {
      open: function (ctx, h) {
        var sock = null, on = false, closed = false, attempts = 0, timer = 0, pending = null;
        function dial() {
          if (closed || !on || sock) return;
          var s = new Socket(urlFor(ctx.aria));
          s.binaryType = 'arraybuffer';
          sock = s;
          s.addEventListener('open', function () { attempts = 0; });
          s.addEventListener('message', function (ev) {
            if (typeof ev.data === 'string') {
              var f = parseFrame(ev.data);
              if (!f) return;
              if (f.type === 'ready' && h.ready) h.ready(f);
              else if (f.type === 'audio.start' && h.start) h.start(Object.assign({ aria: ctx.aria }, f));
              else if (f.type === 'audio.chunk') pending = f;
              else if (f.type === 'audio.end' && h.end) h.end(Object.assign({ aria: ctx.aria, audio_id: f.audio_id || f.key }, f));
              else if (f.type === 'audio.cancel' && h.cancel) h.cancel(Object.assign({ aria: ctx.aria }, f));
              else if (f.type === 'error' && h.error) h.error(Object.assign({ aria: ctx.aria }, f));
            } else if (pending && ev.data instanceof ArrayBuffer && h.chunk) {
              var c = pending;
              pending = null;
              if (ev.data.byteLength % 2 === 0) h.chunk({ aria: ctx.aria, turn: c.turn, node: c.node, cursor: c.cursor, offset: c.offset, bytes: c.bytes, pcm: ev.data });
            }
          });
          s.addEventListener('close', function () {
            if (sock === s) sock = null;
            pending = null;
            if (closed || !on) return;
            timer = timers.set(dial, wait(attempts++));
          });
        }
        return {
          voice: function (v) {
            on = !!v;
            if (on) dial();
            else if (sock) { try { sock.send(JSON.stringify({ type: 'cancel' })); } catch (e) {} sock.close(); sock = null; }
          },
          cancel: function () { if (sock) try { sock.send(JSON.stringify({ type: 'cancel' })); } catch (e) {} },
          close: function () {
            closed = true;
            timers.clear(timer);
            if (sock) sock.close();
            sock = null;
          }
        };
      }
    };
  }

  return { FORMAT: FORMAT, mock: mock, none: none, gateway: gateway, chunks: chunks, seconds: seconds, sentences: sentences, keyOf: keyOf };
}));
