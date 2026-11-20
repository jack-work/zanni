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
      return insert({ id: id, role: role || 'assistant', text: '', created: '', audio_id: '', tools: [], streaming: false, done: false, partial: true });
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
        var pending = role === 'assistant' && !text && !list.length && !raw.audio_id;
        if (m && !m.done && pending) { m.partial = true; return; }
        if (!m) m = insert({ id: raw.id, tools: [] });
        m.role = role;
        m.text = text;
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

    c.add = function (raw) {
      var m = byId[key(raw.id)] || insert({ id: raw.id, tools: [] });
      m.role = raw.role;
      m.text = raw.text;
      m.created = raw.created || '';
      m.audio_id = raw.audio_id || '';
      m.streaming = false;
      m.partial = false;
      m.done = true;
      return m;
    };

    c.apply = function (f) {
      if (!f || typeof f.type !== 'string') return null;
      var m, t;
      switch (f.type) {
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
          return { kind: 'error', message: m, code: String(f.code || 'error'), text: String(f.text || '') };
        case 'ping':
          return { kind: 'ping' };
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

    function call(method, path, body) {
      var init = { method: method, credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } };
      if (body !== undefined) {
        init.body = JSON.stringify(body);
        init.headers['Content-Type'] = 'application/json';
      }
      return doFetch(api + path, init).then(function (res) {
        return res.text().then(function (text) {
          var j = parseJSON(text);
          if (res.status >= 200 && res.status < 300 && j) return j;
          throw fault(res.status, j);
        });
      });
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
    var input = el('textarea', 'figchat-input');
    input.rows = 1;
    input.placeholder = 'Message';
    input.setAttribute('aria-label', 'Message');
    input.setAttribute('enterkeyhint', 'send');
    var send = el('button', 'figchat-send', 'Send');
    send.type = 'submit';
    var sendNote = el('p', 'figchat-sendnote');
    sendNote.setAttribute('role', 'status');
    composer.append(sendNote, input, send);
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
      node = v.nodes[k] = { li: li, bubble: bubble, text: text, tools: toolList, fault: faultLine, meta: meta, player: null };
      var anchor = null;
      for (var next = v.conv.next(m); next && !anchor; next = v.conv.next(next)) {
        if (v.nodes[key(next.id)]) anchor = v.nodes[key(next.id)].li;
      }
      v.log.insertBefore(li, anchor);
      return node;
    }

    function paintMessage(v, m) {
      var node = nodeFor(v, m);
      node.li.setAttribute('data-role', m.role);
      node.text.replaceChildren();
      put(node.text, m.text);
      paintTools(node, m);
      paintMeta(node, m);
      if (m.audio_id) {
        var p = playerFor(v, m);
        if (p && !p.audioId()) p.end(m.audio_id);
      }
      return node;
    }

    function paintMeta(node, m) {
      if (m.streaming) node.li.setAttribute('data-streaming', '');
      else node.li.removeAttribute('data-streaming');
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
      if (eff.kind === 'ping') { v.socket.send({ type: 'pong' }); return; }
      keep(function () {
        switch (eff.kind) {
          case 'message':
            paintMessage(v, m);
            break;
          case 'delta':
            node = nodeFor(v, m);
            put(node.text, eff.text);
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
              node.fault.replaceChildren();
              put(node.fault, (eff.code === 'speech' ? 'Speech failed: ' : 'Failed: ') + eff.text);
              node.fault.hidden = false;
            } else notice(v, 'Error: ' + eff.text);
            break;
        }
      });
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

    function post(v, text) {
      v.sending = true;
      say('');
      paintLink();
      whenLive(v).then(function () { return transport.send(v.id, { text: text }); }).then(function (res) {
        v.sending = false;
        if (view !== v) return;
        paintMessage(v, v.conv.add({ id: res.id, role: 'user', text: text, created: new Date(now()).toISOString() }));
        if (input.value.trim() === text) input.value = '';
        paintLink();
        toBottom();
      }, function (err) { unsent(v, err); });
    }

    function submit() {
      var v = view, text = input.value.trim();
      if (!v || v.sending || !text) return;
      if (V) V.unlock(win);
      if (v.id) { post(v, text); return; }
      v.sending = true;
      paintLink();
      transport.createThread(titleFrom(text)).then(function (res) {
        if (view !== v) return;
        win.location.hash = routeFor(res.id);
        route();
        input.focus({ preventScroll: true });
        loadThreads();
        post(view, text);
      }, function (err) { unsent(v, err); });
    }

    on(composer, 'submit', function (ev) {
      ev.preventDefault();
      submit();
    });
    on(input, 'keydown', function (ev) {
      if (ev.key !== 'Enter' || ev.shiftKey || ev.isComposing) return;
      if (win.matchMedia && win.matchMedia('(pointer: coarse)').matches) return;
      ev.preventDefault();
      submit();
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
      state: function () { return { threads: state.threads, voice: state.voice, link: state.link, thread: view ? view.id : null }; },
      player: function (id) {
        var node = view && view.nodes[key(id)];
        return node ? node.player : null;
      },
      detach: function () {
        destroyed = true;
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
    route();
    loadThreads();
    return api;
  }

  return {
    mount: mount,
    httpTransport: httpTransport,
    conversation: conversation,
    reveal: reveal,
    routeFor: routeFor,
    parseRoute: parseRoute,
    ago: ago,
    titleFrom: titleFrom,
    backoff: backoff
  };
}));
