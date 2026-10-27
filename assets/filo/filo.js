'use strict';

(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.zanni = root.zanni || {};
    root.zanni.filo = api;
  }
}(typeof self !== 'undefined' ? self : this, function () {

  var COMMIT_MS = 400;
  var KEY_PLAY_PAUSE = 179;

  function el(tag, cls, attrs) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    for (var k in attrs || {}) n.setAttribute(k, attrs[k]);
    return n;
  }

  function clock(t) {
    if (!isFinite(t) || t < 0) return '--:--';
    t = Math.floor(t);
    var h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    var mm = String(m).padStart(h ? 2 : 1, '0'), ss = String(s).padStart(2, '0');
    return h ? h + ':' + mm + ':' + ss : mm + ':' + ss;
  }

  function typing(path) {
    for (var i = 0; i < path.length; i++) {
      var n = path[i];
      if (!n || !n.tagName) continue;
      if (n.isContentEditable || n.tagName === 'TEXTAREA' || n.tagName === 'SELECT') return true;
      if (n.tagName === 'INPUT' && n.type !== 'range') return true;
    }
    return false;
  }

  function keyAction(e, o) {
    var k = e.key;
    if (e.altKey || e.ctrlKey) {
      if (e.metaKey || e.shiftKey) return null;
      if (e.code === 'KeyH') return ['skip', -o.fine];
      if (e.code === 'KeyL') return ['skip', o.fine];
      return null;
    }
    if (e.metaKey) return null;
    if (k === ' ' || k === 'Enter' || k === 'MediaPlayPause' || e.keyCode === KEY_PLAY_PAUSE) return ['toggle'];
    if (k === 'h') return ['skip', -o.step];
    if (k === 'l') return ['skip', o.step];
    if (k === 'H') return ['skip', -o.big];
    if (k === 'L') return ['skip', o.big];
    if (k === 'ArrowLeft') return ['skip', e.shiftKey ? -o.big : -o.step];
    if (k === 'ArrowRight') return ['skip', e.shiftKey ? o.big : o.step];
    if (k === 'MediaRewind') return ['skip', -o.big];
    if (k === 'MediaFastForward') return ['skip', o.big];
    if (k === 'ArrowUp') return ['showBar', true];
    if (k === 'ArrowDown') return ['showBar', false];
    if (k === '^' || k === 'Home') return ['seekFraction', 0];
    if (k === '$' || k === 'End') return ['seekFraction', 1];
    if (k === '[' || k === 'PageUp') return ['chapter', -1];
    if (k === ']' || k === 'PageDown') return ['chapter', 1];
    if (k === 'm') return ['mute'];
    if (/^[0-9]$/.test(k)) return ['seekFraction', Number(k) / 10];
    return null;
  }

  function attach(rootEl, media, opts) {
    if (!rootEl || !media) return null;
    if (rootEl.filo) return rootEl.filo;
    opts = opts || {};
    var o = {
      step: opts.step || 10,
      big: opts.big || 30,
      fine: opts.fine || 1,
      autohide: opts.autohide || 0,
      globalKeys: !!opts.globalKeys
    };
    var item = { title: opts.title || '', chapters: opts.chapters || [], duration: opts.duration || 0 };

    rootEl.classList.add('filo');
    rootEl.textContent = '';
    var $ = {
      title: el('div', 'filo-title'),
      chapter: el('div', 'filo-chapter', { 'aria-live': 'polite' }),
      row: el('div', 'filo-row'),
      play: el('button', 'filo-play', { type: 'button', tabindex: '-1', 'aria-label': 'Play' }),
      elapsed: el('span', 'filo-elapsed'),
      track: el('div', 'filo-track', { role: 'slider', tabindex: '0', 'aria-label': 'Seek', 'aria-valuemin': '0' }),
      rail: el('div', 'filo-rail'),
      buffers: el('div', 'filo-buffers'),
      played: el('div', 'filo-played'),
      ticks: el('div', 'filo-ticks'),
      thumb: el('div', 'filo-thumb'),
      ghost: el('div', 'filo-ghost'),
      flag: el('div', 'filo-flag', { 'aria-hidden': 'true' }),
      flagTime: el('span', 'filo-flag-time'),
      flagChapter: el('span', 'filo-flag-chapter'),
      remaining: el('span', 'filo-remaining')
    };
    $.play.textContent = '\u25B6';
    $.flag.append($.flagTime, $.flagChapter);
    $.rail.append($.buffers, $.played, $.ticks);
    $.track.append($.rail, $.thumb, $.ghost, $.flag);
    $.row.append($.play, $.elapsed, $.track, $.remaining);
    rootEl.append($.title, $.chapter, $.row);

    var pending = null, commitTimer = null, hideTimer = null, dragging = false, shown = true;
    var listeners = [];

    function on(target, type, fn, capture) {
      target.addEventListener(type, fn, capture);
      listeners.push([target, type, fn, capture]);
    }

    function emit(type, detail) {
      rootEl.dispatchEvent(new CustomEvent(type, { bubbles: true, detail: detail }));
    }

    function duration() {
      var d = media.duration;
      return isFinite(d) && d > 0 ? d : item.duration || 0;
    }

    function clamp(t) {
      var d = duration();
      return Math.max(0, d ? Math.min(t, d) : t);
    }

    function chapterAt(t) {
      var ch = item.chapters, i = -1;
      for (var j = 0; j < ch.length; j++) if (ch[j].start <= t) i = j;
      return i;
    }

    function chapterLabel(t) {
      var i = chapterAt(t);
      return i >= 0 ? item.chapters[i].title || '' : '';
    }

    function pct(t) {
      var d = duration();
      return d ? Math.max(0, Math.min(100, (t / d) * 100)) : 0;
    }

    function paintTicks() {
      $.ticks.textContent = '';
      var d = duration();
      if (!d) return;
      item.chapters.forEach(function (c) {
        if (c.start <= 0 || c.start >= d) return;
        var t = el('span', 'filo-tick');
        t.style.left = pct(c.start) + '%';
        $.ticks.append(t);
      });
    }

    function paintBuffered() {
      var d = duration(), b = media.buffered;
      $.buffers.textContent = '';
      if (!d || !b) return;
      for (var i = 0; i < b.length; i++) {
        var s = el('span', 'filo-buffered');
        s.style.left = pct(b.start(i)) + '%';
        s.style.width = (pct(b.end(i)) - pct(b.start(i))) + '%';
        $.buffers.append(s);
      }
    }

    function paintFlag(t, label) {
      var at = pct(t);
      rootEl.style.setProperty('--filo-at', at + '%');
      rootEl.style.setProperty('--filo-flag-shift', at < 12 ? '-12%' : at > 88 ? '-88%' : '-50%');
      $.flagTime.textContent = label || clock(t);
      $.flagChapter.textContent = label ? clock(t) : chapterLabel(t);
    }

    function paint() {
      var t = media.currentTime || 0, d = duration();
      rootEl.style.setProperty('--filo-played', pct(t) + '%');
      $.elapsed.textContent = clock(t);
      $.remaining.textContent = d ? '-' + clock(Math.max(0, d - t)) : '--:--';
      $.chapter.textContent = chapterLabel(t);
      var c = chapterLabel(t);
      $.track.setAttribute('aria-valuemax', String(Math.round(d)));
      $.track.setAttribute('aria-valuenow', String(Math.round(t)));
      $.track.setAttribute('aria-valuetext', clock(t) + ' of ' + clock(d) + (c ? ', ' + c : ''));
    }

    function paintPlay() {
      var playing = !media.paused;
      $.play.textContent = playing ? '\u275A\u275A' : '\u25B6';
      $.play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
      armHide();
    }

    function preview(t, delta) {
      rootEl.classList.add('filo-previewing');
      paintFlag(t, delta == null ? null : (delta < 0 ? '\u2212' : '+') + clock(Math.abs(delta)));
    }

    function endPreview() {
      rootEl.classList.remove('filo-previewing', 'filo-held');
    }

    function commit(t) {
      clearTimeout(commitTimer);
      commitTimer = null;
      pending = null;
      var from = media.currentTime || 0, to = clamp(t);
      media.currentTime = to;
      endPreview();
      paint();
      emit('filo:seek', { from: from, to: to });
    }

    function seekTo(t) {
      clearTimeout(commitTimer);
      pending = null;
      commit(t);
    }

    function seekFraction(f) {
      var d = duration();
      if (!d) return;
      seekTo(Math.max(0, Math.min(1, f)) * d);
    }

    function skip(s) {
      var base = pending == null ? media.currentTime || 0 : pending;
      pending = clamp(base + s);
      rootEl.classList.add('filo-held');
      preview(pending, pending - (media.currentTime || 0));
      clearTimeout(commitTimer);
      commitTimer = setTimeout(function () { commit(pending); }, COMMIT_MS);
    }

    function chapter(dir) {
      var ch = item.chapters;
      if (!ch.length) return;
      var t = pending == null ? media.currentTime || 0 : pending;
      var i = chapterAt(t);
      if (dir < 0 && i >= 0 && t - ch[i].start > 3) return seekTo(ch[i].start);
      var j = Math.max(0, Math.min(ch.length - 1, i + (dir < 0 ? -1 : 1)));
      seekTo(ch[j].start);
    }

    function toggle() {
      if (media.paused) {
        var p = media.play();
        if (p && p.catch) p.catch(function () {});
      } else media.pause();
    }

    function armHide() {
      clearTimeout(hideTimer);
      if (!o.autohide || media.paused) return;
      hideTimer = setTimeout(function () { showBar(false); }, o.autohide);
    }

    function showBar(v) {
      shown = !!v;
      rootEl.classList.toggle('filo-hidden', !shown);
      if (shown) armHide();
      else clearTimeout(hideTimer);
      emit('filo:bar', { shown: shown });
    }

    function stop() {
      clearTimeout(commitTimer);
      pending = null;
      endPreview();
      media.pause();
      showBar(false);
      emit('filo:stop', {});
    }

    function setItem(next) {
      item.title = next.title || '';
      item.chapters = next.chapters || [];
      item.duration = next.duration || 0;
      $.title.textContent = item.title;
      paintTicks();
      paint();
    }

    var api = {
      toggle: toggle,
      skip: skip,
      seekTo: seekTo,
      seekFraction: seekFraction,
      chapter: chapter,
      showBar: showBar,
      stop: stop,
      setItem: setItem,
      mute: function () { media.muted = !media.muted; },
      focus: function () { $.track.focus({ preventScroll: true }); },
      get shown() { return shown; },
      get pending() { return pending; },
      detach: function () {
        clearTimeout(commitTimer);
        clearTimeout(hideTimer);
        listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2], l[3]); });
        listeners = [];
        rootEl.textContent = '';
        rootEl.classList.remove('filo', 'filo-hidden', 'filo-previewing', 'filo-held');
        delete rootEl.filo;
      }
    };

    function onKey(e) {
      if (e.defaultPrevented) return;
      var path = e.composedPath ? e.composedPath() : [e.target];
      if (typing(path)) return;
      if (!o.globalKeys && path.indexOf(rootEl) < 0) return;
      var a = keyAction(e, o);
      if (!a) return;
      if ((a[0] === 'toggle') && (e.key === ' ' || e.key === 'Enter')) {
        for (var i = 0; i < path.length && path[i] !== rootEl; i++) {
          var n = path[i];
          if (n.tagName === 'BUTTON' || n.tagName === 'A') return;
        }
      }
      e.preventDefault();
      if (a[0] !== 'showBar' && !shown) showBar(true);
      else if (shown) armHide();
      if (a[0] === 'mute') api.mute();
      else api[a[0]](a[1]);
    }

    function timeAtX(x) {
      var r = $.rail.getBoundingClientRect();
      var f = r.width ? Math.max(0, Math.min(1, (x - r.left) / r.width)) : 0;
      return f * duration();
    }

    on(o.globalKeys ? document : rootEl, 'keydown', onKey);
    on($.play, 'click', toggle);
    on($.track, 'pointerdown', function (e) {
      if (e.button !== 0 || !duration()) return;
      dragging = true;
      $.track.setPointerCapture(e.pointerId);
      rootEl.classList.add('filo-held');
      preview(timeAtX(e.clientX));
    });
    on($.track, 'pointermove', function (e) {
      if (dragging) return preview(timeAtX(e.clientX));
      if (e.pointerType === 'mouse' && duration()) preview(timeAtX(e.clientX));
    });
    on($.track, 'pointerup', function (e) {
      if (!dragging) return;
      dragging = false;
      commit(timeAtX(e.clientX));
    });
    on($.track, 'pointercancel', function () {
      dragging = false;
      endPreview();
    });
    on($.track, 'pointerleave', function () {
      if (!dragging && pending == null) endPreview();
    });
    on(rootEl, 'pointerdown', function () { if (shown) armHide(); });
    on(media, 'timeupdate', paint);
    on(media, 'durationchange', function () { paintTicks(); paint(); paintBuffered(); });
    on(media, 'progress', paintBuffered);
    on(media, 'seeked', paintBuffered);
    on(media, 'play', paintPlay);
    on(media, 'pause', paintPlay);

    setItem(item);
    paintBuffered();
    paintPlay();
    rootEl.filo = api;
    return api;
  }

  function boot() {
    var nodes = document.querySelectorAll('[data-filo]');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i], id = n.getAttribute('data-filo');
      if (!id || n.filo) continue;
      var m = document.getElementById(id);
      if (m) attach(n, m, { globalKeys: n.getAttribute('data-filo-keys') === 'global' });
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }

  return { attach: attach, clock: clock };
}));
