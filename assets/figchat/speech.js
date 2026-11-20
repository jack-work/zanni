(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.zanni = root.zanni || {};
    root.zanni.figchatSpeech = api;
    root.figchatSpeech = api;
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FORMAT = { format: 'pcm', rate: 24000, bits: 16, channels: 1 };

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

  function mock(opts) {
    opts = opts || {};
    var gap = opts.gap == null ? 20 : opts.gap;
    var schedule = opts.setTimeout || function (f, ms) { return setTimeout(f, ms); };
    var spoken = [];
    return {
      spoken: spoken,
      open: function (ctx, h) {
        var on = false, closed = false, seqs = {};
        var off = ctx.events(function (e) {
          if (e.type !== 'prose.settled' || !on || closed) return;
          var key = e.turn + '.' + e.node;
          if (seqs[key] != null) return;
          seqs[key] = 0;
          spoken.push({ aria: ctx.aria, turn: e.turn, node: e.node, text: e.text });
          var list = chunks(e.text), i = 0;
          var next = function () {
            if (closed) return;
            if (i < list.length) {
              h.chunk({ aria: ctx.aria, turn: e.turn, node: e.node, seq: i, format: FORMAT, pcm: list[i] });
              i++;
              schedule(next, gap);
            } else h.end({ aria: ctx.aria, turn: e.turn, node: e.node, audio_id: '' });
          };
          schedule(next, gap);
        });
        return {
          voice: function (v) { on = !!v; },
          close: function () { closed = true; off(); }
        };
      }
    };
  }

  function none() {
    return { open: function () { return { voice: function () {}, close: function () {} }; } };
  }

  return { FORMAT: FORMAT, mock: mock, none: none, chunks: chunks, seconds: seconds };
}));
