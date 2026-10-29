'use strict';

(function () {
  var z = window.zanni;
  var app = document.getElementById('app');
  var ident = document.getElementById('ident');
  var chip = document.getElementById('pending-chip');

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  }

  function clear(n) {
    while (n.firstChild) n.removeChild(n.firstChild);
  }

  function api(method, path, body) {
    var init = { method: method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    return fetch('/api' + path, init).then(function (r) {
      return r.text().then(function (t) {
        var data = null;
        try { data = t ? JSON.parse(t) : null; } catch (e) { data = null; }
        if (!r.ok) {
          var err = new Error((data && data.error) || ('spain answered ' + r.status));
          err.status = r.status;
          throw err;
        }
        return data;
      });
    });
  }

  function seg(s) {
    return encodeURIComponent(s);
  }

  function ago(s) {
    s = Math.max(0, Math.round(s));
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.round(s / 60) + 'm ago';
    if (s < 86400) return Math.round(s / 3600) + 'h ago';
    return Math.round(s / 86400) + 'd ago';
  }

  function showError(where, err) {
    where.appendChild(el('p', 'g-error', err && err.message ? err.message : 'something went wrong'));
  }

  function setHeader(principal, pendingCount) {
    ident.textContent = principal ? principal.edge_name : '';
    chip.hidden = !pendingCount;
    chip.textContent = pendingCount ? pendingCount + ' pending' : '';
  }

  function who(principal, asks) {
    var box = el('section', 'g-who');
    box.appendChild(el('div', 'g-kind', principal.kind));
    box.appendChild(el('h1', 'g-name', principal.edge_name));
    box.appendChild(el('div', 'g-id', principal.id));
    if (asks) box.appendChild(el('p', 'g-asks', asks));
    return box;
  }

  function sealSheet(title, review, done) {
    z.sigillo.open({
      title: title,
      lines: review.receipt_lines,
      digest: review.digest,
      note: 'These lines come from spain, not from this page. Your passkey signs their digest.',
      seal: function () {
        return z.sigillo.assert(review.publicKey).then(function (assertion) {
          return api('POST', '/reviews/' + seg(review.review_id) + '/seal', assertion);
        }).catch(function (err) {
          if (err && err.name === 'NotAllowedError') throw new Error('The passkey was not used. Nothing was signed.');
          if (err && (err.status === 409 || err.status === 410)) throw new Error('This review went stale. Go back and review again.');
          throw err;
        });
      },
      onclose: function (state) { if (state === 'sealed') done(); }
    });
  }

  function renderPrincipal(where, data, currentRequest) {
    var live = data.live || [];
    var pending = data.pending || [];
    var name = data.principal.edge_name;

    where.appendChild(el('h2', 'g-section')).appendChild(document.createTextNode('live'));
    where.lastChild.appendChild(el('span', null, live.length));
    if (!live.length) where.appendChild(el('p', 'g-quiet', name + ' holds no live grants.'));
    live.forEach(function (g) {
      var row = el('article', 'g-live');
      row.setAttribute('data-grant', g.id);
      var dial = el('span');
      row.appendChild(dial);
      z.clessidra.attach(dial, { remaining_s: g.remaining_s, total_s: g.total_s });
      dial.addEventListener('clessidra:spent', function () { row.classList.add('g-spent'); });
      var text = el('div');
      text.appendChild(el('div', 'g-live-summary', g.summary || g.resource));
      var scope = el('div', 'g-live-scope');
      (g.actions || []).forEach(function (a) { scope.appendChild(el('span', 'g-act', a)); });
      scope.appendChild(el('span', 'g-res', g.resource));
      if (g.path) scope.appendChild(el('span', 'g-path', g.path));
      text.appendChild(scope);
      row.appendChild(text);
      var revoke = el('button', 'g-button g-small', 'revoke');
      revoke.type = 'button';
      revoke.setAttribute('aria-label', 'revoke: ' + (g.summary || g.resource));
      revoke.addEventListener('click', function () {
        revoke.disabled = true;
        api('POST', '/grants/' + seg(g.id) + '/revoke').then(function (review) {
          revoke.disabled = false;
          sealSheet('You are about to revoke', review, function () { route('revoked ' + (g.summary || g.resource)); });
        }, function (err) {
          revoke.disabled = false;
          showError(row, err);
        });
      });
      row.appendChild(revoke);
      where.appendChild(row);
    });

    where.appendChild(el('h2', 'g-section')).appendChild(document.createTextNode('pending'));
    where.lastChild.appendChild(el('span', null, pending.length));
    pending.forEach(function (p) {
      var row = el('div', 'g-pending');
      row.appendChild(el('span', null, p.id + ' · ' + p.items + (p.items === 1 ? ' item' : ' items') + ' · ' + ago(p.age_s)));
      if (p.id === currentRequest) {
        row.setAttribute('aria-current', 'page');
        row.appendChild(el('span', null, 'above'));
      } else {
        var a = el('a', null, 'open');
        a.href = '/r/' + seg(p.id);
        row.appendChild(a);
      }
      where.appendChild(row);
    });
    if (data.limit && data.limit.open_max) {
      where.appendChild(el('p', 'g-limit', name + ' may hold ' + data.limit.open_max +
        ' open requests; more wait on its side, not here.'));
    }
  }

  function renderRequest(req, banner) {
    clear(app);
    var principal = req.principal;
    if (banner) app.appendChild(el('p', 'g-banner', banner));
    app.appendChild(who(principal, req.state === 'pending' ? 'wants permission to' : null));

    if (req.state !== 'pending') {
      app.appendChild(el('p', 'g-banner g-banner-off', 'request ' + req.id + ' is ' + req.state));
      return principalBelow(principal, req.id);
    }

    if (req.note) {
      var note = el('p', 'g-note');
      note.appendChild(el('b', null, principal.edge_name + ' says'));
      note.appendChild(document.createTextNode(' ' + req.note));
      app.appendChild(note);
    }

    var suggested = req.suggested || [];
    var cards = [];
    var list = el('div', 'g-items');
    (req.items || []).forEach(function (item) {
      var c = z.licenza.create({
        item: item,
        says: principal.edge_name + ' says',
        widen: suggested.filter(function (s) { return s.widens === item.id; })
      });
      cards.push(c);
      list.appendChild(c.el);
    });
    app.appendChild(list);

    var loose = suggested.filter(function (s) { return !s.widens; });
    var extras = [];
    if (loose.length) {
      var sec = el('section', 'g-suggested');
      var head = el('h2', 'g-section', 'suggested');
      head.appendChild(el('span', 'g-suggested-why', 'by a model, not asked by ' + principal.edge_name));
      sec.appendChild(head);
      var more = el('div', 'g-items');
      loose.forEach(function (s) {
        var c = z.licenza.create({ item: s, suggested: true, says: 'because' });
        extras.push(c);
        more.appendChild(c.el);
      });
      sec.appendChild(more);
      app.appendChild(sec);
    }

    var foot = el('div', 'g-foot');
    var row = el('div', 'g-foot-row');
    var deny = el('button', 'g-button', 'deny all');
    deny.type = 'button';
    var review = el('button', 'g-button g-review');
    review.type = 'button';
    row.appendChild(deny);
    row.appendChild(review);
    foot.appendChild(row);
    app.appendChild(foot);

    function count() {
      var all = cards.concat(extras.filter(function (c) { return c.state().added; }));
      var done = all.filter(function (c) { return c.state().answered; }).length;
      review.disabled = done < all.length;
      review.textContent = 'review ' + done + ' of ' + all.length;
    }

    function draft() {
      var widened = {};
      var items = cards.map(function (c) {
        var s = c.state();
        s.widen.forEach(function (id) { widened[id] = s; });
        return { item_id: s.item_id, verdict: s.verdict, duration_s: s.duration_s, actions: s.actions };
      });
      var extra = [];
      Object.keys(widened).forEach(function (id) {
        extra.push({ suggestion_id: id, verdict: 'yes', duration_s: widened[id].duration_s });
      });
      extras.forEach(function (c) {
        var s = c.state();
        if (s.added) extra.push({ suggestion_id: s.item_id, verdict: s.verdict, duration_s: s.duration_s, actions: s.actions });
      });
      return { items: items, extra: extra };
    }

    app.addEventListener('licenza:change', count);
    deny.addEventListener('click', function () {
      cards.concat(extras).forEach(function (c) { c.deny(); });
    });
    review.addEventListener('click', function () {
      review.disabled = true;
      api('POST', '/requests/' + seg(req.id) + '/review', draft()).then(function (r) {
        count();
        sealSheet('You are about to sign', r, function () { route('sealed ' + req.id); });
      }, function (err) {
        count();
        showError(app, err);
      });
    });
    count();

    return principalBelow(principal, req.id);
  }

  function principalBelow(principal, rid) {
    var below = el('section', 'g-principal');
    app.appendChild(below);
    return api('GET', '/principals/' + seg(principal.id)).then(function (p) {
      setHeader(p.principal, (p.pending || []).length);
      renderPrincipal(below, p, rid);
    });
  }

  function renderPrincipalPage(pid, banner) {
    return api('GET', '/principals/' + seg(pid)).then(function (p) {
      clear(app);
      setHeader(p.principal, (p.pending || []).length);
      if (banner) app.appendChild(el('p', 'g-banner', banner));
      app.appendChild(who(p.principal, null));
      var sec = el('section', 'g-principal');
      app.appendChild(sec);
      renderPrincipal(sec, p, null);
    });
  }

  var lastPrincipal = null;

  function route(banner) {
    var parts = location.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    var job;
    if (parts[0] === 'r' && parts[1]) {
      job = api('GET', '/requests/' + seg(parts[1])).then(function (req) {
        lastPrincipal = req.principal.id;
        setHeader(req.principal, 0);
        if (banner && req.state !== 'pending') return renderPrincipalPage(req.principal.id, banner);
        return renderRequest(req, banner);
      });
    } else if (parts[0] === 'p' && parts[1]) {
      lastPrincipal = parts[1];
      job = renderPrincipalPage(parts[1], banner);
    } else {
      clear(app);
      app.appendChild(el('p', 'g-quiet', 'Open a link from herald to answer a request.'));
      job = Promise.resolve();
    }
    return job.catch(function (err) {
      clear(app);
      showError(app, err);
    });
  }

  window.grants = { route: route, principal: function () { return lastPrincipal; } };
  route();
}());
