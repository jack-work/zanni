(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.zanni = root.zanni || {};
    root.zanni.placet = api;
    root.placet = api;
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb]/;
  var CONTROL_ALL = new RegExp(CONTROL.source, 'g');

  function reveal(text) {
    var s = String(text == null ? '' : text), parts = [], last = 0, m;
    CONTROL_ALL.lastIndex = 0;
    while ((m = CONTROL_ALL.exec(s))) {
      if (m.index > last) parts.push({ plain: s.slice(last, m.index) });
      parts.push({ mark: 'U+' + ('0000' + m[0].charCodeAt(0).toString(16).toUpperCase()).slice(-4) });
      last = m.index + 1;
    }
    if (last < s.length) parts.push({ plain: s.slice(last) });
    return parts;
  }

  function expiryOf(req) {
    var t = Date.parse(req && req.expires);
    return isNaN(t) ? NaN : t;
  }

  function relative(ms, nowMs) {
    var d = ms - nowMs;
    if (d <= 0) return 'expired';
    if (d < 60000) return 'expires in under a minute';
    if (d < 5400000) return 'expires in ' + Math.round(d / 60000) + ' min';
    if (d < 172800000) return 'expires in ' + Math.round(d / 3600000) + ' h';
    return 'expires in ' + Math.round(d / 86400000) + ' d';
  }

  function age(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return s + ' s';
    if (s < 3600) return Math.round(s / 60) + ' min';
    return Math.round(s / 3600) + ' h';
  }

  function keyOf(req) { return req.filing + '\u0000' + req.id; }

  function sortRequests(list) {
    return list.slice().sort(function (a, b) {
      var x = expiryOf(a), y = expiryOf(b);
      if (isNaN(x) !== isNaN(y)) return isNaN(x) ? 1 : -1;
      if (x !== y && !isNaN(x)) return x - y;
      return keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0;
    });
  }

  function stateWord(req) {
    if (req.refusal) return 'deny only';
    if (req.applied) return 'already applied';
    return 'ready';
  }

  function routeFor(filing, id) {
    return '#/r/' + encodeURIComponent(filing) + '/' + encodeURIComponent(id);
  }

  function parseRoute(hash) {
    var m = /^#\/r\/([^/]+)\/([^/]+)$/.exec(hash || '');
    if (!m) return null;
    try { return { filing: decodeURIComponent(m[1]), id: decodeURIComponent(m[2]) }; } catch (e) { return null; }
  }

  function parseJSON(text) {
    try { return { ok: true, value: JSON.parse(text) }; } catch (e) { return { ok: false }; }
  }

  function delta(line) {
    if (line.op !== 'set' || line.current == null) return '';
    var a = parseJSON(line.current), b = parseJSON(line.new);
    if (!a.ok || !b.ok) return '';
    if (typeof a.value === 'number' && typeof b.value === 'number') return a.value + ' to ' + b.value;
    if (Array.isArray(a.value) && Array.isArray(b.value)) {
      var seen = function (v, x) { return v.some(function (y) { return JSON.stringify(y) === JSON.stringify(x); }); };
      var add = b.value.filter(function (x) { return !seen(a.value, x); });
      var drop = a.value.filter(function (x) { return !seen(b.value, x); });
      if (!add.length && !drop.length) return 'no change';
      var out = [];
      if (add.length) out.push('adds ' + add.map(function (x) { return JSON.stringify(x); }).join(', '));
      if (drop.length) out.push('removes ' + drop.map(function (x) { return JSON.stringify(x); }).join(', '));
      return out.join('; ');
    }
    return '';
  }

  function patchSignature(req) {
    return JSON.stringify([req.hash, req.refusal || '', !!req.applied, !!req.at_succession, req.reason || '', req.raw || '', req.expires || '', req.lines || []]);
  }

  function mount(host, opts) {
    if (!host || host.placet) throw new Error('placet needs an unused host');
    opts = opts || {};
    var doc = host.ownerDocument, win = doc.defaultView;
    var base = (opts.base || host.getAttribute('data-api') || '/api/v1').replace(/\/$/, '');
    var doFetch = opts.fetch || function (u, o) { return win.fetch(u, o); };
    var now = opts.now || function () { return Date.now(); };
    var pollMs = opts.poll || 3000;
    var state = { loaded: false, error: '', requests: [], admin: '', seenAt: 0, failures: 0, sig: '' };
    var detail = null;
    var timers = { poll: 0, tick: 0 };
    var listeners = [];
    var destroyed = false, inflight = false;

    function put(n, s) {
      reveal(s).forEach(function (p) {
        if (p.mark) {
          var c = doc.createElement('span');
          c.className = 'placet-ctl';
          c.textContent = p.mark;
          n.appendChild(c);
        } else n.appendChild(doc.createTextNode(p.plain));
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

    var bar = el('header', 'placet-top');
    var mark = el('a', 'placet-mark');
    mark.href = '#/';
    var head = doc.createElement('img');
    head.className = 'placet-head';
    head.alt = '';
    head.src = opts.mark || host.getAttribute('data-mark') || 'figaro-head.png';
    mark.append(head, el('span', 'placet-title', 'Approvals'));
    var live = el('p', 'placet-live');
    var liveWord = el('span', 'placet-state', 'Connecting');
    liveWord.setAttribute('role', 'status');
    var liveAge = el('span', 'placet-age');
    live.append(liveWord, liveAge);
    bar.append(mark, live);

    var main = el('main', 'placet-main');
    main.tabIndex = -1;
    var foot = el('footer', 'placet-foot');
    host.classList.add('placet');
    host.replaceChildren(bar, main, foot);

    function setTitle() {
      var n = state.requests.length;
      doc.title = (n ? '(' + n + ') ' : '') + 'Approvals';
    }

    function liveState() {
      if (!state.loaded && !state.error) return 'loading';
      if (state.error) return 'stale';
      return 'live';
    }

    function paintLive() {
      var s = liveState();
      host.setAttribute('data-state', s);
      var word = s === 'live' ? 'Live' : s === 'loading' ? 'Connecting' : (state.loaded ? 'Offline' : 'Unavailable');
      if (liveWord.textContent !== word) liveWord.textContent = word;
      liveAge.textContent = s === 'stale' && state.seenAt ? 'last seen ' + age(now() - state.seenAt) + ' ago' : state.admin ? 'signed in as ' + state.admin : '';
      host.classList.toggle('placet-stale', s === 'stale');
      var disabled = s !== 'live';
      Array.prototype.forEach.call(foot.querySelectorAll('button[data-act]'), function (b) { b.disabled = disabled || !!(detail && detail.busy) || !!(detail && detail.changed && b.dataset.act === 'approve'); });
      Array.prototype.forEach.call(main.querySelectorAll('[data-expires]'), function (n) {
        var t = Number(n.getAttribute('data-expires'));
        var text = relative(t, now());
        if (n.textContent !== text) n.textContent = text;
        n.classList.toggle('placet-soon', t - now() < 3600000);
      });
    }

    function findReq() {
      if (!detail) return null;
      for (var i = 0; i < state.requests.length; i++) {
        if (state.requests[i].filing === detail.filing && state.requests[i].id === detail.id) return state.requests[i];
      }
      return null;
    }

    function renderList() {
      detail = null;
      foot.replaceChildren();
      foot.hidden = true;
      var h = el('h1', 'placet-h1', 'Waiting for you');
      h.tabIndex = -1;
      var out = [h];
      if (!state.loaded) {
        out.push(el('p', 'placet-note', state.error ? 'Could not load requests: ' + state.error : 'Loading requests.'));
        if (state.error) {
          var retry = el('button', 'placet-button', 'Try again');
          retry.type = 'button';
          on(retry, 'click', function () { poll(true); });
          out.push(retry);
        }
      } else if (!state.requests.length) {
        out.push(el('p', 'placet-empty', 'Nothing waiting.'));
        out.push(el('p', 'placet-note', 'Checked at ' + new Date(state.seenAt).toLocaleTimeString() + '.'));
      } else {
        var ul = el('ul', 'placet-rows');
        sortRequests(state.requests).forEach(function (r) { ul.appendChild(rowFor(r)); });
        out.push(ul);
      }
      main.replaceChildren.apply(main, out);
      setTitle();
      paintLive();
      return h;
    }

    function label(r, which) {
      var name = which === 'filer' ? r.filer_name : r.target_name;
      var id = which === 'filer' ? r.filing : r.target;
      return name ? name : id;
    }

    function sentence(r) {
      var s = el('span', 'placet-sentence');
      s.append(el('span', 'placet-who', label(r, 'filer') || 'unknown filer'), doc.createTextNode(' asks: '), el('span', 'placet-verb', r.verb || 'unknown request'));
      if (r.target) {
        s.append(doc.createTextNode(' on '), el('span', 'placet-who', label(r, 'target')));
      }
      return s;
    }

    function firstSet(r) {
      var lines = r.lines || [];
      for (var i = 0; i < lines.length; i++) if (lines[i].op === 'set') return lines[i];
      return null;
    }

    function rowFor(r) {
      var li = el('li', 'placet-row');
      var a = el('a', 'placet-link');
      a.href = routeFor(r.filing, r.id);
      a.setAttribute('data-state', r.refusal ? 'refused' : r.applied ? 'applied' : 'ready');
      a.appendChild(sentence(r));
      var meta = el('span', 'placet-meta');
      var set = firstSet(r);
      if (set) {
        var pv = el('span', 'placet-preview');
        pv.append(el('code', 'placet-code', set.key), doc.createTextNode(' '), el('code', 'placet-code placet-new', set.new));
        meta.appendChild(pv);
      }
      meta.appendChild(el('span', 'placet-word', stateWord(r)));
      var t = expiryOf(r);
      if (!isNaN(t)) {
        var ex = el('span', 'placet-expiry', relative(t, now()));
        ex.setAttribute('data-expires', String(t));
        meta.appendChild(ex);
      }
      a.appendChild(meta);
      li.appendChild(a);
      return li;
    }

    function patchLine(line, id) {
      var li = el('li', 'placet-line placet-' + (line.op === 'remove' ? 'remove' : 'set'));
      var top = el('div', 'placet-line-top');
      top.append(el('span', 'placet-op', line.op), el('code', 'placet-code placet-key', line.key));
      if (line.op === 'set') top.append(el('span', 'placet-eq', '='));
      li.appendChild(top);
      if (line.op === 'set') {
        li.appendChild(el('code', 'placet-code placet-new placet-value', line.new));
        var now_ = el('div', 'placet-now');
        if (line.current == null) now_.append(el('span', 'placet-was-label', 'now'), el('span', 'placet-unset', 'not set'));
        else now_.append(el('span', 'placet-was-label', 'now'), el('code', 'placet-code placet-was', line.current));
        li.appendChild(now_);
        var d = delta(line);
        if (d) li.appendChild(el('div', 'placet-delta', d));
      } else if (line.key === 'elicit.' + id) {
        li.appendChild(el('div', 'placet-delta', 'closes this request'));
      }
      return li;
    }

    function renderDetail(shown, keepFocus) {
      var r = shown;
      var back = el('a', 'placet-back', 'All requests');
      back.href = '#/';
      var h = el('h1', 'placet-h1');
      h.tabIndex = -1;
      h.appendChild(sentence(r));
      var meta = el('p', 'placet-facts');
      meta.append(el('span', null, 'request '), el('code', 'placet-code', r.id), el('span', null, ' on '), el('code', 'placet-code', r.filing), el('span', null, ' at version ' + r.version));
      var out = [back, h, meta];
      var t = expiryOf(r);
      if (!isNaN(t)) {
        var line = el('p', 'placet-facts');
        var ex = el('span', 'placet-expiry', relative(t, now()));
        ex.setAttribute('data-expires', String(t));
        line.append(ex, el('span', 'placet-abs', ' · ' + new Date(t).toLocaleString()));
        out.push(line);
      }
      if (detail.changed) {
        var ch = el('div', 'placet-banner placet-changed');
        ch.setAttribute('role', 'alert');
        ch.appendChild(el('p', null, 'This request changed since you opened it. The patch below is the new one. Read it before approving.'));
        var ack = el('button', 'placet-button', 'I have read the new patch');
        ack.type = 'button';
        on(ack, 'click', function () { detail.changed = false; renderDetail(detail.shown); });
        ch.appendChild(ack);
        out.push(ch);
      }
      if (r.refusal) out.push(el('p', 'placet-banner placet-refusal', 'Deny only: ' + r.refusal));
      out.push(el('h2', 'placet-h2', 'The exact patch'));
      var ol = el('ol', 'placet-patch');
      (r.lines || []).forEach(function (l) { ol.appendChild(patchLine(l, r.id)); });
      out.push(ol);
      if (r.at_succession) out.push(el('p', 'placet-note', 'Takes effect at the next succession.'));
      if (r.applied) out.push(el('p', 'placet-note', 'Already applied: approving only removes the request.'));
      var hd = el('details', 'placet-hash');
      var sm = el('summary');
      sm.append(el('span', null, 'sha256 '), el('strong', 'placet-code', (r.hash || '').slice(0, 12)));
      hd.append(sm, el('code', 'placet-code placet-full', r.hash || ''));
      out.push(hd);
      if (r.reason) {
        var q = el('blockquote', 'placet-quote');
        q.append(el('p', 'placet-quote-label', 'Filer\u2019s reason, unverified'), el('p', 'placet-quote-body', r.reason));
        out.push(q);
      }
      if (r.raw) {
        var rd = el('details', 'placet-rawbox');
        rd.append(el('summary', null, 'Filer\u2019s raw request, unverified'), el('pre', 'placet-raw', r.raw));
        out.push(rd);
      }
      main.replaceChildren.apply(main, out);
      renderBar(r);
      setTitle();
      paintLive();
      if (!keepFocus) h.focus({ preventScroll: true });
      return h;
    }

    function renderBar(r) {
      foot.replaceChildren();
      foot.hidden = false;
      var result = el('p', 'placet-result');
      result.setAttribute('role', 'status');
      result.setAttribute('aria-live', 'polite');
      var row = el('div', 'placet-actions');
      row.setAttribute('role', 'group');
      row.setAttribute('aria-label', 'Decision');
      if (!r.refusal) {
        var yes = el('button', 'placet-approve', 'Approve');
        yes.type = 'button';
        yes.setAttribute('data-act', 'approve');
        on(yes, 'click', function () { decide('approve'); });
        row.appendChild(yes);
      } else {
        put(result, 'Approve is unavailable: ' + r.refusal);
      }
      var no = el('button', 'placet-deny', 'Deny');
      no.type = 'button';
      no.setAttribute('data-act', 'deny');
      on(no, 'click', function () { decide('deny'); });
      row.appendChild(no);
      foot.append(result, row);
      detail.result = result;
    }

    function renderGone() {
      foot.replaceChildren();
      foot.hidden = true;
      var back = el('a', 'placet-back', 'All requests');
      back.href = '#/';
      var h = el('h1', 'placet-h1', 'This request is gone');
      h.tabIndex = -1;
      main.replaceChildren(back, h, el('p', 'placet-note', 'It was decided, withdrawn or expired. Nothing more to do here.'));
      setTitle();
      paintLive();
      return h;
    }

    function finish(message, tone, keepBar) {
      var back = el('a', 'placet-button placet-linkbutton', 'Back to requests');
      back.href = '#/';
      detail.result.className = 'placet-result placet-' + tone;
      detail.result.replaceChildren();
      put(detail.result, message);
      if (!keepBar) {
        Array.prototype.forEach.call(foot.querySelectorAll('.placet-actions'), function (n) { n.remove(); });
        foot.appendChild(back);
      }
    }

    function decide(kind) {
      if (!detail || detail.busy || liveState() !== 'live') return;
      var shown = detail.shown, d = detail;
      d.busy = true;
      d.result.className = 'placet-result';
      d.result.replaceChildren();
      put(d.result, kind === 'approve' ? 'Approving.' : 'Denying.');
      paintLive();
      var url = base + '/requests/' + encodeURIComponent(shown.filing) + '/' + encodeURIComponent(shown.id) + '/' + kind;
      var body = JSON.stringify({ hash: shown.hash, version: shown.version, token: shown.token });
      call('POST', url, body).then(function (res) {
        d.busy = false;
        if (detail !== d) return;
        var j = res.json || {};
        if (res.status === 200) {
          state.requests = state.requests.filter(function (x) { return keyOf(x) !== keyOf(shown); });
          finish((kind === 'approve' ? 'Approved. ' : 'Denied. ') + (j.result || ''), 'ok');
          setTitle();
        } else if (res.status === 409) {
          finish('Refused: ' + (j.error || j.result || 'the request changed') + (j.result && j.error ? ' (' + j.result + ')' : ''), 'warn', true);
          poll(true);
        } else if (res.status === 403) {
          finish('This page is stale or the session ended. Reload it, nothing was changed.', 'warn', true);
        } else {
          finish('Not sent: ' + (j.error || ('HTTP ' + res.status)) + '. Nothing was changed.', 'warn', true);
        }
        paintLive();
      }, function (err) {
        d.busy = false;
        if (detail !== d) return;
        finish('No answer from the server (' + (err && err.message ? err.message : 'network') + '). Check the list before trying again.', 'warn', true);
        poll(true);
        paintLive();
      });
    }

    function call(method, url, body) {
      var ctl = typeof win.AbortController === 'function' ? new win.AbortController() : null;
      var timer = ctl ? win.setTimeout(function () { ctl.abort(); }, 10000) : 0;
      var init = { method: method, credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } };
      if (body != null) {
        init.body = body;
        init.headers['Content-Type'] = 'application/json';
      }
      if (ctl) init.signal = ctl.signal;
      return doFetch(url, init).then(function (res) {
        win.clearTimeout(timer);
        return res.text().then(function (text) {
          var j = parseJSON(text);
          return { status: res.status, json: j.ok ? j.value : null };
        });
      }, function (e) { win.clearTimeout(timer); throw e; });
    }

    function route() {
      var rt = parseRoute(win.location.hash);
      var h;
      if (!rt) h = renderList();
      else {
        detail = { filing: rt.filing, id: rt.id, busy: false, changed: false, shown: null, result: null };
        var r = findReq();
        if (r) {
          detail.shown = r;
          h = renderDetail(r);
        } else if (state.loaded) h = renderGone();
        else {
          h = el('h1', 'placet-h1', 'Loading request');
          h.tabIndex = -1;
          main.replaceChildren(h);
          foot.hidden = true;
        }
      }
      win.scrollTo(0, 0);
      if (h) h.focus({ preventScroll: true });
    }

    function apply(payload) {
      var list = Array.isArray(payload && payload.requests) ? payload.requests.filter(function (r) { return r && typeof r.filing === 'string' && typeof r.id === 'string'; }) : null;
      if (!list) throw new Error('unexpected answer');
      var sig = JSON.stringify(list);
      var first = !state.loaded;
      state.loaded = true;
      state.error = '';
      state.failures = 0;
      state.seenAt = now();
      state.admin = typeof payload.admin === 'string' ? payload.admin : '';
      if (sig === state.sig && !first) { paintLive(); return; }
      state.sig = sig;
      state.requests = list;
      if (!detail) { renderList(); return; }
      if (detail.busy) return;
      var r = findReq();
      if (!r) {
        if (detail.result && detail.result.className.indexOf('placet-ok') >= 0) return;
        renderGone();
        return;
      }
      if (!detail.shown) { detail.shown = r; renderDetail(r); return; }
      if (patchSignature(r) !== patchSignature(detail.shown)) {
        detail.changed = true;
        detail.shown = r;
        renderDetail(r, true);
        return;
      }
      detail.shown = Object.assign({}, detail.shown, { version: r.version, token: r.token });
      paintLive();
    }

    function poll(immediate) {
      if (destroyed) return;
      win.clearTimeout(timers.poll);
      if (inflight) return;
      var go = function () {
        inflight = true;
        call('GET', base + '/requests').then(function (res) {
          inflight = false;
          if (res.status !== 200) throw new Error(res.json && res.json.error ? res.json.error : 'HTTP ' + res.status);
          apply(res.json);
        }).catch(function (e) {
          inflight = false;
          state.failures++;
          state.error = e && e.message ? e.message : 'network';
          if (!state.loaded && !detail) renderList();
          paintLive();
        }).then(function () {
          if (destroyed) return;
          var hidden = doc.visibilityState === 'hidden';
          var wait = hidden ? 15000 : Math.min(15000, pollMs * Math.pow(2, Math.min(state.failures, 3)));
          timers.poll = win.setTimeout(function () { poll(false); }, wait);
        });
      };
      go();
    }

    on(win, 'hashchange', route);
    on(doc, 'visibilitychange', function () { if (doc.visibilityState === 'visible') poll(true); });
    on(win, 'online', function () { poll(true); });
    on(win, 'focus', function () { poll(true); });
    timers.tick = win.setInterval(paintLive, 5000);

    var api = {
      refresh: function () { poll(true); },
      state: function () { return state; },
      detach: function () {
        destroyed = true;
        win.clearTimeout(timers.poll);
        win.clearInterval(timers.tick);
        listeners.forEach(function (off) { off(); });
        host.replaceChildren();
        host.classList.remove('placet');
        host.removeAttribute('data-state');
        delete host.placet;
      }
    };
    host.placet = api;
    route();
    poll(true);
    return api;
  }

  return {
    mount: mount,
    reveal: reveal,
    relative: relative,
    sortRequests: sortRequests,
    stateWord: stateWord,
    delta: delta,
    routeFor: routeFor,
    parseRoute: parseRoute,
    patchSignature: patchSignature
  };
}));
