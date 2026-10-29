'use strict';

(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.zanni = root.zanni || {};
    root.zanni.clessidra = api;
  }
}(typeof self !== 'undefined' ? self : this, function () {

  var MINUTE = 60, HOUR = 3600, DAY = 86400;
  var dials = [];
  var timer = null;

  function now() {
    return typeof performance !== 'undefined' && performance.now ? performance.now() / 1000 : Date.now() / 1000;
  }

  function short(s) {
    s = Math.max(0, Math.ceil(s));
    if (s >= 2 * DAY) return Math.floor(s / DAY) + 'd';
    if (s >= 2 * HOUR) return Math.floor(s / HOUR) + 'h';
    if (s >= MINUTE) return Math.ceil(s / MINUTE) + 'm';
    return s + 's';
  }

  function spoken(s) {
    s = Math.max(0, Math.ceil(s));
    if (!s) return 'expired';
    var n, unit;
    if (s >= 2 * DAY) { n = Math.floor(s / DAY); unit = 'day'; }
    else if (s >= 2 * HOUR) { n = Math.floor(s / HOUR); unit = 'hour'; }
    else if (s >= MINUTE) { n = Math.ceil(s / MINUTE); unit = 'minute'; }
    else { n = s; unit = 'second'; }
    return n + ' ' + unit + (n === 1 ? '' : 's') + ' left';
  }

  function colour(f) {
    if (f > 0.5) {
      return 'color-mix(in oklab, var(--clessidra-ok) ' + Math.round((f - 0.5) * 200) + '%, var(--clessidra-warn))';
    }
    return 'color-mix(in oklab, var(--clessidra-warn) ' + Math.round(f * 200) + '%, var(--clessidra-fail))';
  }

  function paint(d) {
    var left = Math.max(0, d.remaining - (now() - d.from));
    var f = d.total > 0 ? Math.min(1, left / d.total) : 0;
    d.el.style.setProperty('--clessidra-f', f.toFixed(4));
    d.el.style.setProperty('--clessidra-c', colour(f));
    var text = short(left);
    if (d.face.textContent !== text) d.face.textContent = text;
    var said = spoken(left);
    if (d.el.getAttribute('aria-label') !== said) d.el.setAttribute('aria-label', said);
    if (!left && !d.spent) {
      d.spent = true;
      d.el.classList.add('clessidra-spent');
      d.el.dispatchEvent(new CustomEvent('clessidra:spent', { bubbles: true }));
    }
  }

  function tick() {
    for (var i = dials.length - 1; i >= 0; i--) {
      if (!dials[i].el.isConnected) dials.splice(i, 1);
      else paint(dials[i]);
    }
    if (!dials.length && timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function attach(el, opts) {
    opts = opts || {};
    if (el.clessidra) el.clessidra.stop();
    var face = el.querySelector('.clessidra-time');
    if (!face) {
      face = document.createElement('b');
      face.className = 'clessidra-time';
      el.appendChild(face);
    }
    el.classList.add('clessidra');
    el.setAttribute('role', 'timer');
    var d = { el: el, face: face, remaining: 0, total: 0, from: now(), spent: false };

    function set(remaining, total) {
      d.remaining = Math.max(0, Number(remaining) || 0);
      d.total = Math.max(d.remaining, Number(total) || d.remaining);
      d.from = now();
      d.spent = false;
      el.classList.remove('clessidra-spent');
      paint(d);
    }

    set(opts.remaining_s, opts.total_s);
    dials.push(d);
    if (!timer) timer = setInterval(tick, 1000);

    var api = {
      set: set,
      left: function () { return Math.max(0, d.remaining - (now() - d.from)); },
      stop: function () {
        var i = dials.indexOf(d);
        if (i >= 0) dials.splice(i, 1);
        delete el.clessidra;
      }
    };
    el.clessidra = api;
    return api;
  }

  function boot() {
    var nodes = document.querySelectorAll('[data-clessidra]');
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].clessidra) continue;
      attach(nodes[i], {
        remaining_s: nodes[i].getAttribute('data-remaining-s'),
        total_s: nodes[i].getAttribute('data-total-s')
      });
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }

  return { attach: attach, short: short, spoken: spoken, tick: tick };
}));
