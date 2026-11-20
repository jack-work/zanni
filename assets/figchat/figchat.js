(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.zanni = root.zanni || {};
    root.zanni.figchat = api;
    root.figchat = api;
  }
}(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  var PHASES = { connecting: 'Connecting', 'catching-up': 'Catching up', live: 'Live', offline: 'Offline', refused: 'Not allowed', gone: 'Not found', closed: 'Closed', detached: '' };
  var LIST_PAGE = 8;
  var DEEP_LIMIT = 60;

  function routeFor(store, aria, turn) {
    if (!store) return '#/';
    if (!aria) return '#/' + encodeURIComponent(store);
    return '#/' + encodeURIComponent(store) + '/' + encodeURIComponent(aria) + (turn > 0 ? ':' + turn : '');
  }

  function parseRoute(hash) {
    var m = /^#\/([^/:]+)(?:\/([^/:]+)(?::(\d+))?)?$/.exec(hash || '');
    if (!m) return null;
    try {
      var out = { store: decodeURIComponent(m[1]), aria: m[2] ? decodeURIComponent(m[2]) : '' };
      if (m[3] !== undefined) out.turn = Number(m[3]);
      return out;
    } catch (e) { return null; }
  }

  function depths(rows) {
    var by = {}, out = {};
    rows.forEach(function (r) { by[r.id] = r; });
    function depth(r, guard) {
      if (out[r.id] != null) return out[r.id];
      var p = r.parent && r.parent !== r.id && by[r.parent];
      var d = p && guard < 32 ? depth(p, guard + 1) + 1 : 0;
      if (d > 6) d = 6;
      out[r.id] = d;
      return d;
    }
    rows.forEach(function (r) { depth(r, 0); });
    return out;
  }

  function labelOf(row) {
    if (!row) return '';
    return row.mantra || row.handle || row.short || String(row.id).slice(0, 8);
  }

  function ago(then, now) {
    var t = typeof then === 'number' ? then : Date.parse(then);
    if (isNaN(t)) return '';
    var d = Math.max(0, now - t);
    if (d < 60000) return 'now';
    if (d < 3600000) return Math.floor(d / 60000) + ' min';
    if (d < 86400000) return Math.floor(d / 3600000) + ' h';
    if (d < 7 * 86400000) return Math.floor(d / 86400000) + ' d';
    return new Date(t).toISOString().slice(0, 10);
  }

  function refusalText(r) {
    if (!r) return '';
    var words = { denied: 'You may not read or follow this aria.', not_found: 'No such aria, or one you may not read.', dormant: 'This aria is asleep.', moved: 'This aria is moving between nodes.', unavailable: 'Momentarily unavailable.' };
    return words[r.kind] || 'Refused.';
  }

  var MAX_CLIP_MS = 5 * 60000;

  function micType(Recorder) {
    var wanted = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'];
    if (!Recorder || typeof Recorder.isTypeSupported !== 'function') return '';
    for (var i = 0; i < wanted.length; i++) if (Recorder.isTypeSupported(wanted[i])) return wanted[i];
    return '';
  }

  function micFault(err) {
    var name = err && err.name ? String(err.name) : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') return 'Microphone blocked. Allow it for this site in the browser settings, then tap Record again.';
    if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No microphone found.';
    if (name === 'NotReadableError' || name === 'AbortError') return 'The microphone is busy or not readable.';
    return 'Could not record: ' + (err && err.message ? err.message : name || 'unknown error');
  }

  function clock(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }

  function sttTransport(o) {
    var win = o.window, url = o.url || 'stt';
    return function (blob, target) {
      return win.fetch(url + '?aria=' + encodeURIComponent(target), { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json', 'Content-Type': blob.type || 'application/octet-stream' }, body: blob }).then(function (res) {
        return res.text().then(function (text) {
          var j = null;
          try { j = JSON.parse(text); } catch (e) {}
          if (res.status >= 200 && res.status < 300 && j) return j;
          var err = new Error(j && j.error ? String(j.error) : 'HTTP ' + res.status);
          err.status = res.status;
          throw err;
        });
      });
    };
  }

  function mount(host, opts) {
    if (!host || host.figchat) throw new Error('figchat needs an unused host');
    opts = opts || {};
    var N = opts.nodi || root.nodi || root.zanni.nodi;
    var doc = host.ownerDocument, win = doc.defaultView;
    var V = opts.voce || (root.zanni && root.zanni.voce) || null;
    var speech = opts.speech || (root.figchatSpeech && root.figchatSpeech.none()) || { open: function () { return { voice: function () {}, close: function () {} }; } };
    var stores = opts.stores || {};
    var storeName = opts.store || Object.keys(stores)[0] || 'local';
    var now = opts.now || function () { return Date.now(); };
    var state = { rows: [], next: null, loaded: false, error: '', refused: 0, voice: false, link: 'idle' };
    var view = null;
    var listeners = [];
    var destroyed = false;
    var d = N.dom(doc), put = d.put, el = d.el;
    var media = opts.media || { devices: win.navigator && win.navigator.mediaDevices, Recorder: win.MediaRecorder };
    var canRecord = !!(media.devices && typeof media.devices.getUserMedia === 'function' && media.Recorder);
    var stt = opts.stt || sttTransport({ window: win, url: host.getAttribute('data-stt') || 'stt' });
    var rec = { state: canRecord ? 'idle' : 'unsupported', recorder: null, stream: null, chunks: [], began: 0, tick: 0, token: 0 };

    function on(target, name, fn) {
      target.addEventListener(name, fn);
      listeners.push(function () { target.removeEventListener(name, fn); });
    }
    function button(cls, label) {
      var b = el('button', cls, label);
      b.type = 'button';
      return b;
    }

    var top = el('header', 'figchat-top');
    var mark = el('a', 'figchat-mark');
    mark.href = '#/';
    var head = doc.createElement('img');
    head.className = 'figchat-head';
    head.alt = '';
    head.src = opts.mark || host.getAttribute('data-mark') || 'figaro-head.png';
    mark.append(head, el('span', 'figchat-title', 'figchat'));
    var tools = el('div', 'figchat-bar');
    var link = el('span', 'figchat-link');
    link.setAttribute('role', 'status');
    var voice = button('figchat-voice', 'Voice off');
    voice.setAttribute('aria-pressed', 'false');
    tools.append(link, voice);
    top.append(mark, tools);

    var side = el('nav', 'figchat-side');
    side.setAttribute('aria-label', 'Arias');
    var sideHead = el('div', 'figchat-side-head');
    var refresh = button('figchat-new', 'Refresh');
    sideHead.append(el('h2', 'figchat-h2', 'Arias'), refresh);
    var list = el('ul', 'figchat-threads');
    var more = button('figchat-older figchat-more', 'More arias');
    more.hidden = true;
    var listNote = el('p', 'figchat-note');
    side.append(sideHead, list, more, listNote);

    var pane = el('div', 'figchat-pane');
    var main = el('main', 'figchat-main');
    main.tabIndex = -1;
    var composer = el('form', 'figchat-composer');
    composer.setAttribute('aria-label', 'Message');
    var coarse = !!(win.matchMedia && win.matchMedia('(pointer: coarse)').matches);
    var input = el('textarea', 'figchat-input');
    input.rows = 1;
    input.placeholder = 'Message';
    input.setAttribute('aria-label', 'Message');
    var mic = button('figchat-mic', 'Record');
    mic.setAttribute('aria-pressed', 'false');
    var micNote = el('p', 'figchat-sendnote figchat-micnote');
    micNote.setAttribute('role', 'status');
    var send = el('button', 'figchat-send', 'Send');
    send.type = 'submit';
    var forkAll = button('figchat-fork', 'Fork');
    var turnBar = el('div', 'figchat-turn');
    turnBar.hidden = true;
    var stop = button('figchat-stop', 'Stop');
    var stopClear = button('figchat-stop figchat-stop-clear', 'Stop, clear queue');
    var stops = el('span', 'figchat-stops');
    stops.append(stop, stopClear);
    turnBar.append(el('span', 'figchat-turn-text', 'Figaro is replying. A message now steers it.'), stops);
    var sendNote = el('p', 'figchat-sendnote');
    sendNote.setAttribute('role', 'status');
    composer.append(turnBar, sendNote, micNote, forkAll, input, mic, send);
    pane.append(main, composer);

    var body = el('div', 'figchat-body');
    body.append(side, pane);
    host.classList.add('figchat');
    host.replaceChildren(top, body);

    function client() { return stores[storeName] || null; }

    function paintChrome() {
      host.setAttribute('data-link', state.link);
      var word = PHASES[state.link] || '';
      if (link.textContent !== word) link.textContent = word;
      var label = state.voice ? 'Voice on' : 'Voice off';
      if (voice.textContent !== label) voice.textContent = label;
      voice.setAttribute('aria-pressed', state.voice ? 'true' : 'false');
      var live = !!view && state.link === 'live';
      send.disabled = !!(view && view.sending) || !live;
      forkAll.disabled = !live || !!(view && view.forking);
      turnBar.hidden = !(view && view.running);
      stop.disabled = stopClear.disabled = !live;
      paintMic();
    }

    function paintMic() {
      host.setAttribute('data-mic', rec.state);
      var label = rec.state === 'recording' ? 'Stop ' + clock(now() - rec.began) : rec.state === 'transcribing' ? 'Wait' : 'Record';
      if (mic.textContent !== label) mic.textContent = label;
      mic.setAttribute('aria-pressed', rec.state === 'recording' ? 'true' : 'false');
      mic.disabled = rec.state === 'unsupported' || rec.state === 'asking' || rec.state === 'transcribing' || !view;
    }

    function micSay(text) {
      micNote.replaceChildren();
      put(micNote, text);
    }

    function releaseMic() {
      win.clearInterval(rec.tick);
      if (rec.stream) rec.stream.getTracks().forEach(function (t) { t.stop(); });
      rec.stream = null;
      rec.recorder = null;
    }

    function micIdle(text) {
      rec.state = 'idle';
      micSay(text);
      paintMic();
    }

    function grow() {
      if (win.CSS && win.CSS.supports && win.CSS.supports('field-sizing', 'content')) return;
      input.rows = Math.max(1, Math.min(8, input.value.split('\n').length));
    }

    function transcribed(token, res) {
      if (token !== rec.token) return;
      var text = String((res && res.text) || '').trim();
      if (!text) { micIdle('Heard no words. Try again.'); return; }
      input.value = (input.value.trim() ? input.value.replace(/\s*$/, ' ') : '') + text;
      micIdle('');
      grow();
      input.focus({ preventScroll: true });
    }

    function recorded(token, type) {
      if (token !== rec.token) return;
      var chunks = rec.chunks;
      releaseMic();
      var blob = new win.Blob(chunks, { type: type });
      if (!blob.size) { micIdle('Nothing was recorded.'); return; }
      var v = view;
      rec.state = 'transcribing';
      micSay('Transcribing.');
      paintMic();
      Promise.resolve().then(function () { return stt(blob, v ? v.store + '/' + v.id : ''); }).then(function (res) { transcribed(token, res); }, function (err) {
        if (token === rec.token) micIdle('Not transcribed: ' + (err && err.message ? err.message : 'network'));
      });
    }

    function stopRecording() {
      if (rec.recorder && rec.recorder.state !== 'inactive') rec.recorder.stop();
    }

    function cancelRecording() {
      rec.token++;
      stopRecording();
      releaseMic();
      if (rec.state !== 'unsupported') rec.state = 'idle';
      paintMic();
    }

    function startRecording() {
      var token = ++rec.token;
      rec.state = 'asking';
      micSay('');
      paintMic();
      media.devices.getUserMedia({ audio: true }).then(function (stream) {
        if (token !== rec.token || destroyed) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
        rec.stream = stream;
        var type = micType(media.Recorder);
        var r = type ? new media.Recorder(stream, { mimeType: type }) : new media.Recorder(stream);
        rec.recorder = r;
        rec.chunks = [];
        rec.began = now();
        r.addEventListener('dataavailable', function (ev) { if (ev.data && ev.data.size) rec.chunks.push(ev.data); });
        r.addEventListener('stop', function () { recorded(token, r.mimeType || type || 'audio/webm'); });
        r.start();
        rec.state = 'recording';
        rec.tick = win.setInterval(function () {
          if (now() - rec.began >= MAX_CLIP_MS) stopRecording();
          else paintMic();
        }, 250);
        paintMic();
      }, function (err) {
        if (token === rec.token) micIdle(micFault(err));
      }).catch(function (err) {
        if (token !== rec.token) return;
        releaseMic();
        micIdle(micFault(err));
      });
    }

    function paintList() {
      var open = view ? view.id : null, depth = depths(state.rows);
      var items = state.rows.map(function (r) {
        var li = el('li', 'figchat-row');
        var a = el('a', 'figchat-thread');
        a.href = routeFor(storeName, r.id);
        a.setAttribute('data-id', r.id);
        a.setAttribute('data-state', r.state || '');
        a.setAttribute('data-depth', String(Math.min(6, depth[r.id] || 0)));
        if (r.id === open) a.setAttribute('aria-current', 'page');
        var title = el('span', 'figchat-thread-title', labelOf(r));
        var meta = el('span', 'figchat-thread-when', (r.state || '') + (r.message_count != null ? ' \u00b7 ' + r.message_count : ''));
        a.append(title, meta);
        li.appendChild(a);
        return li;
      });
      list.replaceChildren.apply(list, items);
      more.hidden = !state.next;
      var note = !state.loaded ? (state.error ? 'Could not load arias: ' + state.error : 'Loading arias.') : state.rows.length ? '' : 'No arias.';
      if (state.loaded && state.refused) note = (note ? note + ' ' : '') + state.refused + ' hidden by policy.';
      listNote.replaceChildren();
      put(listNote, note);
      listNote.hidden = !note;
      if (view && view.heading) paintHeading(view);
    }

    function paintHeading(v) {
      var row = null;
      state.rows.forEach(function (r) { if (r.id === v.id) row = r; });
      var text = row ? labelOf(row) : String(v.id).slice(0, 8);
      if (v.heading.nodiText !== text) { v.heading.nodiText = text; v.heading.replaceChildren(); put(v.heading, text); }
    }

    function loadList(append) {
      var c = client();
      if (!c) { state.loaded = true; state.error = 'no such store'; paintList(); return Promise.resolve(); }
      var q = { limit: LIST_PAGE };
      if (append && state.next) q.before = state.next;
      return c.list(q).then(function (res) {
        if (destroyed) return;
        state.rows = append ? state.rows.concat(res.rows) : res.rows.slice();
        state.next = res.nextBefore || null;
        state.refused = res.refused || 0;
        state.loaded = true;
        state.error = '';
        paintList();
      }, function (err) {
        if (destroyed) return;
        state.error = err && err.message ? err.message : 'network';
        paintList();
      });
    }

    function nearBottom() {
      return win.innerHeight + win.scrollY >= doc.documentElement.scrollHeight - 160;
    }
    function toBottom() {
      win.scrollTo(0, doc.documentElement.scrollHeight);
    }

    function runningOf(snap) {
      var last = snap.turns[snap.turns.length - 1];
      return !!last && !last.end && !last.sealed;
    }

    function paintAria(v) {
      if (view !== v || v.closed) return;
      var snap = v.stream.snapshot();
      var stick = nearBottom();
      var first = v.body.firstElementChild, top0 = first ? first.getBoundingClientRect().top : 0, firstTurn = first ? first.getAttribute('data-turn') : null;
      v.log.update(snap.turns);
      var again = firstTurn && v.body.querySelector('[data-turn="' + firstTurn + '"]');
      if (v.paging && again) win.scrollBy(0, again.getBoundingClientRect().top - top0);
      v.metrics.update(snap.metrics);
      v.running = runningOf(snap);
      v.older.hidden = snap.olderAvailable !== true;
      var note = snap.refusal ? refusalText(snap.refusal) : snap.turns.length || snap.phase !== 'live' ? '' : 'Nothing said yet.';
      v.status.replaceChildren();
      put(v.status, note);
      v.status.hidden = !note;
      state.link = snap.phase;
      paintChrome();
      if (stick && !v.paging && v.followed) toBottom();
      if (snap.phase === 'live' && !v.followed) { v.followed = true; deepLink(v); }
    }

    function deepLink(v) {
      if (!v.want) { toBottom(); return; }
      var turn = v.want;
      v.want = 0;
      function seek(n) {
        if (view !== v) return;
        var el0 = v.log.turnEl(turn);
        if (el0) {
          el0.scrollIntoView();
          el0.setAttribute('data-flash', '');
          win.setTimeout(function () { el0.removeAttribute('data-flash'); }, 1800);
          return;
        }
        var snap = v.stream.snapshot();
        if (snap.olderAvailable !== true || n > DEEP_LIMIT) { toBottom(); return; }
        loadOlder(v).then(function () { seek(n + 1); }, function () { toBottom(); });
      }
      seek(0);
    }

    function loadOlder(v) {
      if (v.loading || view !== v) return Promise.resolve(false);
      v.loading = true;
      v.paging = true;
      v.older.disabled = true;
      return v.stream.loadOlder().then(function (got) {
        v.loading = false;
        v.older.disabled = false;
        paintAria(v);
        v.paging = false;
        return got;
      }, function (err) {
        v.loading = false;
        v.paging = false;
        v.older.disabled = false;
        v.status.replaceChildren();
        put(v.status, 'Could not load earlier turns: ' + (err && err.message ? err.message : 'network'));
        v.status.hidden = false;
        throw err;
      });
    }

    function speak(v) {
      if (v.voiceConn) return;
      var players = {}, live = false;
      var ctx = {
        aria: v.id,
        events: function (fn) {
          return v.stream.subscribe(function (e) { if (live) fn(e); });
        }
      };
      v.stream.onChange(function () { if (v.stream.state === 'live') live = true; });
      var audio = opts.audioURL || function (key) { return 'audio/key/' + key.split('/').map(encodeURIComponent).join('/'); };
      function playerFor(c) {
        if (players[c.turn] || !V) return players[c.turn] || null;
        var slot = v.log.slot(c.turn, c.node);
        if (!slot) return null;
        var p = V.create(doc, { audioId: '', src: audio, status: opts.audioStatus || function (key) {
          return win.fetch(audio(key), { method: 'GET', credentials: 'same-origin', cache: 'no-store', headers: { Range: 'bytes=0-0' } }).then(function (r) { return r.status; });
        }, label: 'Spoken reply' });
        p.el.setAttribute('data-for', String(c.turn));
        slot.appendChild(p.el);
        players[c.turn] = p;
        return p;
      }
      function speaking(turn, node) {
        var turnEl = v.log.turnEl(turn);
        if (!turnEl) return;
        var old = turnEl.querySelectorAll('[data-speaking]');
        for (var i = 0; i < old.length; i++) old[i].removeAttribute('data-speaking');
        var n = node == null ? null : v.log.nodeEl(turn, node);
        if (n) n.setAttribute('data-speaking', '');
      }
      function quiet(turn) { speaking(turn, null); }
      v.players = players;
      v.voiceConn = speech.open(ctx, {
        ready: function () {},
        start: function (e) {
          if (view !== v) return;
          var p = playerFor(e);
          if (p) p.start({ format: e.format, rate: e.rate, bits: e.bits, channels: e.channels });
        },
        chunk: function (c) {
          if (view !== v) return;
          var p = playerFor(c);
          if (!p) return;
          speaking(c.turn, c.node);
          p.push(c.pcm);
        },
        end: function (e) {
          var p = players[e.turn];
          quiet(e.turn);
          if (p) p.end(e.audio_id || e.key || '');
        },
        cancel: function (e) {
          var p = players[e.turn];
          quiet(e.turn);
          if (p) { p.stop(); p.end(''); }
        },
        error: function (e) {
          if (e.turn == null) return;
          var p = players[e.turn];
          quiet(e.turn);
          if (p) p.fail();
        }
      });
      v.voiceConn.voice(state.voice);
    }

    function closeView() {
      var v = view;
      view = null;
      if (!v) return;
      v.closed = true;
      if (v.watch) v.watch.disconnect();
      if (v.voiceConn) v.voiceConn.close();
      Object.keys(v.players || {}).forEach(function (k) { v.players[k].destroy(); });
      if (v.stream) v.stream.close();
      state.link = 'idle';
    }

    function crumb() {
      var back = el('a', 'figchat-back', 'Arias');
      back.href = '#/';
      return back;
    }

    function openAria(store, id, turn) {
      closeView();
      cancelRecording();
      var c = client();
      var v = view = { id: id, store: store, stream: null, closed: false, sending: false, forking: false, running: false, want: turn || 0, followed: false, paging: false, loading: false, players: {} };
      v.heading = el('h1', 'figchat-h1');
      v.heading.tabIndex = -1;
      paintHeading(v);
      v.metricsHost = el('div', 'figchat-metrics');
      v.metrics = N.metricsView(doc, v.metricsHost);
      v.older = button('figchat-older', 'Earlier turns');
      v.older.hidden = true;
      v.body = el('ol', 'nodi-turns');
      v.body.setAttribute('aria-label', 'Transcript');
      v.log = N.log(doc, v.body, {
        decorate: function (slot, n) {
          var fork = button('figchat-fork-here', 'Fork here');
          fork.addEventListener('click', function () { doFork(v, n); });
          slot.appendChild(fork);
        }
      });
      v.status = el('p', 'figchat-note');
      v.status.hidden = true;
      main.replaceChildren(crumb(), v.heading, v.metricsHost, v.older, v.body, v.status);
      if (!c) {
        put(v.status, 'No such store: ' + store);
        v.status.hidden = false;
        paintChrome();
        return v.heading;
      }
      v.stream = c.attach(id, {});
      v.stream.onChange(function () { paintAria(v); });
      v.stream.subscribe(function () { loadListSoon(); }, { kind: 'turn' });
      v.older.addEventListener('click', function () { loadOlder(v).catch(function () {}); });
      if (win.IntersectionObserver) {
        v.watch = new win.IntersectionObserver(function (entries) {
          if (entries.some(function (e) { return e.isIntersecting; }) && v.followed && !v.older.hidden) loadOlder(v).catch(function () {});
        }, { rootMargin: '300px 0px 0px 0px' });
        v.watch.observe(v.older);
      }
      speak(v);
      paintAria(v);
      return v.heading;
    }

    var listTimer = 0;
    function loadListSoon() {
      win.clearTimeout(listTimer);
      listTimer = win.setTimeout(function () { if (!destroyed) loadList(false); }, 150);
    }

    function openList() {
      closeView();
      cancelRecording();
      var h = el('h1', 'figchat-h1', 'figchat');
      h.tabIndex = -1;
      main.replaceChildren(h, el('p', 'figchat-note', 'Pick an aria to attend.'));
      return h;
    }

    function route() {
      var rt = parseRoute(win.location.hash);
      if (rt && rt.aria && view && view.id === rt.aria && view.store === rt.store && !view.closed) {
        if (rt.turn) { view.want = rt.turn; deepLink(view); }
        return;
      }
      if (rt && rt.store) storeName = rt.store;
      var h = rt && rt.aria ? openAria(rt.store, rt.aria, rt.turn) : openList();
      host.setAttribute('data-route', rt && rt.aria ? 'aria' : 'list');
      composer.hidden = !(rt && rt.aria);
      sendNote.replaceChildren();
      paintList();
      paintChrome();
      if (!(rt && rt.aria)) win.scrollTo(0, 0);
      h.focus({ preventScroll: true });
    }

    function say(text) {
      sendNote.replaceChildren();
      put(sendNote, text);
    }

    function submit() {
      var v = view, text = input.value.trim();
      if (!v || !v.stream || v.sending || !text) return;
      if (state.link !== 'live') { say('Not connected. Reconnecting.'); return; }
      if (V) V.unlock(win);
      v.sending = true;
      say('');
      paintChrome();
      v.stream.prompt(text).then(function () {
        v.sending = false;
        if (input.value.trim() === text) input.value = '';
        paintChrome();
        if (view === v) toBottom();
      }, function (err) {
        v.sending = false;
        paintChrome();
        if (view === v) say('Not sent: ' + (err && err.message ? err.message : 'network'));
      });
    }

    function doFork(v, atTurn) {
      if (view !== v || v.forking || !v.stream) return;
      v.forking = true;
      paintChrome();
      v.stream.fork(atTurn ? { atTurn: atTurn } : {}).then(function (res) {
        v.forking = false;
        paintChrome();
        loadList(false);
        win.location.hash = routeFor(v.store, res.alternative);
      }, function (err) {
        v.forking = false;
        paintChrome();
        if (view === v) say('Not forked: ' + (err && err.message ? err.message : 'network'));
      });
    }

    function interrupt(queue) {
      var v = view;
      if (!v || !v.stream) return;
      if (v.voiceConn) v.voiceConn.cancel();
      v.stream.interrupt({ queue: queue }).catch(function (err) {
        if (view === v) say('Not stopped: ' + (err && err.message ? err.message : 'network'));
      });
    }

    on(composer, 'submit', function (ev) {
      ev.preventDefault();
      submit();
    });
    on(input, 'input', grow);
    on(input, 'keydown', function (ev) {
      if (ev.key !== 'Enter' || ev.shiftKey || ev.isComposing || coarse) return;
      ev.preventDefault();
      submit();
    });
    on(mic, 'click', function () {
      if (V) V.unlock(win);
      if (rec.state === 'recording') stopRecording();
      else if (rec.state === 'idle') startRecording();
    });
    on(stop, 'click', function () { interrupt('keep'); });
    on(stopClear, 'click', function () { interrupt('clear'); });
    on(forkAll, 'click', function () { if (view) doFork(view, 0); });
    on(more, 'click', function () { loadList(true); });
    on(refresh, 'click', function () { loadList(false); });
    on(voice, 'click', function () {
      if (V) V.unlock(win);
      state.voice = !state.voice;
      if (view && view.voiceConn) view.voiceConn.voice(state.voice);
      if (!state.voice && view) Object.keys(view.players).forEach(function (k) { view.players[k].stop(); });
      paintChrome();
    });
    on(win, 'hashchange', route);
    on(doc, 'visibilitychange', function () { if (doc.visibilityState === 'visible') loadList(false); });

    var api = {
      state: function () {
        var snap = view && view.stream ? view.stream.snapshot() : null;
        return { rows: state.rows.length, voice: state.voice, link: state.link, aria: view ? view.id : null, store: storeName, turns: snap ? snap.turns.length : 0, running: !!(view && view.running), cursor: snap ? snap.cursor : '' };
      },
      stream: function () { return view ? view.stream : null; },
      player: function (key) { return view && view.players[key] ? view.players[key] : null; },
      detach: function () {
        destroyed = true;
        cancelRecording();
        win.clearTimeout(listTimer);
        closeView();
        listeners.forEach(function (off) { off(); });
        host.replaceChildren();
        host.classList.remove('figchat');
        host.removeAttribute('data-route');
        host.removeAttribute('data-link');
        delete host.figchat;
      }
    };
    host.figchat = api;
    if (!canRecord) micSay('This browser cannot record audio.');
    paintChrome();
    route();
    loadList(false);
    return api;
  }

  return {
    mount: mount,
    routeFor: routeFor,
    parseRoute: parseRoute,
    depths: depths,
    labelOf: labelOf,
    ago: ago,
    refusalText: refusalText,
    micType: micType,
    micFault: micFault,
    clock: clock
  };
}));
