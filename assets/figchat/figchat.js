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

  var CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb]/g;

  function reveal(text) {
    var s = String(text == null ? '' : text), parts = [], last = 0, m;
    CONTROL.lastIndex = 0;
    while ((m = CONTROL.exec(s))) {
      if (m.index > last) parts.push({ plain: s.slice(last, m.index) });
      parts.push({ mark: 'U+' + ('0000' + m[0].charCodeAt(0).toString(16).toUpperCase()).slice(-4) });
      last = m.index + 1;
    }
    if (last < s.length) parts.push({ plain: s.slice(last) });
    return parts;
  }

  function enc(s) { return encodeURIComponent(String(s)); }

  function routeFor(store, aria, turn) {
    if (store == null) return '#/';
    var out = '#/' + enc(store);
    if (aria == null) return out;
    out += '/' + enc(aria);
    if (turn != null && turn !== '') out += ':' + enc(turn);
    return out;
  }

  function parseRoute(hash) {
    var m = /^#\/([^/:]+)(?:\/([^/:]+)(?::([^/:]+))?)?$/.exec(hash || '');
    if (!m) return null;
    try {
      var out = { store: decodeURIComponent(m[1]) };
      if (m[2] != null) out.aria = decodeURIComponent(m[2]);
      if (m[3] != null) out.turn = decodeURIComponent(m[3]);
      return out;
    } catch (e) { return null; }
  }

  function tree(rows) {
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var d = Math.max(0, Number(rows[i].depth) || 0), prefix = [], last = true;
      for (var level = 1; level <= d; level++) {
        var more = false;
        for (var j = i + 1; j < rows.length; j++) {
          var dj = Math.max(0, Number(rows[j].depth) || 0);
          if (dj < level) break;
          if (dj === level) { more = true; break; }
        }
        if (level === d) last = !more;
        else prefix.push(more);
      }
      out.push({ prefix: prefix, last: last, depth: d });
    }
    return out;
  }

  function treeText(t) {
    if (!t.depth) return '';
    return t.prefix.map(function (more) { return more ? '\u2502 ' : '  '; }).join('') + (t.last ? '\u2514\u2500' : '\u251c\u2500');
  }

  function cursorText(c) {
    if (c == null || c === '') return '';
    if (typeof c === 'string') return c;
    return [c.turn, c.text, c.started, c.ended].join('.');
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

  function backoff(attempt) {
    return Math.min(15000, 500 * Math.pow(2, Math.max(0, attempt)));
  }

  var MAX_CLIP_MS = 5 * 60000;

  function key(id) { return String(id); }

  function toolState(t) {
    if (t.error) return 'failed';
    return t.state || 'done';
  }

  var FENCE = /^\s{0,3}(`{3,}|~{3,})\s*([^`\s]*)[^`]*$/;
  var ITEM = /^\s{0,6}(?:([-*+])|(\d{1,9})[.)])\s+(.*)$/;
  var INLINE = /(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)|\*\*([^\s*](?:[\s\S]*?[^\s*])?)\*\*(?!\*)|\*([^\s*](?:[^*]*?[^\s*])?)\*(?!\*)|\[([^\]\n]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<>]*[^\s<>.,;:!?'")\]])/g;

  function safeHref(raw) {
    var m = /^(https?:\/\/|mailto:)[^\s]+$/i.exec(raw);
    return m ? raw : '';
  }

  function spans(text, depth) {
    var out = [], last = 0, m, re = new RegExp(INLINE.source, 'g');
    var plain = function (s) {
      if (!s) return;
      if (out.length && out[out.length - 1].kind === 'text') out[out.length - 1].text += s;
      else out.push({ kind: 'text', text: s });
    };
    while ((m = re.exec(text))) {
      plain(text.slice(last, m.index));
      last = m.index + m[0].length;
      if (m[1]) out.push({ kind: 'code', text: m[2] });
      else if (m[3] != null) out.push({ kind: 'b', spans: depth ? [{ kind: 'text', text: m[3] }] : spans(m[3], 1) });
      else if (m[4] != null) out.push({ kind: 'i', spans: depth ? [{ kind: 'text', text: m[4] }] : spans(m[4], 1) });
      else if (m[5] != null) {
        if (safeHref(m[6])) out.push({ kind: 'a', text: m[5], href: m[6] });
        else plain(m[0]);
      } else if (safeHref(m[7])) out.push({ kind: 'a', text: m[7], href: m[7] });
      else plain(m[0]);
    }
    plain(text.slice(last));
    return out;
  }

  function blocks(text) {
    var lines = String(text == null ? '' : text).split('\n'), out = [], para = [], i = 0, m;
    var flush = function () {
      if (para.length) out.push({ kind: 'p', text: para.join('\n') });
      para = [];
    };
    while (i < lines.length) {
      var line = lines[i];
      if ((m = FENCE.exec(line))) {
        flush();
        var body = [], closed = false, mark = m[1];
        for (i++; i < lines.length; i++) {
          if (lines[i].trim().indexOf(mark) === 0 && /^\s*[`~]+\s*$/.test(lines[i])) { closed = true; i++; break; }
          body.push(lines[i]);
        }
        out.push({ kind: 'code', lang: m[2], text: body.join('\n'), open: !closed });
        continue;
      }
      if (!line.trim()) { flush(); i++; continue; }
      if ((m = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line))) {
        flush();
        out.push({ kind: 'h', level: m[1].length, text: m[2] });
        i++;
        continue;
      }
      if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); out.push({ kind: 'hr' }); i++; continue; }
      if ((m = ITEM.exec(line))) {
        flush();
        var list = { kind: m[2] ? 'ol' : 'ul', start: m[2] ? Number(m[2]) : 1, items: [] };
        while (i < lines.length && lines[i].trim() && !FENCE.test(lines[i])) {
          var it = ITEM.exec(lines[i]);
          if (it && !!it[2] === (list.kind === 'ol')) list.items.push(it[3]);
          else if (it) break;
          else list.items[list.items.length - 1] += '\n' + lines[i].trim();
          i++;
        }
        out.push(list);
        continue;
      }
      if (/^\s{0,3}>\s?/.test(line)) {
        flush();
        var quote = [];
        while (i < lines.length && /^\s{0,3}>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^\s{0,3}>\s?/, ''));
        out.push({ kind: 'quote', text: quote.join('\n') });
        continue;
      }
      para.push(line);
      i++;
    }
    flush();
    return out;
  }

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

  function conversation() {
    var c = { turns: [], audio: null, cur: '' };
    var byId = {};

    function blank(id) {
      return { id: id, at: '', prompt: '', reply: '', from: '', tools: [], done: false, streaming: false, failed: false, fault: '', audio_id: '', prompt_audio_id: '', cursor: '' };
    }

    function ensure(id) {
      var t = byId[key(id)];
      if (t) return t;
      t = byId[key(id)] = blank(id);
      c.turns.push(t);
      return t;
    }

    function tool(t, id) {
      for (var i = 0; i < t.tools.length; i++) if (key(t.tools[i].id) === key(id)) return t.tools[i];
      var x = { id: id, name: '', args: '', result: '', error: '', state: 'running' };
      t.tools.push(x);
      return x;
    }

    function fill(t, raw) {
      t.at = raw.at || t.at || '';
      t.prompt = typeof raw.prompt === 'string' ? raw.prompt : t.prompt;
      t.reply = typeof raw.reply === 'string' ? raw.reply : t.reply;
      t.from = raw.from ? String(raw.from) : t.from;
      t.audio_id = raw.audio_id ? String(raw.audio_id) : t.audio_id;
      t.prompt_audio_id = raw.prompt_audio_id ? String(raw.prompt_audio_id) : t.prompt_audio_id;
      t.cursor = cursorText(raw.cursor) || t.cursor;
      t.tools = (Array.isArray(raw.tools) ? raw.tools : []).map(function (x) {
        return { id: x.id, name: x.name || '', args: x.args == null ? '' : String(x.args), result: x.result == null ? '' : String(x.result), error: x.error ? String(x.error) : '', state: x.error ? 'failed' : 'done' };
      });
      t.done = raw.done !== false;
      t.streaming = !t.done;
      return t;
    }

    c.get = function (id) { return byId[key(id)] || null; };
    c.next = function (t) {
      var i = c.turns.indexOf(t);
      return i >= 0 && i + 1 < c.turns.length ? c.turns[i + 1] : null;
    };
    c.running = function () {
      return c.turns.some(function (t) { return !t.done; });
    };
    c.cursor = function () {
      if (c.cur) return c.cur;
      for (var i = c.turns.length - 1; i >= 0; i--) if (c.turns[i].cursor) return c.turns[i].cursor;
      return '';
    };

    c.load = function (list, older) {
      var made = [], fresh = [];
      (list || []).forEach(function (raw) {
        if (!raw || raw.id == null) return;
        var t = byId[key(raw.id)];
        if (t) {
          if (t.streaming) return;
          fill(t, raw);
          made.push(t);
          return;
        }
        t = byId[key(raw.id)] = fill(blank(raw.id), raw);
        fresh.push(t);
        made.push(t);
      });
      if (older) c.turns = fresh.concat(c.turns);
      else c.turns = c.turns.concat(fresh);
      return made;
    };

    c.apply = function (f) {
      if (!f || typeof f.type !== 'string') return null;
      var t, x, cur = cursorText(f.cursor);
      if (cur) c.cur = cur;
      switch (f.type) {
        case 'turn.start':
          if (f.turn == null) return null;
          t = byId[key(f.turn)];
          if (t) return null;
          t = ensure(f.turn);
          t.prompt = typeof f.prompt === 'string' ? f.prompt : '';
          t.from = f.from ? String(f.from) : '';
          t.at = f.at || '';
          t.prompt_audio_id = f.prompt_audio_id ? String(f.prompt_audio_id) : '';
          t.streaming = true;
          return { kind: 'turn', turn: t };
        case 'message.delta':
          if (f.turn == null || typeof f.text !== 'string') return null;
          t = ensure(f.turn);
          if (t.done) return null;
          t.streaming = true;
          t.reply += f.text;
          return { kind: 'delta', turn: t, text: f.text };
        case 'tool.start':
        case 'tool.end':
          if (f.turn == null || f.tool_id == null) return null;
          t = ensure(f.turn);
          if (t.done) return null;
          t.streaming = true;
          x = tool(t, f.tool_id);
          if (f.name) x.name = String(f.name);
          if (f.args != null) x.args = typeof f.args === 'string' ? f.args : JSON.stringify(f.args);
          if (f.type === 'tool.end') {
            x.result = f.result == null ? '' : String(f.result);
            x.error = f.error ? String(f.error) : '';
            x.state = x.error ? 'failed' : 'done';
          }
          return { kind: 'tool', turn: t, tool: x };
        case 'turn.end':
          t = f.turn == null ? null : byId[key(f.turn)];
          if (!t || t.done) return null;
          if (typeof f.text === 'string') t.reply = f.text;
          t.streaming = false;
          t.done = true;
          return { kind: 'end', turn: t };
        case 'audio.start':
          if (f.turn == null) return null;
          t = ensure(f.turn);
          c.audio = key(t.id);
          return { kind: 'audio.start', turn: t, format: { format: f.format, rate: f.rate, bits: f.bits, channels: f.channels } };
        case 'audio.end':
          if (f.turn == null) return null;
          t = ensure(f.turn);
          if (c.audio === key(t.id)) c.audio = null;
          if (f.audio_id) t.audio_id = String(f.audio_id);
          return { kind: 'audio.end', turn: t, audio_id: t.audio_id };
        case 'error':
          t = f.turn == null ? null : byId[key(f.turn)] || null;
          if (t && f.code === 'speech' && c.audio === key(t.id)) c.audio = null;
          if (t) {
            if (f.code !== 'speech') { t.failed = true; t.streaming = false; t.done = true; }
            t.fault = (f.code === 'speech' ? 'Speech failed: ' : 'Failed: ') + String(f.text || f.code || 'error');
          }
          return { kind: 'error', turn: t, code: String(f.code || 'error'), text: String(f.text || '') };
        case 'offline':
          return { kind: 'offline' };
        default:
          return null;
      }
    };

    c.binary = function () {
      return c.audio == null ? null : byId[c.audio] || null;
    };

    c.cut = function () {
      var t = c.binary();
      c.audio = null;
      c.turns.forEach(function (x) { x.streaming = false; });
      return t;
    };

    return c;
  }

  function fault(status, body) {
    var e = new Error(body && body.error ? String(body.error) : 'HTTP ' + status);
    e.status = status;
    e.code = body && body.code ? String(body.code) : '';
    return e;
  }

  function parseJSON(text) {
    try { return JSON.parse(text); } catch (e) { return null; }
  }

  function httpTransport(o) {
    o = o || {};
    var win = o.window || root;
    var trim = function (s) { return String(s).replace(/\/$/, ''); };
    var api = trim(o.api || 'api'), audio = trim(o.audio || 'audio'), ws = o.ws || 'ws';
    var doFetch = o.fetch || function (u, i) { return win.fetch(u, i); };

    function answer(res) {
      return res.text().then(function (text) {
        var j = parseJSON(text);
        if (res.status >= 200 && res.status < 300 && j) return j;
        throw fault(res.status, j);
      });
    }

    function call(method, path, body) {
      var init = { method: method, credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } };
      if (body !== undefined) {
        init.body = JSON.stringify(body);
        init.headers['Content-Type'] = 'application/json';
      }
      return doFetch(api + path, init).then(answer);
    }

    function query(q, names) {
      var parts = [];
      names.forEach(function (n) { if (q && q[n] != null && q[n] !== '') parts.push(n + '=' + enc(q[n])); });
      return parts.length ? '?' + parts.join('&') : '';
    }

    function ariaPath(store, aria) { return '/stores/' + enc(store) + '/arias/' + enc(aria); }

    return {
      stores: function () { return call('GET', '/stores'); },
      arias: function (store, q) { return call('GET', '/stores/' + enc(store) + '/arias' + query(q, ['before', 'limit', 'q'])); },
      turns: function (store, aria, q) { return call('GET', ariaPath(store, aria) + '/turns' + query(q, ['before', 'limit'])); },
      send: function (store, aria, body) { return call('POST', ariaPath(store, aria) + '/send', body); },
      cancel: function (store, aria) { return call('POST', ariaPath(store, aria) + '/cancel', {}); },
      createAria: function (store, body) { return call('POST', '/stores/' + enc(store) + '/arias', body || {}); },
      clip: function (blob) {
        return doFetch(api + '/clips', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json', 'Content-Type': blob.type || 'application/octet-stream' }, body: blob }).then(answer);
      },
      audioURL: function (id) { return audio + '/' + enc(id); },
      audioStatus: function (id) {
        return doFetch(audio + '/' + enc(id), { method: 'GET', credentials: 'same-origin', cache: 'no-store', headers: { Range: 'bytes=0-0' } })
          .then(function (res) { return res.status; });
      },
      connect: function (store, aria, cursor, h) {
        var Socket = o.WebSocket || win.WebSocket;
        var base = o.base || win.document.baseURI;
        var url = new URL(ws, base).href.replace(/^http/, 'ws') + '?store=' + enc(store) + '&aria=' + enc(aria) + (cursor ? '&cursor=' + enc(cursor) : '');
        var sock = new Socket(url);
        sock.binaryType = 'arraybuffer';
        sock.addEventListener('open', function () { if (h.open) h.open(); });
        sock.addEventListener('message', function (ev) {
          if (typeof ev.data === 'string') {
            var f = parseJSON(ev.data);
            if (f && h.frame) h.frame(f);
          } else if (ev.data instanceof ArrayBuffer && h.binary) h.binary(ev.data);
        });
        sock.addEventListener('close', function (ev) { if (h.close) h.close({ code: ev.code }); });
        return {
          send: function (frame) {
            if (sock.readyState !== 1) return false;
            sock.send(JSON.stringify(frame));
            return true;
          },
          close: function () { sock.close(1000); }
        };
      }
    };
  }

  var PAGE = 20;
  var ARIA_PAGE = 30;
  var STATES = { active: 'active', idle: 'idle', dormant: 'dormant', reaped: 'reaped' };

  function ariaName(a) {
    return (a && (a.title || a.mantra || a.handle || a.id)) || '';
  }

  function mount(host, opts) {
    if (!host || host.figchat) throw new Error('figchat needs an unused host');
    opts = opts || {};
    var doc = host.ownerDocument, win = doc.defaultView;
    var V = opts.voce || (root.zanni && root.zanni.voce) || null;
    var transport = opts.transport || httpTransport({
      window: win,
      api: host.getAttribute('data-api') || 'api',
      ws: host.getAttribute('data-ws') || 'ws',
      audio: host.getAttribute('data-audio') || 'audio'
    });
    var now = opts.now || function () { return Date.now(); };
    var wait = opts.backoff || backoff;
    var state = {
      stores: [], storesLoaded: false, storesError: '',
      store: null, arias: [], next: null, ariasLoaded: false, ariasError: '', ariasBusy: false,
      voice: false, link: 'idle'
    };
    var media = opts.media || { devices: win.navigator && win.navigator.mediaDevices, Recorder: win.MediaRecorder };
    var canRecord = !!(media.devices && typeof media.devices.getUserMedia === 'function' && media.Recorder);
    var rec = { state: canRecord ? 'idle' : 'unsupported', recorder: null, stream: null, chunks: [], began: 0, tick: 0, token: 0 };
    var clip = null;
    var view = null;
    var listeners = [];
    var destroyed = false;
    var current = null;

    function put(n, s) {
      reveal(s).forEach(function (p) {
        if (p.mark) {
          var c = doc.createElement('span');
          c.className = 'figchat-ctl';
          c.textContent = p.mark;
          n.appendChild(c);
        } else if (n.lastChild && n.lastChild.nodeType === 3) n.lastChild.appendData(p.plain);
        else n.appendChild(doc.createTextNode(p.plain));
      });
      return n;
    }
    function el(tag, cls, s) {
      var n = doc.createElement(tag);
      if (cls) n.className = cls;
      if (s != null) put(n, s);
      return n;
    }
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
    side.setAttribute('aria-label', 'Stores and arias');
    var sideHead = el('div', 'figchat-side-head');
    var sideTitle = el('h2', 'figchat-h2', 'Stores');
    var sideAct = el('div', 'figchat-side-act');
    sideHead.append(sideTitle, sideAct);
    var list = el('ul', 'figchat-threads');
    var listNote = el('p', 'figchat-note');
    var moreArias = button('figchat-older figchat-more', 'More arias');
    moreArias.hidden = true;
    side.append(sideHead, list, listNote, moreArias);

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
    if (!coarse) input.setAttribute('enterkeyhint', 'send');
    var send = el('button', 'figchat-send', 'Send');
    send.type = 'submit';
    var mic = button('figchat-mic', 'Record');
    mic.setAttribute('aria-pressed', 'false');
    var turn = el('div', 'figchat-turn');
    turn.hidden = true;
    var stop = button('figchat-stop', 'Stop reply');
    turn.append(el('span', 'figchat-turn-text', 'Figaro is replying. A message now steers it.'), stop);
    var clipRow = el('div', 'figchat-clip');
    clipRow.hidden = true;
    var clipText = el('span', 'figchat-clip-text');
    var clipDrop = button('figchat-clip-drop', 'Remove');
    clipRow.append(clipText, clipDrop);
    var micNote = el('p', 'figchat-sendnote figchat-micnote');
    micNote.setAttribute('role', 'status');
    var sendNote = el('p', 'figchat-sendnote');
    sendNote.setAttribute('role', 'status');
    composer.append(turn, sendNote, micNote, clipRow, mic, input, send);
    pane.append(main, composer);

    var body = el('div', 'figchat-body');
    body.append(side, pane);
    host.classList.add('figchat');
    host.replaceChildren(top, body);

    function live() { return !!(view && !view.dead && view.aria); }

    function paintLink() {
      var words = { idle: '', connecting: 'Connecting', live: 'Live', offline: 'Offline' };
      host.setAttribute('data-link', state.link);
      if (link.textContent !== words[state.link]) link.textContent = words[state.link];
      var label = state.voice ? 'Voice on' : 'Voice off';
      if (voice.textContent !== label) voice.textContent = label;
      voice.setAttribute('aria-pressed', state.voice ? 'true' : 'false');
      send.disabled = !!(view && view.sending) || state.link === 'offline';
      turn.hidden = !(live() && view.conv.running());
      stop.disabled = !(live() && view.socket && state.link === 'live');
      composer.hidden = !live();
    }

    function paintMic() {
      host.setAttribute('data-mic', rec.state);
      var label = rec.state === 'recording' ? 'Stop ' + clock(now() - rec.began) : rec.state === 'transcribing' ? 'Wait' : 'Record';
      if (mic.textContent !== label) mic.textContent = label;
      mic.setAttribute('aria-pressed', rec.state === 'recording' ? 'true' : 'false');
      mic.disabled = rec.state === 'unsupported' || rec.state === 'asking' || rec.state === 'transcribing';
      var held = clip ? 'Recording attached, ' + clock(clip.ms) : '';
      if (clipText.textContent !== held) clipText.textContent = held;
      clipRow.hidden = !clip;
    }

    function micSay(text) {
      micNote.replaceChildren();
      put(micNote, text);
    }

    function release() {
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

    function transcribed(token, ms, res) {
      if (token !== rec.token) return;
      var text = String((res && res.text) || '').trim();
      if (!text || !res.clip_id) { micIdle('Heard no words. Try again.'); return; }
      clip = { id: String(res.clip_id), ms: Number(res.duration_ms) > 0 ? Number(res.duration_ms) : ms };
      input.value = (input.value.trim() ? input.value.replace(/\s*$/, ' ') : '') + text;
      micIdle('');
      grow();
      input.focus({ preventScroll: true });
    }

    function recorded(token, type) {
      if (token !== rec.token) return;
      var chunks = rec.chunks, ms = now() - rec.began;
      release();
      var blob = new win.Blob(chunks, { type: type });
      if (!blob.size) { micIdle('Nothing was recorded.'); return; }
      rec.state = 'transcribing';
      micSay('Transcribing.');
      paintMic();
      transport.clip(blob).then(function (res) { transcribed(token, ms, res); }, function (err) {
        if (token === rec.token) micIdle('Not transcribed: ' + (err && err.message ? err.message : 'network'));
      });
    }

    function stopRecording() {
      if (rec.recorder && rec.recorder.state !== 'inactive') rec.recorder.stop();
    }

    function cancelRecording() {
      rec.token++;
      stopRecording();
      release();
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
        release();
        micIdle(micFault(err));
      });
    }

    function grow() {
      if (win.CSS && win.CSS.supports && win.CSS.supports('field-sizing', 'content')) return;
      input.rows = Math.max(1, Math.min(8, input.value.split('\n').length));
    }

    function setLink(s) {
      state.link = s;
      paintLink();
    }

    function storeLabel(id) {
      for (var i = 0; i < state.stores.length; i++) if (state.stores[i].id === id) return state.stores[i].label || id;
      return id;
    }

    function ariaOf(store, id) {
      if (state.store !== store) return null;
      for (var i = 0; i < state.arias.length; i++) if (state.arias[i].id === id) return state.arias[i];
      return null;
    }

    function paintSideNote(text) {
      listNote.replaceChildren();
      put(listNote, text);
      listNote.hidden = !text;
    }

    function paintStores() {
      sideTitle.textContent = 'Stores';
      sideAct.replaceChildren();
      moreArias.hidden = true;
      var rows = state.stores.map(function (s) {
        var li = el('li', 'figchat-row');
        li.setAttribute('data-online', s.online ? 'true' : 'false');
        if (s.online) {
          var a = el('a', 'figchat-thread');
          a.href = routeFor(s.id);
          if (current && current.store === s.id) a.setAttribute('aria-current', 'page');
          a.append(el('span', 'figchat-aria-name', s.label || s.id), el('span', 'figchat-thread-when', 'Online'));
          li.appendChild(a);
        } else {
          var d = el('div', 'figchat-thread figchat-offline');
          d.append(el('span', 'figchat-aria-name', s.label || s.id), el('span', 'figchat-thread-when', 'Offline'));
          li.append(d, el('p', 'figchat-aria-sub', 'Not answering. Nothing is queued.'));
        }
        return li;
      });
      list.replaceChildren.apply(list, rows);
      paintSideNote(!state.storesLoaded ? (state.storesError ? 'Could not load stores: ' + state.storesError : 'Loading stores.') : state.stores.length ? '' : 'No stores configured.');
    }

    function paintArias() {
      var store = current && current.store;
      sideTitle.textContent = storeLabel(store);
      sideAct.replaceChildren();
      var back = el('a', 'figchat-new', 'Stores');
      back.href = '#/';
      var fresh = button('figchat-new figchat-fork', 'New aria');
      fresh.addEventListener('click', function () { forkAria(store, undefined, fresh); });
      sideAct.append(back, fresh);
      var shape = tree(state.arias);
      var open = current && current.aria;
      var rows = state.arias.map(function (a, i) {
        var li = el('li', 'figchat-row');
        var anchor = el('a', 'figchat-thread');
        anchor.href = routeFor(store, a.id);
        if (a.id === open) anchor.setAttribute('aria-current', 'page');
        var st = STATES[a.state] || 'idle';
        anchor.setAttribute('data-state', st);
        var line = el('span', 'figchat-aria-line');
        var branch = treeText(shape[i]);
        if (branch) line.appendChild(el('span', 'figchat-tree', branch));
        var dot = el('i', 'figchat-dot');
        dot.setAttribute('aria-hidden', 'true');
        line.append(dot, el('span', 'figchat-aria-name', ariaName(a)));
        var sub = [(a.roles || []).join(' '), a.id, st].filter(Boolean).join(' \u00b7 ');
        anchor.append(line, el('span', 'figchat-thread-when', ago(a.last_turn, now())), el('span', 'figchat-aria-sub', sub));
        li.appendChild(anchor);
        return li;
      });
      list.replaceChildren.apply(list, rows);
      moreArias.hidden = state.next == null;
      moreArias.disabled = state.ariasBusy;
      var note = !state.ariasLoaded ? (state.ariasError ? state.ariasError : 'Loading arias.') : state.arias.length ? '' : 'This store has no arias.';
      paintSideNote(note);
      if (view && view.heading && view.aria && !view.titled) {
        var found = ariaOf(view.store, view.aria);
        if (found) { view.titled = true; view.heading.replaceChildren(); put(view.heading, ariaName(found)); }
      }
    }

    function paintSide() {
      if (current && current.store != null) paintArias();
      else paintStores();
    }

    function loadStores() {
      return transport.stores().then(function (res) {
        if (destroyed) return;
        state.stores = Array.isArray(res && res.stores) ? res.stores.filter(function (s) { return s && typeof s.id === 'string'; }) : [];
        state.storesLoaded = true;
        state.storesError = '';
        paintSide();
        if (view && view.heading && !view.aria) { view.heading.replaceChildren(); put(view.heading, storeLabel(view.store)); }
      }, function (err) {
        if (destroyed) return;
        state.storesError = err && err.message ? err.message : 'network';
        paintSide();
      });
    }

    function loadArias(store, more) {
      if (state.store !== store) {
        state.store = store;
        state.arias = [];
        state.next = null;
        state.ariasLoaded = false;
        state.ariasError = '';
        more = false;
      }
      var q = { limit: more ? ARIA_PAGE : Math.max(ARIA_PAGE, state.arias.length) };
      if (more && state.next != null) q.before = state.next;
      state.ariasBusy = true;
      if (current && current.store === store) paintSide();
      return transport.arias(store, q).then(function (res) {
        if (destroyed || state.store !== store) return;
        var got = Array.isArray(res && res.arias) ? res.arias.filter(function (a) { return a && typeof a.id === 'string'; }) : [];
        if (more) state.arias = state.arias.concat(got);
        else state.arias = got;
        state.next = res && res.next_before != null ? res.next_before : null;
        state.ariasLoaded = true;
        state.ariasError = '';
        state.ariasBusy = false;
        if (current && current.store === store) paintSide();
      }, function (err) {
        if (destroyed || state.store !== store) return;
        state.ariasBusy = false;
        state.ariasError = err && err.code === 'store_offline' ? 'This store is offline. Nothing is queued.' : 'Could not load arias: ' + (err && err.message ? err.message : 'network');
        if (current && current.store === store) paintSide();
      });
    }

    function nearBottom() {
      return win.innerHeight + win.scrollY >= doc.documentElement.scrollHeight - 120;
    }
    function toBottom() {
      win.scrollTo(0, doc.documentElement.scrollHeight);
    }
    function keep(fn) {
      var stick = nearBottom();
      fn();
      if (stick) toBottom();
    }

    function playerFor(v, t, which) {
      var node = nodeFor(v, t), part = node[which];
      var id = which === 'prompt' ? t.prompt_audio_id : t.audio_id;
      if (part.player || !V) return part.player;
      part.player = V.create(doc, {
        audioId: id,
        src: transport.audioURL,
        status: transport.audioStatus,
        label: which === 'prompt' ? 'Recording' : 'Spoken reply'
      });
      part.player.el.setAttribute('data-for', key(t.id) + ':' + (which === 'prompt' ? 'in' : 'out'));
      part.bubble.appendChild(part.player.el);
      return part.player;
    }

    function paintTools(part, t) {
      var rows = t.tools.map(function (x) {
        var li = el('li', 'figchat-tool');
        li.setAttribute('data-state', toolState(x));
        li.append(el('span', 'figchat-tool-name', x.name || 'tool'), el('span', 'figchat-tool-state', toolState(x)));
        return li;
      });
      part.tools.replaceChildren.apply(part.tools, rows);
      part.tools.hidden = !rows.length;
    }

    function makePart(role, t) {
      var li = el('li', 'figchat-msg');
      li.setAttribute('data-role', role);
      li.setAttribute('data-turn', key(t.id));
      var bubble = el('div', 'figchat-bubble');
      var who = el('span', 'figchat-who', role === 'user' ? 'Prompt' : 'Figaro');
      var text = el('div', 'figchat-text');
      var toolList = el('ul', 'figchat-tools');
      toolList.hidden = true;
      var faultLine = el('p', 'figchat-fault');
      faultLine.hidden = true;
      bubble.append(who, text, toolList, faultLine);
      var meta = el('span', 'figchat-meta');
      li.append(bubble, meta);
      return { li: li, bubble: bubble, text: text, tools: toolList, fault: faultLine, meta: meta, player: null, blocks: [], plain: null };
    }

    function nodeFor(v, t) {
      var k = key(t.id), node = v.nodes[k];
      if (node) return node;
      node = v.nodes[k] = { prompt: makePart('user', t), reply: makePart('assistant', t) };
      var anchor = null;
      for (var next = v.conv.next(t); next && !anchor; next = v.conv.next(next)) {
        if (v.nodes[key(next.id)]) anchor = v.nodes[key(next.id)].prompt.li;
      }
      v.log.insertBefore(node.prompt.li, anchor);
      v.log.insertBefore(node.reply.li, anchor);
      return node;
    }

    function inline(n, spanList) {
      spanList.forEach(function (sp) {
        var c;
        if (sp.kind === 'text') { put(n, sp.text); return; }
        if (sp.kind === 'code') c = el('code', 'figchat-code', sp.text);
        else if (sp.kind === 'a') {
          c = el('a', 'figchat-a', sp.text);
          c.setAttribute('href', sp.href);
          c.setAttribute('rel', 'noopener noreferrer');
          c.setAttribute('target', '_blank');
        } else c = inline(el(sp.kind === 'b' ? 'strong' : 'em'), sp.spans);
        n.appendChild(c);
      });
      return n;
    }

    function blockEl(b) {
      var n;
      switch (b.kind) {
        case 'code':
          n = el('pre', 'figchat-pre');
          n.appendChild(el('code', '', b.text));
          return n;
        case 'h': return inline(el(b.level < 3 ? 'h3' : 'h4', 'figchat-h'), spans(b.text));
        case 'hr': return el('hr', 'figchat-hr');
        case 'ul':
        case 'ol':
          n = el(b.kind, 'figchat-list');
          if (b.kind === 'ol' && b.start !== 1) n.start = b.start;
          b.items.forEach(function (x) { n.appendChild(inline(el('li'), spans(x))); });
          return n;
        case 'quote': return inline(el('blockquote', 'figchat-quote'), spans(b.text));
        default: return inline(el('p', 'figchat-p'), spans(b.text));
      }
    }

    function paintReplyText(part, t) {
      var next = blocks(t.reply), old = part.blocks;
      for (var i = 0; i < next.length; i++) {
        var sig = JSON.stringify(next[i]);
        if (old[i] && old[i].sig === sig) continue;
        var made = blockEl(next[i]);
        if (old[i]) part.text.replaceChild(made, old[i].el);
        else part.text.appendChild(made);
        old[i] = { sig: sig, el: made };
      }
      while (old.length > next.length) part.text.removeChild(old.pop().el);
    }

    function paintPrompt(v, t) {
      var part = nodeFor(v, t).prompt;
      part.li.hidden = !t.prompt && !t.prompt_audio_id;
      if (part.plain !== t.prompt) {
        part.plain = t.prompt;
        part.text.replaceChildren();
        put(part.text, t.prompt);
      }
      var stamp = Date.parse(t.at);
      var when = isNaN(stamp) ? '' : new Date(stamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      part.meta.replaceChildren();
      var bits = [when, t.from].filter(Boolean).join(' \u00b7 ');
      var anchor = el('a', 'figchat-turnlink', '#' + key(t.id));
      anchor.href = routeFor(v.store, v.aria, t.id);
      anchor.setAttribute('aria-label', 'Link to turn ' + key(t.id));
      if (bits) put(part.meta, bits + ' \u00b7 ');
      part.meta.appendChild(anchor);
      if (t.prompt_audio_id) {
        var p = playerFor(v, t, 'prompt');
        if (p && !p.audioId()) p.end(t.prompt_audio_id);
      }
    }

    function paintReply(v, t) {
      var part = nodeFor(v, t).reply;
      part.li.hidden = !t.reply && !t.tools.length && !t.audio_id && t.done && !t.fault;
      paintReplyText(part, t);
      paintTools(part, t);
      if (t.streaming || !t.done) part.li.setAttribute('data-streaming', '');
      else part.li.removeAttribute('data-streaming');
      if (t.failed) part.li.setAttribute('data-failed', '');
      else part.li.removeAttribute('data-failed');
      part.fault.replaceChildren();
      put(part.fault, t.fault || '');
      part.fault.hidden = !t.fault;
      if (t.audio_id) {
        var p = playerFor(v, t, 'reply');
        if (p && !p.audioId()) p.end(t.audio_id);
      }
    }

    function paintTurn(v, t) {
      nodeFor(v, t);
      paintPrompt(v, t);
      paintReply(v, t);
    }

    function notice(v, text) {
      var li = el('li', 'figchat-msg figchat-system');
      li.setAttribute('data-role', 'system');
      li.appendChild(el('p', 'figchat-fault', text));
      v.log.appendChild(li);
    }

    function say(text) {
      sendNote.replaceChildren();
      put(sendNote, text);
    }

    function frame(v, f) {
      var eff = v.conv.apply(f);
      if (!eff) return;
      var t = eff.turn, node;
      keep(function () {
        switch (eff.kind) {
          case 'turn':
            paintTurn(v, t);
            break;
          case 'delta':
          case 'tool':
            nodeFor(v, t);
            paintReply(v, t);
            break;
          case 'end':
            paintReply(v, t);
            loadArias(v.store, false);
            break;
          case 'audio.start':
            nodeFor(v, t);
            if (playerFor(v, t, 'reply')) playerFor(v, t, 'reply').start(eff.format);
            break;
          case 'audio.end':
            nodeFor(v, t);
            paintReply(v, t);
            if (playerFor(v, t, 'reply')) playerFor(v, t, 'reply').end(eff.audio_id);
            break;
          case 'error':
            if (t) {
              node = nodeFor(v, t);
              if (eff.code === 'speech' && node.reply.player) node.reply.player.fail();
              paintReply(v, t);
            } else notice(v, 'Error: ' + eff.text);
            break;
          case 'offline':
            v.storeOffline = true;
            say('The store went offline. Nothing is queued; reconnecting.');
            break;
        }
      });
      paintLink();
    }

    function loadOlder(v) {
      if (view !== v || !v.more || v.olderBusy || !v.conv.turns.length) return Promise.resolve();
      v.olderBusy = true;
      v.older.disabled = true;
      return transport.turns(v.store, v.aria, { before: v.conv.turns[0].id, limit: PAGE }).then(function (page) {
        v.olderBusy = false;
        v.older.disabled = false;
        if (view !== v) return;
        var first = v.log.firstChild, anchorTop = first ? first.getBoundingClientRect().top : 0;
        var got = v.conv.load(page && page.turns, true);
        got.forEach(function (t) { paintTurn(v, t); });
        v.more = !!(page && page.more) && got.length > 0;
        v.older.hidden = !v.more;
        if (first) win.scrollBy(0, first.getBoundingClientRect().top - anchorTop);
      }, function (err) {
        v.olderBusy = false;
        v.older.disabled = false;
        if (view === v) say('Could not load earlier turns: ' + (err && err.message ? err.message : 'network'));
      });
    }

    function markTurn(v, id) {
      Object.keys(v.nodes).forEach(function (k) { v.nodes[k].prompt.li.removeAttribute('data-target'); v.nodes[k].reply.li.removeAttribute('data-target'); });
      var t = v.conv.get(id);
      if (!t || !v.nodes[key(t.id)]) return false;
      var n = v.nodes[key(t.id)];
      n.prompt.li.setAttribute('data-target', '');
      n.reply.li.setAttribute('data-target', '');
      (n.prompt.li.hidden ? n.reply.li : n.prompt.li).scrollIntoView({ block: 'start' });
      return true;
    }

    function seek(v, id) {
      var guard = 0;
      function step() {
        if (view !== v) return Promise.resolve();
        if (v.conv.get(id)) { markTurn(v, id); v.ready = true; return Promise.resolve(); }
        if (!v.more || guard++ > 200) {
          v.ready = true;
          v.status.hidden = false;
          v.status.replaceChildren();
          put(v.status, 'Turn ' + id + ' is not in this aria\u2019s history.');
          return Promise.resolve();
        }
        return loadOlder(v).then(step);
      }
      return step();
    }

    function connect(v) {
      if (view !== v || v.closed) return;
      setLink('connecting');
      v.socket = transport.connect(v.store, v.aria, v.conv.cursor(), {
        open: function () {
          if (view !== v) return;
          v.attempts = 0;
          v.storeOffline = false;
          say('');
          setLink('live');
          if (state.voice) v.socket.send({ type: 'voice', on: true });
          v.waiting.splice(0).forEach(function (go) { go(); });
        },
        frame: function (f) { if (view === v) frame(v, f); },
        binary: function (data) {
          if (view !== v) return;
          var t = v.conv.binary();
          var node = t && v.nodes[key(t.id)];
          if (node && node.reply.player) node.reply.player.push(data);
        },
        close: function () {
          if (view !== v || v.closed) return;
          v.socket = null;
          var t = v.conv.cut();
          var node = t && v.nodes[key(t.id)];
          if (node && node.reply.player) node.reply.player.end('');
          v.conv.turns.forEach(function (x) { if (v.nodes[key(x.id)]) paintReply(v, x); });
          setLink('offline');
          v.timer = win.setTimeout(function () { connect(v); }, wait(v.attempts++));
        }
      });
    }

    function closeView() {
      var v = view;
      view = null;
      if (!v) return;
      v.closed = true;
      win.clearTimeout(v.timer);
      if (v.socket) v.socket.close();
      Object.keys(v.nodes).forEach(function (k) {
        if (v.nodes[k].prompt.player) v.nodes[k].prompt.player.destroy();
        if (v.nodes[k].reply.player) v.nodes[k].reply.player.destroy();
      });
      setLink('idle');
    }

    function crumb(store) {
      var back = el('a', 'figchat-back', store == null ? 'Stores' : 'Arias');
      back.href = routeFor(store);
      return back;
    }

    function forkAria(store, parent, btn) {
      if (btn) btn.disabled = true;
      var req = parent ? { fork_of: parent } : {};
      return transport.createAria(store, req).then(function (res) {
        if (btn) btn.disabled = false;
        if (destroyed) return;
        loadArias(store, false);
        win.location.hash = routeFor(store, res.id);
      }, function (err) {
        if (btn) btn.disabled = false;
        say('Could not start an aria: ' + (err && err.message ? err.message : 'network'));
      });
    }

    function deadWords(store, err) {
      if (err && err.code === 'store_offline') return storeLabel(store) + ' is offline. Nothing is queued.';
      if (err && (err.status === 404 || err.code === 'aria_gone')) return 'This aria is gone. It was reaped, or the link is wrong.';
      return 'Could not load turns: ' + (err && err.message ? err.message : 'network');
    }

    function openAria(rt) {
      closeView();
      var v = view = { store: rt.store, aria: rt.aria, conv: conversation(), nodes: {}, socket: null, timer: 0, attempts: 0, closed: false, sending: false, waiting: [], more: false, olderBusy: false, ready: false, dead: false, titled: false, storeOffline: false };
      var known = ariaOf(rt.store, rt.aria);
      v.heading = el('h1', 'figchat-h1', known ? ariaName(known) : rt.aria);
      v.heading.tabIndex = -1;
      v.titled = !!known;
      var actions = el('div', 'figchat-actions');
      var fork = button('figchat-button figchat-fork', 'Fork this aria');
      fork.addEventListener('click', function () { forkAria(v.store, v.aria, fork); });
      actions.append(el('span', 'figchat-where', storeLabel(rt.store) + ' \u00b7 ' + rt.aria), fork);
      v.older = button('figchat-older', 'Earlier turns');
      v.older.hidden = true;
      v.older.addEventListener('click', function () { loadOlder(v); });
      v.log = el('ol', 'figchat-log');
      v.log.setAttribute('aria-label', 'Turns');
      v.status = el('p', 'figchat-note', 'Loading turns.');
      main.replaceChildren(crumb(rt.store), v.heading, actions, v.older, v.log, v.status);
      transport.turns(rt.store, rt.aria, { limit: PAGE }).then(function (page) {
        if (view !== v) return;
        v.status.hidden = true;
        v.conv.load(page && page.turns, false).forEach(function (t) { paintTurn(v, t); });
        v.more = !!(page && page.more);
        v.older.hidden = !v.more;
        var go = rt.turn != null ? seek(v, rt.turn) : Promise.resolve().then(function () { toBottom(); v.ready = true; });
        go.then(function () { if (view === v) connect(v); });
        paintLink();
      }, function (err) {
        if (view !== v) return;
        v.dead = true;
        v.status.replaceChildren();
        put(v.status, deadWords(rt.store, err));
        paintLink();
        if (!err || (err.status !== 404 && err.code !== 'aria_gone')) {
          var retry = button('figchat-button', 'Try again');
          retry.addEventListener('click', function () { if (view === v) openAria(rt); });
          main.appendChild(retry);
        }
      });
      return v.heading;
    }

    function openStoreHome(rt) {
      closeView();
      var h = el('h1', 'figchat-h1', storeLabel(rt.store));
      h.tabIndex = -1;
      view = { store: rt.store, aria: null, heading: h, conv: conversation(), nodes: {}, closed: false, dead: true, waiting: [] };
      main.replaceChildren(crumb(), h, el('p', 'figchat-note', 'Pick an aria.'));
      return h;
    }

    function openStores() {
      closeView();
      var h = el('h1', 'figchat-h1', 'figchat');
      h.tabIndex = -1;
      main.replaceChildren(h, el('p', 'figchat-note', 'Pick a store, then an aria to attend.'));
      return h;
    }

    function route() {
      var rt = parseRoute(win.location.hash);
      var h;
      if (rt && rt.aria != null && view && view.aria === rt.aria && view.store === rt.store && !view.closed) {
        current = rt;
        if (rt.turn != null && !view.dead) seek(view, rt.turn);
        paintSide();
        return;
      }
      current = rt;
      if (rt && rt.aria != null) h = openAria(rt);
      else if (rt) h = openStoreHome(rt);
      else h = openStores();
      host.setAttribute('data-route', rt && rt.aria != null ? 'aria' : rt ? 'store' : 'stores');
      if (!rt || rt.aria == null) cancelRecording();
      sendNote.replaceChildren();
      if (rt) loadArias(rt.store, false);
      paintSide();
      paintLink();
      if (!(rt && rt.turn != null)) win.scrollTo(0, 0);
      h.focus({ preventScroll: true });
    }

    function whenLive(v) {
      if (v.socket && state.link === 'live') return Promise.resolve();
      return new Promise(function (go) { v.waiting.push(go); });
    }

    function unsent(v, err) {
      v.sending = false;
      if (view !== v) return;
      paintLink();
      say('Not sent: ' + (err && err.message ? err.message : 'network'));
    }

    function submit() {
      var v = view, text = input.value.trim(), held = clip;
      if (!live() || v.sending || !text) return;
      if (state.link === 'offline') { say('Offline. Nothing is queued; try again when it is live.'); return; }
      if (V) V.unlock(win);
      v.sending = true;
      say('');
      paintLink();
      whenLive(v).then(function () {
        return transport.send(v.store, v.aria, held ? { text: text, clip_id: held.id } : { text: text });
      }).then(function () {
        v.sending = false;
        if (clip === held) clip = null;
        if (input.value.trim() === text) input.value = '';
        grow();
        paintMic();
        if (view !== v) return;
        paintLink();
        toBottom();
      }, function (err) { unsent(v, err); });
    }

    on(composer, 'submit', function (ev) {
      ev.preventDefault();
      submit();
    });
    on(input, 'keydown', function (ev) {
      if (ev.key !== 'Enter' || ev.shiftKey || ev.isComposing || coarse) return;
      ev.preventDefault();
      submit();
    });
    on(input, 'input', grow);
    on(mic, 'click', function () {
      if (V) V.unlock(win);
      if (rec.state === 'recording') stopRecording();
      else if (rec.state === 'idle') startRecording();
    });
    on(clipDrop, 'click', function () {
      clip = null;
      paintMic();
    });
    on(stop, 'click', function () {
      if (live()) transport.cancel(view.store, view.aria).catch(function (err) { say('Could not stop: ' + (err && err.message ? err.message : 'network')); });
    });
    on(moreArias, 'click', function () {
      if (current && current.store != null && state.next != null) loadArias(current.store, true);
    });
    on(voice, 'click', function () {
      if (V) V.unlock(win);
      state.voice = !state.voice;
      paintLink();
      if (live() && view.socket) view.socket.send({ type: 'voice', on: state.voice });
      if (!state.voice && live()) {
        var t = view.conv.binary();
        var node = t && view.nodes[key(t.id)];
        view.conv.audio = null;
        if (node && node.reply.player) {
          node.reply.player.stop();
          node.reply.player.end('');
        }
      }
    });
    on(win, 'hashchange', route);
    on(win, 'scroll', function () {
      var v = view;
      if (v && v.aria && v.ready && v.more && !v.olderBusy && win.scrollY < 160) loadOlder(v);
    });
    on(doc, 'visibilitychange', function () {
      if (doc.visibilityState !== 'visible') return;
      loadStores();
      if (current && current.store != null) loadArias(current.store, false);
    });

    var api = {
      state: function () { return { stores: state.stores, arias: state.arias, store: current ? current.store || null : null, aria: live() ? view.aria : null, voice: state.voice, link: state.link, mic: rec.state, clip: clip ? clip.id : null, turns: view && view.conv ? view.conv.turns.length : 0 }; },
      player: function (id, which) {
        var node = view && view.nodes[key(id)];
        return node ? node[which === 'in' ? 'prompt' : 'reply'].player : null;
      },
      detach: function () {
        destroyed = true;
        cancelRecording();
        closeView();
        listeners.forEach(function (off) { off(); });
        host.replaceChildren();
        host.classList.remove('figchat');
        host.removeAttribute('data-route');
        host.removeAttribute('data-link');
        host.removeAttribute('data-mic');
        delete host.figchat;
      }
    };
    host.figchat = api;
    if (!canRecord) micSay('This browser cannot record audio.');
    paintMic();
    route();
    loadStores();
    return api;
  }

  return {
    mount: mount,
    httpTransport: httpTransport,
    conversation: conversation,
    blocks: blocks,
    spans: spans,
    micType: micType,
    micFault: micFault,
    reveal: reveal,
    routeFor: routeFor,
    parseRoute: parseRoute,
    tree: tree,
    treeText: treeText,
    cursorText: cursorText,
    ago: ago,
    backoff: backoff
  };
}));
