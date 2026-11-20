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

  function routeFor(thread) {
    return '#/t/' + encodeURIComponent(thread);
  }

  function parseRoute(hash) {
    if (hash === '#/new') return { fresh: true };
    var m = /^#\/t\/([^/]+)$/.exec(hash || '');
    if (!m) return null;
    try { return { thread: decodeURIComponent(m[1]) }; } catch (e) { return null; }
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

  function titleFrom(text) {
    var line = String(text).trim().split('\n')[0].replace(/\s+/g, ' ');
    return line.length > 60 ? line.slice(0, 59).trimEnd() + '\u2026' : line;
  }

  function backoff(attempt) {
    return Math.min(15000, 500 * Math.pow(2, Math.max(0, attempt)));
  }

  var MAX_CLIP_MS = 5 * 60000;

  function key(id) { return String(id); }

  function before(a, b) {
    var x = Number(a), y = Number(b);
    if (!isNaN(x) && !isNaN(y)) return x < y;
    return key(a) < key(b);
  }

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
    var c = { messages: [], audio: null };
    var byId = {};

    function insert(m) {
      var i = c.messages.length;
      while (i > 0 && before(m.id, c.messages[i - 1].id)) i--;
      c.messages.splice(i, 0, m);
      byId[key(m.id)] = m;
      return m;
    }

    function ensure(id, role) {
      var m = byId[key(id)];
      if (m) return m;
      return insert({ id: id, role: role || 'assistant', text: '', created: '', audio_id: '', tools: [], streaming: false, done: false, partial: true, failed: false, fault: '' });
    }

    function tool(m, id) {
      for (var i = 0; i < m.tools.length; i++) if (key(m.tools[i].id) === key(id)) return m.tools[i];
      var t = { id: id, name: '', args: '', result: '', error: '', state: 'running' };
      m.tools.push(t);
      return t;
    }

    c.get = function (id) { return byId[key(id)] || null; };
    c.next = function (m) {
      var i = c.messages.indexOf(m);
      return i >= 0 && i + 1 < c.messages.length ? c.messages[i + 1] : null;
    };
    c.last = function () {
      for (var i = c.messages.length - 1; i >= 0; i--) if (c.messages[i].done) return c.messages[i].id;
      return null;
    };

    c.load = function (list) {
      var touched = [];
      (list || []).forEach(function (raw) {
        if (!raw || raw.id == null) return;
        var m = byId[key(raw.id)];
        if (m && m.streaming) return;
        var role = raw.role === 'user' ? 'user' : 'assistant';
        var text = typeof raw.text === 'string' ? raw.text : '';
        var list = Array.isArray(raw.tools) ? raw.tools : [];
        var known = raw.state === 'streaming' || raw.state === 'done' || raw.state === 'failed';
        var pending = known ? raw.state === 'streaming' : role === 'assistant' && !text && !list.length && !raw.audio_id;
        if (m && !m.done && pending) { m.partial = true; return; }
        if (!m) m = insert({ id: raw.id, tools: [], text: '', fault: '' });
        m.role = role;
        m.failed = raw.state === 'failed';
        m.text = text || (m.failed ? m.text : '');
        if (m.failed && !m.fault) m.fault = 'This reply failed.';
        m.created = raw.created || '';
        m.audio_id = raw.audio_id || m.audio_id || '';
        m.tools = list.map(function (t) {
          return { id: t.id, name: t.name || '', args: t.args || '', result: t.result || '', error: t.error || '', state: t.error ? 'failed' : 'done' };
        });
        m.streaming = false;
        m.partial = pending;
        m.done = !pending;
        touched.push(m);
      });
      return touched;
    };

    c.running = function () {
      return c.messages.some(function (m) { return m.role === 'assistant' && !m.done; });
    };

    c.add = function (raw) {
      var m = byId[key(raw.id)] || insert({ id: raw.id, tools: [], audio_id: '' });
      m.role = raw.role === 'assistant' ? 'assistant' : 'user';
      m.text = typeof raw.text === 'string' ? raw.text : '';
      m.created = raw.created || m.created || '';
      m.audio_id = raw.audio_id || m.audio_id || '';
      m.streaming = false;
      m.partial = false;
      m.failed = false;
      m.fault = '';
      m.done = true;
      return m;
    };

    c.apply = function (f) {
      if (!f || typeof f.type !== 'string') return null;
      var m, t;
      switch (f.type) {
        case 'message.added':
          if (!f.message || f.message.id == null) return null;
          return { kind: 'message', message: c.add(f.message) };
        case 'message.start':
          if (f.id == null) return null;
          m = ensure(f.id, f.role === 'user' ? 'user' : 'assistant');
          if (m.done) return null;
          m.text = '';
          m.tools = [];
          m.streaming = true;
          m.partial = false;
          return { kind: 'message', message: m };
        case 'message.delta':
          if (f.id == null || typeof f.text !== 'string') return null;
          m = ensure(f.id);
          if (m.done) return null;
          m.streaming = true;
          m.text += f.text;
          return { kind: 'delta', message: m, text: f.text };
        case 'tool.start':
        case 'tool.end':
          if (f.id == null || f.tool_id == null) return null;
          m = ensure(f.id);
          if (m.done) return null;
          m.streaming = true;
          t = tool(m, f.tool_id);
          if (f.name) t.name = String(f.name);
          if (f.args != null) t.args = String(f.args);
          if (f.type === 'tool.end') {
            t.result = f.result == null ? '' : String(f.result);
            t.error = f.error ? String(f.error) : '';
            t.state = t.error ? 'failed' : 'done';
          }
          return { kind: 'tool', message: m, tool: t };
        case 'message.end':
          m = f.id == null ? null : byId[key(f.id)];
          if (!m || m.done) return null;
          m.streaming = false;
          m.done = true;
          return { kind: 'end', message: m, refetch: m.partial };
        case 'audio.start':
          if (f.message_id == null) return null;
          m = ensure(f.message_id);
          c.audio = key(m.id);
          return { kind: 'audio.start', message: m, format: { format: f.format, rate: f.rate, bits: f.bits, channels: f.channels } };
        case 'audio.end':
          if (f.message_id == null) return null;
          m = ensure(f.message_id);
          if (c.audio === key(m.id)) c.audio = null;
          if (f.audio_id) m.audio_id = String(f.audio_id);
          return { kind: 'audio.end', message: m, audio_id: m.audio_id };
        case 'error':
          m = f.message_id == null ? null : byId[key(f.message_id)] || null;
          if (m && f.code === 'speech' && c.audio === key(m.id)) c.audio = null;
          if (m) {
            if (f.code !== 'speech') m.failed = true;
            m.fault = (f.code === 'speech' ? 'Speech failed: ' : 'Failed: ') + String(f.text || f.code || 'error');
          }
          return { kind: 'error', message: m, code: String(f.code || 'error'), text: String(f.text || '') };
        default:
          return null;
      }
    };

    c.binary = function () {
      return c.audio == null ? null : byId[c.audio] || null;
    };

    c.cut = function () {
      var m = c.binary();
      c.audio = null;
      c.messages.forEach(function (x) { x.streaming = false; });
      return m;
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
    var enc = encodeURIComponent;

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

    return {
      threads: function () { return call('GET', '/threads'); },
      createThread: function (title) { return call('POST', '/threads', title ? { title: title } : {}); },
      messages: function (thread, q) {
        var parts = ['limit=' + enc((q && q.limit) || 50)];
        if (q && q.before != null) parts.unshift('before=' + enc(q.before));
        return call('GET', '/threads/' + enc(thread) + '/messages?' + parts.join('&'));
      },
      send: function (thread, body) { return call('POST', '/threads/' + enc(thread) + '/messages', body); },
      clip: function (blob) {
        return doFetch(api + '/clips', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json', 'Content-Type': blob.type || 'application/octet-stream' }, body: blob }).then(answer);
      },
      audioURL: function (id) { return audio + '/' + enc(id); },
      audioStatus: function (id) {
        return doFetch(audio + '/' + enc(id), { method: 'GET', credentials: 'same-origin', cache: 'no-store', headers: { Range: 'bytes=0-0' } })
          .then(function (res) { return res.status; });
      },
      connect: function (thread, after, h) {
        var Socket = o.WebSocket || win.WebSocket;
        var base = o.base || win.document.baseURI;
        var url = new URL(ws, base).href.replace(/^http/, 'ws') + '?thread=' + enc(thread) + (after == null ? '' : '&after=' + enc(after));
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
    var state = { threads: [], loaded: false, error: '', voice: false, link: 'idle' };
    var media = opts.media || { devices: win.navigator && win.navigator.mediaDevices, Recorder: win.MediaRecorder };
    var canRecord = !!(media.devices && typeof media.devices.getUserMedia === 'function' && media.Recorder);
    var rec = { state: canRecord ? 'idle' : 'unsupported', recorder: null, stream: null, chunks: [], began: 0, tick: 0, token: 0 };
    var clip = null;
    var view = null;
    var listeners = [];
    var destroyed = false;

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
    side.setAttribute('aria-label', 'Threads');
    var sideHead = el('div', 'figchat-side-head');
    var fresh = el('a', 'figchat-new', 'New thread');
    fresh.href = '#/new';
    sideHead.append(el('h2', 'figchat-h2', 'Threads'), fresh);
    var list = el('ul', 'figchat-threads');
    var listNote = el('p', 'figchat-note');
    side.append(sideHead, list, listNote);

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

    function paintLink() {
      var words = { idle: '', connecting: 'Connecting', live: 'Live', offline: 'Offline' };
      host.setAttribute('data-link', state.link);
      if (link.textContent !== words[state.link]) link.textContent = words[state.link];
      var label = state.voice ? 'Voice on' : 'Voice off';
      if (voice.textContent !== label) voice.textContent = label;
      voice.setAttribute('aria-pressed', state.voice ? 'true' : 'false');
      send.disabled = !!(view && view.sending) || state.link === 'offline';
      turn.hidden = !(view && view.id && view.conv.running());
      stop.disabled = !(view && view.socket && state.link === 'live');
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

    function titleOf(id) {
      for (var i = 0; i < state.threads.length; i++) if (state.threads[i].id === id) return state.threads[i].title || 'Untitled thread';
      return 'Thread';
    }

    function paintThreads() {
      var open = view ? view.id : null;
      var rows = state.threads.map(function (t) {
        var li = el('li', 'figchat-row');
        var a = el('a', 'figchat-thread');
        a.href = routeFor(t.id);
        if (t.id === open) a.setAttribute('aria-current', 'page');
        a.append(el('span', 'figchat-thread-title', t.title || 'Untitled thread'), el('span', 'figchat-thread-when', ago(t.updated, now())));
        li.appendChild(a);
        return li;
      });
      list.replaceChildren.apply(list, rows);
      var note = !state.loaded ? (state.error ? 'Could not load threads: ' + state.error : 'Loading threads.') : state.threads.length ? '' : 'No threads yet.';
      listNote.replaceChildren();
      put(listNote, note);
      listNote.hidden = !note;
      if (view && view.heading && view.id) {
        var t = titleOf(view.id);
        if (view.heading.textContent !== t) { view.heading.replaceChildren(); put(view.heading, t); }
      }
    }

    function loadThreads() {
      return transport.threads().then(function (res) {
        if (destroyed) return;
        state.threads = Array.isArray(res && res.threads) ? res.threads.filter(function (t) { return t && typeof t.id === 'string'; }) : [];
        state.threads.sort(function (a, b) { return String(b.updated || '').localeCompare(String(a.updated || '')); });
        state.loaded = true;
        state.error = '';
        paintThreads();
      }, function (err) {
        if (destroyed) return;
        state.error = err && err.message ? err.message : 'network';
        paintThreads();
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

    function playerFor(v, m) {
      var k = key(m.id), node = nodeFor(v, m);
      if (node.player || !V) return node.player;
      node.player = V.create(doc, {
        audioId: m.audio_id,
        src: transport.audioURL,
        status: transport.audioStatus,
        label: m.role === 'user' ? 'Recording' : 'Spoken reply'
      });
      node.player.el.setAttribute('data-for', k);
      node.bubble.appendChild(node.player.el);
      return node.player;
    }

    function paintTools(node, m) {
      var rows = m.tools.map(function (t) {
        var li = el('li', 'figchat-tool');
        li.setAttribute('data-state', toolState(t));
        li.append(el('span', 'figchat-tool-name', t.name || 'tool'), el('span', 'figchat-tool-state', toolState(t)));
        return li;
      });
      node.tools.replaceChildren.apply(node.tools, rows);
      node.tools.hidden = !rows.length;
    }

    function nodeFor(v, m) {
      var k = key(m.id), node = v.nodes[k];
      if (node) return node;
      var li = el('li', 'figchat-msg');
      li.setAttribute('data-role', m.role);
      li.setAttribute('data-id', k);
      var bubble = el('div', 'figchat-bubble');
      var who = el('span', 'figchat-who', m.role === 'user' ? 'You' : 'Figaro');
      var text = el('div', 'figchat-text');
      var toolList = el('ul', 'figchat-tools');
      toolList.hidden = true;
      var faultLine = el('p', 'figchat-fault');
      faultLine.hidden = true;
      bubble.append(who, text, toolList, faultLine);
      var meta = el('span', 'figchat-meta');
      li.append(bubble, meta);
      node = v.nodes[k] = { li: li, bubble: bubble, text: text, tools: toolList, fault: faultLine, meta: meta, player: null, blocks: [], plain: null };
      var anchor = null;
      for (var next = v.conv.next(m); next && !anchor; next = v.conv.next(next)) {
        if (v.nodes[key(next.id)]) anchor = v.nodes[key(next.id)].li;
      }
      v.log.insertBefore(li, anchor);
      return node;
    }

    function inline(n, list) {
      list.forEach(function (sp) {
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
          b.items.forEach(function (t) { n.appendChild(inline(el('li'), spans(t))); });
          return n;
        case 'quote': return inline(el('blockquote', 'figchat-quote'), spans(b.text));
        default: return inline(el('p', 'figchat-p'), spans(b.text));
      }
    }

    function paintText(node, m) {
      if (m.role === 'user') {
        if (node.plain === m.text) return;
        node.plain = m.text;
        node.text.replaceChildren();
        put(node.text, m.text);
        return;
      }
      var next = blocks(m.text), old = node.blocks;
      for (var i = 0; i < next.length; i++) {
        var sig = JSON.stringify(next[i]);
        if (old[i] && old[i].sig === sig) continue;
        var made = blockEl(next[i]);
        if (old[i]) node.text.replaceChild(made, old[i].el);
        else node.text.appendChild(made);
        old[i] = { sig: sig, el: made };
      }
      while (old.length > next.length) node.text.removeChild(old.pop().el);
    }

    function paintMessage(v, m) {
      var node = nodeFor(v, m);
      node.li.setAttribute('data-role', m.role);
      paintText(node, m);
      paintTools(node, m);
      paintMeta(node, m);
      if (m.audio_id) {
        var p = playerFor(v, m);
        if (p && !p.audioId()) p.end(m.audio_id);
      }
      return node;
    }

    function paintMeta(node, m) {
      if (m.streaming || (m.role === 'assistant' && !m.done)) node.li.setAttribute('data-streaming', '');
      else node.li.removeAttribute('data-streaming');
      if (m.failed) node.li.setAttribute('data-failed', '');
      else node.li.removeAttribute('data-failed');
      node.fault.replaceChildren();
      put(node.fault, m.fault || '');
      node.fault.hidden = !m.fault;
      var t = Date.parse(m.created);
      var when = isNaN(t) ? '' : new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (node.meta.textContent !== when) node.meta.textContent = when;
    }

    function notice(v, text) {
      var li = el('li', 'figchat-msg figchat-system');
      li.setAttribute('data-role', 'system');
      li.appendChild(el('p', 'figchat-fault', text));
      v.log.appendChild(li);
    }

    function frame(v, f) {
      var eff = v.conv.apply(f);
      if (!eff) return;
      var m = eff.message, node;
      keep(function () {
        switch (eff.kind) {
          case 'message':
            paintMessage(v, m);
            break;
          case 'delta':
            node = nodeFor(v, m);
            paintText(node, m);
            paintMeta(node, m);
            break;
          case 'tool':
            node = nodeFor(v, m);
            paintTools(node, m);
            paintMeta(node, m);
            break;
          case 'end':
            paintMeta(nodeFor(v, m), m);
            if (eff.refetch) history(v);
            loadThreads();
            break;
          case 'audio.start':
            nodeFor(v, m);
            if (playerFor(v, m)) playerFor(v, m).start(eff.format);
            break;
          case 'audio.end':
            nodeFor(v, m);
            if (playerFor(v, m)) playerFor(v, m).end(eff.audio_id);
            break;
          case 'error':
            if (m) {
              node = nodeFor(v, m);
              if (eff.code === 'speech' && node.player) node.player.fail();
              paintMeta(node, m);
            } else notice(v, 'Error: ' + eff.text);
            break;
        }
      });
      paintLink();
    }

    function history(v, q) {
      return transport.messages(v.id, q || { limit: 50 }).then(function (page) {
        if (view !== v) return page;
        var first = v.log.firstChild, anchorTop = first ? first.getBoundingClientRect().top : 0;
        var older = !!q && q.before != null;
        v.conv.load(page && page.messages).forEach(function (m) { paintMessage(v, m); });
        if (older || v.cursor === undefined) v.cursor = page && page.next_before != null ? page.next_before : null;
        v.older.hidden = v.cursor == null;
        if (older && first) win.scrollBy(0, first.getBoundingClientRect().top - anchorTop);
        paintLink();
        return page;
      });
    }

    function connect(v) {
      if (view !== v || v.closed) return;
      setLink('connecting');
      v.socket = transport.connect(v.id, v.conv.last(), {
        open: function () {
          if (view !== v) return;
          v.attempts = 0;
          setLink('live');
          if (state.voice) v.socket.send({ type: 'voice', on: true });
          v.waiting.splice(0).forEach(function (go) { go(); });
          if (v.conv.running()) history(v).catch(function () {});
        },
        frame: function (f) { if (view === v) frame(v, f); },
        binary: function (data) {
          if (view !== v) return;
          var m = v.conv.binary();
          var node = m && v.nodes[key(m.id)];
          if (node && node.player) node.player.push(data);
        },
        close: function () {
          if (view !== v || v.closed) return;
          v.socket = null;
          var m = v.conv.cut();
          var node = m && v.nodes[key(m.id)];
          if (node && node.player) node.player.end('');
          v.conv.messages.forEach(function (x) { if (v.nodes[key(x.id)]) paintMeta(v.nodes[key(x.id)], x); });
          setLink('offline');
          v.timer = win.setTimeout(function () {
            history(v).then(function () { connect(v); }, function () {
              if (view !== v || v.closed) return;
              v.timer = win.setTimeout(function () { connect(v); }, wait(v.attempts++));
            });
          }, wait(v.attempts++));
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
      Object.keys(v.nodes).forEach(function (k) { if (v.nodes[k].player) v.nodes[k].player.destroy(); });
      setLink('idle');
    }

    function crumb() {
      var back = el('a', 'figchat-back', 'Threads');
      back.href = '#/';
      return back;
    }

    function openThread(id) {
      closeView();
      var v = view = { id: id, conv: conversation(), nodes: {}, socket: null, timer: 0, attempts: 0, closed: false, sending: false, waiting: [], cursor: undefined };
      v.heading = el('h1', 'figchat-h1', titleOf(id));
      v.heading.tabIndex = -1;
      v.older = button('figchat-older', 'Earlier messages');
      v.older.hidden = true;
      v.older.addEventListener('click', function () {
        if (view !== v || v.cursor == null) return;
        v.older.disabled = true;
        history(v, { before: v.cursor, limit: 50 }).then(function () { v.older.disabled = false; }, function () { v.older.disabled = false; });
      });
      v.log = el('ol', 'figchat-log');
      v.log.setAttribute('aria-label', 'Messages');
      v.status = el('p', 'figchat-note', 'Loading messages.');
      main.replaceChildren(crumb(), v.heading, v.older, v.log, v.status);
      history(v).then(function () {
        if (view !== v) return;
        v.status.hidden = true;
        toBottom();
        connect(v);
      }, function (err) {
        if (view !== v) return;
        v.status.replaceChildren();
        put(v.status, err && err.status === 404 ? 'This thread is gone.' : 'Could not load messages: ' + (err && err.message ? err.message : 'network'));
        if (!err || err.status !== 404) {
          var retry = button('figchat-button', 'Try again');
          retry.addEventListener('click', function () { if (view === v) openThread(id); });
          main.appendChild(retry);
        }
      });
      return v.heading;
    }

    function openFresh() {
      closeView();
      view = { id: null, conv: conversation(), nodes: {}, socket: null, timer: 0, attempts: 0, closed: false, sending: false, waiting: [] };
      view.heading = el('h1', 'figchat-h1', 'New thread');
      view.heading.tabIndex = -1;
      main.replaceChildren(crumb(), view.heading, el('p', 'figchat-note', 'Write the first message below.'));
      return view.heading;
    }

    function openList() {
      closeView();
      var h = el('h1', 'figchat-h1', 'figchat');
      h.tabIndex = -1;
      main.replaceChildren(h, el('p', 'figchat-note', 'Pick a thread or start a new one.'));
      return h;
    }

    function route() {
      var rt = parseRoute(win.location.hash);
      var h;
      if (rt && rt.thread && view && view.id === rt.thread && !view.closed) return;
      if (rt && rt.thread) h = openThread(rt.thread);
      else if (rt && rt.fresh) h = openFresh();
      else h = openList();
      host.setAttribute('data-route', rt && rt.thread ? 'thread' : rt && rt.fresh ? 'fresh' : 'list');
      composer.hidden = !rt;
      if (!rt) cancelRecording();
      sendNote.replaceChildren();
      paintThreads();
      paintLink();
      win.scrollTo(0, 0);
      if (rt && rt.fresh) input.focus({ preventScroll: true });
      else h.focus({ preventScroll: true });
    }

    function say(text) {
      sendNote.replaceChildren();
      put(sendNote, text);
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

    function post(v, text, held) {
      v.sending = true;
      say('');
      paintLink();
      whenLive(v).then(function () { return transport.send(v.id, held ? { text: text, clip_id: held.id } : { text: text }); }).then(function (res) {
        v.sending = false;
        if (clip === held) clip = null;
        if (input.value.trim() === text) input.value = '';
        grow();
        paintMic();
        if (view !== v) return;
        if (!v.conv.get(res.id)) paintMessage(v, v.conv.add({ id: res.id, role: 'user', text: text, created: new Date(now()).toISOString(), audio_id: held ? held.id : '' }));
        paintLink();
        toBottom();
      }, function (err) { unsent(v, err); });
    }

    function submit() {
      var v = view, text = input.value.trim(), held = clip;
      if (!v || v.sending || !text) return;
      if (state.link === 'offline') { say('Offline. Reconnecting.'); return; }
      if (V) V.unlock(win);
      if (v.id) { post(v, text, held); return; }
      v.sending = true;
      paintLink();
      transport.createThread(titleFrom(text)).then(function (res) {
        if (view !== v) return;
        win.location.hash = routeFor(res.id);
        route();
        input.focus({ preventScroll: true });
        loadThreads();
        post(view, text, held);
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
      if (view && view.socket) view.socket.send({ type: 'cancel' });
    });
    on(voice, 'click', function () {
      if (V) V.unlock(win);
      state.voice = !state.voice;
      paintLink();
      if (view && view.socket) view.socket.send({ type: 'voice', on: state.voice });
      if (!state.voice && view) {
        var m = view.conv.binary();
        var node = m && view.nodes[key(m.id)];
        view.conv.audio = null;
        if (node && node.player) {
          node.player.stop();
          node.player.end('');
        }
      }
    });
    on(win, 'hashchange', route);
    on(doc, 'visibilitychange', function () { if (doc.visibilityState === 'visible') loadThreads(); });

    var api = {
      state: function () { return { threads: state.threads, voice: state.voice, link: state.link, thread: view ? view.id : null, mic: rec.state, clip: clip ? clip.id : null }; },
      player: function (id) {
        var node = view && view.nodes[key(id)];
        return node ? node.player : null;
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
    loadThreads();
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
    ago: ago,
    titleFrom: titleFrom,
    backoff: backoff
  };
}));
