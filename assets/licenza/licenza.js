'use strict';

(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.zanni = root.zanni || {};
    root.zanni.licenza = api;
  }
}(typeof self !== 'undefined' ? self : this, function () {

  var LENGTHS = [
    { label: '15m', s: 900 },
    { label: '1h', s: 3600 },
    { label: '1d', s: 86400 },
    { label: '1w', s: 604800 }
  ];
  var LOUD = ['admin', 'delete', 'send', 'write'];

  function modality() {
    var html = document.documentElement;
    if (html.hasAttribute('data-zanni-modality')) return;
    html.setAttribute('data-zanni-modality', '');
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) html.classList.add('zanni-pointing');
    document.addEventListener('pointerdown', function () { html.classList.add('zanni-pointing'); }, true);
    document.addEventListener('keydown', function () { html.classList.remove('zanni-pointing'); }, true);
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  }

  function scope(item, chips) {
    var row = el('div', 'licenza-scope');
    chips.forEach(function (c) { row.appendChild(c); });
    if (item.resource) row.appendChild(el('span', 'licenza-resource', item.resource));
    if (item.path) row.appendChild(el('span', 'licenza-path', item.path));
    return row;
  }

  function chip(action, loud) {
    var c = el('span', 'licenza-chip', action);
    if (loud.indexOf(action) >= 0) c.classList.add('licenza-loud');
    return c;
  }

  function create(opts) {
    modality();
    var item = opts.item;
    var loud = opts.loud || LOUD;
    var actions = (item.actions || []).slice();
    var lengths = (opts.lengths || LENGTHS).filter(function (l) {
      return !item.max_duration_s || l.s <= item.max_duration_s;
    });
    var widen = opts.widen || [];
    var st = {
      item_id: item.id,
      verdict: null,
      duration_s: null,
      actions: actions.slice(),
      widen: [],
      added: !opts.suggested
    };

    var root = el('article', 'licenza');
    root.setAttribute('data-item', item.id);
    if (opts.suggested) root.classList.add('licenza-suggested');

    var sum = el('h3', 'licenza-summary', item.summary || item.resource);
    root.appendChild(sum);

    var chipEls = actions.map(function (a) {
      var c = chip(a, loud);
      if (actions.length > 1) {
        var b = el('button', c.className, a);
        b.type = 'button';
        b.setAttribute('aria-pressed', 'true');
        b.setAttribute('aria-label', a + ', included');
        b.addEventListener('click', function () { toggleAction(a, b); });
        return b;
      }
      return c;
    });
    root.appendChild(scope(item, chipEls));

    if (item.why) {
      var why = el('p', 'licenza-why');
      why.appendChild(el('span', 'licenza-says', opts.says || ''));
      why.appendChild(document.createTextNode(' '));
      why.appendChild(el('span', 'licenza-reason', item.why));
      root.appendChild(why);
    }

    var add = null;
    if (opts.suggested) {
      add = el('button', 'licenza-add', opts.addLabel || 'add to this answer');
      add.type = 'button';
      add.addEventListener('click', function () { setAdded(!st.added); });
      root.appendChild(add);
    }

    var answer = el('div', 'licenza-answer');
    answer.setAttribute('role', 'radiogroup');
    answer.setAttribute('aria-label', 'answer: ' + (item.summary || item.resource));
    var choices = [{ label: 'no', value: 'no' }].concat(lengths.map(function (l) {
      return { label: l.label, value: l.s };
    }));
    var buttons = choices.map(function (c, i) {
      var b = el('button', 'licenza-choice', c.label);
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', 'false');
      b.tabIndex = i === 0 ? 0 : -1;
      if (c.value === 'no') b.classList.add('licenza-no');
      else b.setAttribute('aria-label', 'yes for ' + c.label);
      b.addEventListener('click', function () { choose(i, false); });
      b.addEventListener('keydown', function (e) {
        var step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (!step) return;
        e.preventDefault();
        choose((i + step + choices.length) % choices.length, true);
      });
      answer.appendChild(b);
      return b;
    });
    root.appendChild(answer);

    var widenBox = null;
    if (widen.length) {
      widenBox = el('fieldset', 'licenza-widen');
      widenBox.appendChild(el('legend', 'licenza-widen-head', opts.widenLabel || 'widen'));
      widen.forEach(function (w) {
        var label = el('label', 'licenza-widen-item');
        var box = el('input');
        box.type = 'checkbox';
        box.value = w.id;
        box.addEventListener('change', function () {
          st.widen = st.widen.filter(function (id) { return id !== w.id; });
          if (box.checked) st.widen.push(w.id);
          changed();
        });
        label.appendChild(box);
        var text = el('span', 'licenza-widen-text');
        (w.actions || []).forEach(function (a) { text.appendChild(chip(a, loud)); });
        text.appendChild(el('span', 'licenza-widen-summary', w.summary));
        if (w.path && w.path !== item.path) text.appendChild(el('span', 'licenza-path', w.path));
        label.appendChild(text);
        widenBox.appendChild(label);
      });
      root.appendChild(widenBox);
    }

    function toggleAction(a, b) {
      var on = st.actions.indexOf(a) >= 0;
      if (on && st.actions.length === 1) return;
      st.actions = on ? st.actions.filter(function (x) { return x !== a; }) : actions.filter(function (x) {
        return x === a || st.actions.indexOf(x) >= 0;
      });
      b.setAttribute('aria-pressed', on ? 'false' : 'true');
      b.setAttribute('aria-label', a + (on ? ', left out' : ', included'));
      changed();
    }

    function choose(i, focus) {
      var c = choices[i];
      st.verdict = c.value === 'no' ? 'no' : 'yes';
      st.duration_s = c.value === 'no' ? null : c.value;
      paint();
      if (focus) buttons[i].focus();
      changed();
    }

    function setAdded(on) {
      st.added = on;
      if (!on) {
        st.verdict = null;
        st.duration_s = null;
      }
      paint();
      changed();
    }

    function paint() {
      var at = st.verdict === 'no' ? 0 : st.verdict === 'yes' ? choices.map(function (c) { return c.value; }).indexOf(st.duration_s) : -1;
      buttons.forEach(function (b, i) {
        b.setAttribute('aria-checked', i === at ? 'true' : 'false');
        b.tabIndex = i === (at < 0 ? 0 : at) ? 0 : -1;
      });
      root.classList.toggle('licenza-yes', st.verdict === 'yes');
      root.classList.toggle('licenza-denied', st.verdict === 'no');
      root.classList.toggle('licenza-added', st.added);
      answer.hidden = !st.added;
      if (add) {
        add.textContent = st.added ? (opts.removeLabel || 'leave it out') : (opts.addLabel || 'add to this answer');
        add.setAttribute('aria-expanded', st.added ? 'true' : 'false');
      }
      if (widenBox) widenBox.hidden = st.verdict !== 'yes';
    }

    function changed() {
      root.dispatchEvent(new CustomEvent('licenza:change', { bubbles: true, detail: state() }));
    }

    function state() {
      return {
        item_id: st.item_id,
        added: st.added,
        answered: !st.added || st.verdict !== null,
        verdict: st.verdict,
        duration_s: st.duration_s,
        actions: st.actions.slice(),
        widen: st.verdict === 'yes' ? st.widen.slice() : []
      };
    }

    paint();

    var api = {
      el: root,
      state: state,
      deny: function () { if (st.added) choose(0, false); },
      choose: function (value) {
        for (var i = 0; i < choices.length; i++) if (choices[i].value === value) return choose(i, false);
      }
    };
    root.licenza = api;
    return api;
  }

  return { create: create, lengths: LENGTHS };
}));
