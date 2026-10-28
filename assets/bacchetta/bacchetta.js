'use strict';

(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.zanni = root.zanni || {};
    root.zanni.bacchetta = api;
  }
}(typeof self !== 'undefined' ? self : this, function () {

  var SVG = 'http://www.w3.org/2000/svg';
  var ICONS = {
    cast: 'M1 1h14v1h-14zM1 2h1v2h-1zM14 2h1v11h-1zM0 5h2v1h-2zM2 6h2v1h-2zM4 7h1v1h-1zM0 8h2v1h-2zM5 8h1v1h-1zM2 9h2v1h-2zM6 9h1v2h-1zM4 10h1v3h-1zM0 11h2v2h-2zM7 11h1v2h-1zM9 12h5v1h-5z',
    play: 'M3 1h1v1h-1zM3 2h3v1h-3zM3 3h4v1h-4zM3 4h6v1h-6zM3 5h7v1h-7zM3 6h9v1h-9zM3 7h11v1h-11zM3 8h9v1h-9zM3 9h7v1h-7zM3 10h6v1h-6zM3 11h4v1h-4zM3 12h3v1h-3zM3 13h1v1h-1z',
    pause: 'M3 2h4v12h-4zM9 2h4v12h-4z',
    back: 'M6 1h1v1h-1zM5 2h2v1h-2zM4 3h10v1h-10zM5 4h2v1h-2zM14 4h1v1h-1zM6 5h1v1h-1zM15 5h1v6h-1zM1 7h1v4h-1zM2 11h1v1h-1zM14 11h1v1h-1zM3 12h1v1h-1zM13 12h1v1h-1zM4 13h2v1h-2zM11 13h2v1h-2zM6 14h5v1h-5z',
    fwd: 'M9 1h1v1h-1zM9 2h2v1h-2zM2 3h10v1h-10zM1 4h1v1h-1zM9 4h2v1h-2zM0 5h1v6h-1zM9 5h1v1h-1zM14 7h1v4h-1zM1 11h1v1h-1zM13 11h1v1h-1zM2 12h1v1h-1zM12 12h1v1h-1zM3 13h2v1h-2zM10 13h2v1h-2zM5 14h5v1h-5z',
    up: 'M7 4h2v1h-2zM6 5h4v1h-4zM5 6h6v1h-6zM4 7h8v1h-8zM3 8h10v1h-10z',
    down: 'M3 7h10v1h-10zM4 8h8v1h-8zM5 9h6v1h-6zM6 10h4v1h-4zM7 11h2v1h-2z',
    left: 'M8 3h1v10h-1zM7 4h1v8h-1zM6 5h1v6h-1zM5 6h1v4h-1zM4 7h1v2h-1z',
    right: 'M7 3h1v10h-1zM8 4h1v8h-1zM9 5h1v6h-1zM10 6h1v4h-1zM11 7h1v2h-1z',
    prev: 'M2 3h2v10h-2zM11 3h1v10h-1zM10 4h1v8h-1zM9 5h1v6h-1zM8 6h1v4h-1zM7 7h1v2h-1z',
    next: 'M12 3h2v10h-2zM4 3h1v10h-1zM5 4h1v8h-1zM6 5h1v6h-1zM7 6h1v4h-1zM8 7h1v2h-1z',
    shrink: 'M1 5h2v1h-2zM13 5h2v1h-2zM2 6h2v1h-2zM12 6h2v1h-2zM3 7h2v1h-2zM11 7h2v1h-2zM4 8h2v1h-2zM10 8h2v1h-2zM5 9h2v1h-2zM9 9h2v1h-2zM6 10h4v1h-4zM7 11h2v1h-2z',
    grow: 'M7 4h2v1h-2zM6 5h4v1h-4zM5 6h2v1h-2zM9 6h2v1h-2zM4 7h2v1h-2zM10 7h2v1h-2zM3 8h2v1h-2zM11 8h2v1h-2zM2 9h2v1h-2zM12 9h2v1h-2zM1 10h2v1h-2zM13 10h2v1h-2z',
    home: 'M7 1h2v1h-2zM6 2h4v1h-4zM5 3h2v1h-2zM9 3h2v1h-2zM4 4h2v1h-2zM10 4h2v1h-2zM3 5h2v1h-2zM11 5h2v1h-2zM2 6h2v1h-2zM12 6h2v1h-2zM1 7h2v1h-2zM13 7h2v1h-2zM2 8h1v5h-1zM13 8h1v5h-1zM6 9h4v1h-4zM6 10h1v3h-1zM9 10h1v3h-1zM2 13h12v1h-12z',
    ret: 'M5 1h1v1h-1zM4 2h2v1h-2zM3 3h9v1h-9zM2 4h10v1h-10zM3 5h2v1h-2zM11 5h2v1h-2zM4 6h1v1h-1zM12 6h2v3h-2zM11 9h2v1h-2zM2 10h9v1h-9zM2 11h8v1h-8z',
    close: 'M2 2h2v1h-2zM12 2h2v1h-2zM3 3h2v1h-2zM11 3h2v1h-2zM4 4h2v1h-2zM10 4h2v1h-2zM5 5h2v1h-2zM9 5h2v1h-2zM6 6h4v1h-4zM7 7h2v1h-2zM6 8h4v1h-4zM5 9h2v1h-2zM9 9h2v1h-2zM4 10h2v1h-2zM10 10h2v1h-2zM3 11h2v1h-2zM11 11h2v1h-2zM2 12h2v1h-2zM12 12h2v1h-2z'
  };

  function el(tag, cls, attrs, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    for (var k in attrs || {}) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  }

  function icon(name) {
    var s = document.createElementNS(SVG, 'svg');
    s.setAttribute('class', 'bacchetta-icon');
    s.setAttribute('viewBox', '0 0 16 16');
    s.setAttribute('shape-rendering', 'crispEdges');
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('focusable', 'false');
    var p = document.createElementNS(SVG, 'path');
    p.setAttribute('d', ICONS[name]);
    s.appendChild(p);
    return s;
  }

  function setIcon(b, name) {
    var p = b.querySelector('path');
    if (p) p.setAttribute('d', ICONS[name]);
  }

  function key(cls, label, iconName, text) {
    var b = el('button', 'bacchetta-key ' + cls, { type: 'button', 'aria-label': label, title: label });
    if (iconName) b.appendChild(icon(iconName));
    if (text != null) b.appendChild(el('span', 'bacchetta-label', null, text));
    return b;
  }

  function ring(cls, dir, n) {
    var b = key('bacchetta-ring ' + cls, (dir < 0 ? 'Back ' : 'Forward ') + n + ' seconds', dir < 0 ? 'back' : 'fwd');
    b.appendChild(el('span', 'bacchetta-n', { 'aria-hidden': 'true' }, String(n)));
    return b;
  }

  function clock(t) {
    if (!isFinite(t) || t < 0) return '--:--';
    t = Math.floor(t);
    var h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    var mm = String(m).padStart(h ? 2 : 1, '0'), ss = String(s).padStart(2, '0');
    return h ? h + ':' + mm + ':' + ss : mm + ':' + ss;
  }

  function watchModality() {
    var html = document.documentElement;
    if (html.hasAttribute('data-zanni-modality')) return;
    html.setAttribute('data-zanni-modality', '');
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) html.classList.add('zanni-pointing');
    document.addEventListener('pointerdown', function () { html.classList.add('zanni-pointing'); }, true);
    document.addEventListener('keydown', function () { html.classList.remove('zanni-pointing'); }, true);
  }

  function hasBoil() {
    return !!document.getElementById('pixel-ui');
  }

  function caster(button, opts) {
    opts = opts || {};
    watchModality();
    var screens = opts.screens || [];
    var wrap = el('span', 'bacchetta-caster');
    button.parentNode.insertBefore(wrap, button);
    wrap.appendChild(button);
    button.classList.add('bacchetta-key', 'bacchetta-cast');
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    if (!button.querySelector('.bacchetta-icon')) button.insertBefore(icon('cast'), button.firstChild);
    var menu = el('div', 'bacchetta-screens', { role: 'menu', hidden: '' });
    wrap.appendChild(menu);
    var listeners = [];

    function on(t, type, fn) { t.addEventListener(type, fn); listeners.push([t, type, fn]); }

    function render() {
      menu.textContent = '';
      if (!screens.length) {
        menu.appendChild(el('div', 'bacchetta-empty', null, 'No screens'));
        return;
      }
      screens.forEach(function (s) {
        var item = el('button', 'bacchetta-screen', { type: 'button', role: 'menuitem' });
        if (s.online === false) item.classList.add('bacchetta-offline');
        item.appendChild(icon('cast'));
        item.appendChild(el('span', 'bacchetta-screen-name', null, s.name || s.id));
        item.appendChild(el('span', 'bacchetta-screen-kind', null, s.kind || ''));
        item.appendChild(el('span', 'bacchetta-dot', { 'aria-label': s.online === false ? 'offline' : 'online' }));
        item.addEventListener('click', function (e) {
          e.stopPropagation();
          close();
          button.dispatchEvent(new CustomEvent('bacchetta:cast', { bubbles: true, detail: { screen: s } }));
        });
        menu.appendChild(item);
      });
    }

    function open() {
      render();
      menu.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      var first = menu.querySelector('button');
      if (first) first.focus({ preventScroll: true });
    }

    function close() {
      if (menu.hidden) return;
      var had = menu.contains(document.activeElement);
      menu.hidden = true;
      button.setAttribute('aria-expanded', 'false');
      if (had) button.focus({ preventScroll: true });
    }

    on(button, 'click', function (e) { e.stopPropagation(); if (menu.hidden) open(); else close(); });
    on(document, 'pointerdown', function (e) { if (!wrap.contains(e.target)) close(); });
    on(menu, 'keydown', function (e) {
      var items = Array.prototype.slice.call(menu.querySelectorAll('button'));
      var i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { (items[i + 1] || items[0]).focus(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { (items[i - 1] || items[items.length - 1]).focus(); e.preventDefault(); }
      else if (e.key === 'Escape') { close(); e.preventDefault(); }
    });

    return {
      setScreens: function (list) { screens = list || []; if (!menu.hidden) render(); },
      open: open,
      close: close,
      get isOpen() { return !menu.hidden; },
      destroy: function () {
        listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2]); });
        wrap.parentNode.insertBefore(button, wrap);
        wrap.remove();
        button.classList.remove('bacchetta-key', 'bacchetta-cast');
      }
    };
  }

  function remote(opts) {
    opts = opts || {};
    watchModality();
    var o = { step: opts.step || 10, big: opts.big || 30 };
    var host = opts.host || document.body;
    var now = { title: '', chapter: '', position: 0, duration: 0, playing: false, at: 0 };
    var screen = null, minimised = false, shown = false, boiled = !!opts.boil, dragging = false, ticker = null;

    var $ = {
      root: el('section', 'bacchetta', { role: 'dialog', 'aria-modal': 'false', 'aria-label': 'Remote', hidden: '' }),
      sheet: el('div', 'bacchetta-sheet'),
      grip: el('div', 'bacchetta-grip', { 'aria-hidden': 'true' }),
      head: el('header', 'bacchetta-head'),
      to: el('div', 'bacchetta-to'),
      toName: el('span', 'bacchetta-to-name'),
      shrink: key('bacchetta-plain bacchetta-shrink', 'Minimise', 'shrink'),
      close: key('bacchetta-plain bacchetta-close', 'Stop and close', 'close'),
      now: el('div', 'bacchetta-now'),
      title: el('div', 'bacchetta-title'),
      chapter: el('div', 'bacchetta-chapter'),
      track: el('div', 'bacchetta-track', { role: 'slider', tabindex: '0', 'aria-label': 'Seek', 'aria-valuemin': '0' }),
      rail: el('div', 'bacchetta-rail'),
      fill: el('div', 'bacchetta-fill'),
      head2: el('div', 'bacchetta-head-at'),
      thumb: el('div', 'bacchetta-thumb'),
      flag: el('div', 'bacchetta-flag', { 'aria-hidden': 'true' }),
      times: el('div', 'bacchetta-times'),
      elapsed: el('span', 'bacchetta-elapsed'),
      remaining: el('span', 'bacchetta-remaining'),
      transport: el('div', 'bacchetta-transport'),
      bigBack: ring('bacchetta-big-back', -1, o.big),
      back: ring('bacchetta-back', -1, o.step),
      play: key('bacchetta-play', 'Play', 'play'),
      fwd: ring('bacchetta-fwd', 1, o.step),
      bigFwd: ring('bacchetta-big-fwd', 1, o.big),
      mid: el('div', 'bacchetta-mid'),
      pad: el('div', 'bacchetta-pad', { role: 'group', 'aria-label': 'Direction pad' }),
      goBack: key('bacchetta-goback', 'Back', 'ret'),
      home: key('bacchetta-home', 'Home', 'home'),
      up: key('bacchetta-up', 'Up', 'up'),
      left: key('bacchetta-left', 'Left', 'left'),
      ok: key('bacchetta-ok', 'OK', null, 'OK'),
      right: key('bacchetta-right', 'Right', 'right'),
      down: key('bacchetta-down', 'Down', 'down'),
      side: el('div', 'bacchetta-side'),
      prev: key('bacchetta-wide bacchetta-prev', 'Previous chapter', 'prev', 'chapter'),
      next: key('bacchetta-wide bacchetta-next', 'Next chapter', 'next', 'chapter'),
      bar: key('bacchetta-wide bacchetta-bar', 'Show or hide the controls on the screen', null, 'controls'),
      stop: key('bacchetta-wide bacchetta-stop', 'Stop', null, 'stop'),
      more: el('details', 'bacchetta-more'),
      summary: el('summary', null, null, 'more'),
      form: el('form', 'bacchetta-path'),
      path: el('input', 'bacchetta-path-input', { type: 'text', placeholder: 'cast a files path', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Cast a files path' }),
      send: el('button', 'bacchetta-key bacchetta-path-send', { type: 'submit' }, 'cast'),
      boilLabel: el('label', 'bacchetta-boil'),
      boilBox: el('input', null, { type: 'checkbox' }),
      mini: el('div', 'bacchetta-mini'),
      miniLine: el('div', 'bacchetta-mini-line'),
      miniText: el('div', 'bacchetta-mini-text'),
      miniTo: el('div', 'bacchetta-mini-to'),
      miniNow: el('div', 'bacchetta-mini-now'),
      miniPlay: key('bacchetta-play bacchetta-mini-play', 'Play', 'play'),
      grow: key('bacchetta-plain bacchetta-grow', 'Open the remote', 'grow')
    };
    $.to.append(icon('cast'), $.toName);
    $.head.append($.to, $.shrink, $.close);
    $.rail.append($.fill);
    $.head2.append($.thumb, $.flag);
    $.track.append($.rail, $.head2);
    $.times.append($.elapsed, $.remaining);
    $.now.append($.title, $.chapter, $.track, $.times);
    $.transport.append($.bigBack, $.back, $.play, $.fwd, $.bigFwd);
    $.pad.append($.goBack, $.up, $.home, $.left, $.ok, $.right, $.down);
    $.side.append($.prev, $.next, $.bar, $.stop);
    $.mid.append($.pad, $.side);
    $.form.append($.path, $.send);
    $.boilLabel.append($.boilBox, el('span', null, null, 'Boil the remote'));
    $.more.append($.summary, $.form, $.boilLabel);
    $.sheet.append($.grip, $.head, $.now, $.transport, $.mid, $.more);
    $.miniText.append($.miniTo, $.miniNow);
    $.mini.append($.miniLine, icon('cast'), $.miniText, $.miniPlay, $.grow);
    $.root.append($.sheet, $.mini);
    host.appendChild($.root);

    var listeners = [];
    function on(t, type, fn) { t.addEventListener(type, fn); listeners.push([t, type, fn]); }

    function emit(type, detail) {
      $.root.dispatchEvent(new CustomEvent(type, { bubbles: true, detail: detail }));
    }

    function control(action, value) {
      emit('bacchetta:control', { action: action, value: value, screen: screen });
    }

    function position() {
      var p = now.position;
      if (now.playing && now.at) p += (Date.now() - now.at) / 1000;
      return now.duration ? Math.min(p, now.duration) : p;
    }

    function frac(t) {
      return now.duration ? Math.max(0, Math.min(1, t / now.duration)) : 0;
    }

    function place(t) {
      var f = frac(t);
      $.fill.style.transform = 'scaleX(' + f + ')';
      $.head2.style.transform = 'translateX(' + (f * 100) + '%)';
      $.miniLine.style.transform = 'scaleX(' + f + ')';
    }

    function paint() {
      var t = position();
      if (!dragging) place(t);
      $.elapsed.textContent = clock(t);
      $.remaining.textContent = now.duration ? '-' + clock(Math.max(0, now.duration - t)) : '--:--';
      $.track.setAttribute('aria-valuemax', String(Math.round(now.duration)));
      $.track.setAttribute('aria-valuenow', String(Math.round(t)));
      $.track.setAttribute('aria-valuetext', clock(t) + ' of ' + clock(now.duration));
    }

    function paintPlay() {
      [$.play, $.miniPlay].forEach(function (b) {
        setIcon(b, now.playing ? 'pause' : 'play');
        b.setAttribute('aria-label', now.playing ? 'Pause' : 'Play');
        b.title = now.playing ? 'Pause' : 'Play';
      });
    }

    function tick() {
      clearInterval(ticker);
      ticker = null;
      if (shown && now.playing) ticker = setInterval(paint, 500);
    }

    function setHeight() {
      var h = shown ? (minimised ? $.mini : $.sheet).getBoundingClientRect().height : 0;
      var wide = window.matchMedia && window.matchMedia('(min-width: 900px)').matches;
      if (shown && (minimised || !wide)) document.documentElement.style.setProperty('--bacchetta-height', Math.round(h) + 'px');
      else document.documentElement.style.removeProperty('--bacchetta-height');
    }

    function show(s) {
      if (s) screen = s;
      $.toName.textContent = screen ? screen.name || screen.id : '';
      $.miniTo.textContent = $.toName.textContent;
      $.root.hidden = false;
      shown = true;
      minimise(false);
      tick();
      emit('bacchetta:show', { screen: screen });
    }

    function hide() {
      if (!shown) return;
      $.root.hidden = true;
      shown = false;
      tick();
      setHeight();
      emit('bacchetta:hide', { screen: screen });
    }

    function minimise(v) {
      minimised = v == null ? !minimised : !!v;
      $.root.classList.toggle('bacchetta-minimised', minimised);
      setHeight();
      emit('bacchetta:minimise', { on: minimised });
    }

    function setNow(n) {
      n = n || {};
      if ('title' in n) now.title = n.title || '';
      if ('chapter' in n) now.chapter = n.chapter || '';
      if ('duration' in n) now.duration = Number(n.duration) || 0;
      if ('playing' in n) now.playing = !!n.playing;
      if ('position' in n) { now.position = Number(n.position) || 0; now.at = Date.now(); }
      $.title.textContent = now.title || 'Nothing playing';
      $.chapter.textContent = now.chapter;
      $.miniNow.textContent = now.title ? now.title + (now.chapter ? ' \u00B7 ' + now.chapter : '') : 'Nothing playing';
      paintPlay();
      paint();
      tick();
    }

    function boil(v) {
      boiled = v == null ? !boiled : !!v;
      $.boilBox.checked = boiled;
      $.sheet.classList.toggle('boil-ui', boiled && hasBoil());
      $.mini.classList.toggle('boil-ui', boiled && hasBoil());
      emit('bacchetta:boil', { on: boiled });
    }

    function timeAtX(x) {
      var r = $.rail.getBoundingClientRect();
      return (r.width ? Math.max(0, Math.min(1, (x - r.left) / r.width)) : 0) * now.duration;
    }

    function preview(t) {
      place(t);
      $.flag.textContent = clock(t);
      $.root.classList.add('bacchetta-previewing');
    }

    on($.shrink, 'click', function () { minimise(true); });
    on($.grow, 'click', function () { minimise(false); });
    on($.close, 'click', function () { control('stop'); hide(); });
    on($.play, 'click', function () { control('toggle'); });
    on($.miniPlay, 'click', function () { control('toggle'); });
    on($.back, 'click', function () { control('skip', -o.step); });
    on($.fwd, 'click', function () { control('skip', o.step); });
    on($.bigBack, 'click', function () { control('skip', -o.big); });
    on($.bigFwd, 'click', function () { control('skip', o.big); });
    on($.prev, 'click', function () { control('chapter', -1); });
    on($.next, 'click', function () { control('chapter', 1); });
    on($.bar, 'click', function () { control('bar'); });
    on($.goBack, 'click', function () { control('back'); });
    on($.home, 'click', function () { control('home'); });
    on($.stop, 'click', function () { control('stop'); });
    [['up', 'ArrowUp'], ['down', 'ArrowDown'], ['left', 'ArrowLeft'], ['right', 'ArrowRight'], ['ok', 'Enter']].forEach(function (k) {
      on($[k[0]], 'click', function () { control('key', k[1]); });
    });
    on($.form, 'submit', function (e) {
      e.preventDefault();
      var p = $.path.value.trim();
      if (!p) return;
      emit('bacchetta:path', { path: p, screen: screen });
      $.path.value = '';
    });
    on($.boilBox, 'change', function () { boil($.boilBox.checked); });
    on($.more, 'toggle', setHeight);
    on($.track, 'pointerdown', function (e) {
      if (e.button !== 0 || !now.duration) return;
      dragging = true;
      if ($.track.setPointerCapture) $.track.setPointerCapture(e.pointerId);
      preview(timeAtX(e.clientX));
    });
    on($.track, 'pointermove', function (e) { if (dragging) preview(timeAtX(e.clientX)); });
    on($.track, 'pointerup', function (e) {
      if (!dragging) return;
      dragging = false;
      $.root.classList.remove('bacchetta-previewing');
      var t = timeAtX(e.clientX);
      now.position = t;
      now.at = Date.now();
      paint();
      control('seekTo', t);
    });
    on($.track, 'pointercancel', function () {
      dragging = false;
      $.root.classList.remove('bacchetta-previewing');
      paint();
    });
    on($.track, 'keydown', function (e) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        control('skip', e.key === 'ArrowLeft' ? -o.step : o.step);
      }
    });
    on(window, 'resize', setHeight);

    setNow({});
    boil(boiled);

    return {
      show: show,
      hide: hide,
      minimise: minimise,
      setNow: setNow,
      boil: boil,
      get shown() { return shown; },
      get minimised() { return minimised; },
      get boiled() { return boiled; },
      get screen() { return screen; },
      get root() { return $.root; },
      destroy: function () {
        clearInterval(ticker);
        listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2]); });
        listeners = [];
        $.root.remove();
        document.documentElement.style.removeProperty('--bacchetta-height');
      }
    };
  }

  return { caster: caster, remote: remote, clock: clock };
}));
