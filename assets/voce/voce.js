(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.zanni = root.zanni || {};
    root.zanni.voce = api;
    root.voce = api;
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var RATE = 24000;
  var JITTER = 0.12;

  function decodePCM(data) {
    var view = ArrayBuffer.isView(data)
      ? new DataView(data.buffer, data.byteOffset, data.byteLength)
      : new DataView(data);
    if (view.byteLength % 2) throw new RangeError('PCM frame of ' + view.byteLength + ' bytes is not whole 16-bit samples');
    var out = new Float32Array(view.byteLength / 2);
    for (var i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true) / 32768;
    return out;
  }

  function place(next, now, duration, jitter) {
    var late = !(next > now);
    var at = late ? now + jitter : next;
    return { at: at, next: at + duration, late: late };
  }

  var TABLE = {
    none: { start: 'live', locked: 'muted', ready: 'idle' },
    live: { stop: 'muted', bad: 'muted', end: 'draining', fail: 'lost' },
    muted: { end: 'idle', fail: 'lost' },
    draining: { drained: 'idle', stop: 'idle' },
    idle: { play: 'loading', start: 'live', locked: 'muted' },
    loading: { playing: 'playing', pause: 'paused', expired: 'expired', error: 'error', start: 'live', locked: 'muted' },
    playing: { pause: 'paused', ended: 'idle', expired: 'expired', error: 'error', start: 'live', locked: 'muted' },
    paused: { play: 'loading', playing: 'playing', ended: 'idle', expired: 'expired', error: 'error', start: 'live', locked: 'muted' },
    error: { play: 'loading', start: 'live', locked: 'muted' },
    lost: { ready: 'idle' },
    expired: {}
  };

  function transition(state, event) {
    var row = TABLE[state];
    return row && row[event] ? row[event] : state;
  }

  function clock(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '--:--';
    var s = Math.floor(seconds);
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }

  function supported(format) {
    return !!format && format.format === 'pcm' && (format.bits == null || format.bits === 16) && (format.channels == null || format.channels === 1);
  }

  function queue(ctx, out, opts) {
    opts = opts || {};
    var rate = opts.rate || RATE;
    var jitter = opts.jitter == null ? JITTER : opts.jitter;
    var q = { next: 0, origin: -1, chunks: 0, samples: 0, underruns: 0, ended: false, stopped: false };
    var sources = [];

    function settle() {
      if (q.ended && !q.stopped && !sources.length && opts.drained) opts.drained();
    }

    q.push = function (data) {
      if (q.stopped || q.ended) return null;
      var samples = decodePCM(data);
      if (!samples.length) return null;
      var buffer = ctx.createBuffer(1, samples.length, rate);
      buffer.getChannelData(0).set(samples);
      var src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(out);
      var slot = place(q.next, ctx.currentTime, samples.length / rate, jitter);
      if (slot.late && q.chunks) q.underruns++;
      if (!q.chunks) q.origin = slot.at;
      q.next = slot.next;
      q.chunks++;
      q.samples += samples.length;
      sources.push(src);
      src.addEventListener('ended', function () {
        var i = sources.indexOf(src);
        if (i >= 0) sources.splice(i, 1);
        settle();
      });
      src.start(slot.at);
      return slot;
    };
    q.end = function () {
      q.ended = true;
      settle();
    };
    q.stop = function () {
      q.stopped = true;
      sources.splice(0).forEach(function (src) {
        try { src.stop(); } catch (e) { return; }
      });
    };
    q.pending = function () { return sources.length; };
    q.seconds = function () { return q.samples / rate; };
    q.elapsed = function () {
      if (q.origin < 0) return 0;
      return Math.max(0, Math.min(q.seconds(), ctx.currentTime - q.origin));
    };
    return q;
  }

  var engines = new WeakMap();

  function engine(win) {
    var e = engines.get(win);
    if (e) return e;
    e = { ctx: null, out: null, current: null };
    e.unlock = function () {
      var AC = win.AudioContext || win.webkitAudioContext;
      if (!AC) return null;
      if (!e.ctx) {
        try { e.ctx = new AC({ sampleRate: RATE, latencyHint: 'interactive' }); } catch (x) { e.ctx = new AC(); }
        e.out = e.ctx.createGain();
        e.out.connect(e.ctx.destination);
      }
      if (e.ctx.state !== 'running' && e.ctx.resume) {
        var p = e.ctx.resume();
        if (p && p.catch) p.catch(function () { return null; });
      }
      return e.ctx;
    };
    e.running = function () { return !!e.ctx && e.ctx.state === 'running'; };
    e.waiting = [];
    e.claim = function (player) {
      var old = e.current;
      e.current = player;
      e.drop(player);
      if (old && old !== player) old.yield();
    };
    e.busy = function (player) {
      return !!e.current && e.current !== player && !!e.current.speaking && e.current.speaking();
    };
    e.wait = function (player) {
      if (e.waiting.indexOf(player) < 0) e.waiting.push(player);
    };
    e.drop = function (player) {
      var i = e.waiting.indexOf(player);
      if (i >= 0) e.waiting.splice(i, 1);
    };
    e.release = function (player) {
      if (e.current === player) e.current = null;
      e.drop(player);
      while (!e.current && e.waiting.length) e.waiting.shift().resume();
    };
    engines.set(win, e);
    return e;
  }

  function unlock(win) {
    return engine(win || self).unlock();
  }

  var NOTES = { live: 'speaking', draining: 'speaking', expired: 'audio expired', error: 'audio unavailable', lost: 'audio unavailable' };
  var ACTIONS = { live: 'Stop', draining: 'Stop', loading: 'Pause', playing: 'Pause' };

  function create(doc, opts) {
    opts = opts || {};
    var win = doc.defaultView;
    var eng = opts.engine || engine(win);
    var state = 'none';
    var audioId = opts.audioId || '';
    var duration = opts.duration > 0 ? opts.duration : NaN;
    var live = null;
    var media = null;
    var wanted = -1;
    var dragging = false;
    var timer = 0;
    var destroyed = false;
    var pending = null;

    function el(tag, cls) {
      var n = doc.createElement(tag);
      n.className = cls;
      return n;
    }

    var box = el('div', 'voce');
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', opts.label || 'Audio');
    var button = el('button', 'voce-play');
    button.type = 'button';
    var track = el('div', 'voce-track');
    var fill = el('progress', 'voce-fill');
    fill.max = 1000;
    fill.value = 0;
    fill.setAttribute('aria-hidden', 'true');
    var seek = el('input', 'voce-seek');
    seek.type = 'range';
    seek.min = '0';
    seek.max = '1000';
    seek.step = '1';
    seek.value = '0';
    seek.setAttribute('aria-label', 'Position');
    track.append(fill, seek);
    var time = el('span', 'voce-time');
    var elapsed = el('span', 'voce-elapsed');
    var total = el('span', 'voce-total');
    time.append(elapsed, doc.createTextNode(' / '), total);
    var note = el('span', 'voce-note');
    note.setAttribute('role', 'status');
    box.append(button, track, time, note);

    function position() {
      if (state === 'live' || state === 'draining') return live ? live.elapsed() : 0;
      if (dragging && duration > 0) return Number(seek.value) / 1000 * duration;
      if (wanted >= 0) return wanted;
      if (media && media.readyState > 0 && !media.ended) return media.currentTime || 0;
      return 0;
    }

    function paint() {
      if (destroyed) return;
      if (state === 'draining' && live && eng.ctx && eng.ctx.currentTime > live.next + 0.25) { go('drained'); return; }
      var at = position();
      var known = duration > 0 && isFinite(duration);
      var liveNow = state === 'live' || state === 'draining';
      var frac = known ? Math.max(0, Math.min(1, at / duration)) : 0;
      if (liveNow) frac = 1;
      var mark = Math.round(frac * 1000);
      if (fill.value !== mark) fill.value = mark;
      if (!dragging && seek.value !== String(mark)) seek.value = String(mark);
      var e = clock(at), t = liveNow ? clock(live.seconds()) : clock(known ? duration : NaN);
      if (elapsed.textContent !== e) elapsed.textContent = e;
      if (total.textContent !== t) total.textContent = t;
      seek.setAttribute('aria-valuetext', e + ' of ' + t);
    }

    function dress() {
      box.setAttribute('data-state', state);
      var action = ACTIONS[state] || 'Play';
      button.setAttribute('aria-label', action);
      button.setAttribute('data-act', action.toLowerCase());
      button.disabled = state === 'expired' || state === 'none' || state === 'muted' || state === 'lost' || (!audioId && !ACTIONS[state]);
      seek.disabled = !(duration > 0) || !audioId || state === 'live' || state === 'draining' || state === 'muted' || state === 'expired' || state === 'lost';
      var text = pending ? 'queued' : (NOTES[state] || '');
      if (note.textContent !== text) note.textContent = text;
      var ticking = state === 'live' || state === 'draining' || state === 'playing';
      if (ticking && !timer) timer = win.setInterval(paint, 200);
      if (!ticking && timer) { win.clearInterval(timer); timer = 0; }
      paint();
    }

    function go(event) {
      var next = transition(state, event);
      if (next === state) return false;
      state = next;
      if (state === 'idle' || state === 'muted' || state === 'expired' || state === 'error' || state === 'lost') eng.release(api);
      dress();
      if (opts.change) opts.change(state, event);
      return true;
    }

    function dropLive() {
      if (live) live.stop();
    }

    function dropMedia() {
      if (!media) return;
      media.pause();
      media.removeAttribute('src');
      media.load();
      media = null;
    }

    function broken() {
      if (destroyed || !audioId) return;
      var id = audioId;
      var check = opts.status ? opts.status(id) : Promise.resolve(0);
      Promise.resolve(check).then(function (status) { return status; }, function () { return 0; }).then(function (status) {
        if (destroyed || id !== audioId) return;
        dropMedia();
        go(status === 404 || status === 410 ? 'expired' : 'error');
      });
    }

    function listen(m) {
      var mine = function (fn) { return function () { if (media === m && !destroyed) fn(); }; };
      m.addEventListener('loadedmetadata', mine(function () {
        if (isFinite(m.duration) && m.duration > 0) duration = m.duration;
        if (wanted >= 0) { m.currentTime = Math.min(wanted, duration || wanted); wanted = -1; }
        dress();
      }));
      m.addEventListener('durationchange', mine(function () {
        if (isFinite(m.duration) && m.duration > 0) { duration = m.duration; dress(); }
      }));
      m.addEventListener('timeupdate', mine(paint));
      m.addEventListener('playing', mine(function () { go('playing'); }));
      m.addEventListener('pause', mine(function () { if (!m.ended) go('pause'); }));
      m.addEventListener('ended', mine(function () { go('ended'); }));
      m.addEventListener('error', mine(broken));
    }

    function load() {
      if (media) return media;
      media = doc.createElement('audio');
      media.preload = 'metadata';
      listen(media);
      media.src = opts.src ? opts.src(audioId) : audioId;
      return media;
    }

    function play() {
      eng.unlock();
      if (state === 'live' || state === 'draining') { stop(); return; }
      if (!audioId || !go('play')) return;
      eng.claim(api);
      var m = load();
      var p = m.play();
      if (p && p.catch) p.catch(function (err) {
        if (media !== m || destroyed) return;
        if (err && err.name === 'AbortError') return;
        if (err && err.name === 'NotAllowedError') { go('pause'); return; }
        broken();
      });
    }

    function pause() {
      if (media) media.pause();
      if (state === 'loading') go('pause');
    }

    function stop() {
      if (pending) { pending = null; eng.drop(api); dress(); }
      dropLive();
      go('stop');
    }

    function resume() {
      var p = pending;
      pending = null;
      if (!p || destroyed) return;
      if (!api.start(p.format)) { if (p.end !== null) api.end(p.end); return; }
      p.chunks.forEach(function (c) { api.push(c); });
      if (p.end !== null) api.end(p.end);
    }

    function seekTo(seconds) {
      if (!(duration > 0) || !audioId) return;
      var t = Math.max(0, Math.min(duration, seconds));
      if (media && media.readyState > 0) media.currentTime = t;
      else {
        wanted = t;
        if (state === 'idle' || state === 'paused' || state === 'error') load();
      }
      paint();
    }

    button.addEventListener('click', function () {
      if (state === 'playing' || state === 'loading') pause();
      else play();
    });
    seek.addEventListener('input', function () { dragging = true; paint(); });
    function commit() {
      if (!dragging) return;
      dragging = false;
      seekTo(Number(seek.value) / 1000 * duration);
    }
    ['change', 'pointerup', 'pointercancel', 'blur'].forEach(function (name) { seek.addEventListener(name, commit); });

    var api = {
      el: box,
      state: function () { return state; },
      audioId: function () { return audioId; },
      duration: function () { return duration; },
      position: position,
      stats: function () {
        return live ? { chunks: live.chunks, samples: live.samples, underruns: live.underruns, seconds: live.seconds(), pending: live.pending() } : null;
      },
      speaking: function () { return state === 'live' || state === 'draining'; },
      resume: resume,
      start: function (format) {
        if (!pending && eng.busy(api)) {
          pending = { format: format, chunks: [], end: null };
          eng.wait(api);
          dress();
          return true;
        }
        dropLive();
        dropMedia();
        live = null;
        if (!supported(format) || !eng.running()) { go('locked'); return false; }
        live = queue(eng.ctx, eng.out, { rate: format.rate || RATE, jitter: opts.jitter, drained: function () { go('drained'); } });
        eng.claim(api);
        go('start');
        return state === 'live';
      },
      push: function (data) {
        if (pending) { pending.chunks.push(data); return true; }
        if (state !== 'live' || !live) return false;
        try { live.push(data); } catch (e) {
          dropLive();
          go('bad');
          return false;
        }
        paint();
        return true;
      },
      end: function (id) {
        audioId = id || audioId;
        if (pending) { pending.end = id || ''; return; }
        if (live && live.samples) duration = live.seconds();
        var streaming = state === 'live' && live;
        go(state === 'none' || state === 'lost' ? 'ready' : 'end');
        if (streaming) live.end();
        dress();
      },
      fail: function () {
        if (pending) { pending = null; eng.drop(api); }
        dropLive();
        go('fail');
      },
      play: play,
      pause: pause,
      stop: stop,
      seek: seekTo,
      yield: function () {
        if (state === 'live' || state === 'draining') stop();
        else if (state === 'playing' || state === 'loading') pause();
      },
      destroy: function () {
        destroyed = true;
        pending = null;
        eng.drop(api);
        dropLive();
        dropMedia();
        if (timer) win.clearInterval(timer);
        eng.release(api);
        box.remove();
      }
    };

    if (audioId) state = 'idle';
    dress();
    return api;
  }

  return {
    RATE: RATE,
    JITTER: JITTER,
    decodePCM: decodePCM,
    place: place,
    transition: transition,
    clock: clock,
    supported: supported,
    queue: queue,
    engine: engine,
    unlock: unlock,
    create: create
  };
}));
