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
  var RATES = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
  var SLEEP = [['off', 'Off'], ['15', '15 min'], ['30', '30 min'], ['45', '45 min'], ['60', '60 min'], ['chapter', 'End of chapter']];
  var SVG = 'http://www.w3.org/2000/svg';

  var ICONS = {
    play: 'M3 1h1v1h-1zM3 2h3v1h-3zM3 3h4v1h-4zM3 4h6v1h-6zM3 5h7v1h-7zM3 6h9v1h-9zM3 7h11v1h-11zM3 8h9v1h-9zM3 9h7v1h-7zM3 10h6v1h-6zM3 11h4v1h-4zM3 12h3v1h-3zM3 13h1v1h-1z',
    pause: 'M3 2h4v12h-4zM9 2h4v12h-4z',
    back: 'M6 1h1v1h-1zM5 2h2v1h-2zM4 3h10v1h-10zM5 4h2v1h-2zM14 4h1v1h-1zM6 5h1v1h-1zM15 5h1v6h-1zM1 7h1v4h-1zM2 11h1v1h-1zM14 11h1v1h-1zM3 12h1v1h-1zM13 12h1v1h-1zM4 13h2v1h-2zM11 13h2v1h-2zM6 14h5v1h-5z',
    fwd: 'M9 1h1v1h-1zM9 2h2v1h-2zM2 3h10v1h-10zM1 4h1v1h-1zM9 4h2v1h-2zM0 5h1v6h-1zM9 5h1v1h-1zM14 7h1v4h-1zM1 11h1v1h-1zM13 11h1v1h-1zM2 12h1v1h-1zM12 12h1v1h-1zM3 13h2v1h-2zM10 13h2v1h-2zM5 14h5v1h-5z',
    vol: 'M6 2h1v1h-1zM5 3h2v1h-2zM12 3h1v1h-1zM4 4h3v1h-3zM9 4h1v1h-1zM13 4h1v1h-1zM0 5h7v6h-7zM10 5h1v6h-1zM14 5h1v6h-1zM4 11h3v1h-3zM9 11h1v1h-1zM13 11h1v1h-1zM5 12h2v1h-2zM12 12h1v1h-1zM6 13h1v1h-1z',
    muted: 'M6 2h1v1h-1zM5 3h2v1h-2zM4 4h3v1h-3zM0 5h7v6h-7zM9 5h1v1h-1zM13 5h1v1h-1zM10 6h1v1h-1zM12 6h1v1h-1zM11 7h1v1h-1zM10 8h1v1h-1zM12 8h1v1h-1zM9 9h1v1h-1zM13 9h1v1h-1zM4 11h3v1h-3zM5 12h2v1h-2zM6 13h1v1h-1z',
    more: 'M6 2h3v3h-3zM6 7h3v3h-3zM6 12h3v3h-3z',
    full: 'M1 1h5v2h-5zM10 1h5v2h-5zM1 3h2v3h-2zM13 3h2v3h-2zM1 10h2v3h-2zM13 10h2v3h-2zM1 13h5v2h-5zM10 13h5v2h-5z',
    unfull: 'M4 1h2v3h-2zM10 1h2v3h-2zM1 4h5v2h-5zM10 4h5v2h-5zM1 10h5v2h-5zM10 10h5v2h-5zM4 12h2v3h-2zM10 12h2v3h-2z'
  };

  function el(tag, cls, attrs) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    for (var k in attrs || {}) n.setAttribute(k, attrs[k]);
    return n;
  }

  function icon(name) {
    var s = document.createElementNS(SVG, 'svg');
    s.setAttribute('class', 'filo-icon');
    s.setAttribute('viewBox', '0 0 16 16');
    s.setAttribute('shape-rendering', 'crispEdges');
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('focusable', 'false');
    var p = document.createElementNS(SVG, 'path');
    p.setAttribute('d', ICONS[name]);
    s.appendChild(p);
    return s;
  }

  function setIcon(button, name) {
    var p = button.querySelector('path');
    if (p) p.setAttribute('d', ICONS[name]);
  }

  function clock(t) {
    if (!isFinite(t) || t < 0) return '--:--';
    t = Math.floor(t);
    var h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    var mm = String(m).padStart(h ? 2 : 1, '0'), ss = String(s).padStart(2, '0');
    return h ? h + ':' + mm + ':' + ss : mm + ':' + ss;
  }

  function rateLabel(r) {
    return String(r).replace(/^0\./, '.') + '\u00D7';
  }

  function vttTime(s) {
    var p = s.trim().split(':').map(Number);
    return p.reduce(function (a, b) { return a * 60 + b; }, 0);
  }

  function parseVtt(text, base) {
    var cues = [];
    text.replace(/\r/g, '').split(/\n\n+/).forEach(function (block) {
      var lines = block.split('\n');
      for (var i = 0; i < lines.length; i++) {
        var m = /^([\d:.]+)\s+-->\s+([\d:.]+)/.exec(lines[i]);
        if (!m || !lines[i + 1]) continue;
        var url = new URL(lines[i + 1].trim(), base);
        var xywh = /#xywh=(\d+),(\d+),(\d+),(\d+)$/.exec(url.href);
        var cue = { start: vttTime(m[1]), end: vttTime(m[2]), url: url.href.replace(/#.*$/, '') };
        if (xywh) { cue.x = +xywh[1]; cue.y = +xywh[2]; cue.w = +xywh[3]; cue.h = +xywh[4]; }
        cues.push(cue);
        break;
      }
    });
    return cues;
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
    if (k === '<') return ['stepRate', -1];
    if (k === '>') return ['stepRate', 1];
    if (k === 'm') return ['mute'];
    if (k === 'f') return ['fullscreen'];
    if (k === '?') return ['help'];
    if (/^[0-9]$/.test(k)) return ['seekFraction', Number(k) / 10];
    return null;
  }

  function shortcuts(o) {
    return [
      ['Space, Enter', 'Play or pause'],
      ['h  l', 'Back or forward ' + o.step + ' s'],
      ['\u2190  \u2192', 'Back or forward ' + o.step + ' s'],
      ['H  L', 'Back or forward ' + o.big + ' s'],
      ['Alt+h  Alt+l', 'Back or forward ' + o.fine + ' s'],
      ['0 \u2013 9', 'Jump to 0 \u2013 90%'],
      ['^  $', 'Start, end'],
      ['[  ]', 'Previous, next chapter'],
      ['<  >', 'Slower, faster'],
      ['m', 'Mute'],
      ['f', 'Fullscreen'],
      ['\u2191  \u2193', 'Show, hide the controls'],
      ['?', 'These keys'],
      ['Esc', 'Close a menu']
    ];
  }

  function hasBoil() {
    return !!document.getElementById('pixel-ui');
  }

  function attach(media, opts) {
    if (!media || !/^(VIDEO|AUDIO)$/.test(media.tagName)) return null;
    if (media.filo) return media.filo;
    opts = opts || {};
    var o = {
      step: opts.step || 10,
      big: opts.big || 30,
      fine: opts.fine || 1,
      globalKeys: !!opts.globalKeys,
      rates: opts.rates || RATES,
      boil: opts.boil !== false
    };
    var item = {
      title: opts.title || '', chapters: opts.chapters || [], duration: opts.duration || 0,
      kind: opts.kind || (media.tagName === 'AUDIO' ? 'audio' : 'video')
    };
    var qualities = opts.qualities || [], quality = opts.quality == null ? null : String(opts.quality);
    var audioMode = function () { return item.kind === 'audio'; };
    var autohide = function () { return opts.autohide == null ? (audioMode() ? 0 : 2500) : opts.autohide; };

    var parent = media.parentElement;
    var created = !(parent && parent.hasAttribute('data-filo') && parent !== media);
    var box = created ? el('div') : parent;
    var home = { parent: parent, next: media.nextSibling };
    var hadControls = media.hasAttribute('controls');
    if (created) {
      parent.insertBefore(box, media);
      box.appendChild(media);
    }
    media.removeAttribute('controls');

    function button(cls, label, iconName) {
      var b = el('button', 'filo-button ' + cls, { type: 'button', 'aria-label': label, title: label });
      if (iconName) b.appendChild(icon(iconName));
      return b;
    }

    function skipButton(cls, dir, n) {
      var b = button(cls, (dir < 0 ? 'Back ' : 'Forward ') + n + ' seconds', dir < 0 ? 'back' : 'fwd');
      var s = el('span', 'filo-n', { 'aria-hidden': 'true' });
      s.textContent = String(n);
      b.appendChild(s);
      return b;
    }

    var $ = {
      top: el('div', 'filo-top'),
      title: el('div', 'filo-title'),
      chapter: el('div', 'filo-chapter', { 'aria-live': 'polite' }),
      center: el('div', 'filo-center'),
      bigBack: skipButton('filo-big filo-big-back', -1, o.step),
      bigPlay: button('filo-big filo-big-play', 'Play', 'play'),
      bigFwd: skipButton('filo-big filo-big-fwd', 1, o.step),
      chrome: el('div', 'filo-chrome'),
      track: el('div', 'filo-track', { role: 'slider', tabindex: '0', 'aria-label': 'Seek', 'aria-valuemin': '0' }),
      rail: el('div', 'filo-rail'),
      buffers: el('div', 'filo-buffers'),
      played: el('div', 'filo-played'),
      ticks: el('div', 'filo-ticks'),
      head: el('div', 'filo-head'),
      thumb: el('div', 'filo-thumb'),
      at: el('div', 'filo-at'),
      ghost: el('div', 'filo-ghost'),
      flag: el('div', 'filo-flag', { 'aria-hidden': 'true' }),
      frame: el('div', 'filo-frame'),
      flagTime: el('span', 'filo-flag-time'),
      flagChapter: el('span', 'filo-flag-chapter'),
      row: el('div', 'filo-row'),
      play: button('filo-play', 'Play', 'play'),
      back: skipButton('filo-back', -1, o.step),
      fwd: skipButton('filo-fwd', 1, o.step),
      volume: el('div', 'filo-volume'),
      mute: button('filo-mute', 'Mute', 'vol'),
      level: el('input', 'filo-level', { type: 'range', min: '0', max: '1', step: '0.05', 'aria-label': 'Volume' }),
      elapsed: el('span', 'filo-elapsed'),
      sep: el('span', 'filo-sep', { 'aria-hidden': 'true' }),
      total: el('span', 'filo-total'),
      remaining: el('span', 'filo-remaining'),
      now: el('span', 'filo-now'),
      gap: el('span', 'filo-gap'),
      more: button('filo-more', 'Settings', 'more'),
      full: button('filo-full', 'Fullscreen', 'full'),
      menu: el('div', 'filo-menu', { role: 'menu', 'aria-label': 'Settings', hidden: '' }),
      help: el('div', 'filo-help', { role: 'dialog', 'aria-label': 'Keyboard shortcuts', hidden: '' }),
      status: el('div', 'filo-status', { role: 'status', 'aria-live': 'polite' })
    };
    $.more.setAttribute('aria-haspopup', 'menu');
    $.more.setAttribute('aria-expanded', 'false');
    $.sep.textContent = ' / ';
    $.bigBack.tabIndex = -1;
    $.bigPlay.tabIndex = -1;
    $.bigFwd.tabIndex = -1;
    $.top.append($.title, $.chapter);
    $.center.append($.bigBack, $.bigPlay, $.bigFwd);
    $.flag.append($.frame, $.flagTime, $.flagChapter);
    $.rail.append($.buffers, $.played, $.ticks);
    $.head.append($.thumb);
    $.at.append($.ghost, $.flag);
    $.track.append($.rail, $.head, $.at);
    $.volume.append($.mute, $.level);
    $.row.append($.play, $.back, $.fwd, $.volume, $.elapsed, $.sep, $.total, $.remaining, $.now, $.gap, $.more, $.full);
    $.chrome.append($.track, $.row);
    var built = [$.top, $.center, $.chrome, $.menu, $.help, $.status];
    built.forEach(function (n) { box.appendChild(n); });
    box.classList.add('filo');
    if (opts.fill) box.classList.add('filo-fill');

    var pending = null, commitTimer = null, hideTimer = null, sleepTimer = null;
    var dragging = false, active = true, lastPointer = 'mouse', swallow = false;
    var sleepMode = 'off', chapterIndex = -2, lastSecond = -1, lastDuration = -1;
    var thumbs = [], thumbsUrl = null, menuView = null, menuReturn = null;
    var listeners = [];

    function on(target, type, fn, options) {
      target.addEventListener(type, fn, options);
      listeners.push([target, type, fn, options]);
    }

    function emit(type, detail) {
      box.dispatchEvent(new CustomEvent(type, { bubbles: true, detail: detail }));
    }

    function duration() {
      var d = media.duration;
      return isFinite(d) && d > 0 ? d : item.duration || 0;
    }

    function clamp(t) {
      var d = duration();
      return Math.max(0, d ? Math.min(t, d) : t);
    }

    function frac(t) {
      var d = duration();
      return d ? Math.max(0, Math.min(1, t / d)) : 0;
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

    function placeFill(f) {
      $.played.style.transform = 'scaleX(' + f + ')';
      $.head.style.transform = 'translateX(' + (f * 100) + '%)';
    }

    function paintTicks() {
      $.ticks.textContent = '';
      var d = duration();
      if (!d) return;
      item.chapters.forEach(function (c) {
        if (c.start <= 0 || c.start >= d) return;
        var t = el('span', 'filo-tick');
        t.style.left = (c.start / d * 100) + '%';
        $.ticks.append(t);
      });
    }

    function paintBuffered() {
      var d = duration(), b = media.buffered;
      $.buffers.textContent = '';
      if (!d || !b) return;
      for (var i = 0; i < b.length; i++) {
        var s = el('span', 'filo-buffered');
        s.style.transform = 'translateX(' + (frac(b.start(i)) * 100) + '%) scaleX(' + (frac(b.end(i)) - frac(b.start(i))) + ')';
        $.buffers.append(s);
      }
    }

    function sizeClocks() {
      var d = duration();
      if (d === lastDuration) return;
      lastDuration = d;
      lastSecond = -1;
      var w = Math.max(4, clock(d).length) + 'ch';
      [$.elapsed, $.total].forEach(function (n) { n.style.width = w; });
      $.remaining.style.width = 'calc(' + w + ' + 1ch)';
      $.total.textContent = clock(d);
      $.track.setAttribute('aria-valuemax', String(Math.round(d)));
      paintTicks();
    }

    function paintChapter(t) {
      var i = chapterAt(t);
      if (i === chapterIndex) return;
      if (sleepMode === 'chapter' && chapterIndex >= 0 && i > chapterIndex) sleepNow();
      chapterIndex = i;
      var c = i >= 0 ? item.chapters[i].title || '' : '';
      $.chapter.textContent = c;
      $.now.textContent = c;
    }

    function paint() {
      var t = media.currentTime || 0, d = duration();
      sizeClocks();
      if (pending == null && !dragging) placeFill(frac(t));
      paintChapter(t);
      var s = Math.floor(t);
      if (s === lastSecond) return;
      lastSecond = s;
      $.elapsed.textContent = clock(t);
      $.remaining.textContent = d ? '-' + clock(Math.max(0, d - t)) : '--:--';
      var c = chapterLabel(t);
      $.track.setAttribute('aria-valuenow', String(s));
      $.track.setAttribute('aria-valuetext', clock(t) + ' of ' + clock(d) + (c ? ', ' + c : ''));
    }

    function paintPlay() {
      var paused = media.paused;
      var label = paused ? 'Play' : 'Pause';
      [$.play, $.bigPlay].forEach(function (b) {
        setIcon(b, paused ? 'play' : 'pause');
        b.setAttribute('aria-label', label);
        b.title = label;
      });
      box.classList.toggle('filo-paused', paused);
      if (paused) wake();
      else armHide();
    }

    function paintVolume() {
      var silent = media.muted || media.volume === 0;
      setIcon($.mute, silent ? 'muted' : 'vol');
      $.mute.setAttribute('aria-label', silent ? 'Unmute' : 'Mute');
      $.mute.title = silent ? 'Unmute' : 'Mute';
      $.level.value = String(media.muted ? 0 : media.volume);
      box.classList.toggle('filo-muted', silent);
    }

    function paintFull() {
      var full = fullscreenElement() === box;
      box.classList.toggle('filo-fullscreen', full);
      setIcon($.full, full ? 'unfull' : 'full');
      var label = full ? 'Exit fullscreen' : 'Fullscreen';
      $.full.setAttribute('aria-label', label);
      $.full.title = label;
    }

    function paintKind() {
      var audio = audioMode();
      box.classList.toggle('filo-audio', audio);
      box.classList.toggle('filo-video', !audio);
      [$.bigBack, $.bigPlay, $.bigFwd].forEach(function (b) {
        b.classList.toggle('boil-ui', !audio && o.boil && hasBoil());
      });
      $.full.tabIndex = audio ? -1 : 0;
    }

    function frameAt(t) {
      for (var i = 0; i < thumbs.length; i++) {
        if (t >= thumbs[i].start && t < thumbs[i].end) return thumbs[i];
      }
      return null;
    }

    function paintFrame(t) {
      var c = audioMode() ? null : frameAt(t);
      box.classList.toggle('filo-framed', !!c);
      if (!c) return;
      var s = $.frame.style;
      s.backgroundImage = 'url("' + c.url.replace(/"/g, '%22') + '")';
      if (c.w) {
        s.width = c.w + 'px';
        s.height = c.h + 'px';
        s.backgroundPosition = (-c.x) + 'px ' + (-c.y) + 'px';
      }
    }

    function preview(t, label, follow) {
      var f = frac(t);
      box.classList.add('filo-previewing');
      $.at.style.transform = 'translateX(' + (f * 100) + '%)';
      $.flag.style.translate = (f < 0.12 ? '-12%' : f > 0.88 ? '-88%' : '-50%') + ' 0';
      $.flagTime.textContent = label || clock(t);
      $.flagChapter.textContent = label ? clock(t) : chapterLabel(t);
      paintFrame(t);
      if (follow) placeFill(f);
    }

    function endPreview() {
      box.classList.remove('filo-previewing', 'filo-held');
    }

    function commit(t) {
      clearTimeout(commitTimer);
      commitTimer = null;
      pending = null;
      var from = media.currentTime || 0, to = clamp(t);
      media.currentTime = to;
      endPreview();
      lastSecond = -1;
      placeFill(frac(to));
      paint();
      armHide();
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
      box.classList.add('filo-held');
      var delta = pending - (media.currentTime || 0);
      preview(pending, (delta < 0 ? '\u2212' : '+') + clock(Math.abs(delta)), true);
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

    function say(text) {
      $.status.textContent = text;
    }

    function toggle() {
      if (media.paused) {
        var p = media.play();
        if (p && p.catch) p.catch(function (e) {
          say(e && e.name === 'NotAllowedError' ? 'Tap play' : (e && e.message) || 'Playback failed');
          wake();
        });
      } else media.pause();
    }

    function rate(r) {
      r = Number(r);
      if (!(r > 0)) return media.playbackRate;
      media.playbackRate = r;
      media.defaultPlaybackRate = r;
      if (menuView) renderMenu(menuView);
      emit('filo:rate', { rate: r });
      return r;
    }

    function stepRate(dir) {
      var i = o.rates.indexOf(media.playbackRate);
      if (i < 0) i = o.rates.indexOf(1);
      var next = o.rates[Math.max(0, Math.min(o.rates.length - 1, i + dir))];
      rate(next);
      say(rateLabel(next));
    }

    function sleepNow() {
      clearTimeout(sleepTimer);
      sleepTimer = null;
      media.pause();
      sleepMode = 'off';
      say('Sleep timer stopped playback');
      emit('filo:sleep', { mode: 'off', fired: true });
    }

    function setSleep(mode) {
      clearTimeout(sleepTimer);
      sleepTimer = null;
      sleepMode = mode;
      if (/^\d+$/.test(mode)) sleepTimer = setTimeout(sleepNow, Number(mode) * 60000);
      emit('filo:sleep', { mode: mode, fired: false });
    }

    function wake() {
      if (!active) {
        active = true;
        box.classList.add('filo-active');
        emit('filo:bar', { shown: true });
      }
      armHide();
    }

    function rest() {
      clearTimeout(hideTimer);
      if (!active) return;
      active = false;
      box.classList.remove('filo-active');
      emit('filo:bar', { shown: false });
    }

    function holding() {
      return dragging || pending != null || !$.menu.hidden || !$.help.hidden;
    }

    function armHide() {
      clearTimeout(hideTimer);
      var ms = autohide();
      if (!ms || media.paused || holding()) return;
      hideTimer = setTimeout(function () { if (!holding() && !media.paused) rest(); }, ms);
    }

    function showBar(v) {
      if (v) wake();
      else rest();
    }

    function fullscreenElement() {
      return document.fullscreenElement || document.webkitFullscreenElement || null;
    }

    function fullscreen(v) {
      var isFull = fullscreenElement() === box;
      var want = v == null ? !isFull : !!v;
      if (want === isFull) return;
      if (want) {
        var req = box.requestFullscreen || box.webkitRequestFullscreen;
        if (req) {
          var p = req.call(box);
          if (p && p.catch) p.catch(function () {});
        } else if (media.webkitEnterFullscreen) media.webkitEnterFullscreen();
      } else {
        var exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) {
          var q = exit.call(document);
          if (q && q.catch) q.catch(function () {});
        }
      }
    }

    function mute() {
      if (media.muted || media.volume === 0) {
        media.muted = false;
        if (media.volume === 0) media.volume = 1;
      } else media.muted = true;
      paintVolume();
    }

    function menuItem(label, value, onPick, opts2) {
      var b = el('button', 'filo-menu-item', { type: 'button', role: (opts2 && opts2.radio) ? 'menuitemradio' : 'menuitem' });
      var l = el('span', 'filo-menu-label');
      l.textContent = label;
      b.appendChild(l);
      if (value != null) {
        var v = el('span', 'filo-menu-value');
        v.textContent = value;
        b.appendChild(v);
      }
      if (opts2 && opts2.radio) b.setAttribute('aria-checked', opts2.checked ? 'true' : 'false');
      if (opts2 && opts2.sub) b.classList.add('filo-menu-sub');
      b.addEventListener('click', function (e) { e.stopPropagation(); onPick(); });
      return b;
    }

    function qualityLabel() {
      for (var i = 0; i < qualities.length; i++) if (String(qualities[i].value) === quality) return qualities[i].label;
      return qualities.length ? qualities[0].label : '';
    }

    function sleepLabel() {
      for (var i = 0; i < SLEEP.length; i++) if (SLEEP[i][0] === sleepMode) return SLEEP[i][1];
      return 'Off';
    }

    function renderMenu(view) {
      var focusFirst = $.menu.contains(document.activeElement);
      menuView = view;
      $.menu.textContent = '';
      if (view === 'root') {
        $.menu.append(menuItem('Speed', rateLabel(media.playbackRate), function () { openView('rate'); }, { sub: true }));
        if (qualities.length > 1) $.menu.append(menuItem('Quality', qualityLabel(), function () { openView('quality'); }, { sub: true }));
        $.menu.append(menuItem('Sleep', sleepLabel(), function () { openView('sleep'); }, { sub: true }));
        if (item.chapters.length) $.menu.append(menuItem('Chapters', null, function () { openView('chapters'); }, { sub: true }));
        $.menu.append(menuItem('Keyboard shortcuts', '?', function () { help(true); }));
      } else {
        var titles = { rate: 'Speed', quality: 'Quality', sleep: 'Sleep', chapters: 'Chapters' };
        var head = menuItem('\u2039 ' + titles[view], null, function () { openView('root'); });
        head.classList.add('filo-menu-back');
        $.menu.append(head);
        var picks = [];
        if (view === 'rate') picks = o.rates.map(function (r) {
          return [rateLabel(r), r === media.playbackRate, function () { rate(r); closeMenu(); }];
        });
        if (view === 'quality') picks = qualities.map(function (q) {
          return [q.label, String(q.value) === (quality == null ? String(qualities[0].value) : quality), function () {
            quality = String(q.value);
            emit('filo:quality', { value: q.value });
            closeMenu();
          }];
        });
        if (view === 'sleep') picks = SLEEP.filter(function (s) { return s[0] !== 'chapter' || item.chapters.length; }).map(function (s) {
          return [s[1], s[0] === sleepMode, function () { setSleep(s[0]); closeMenu(); }];
        });
        if (view === 'chapters') {
          var cur = chapterAt(media.currentTime || 0);
          picks = item.chapters.map(function (c, i) {
            return [c.title || ('Chapter ' + (i + 1)), i === cur, function () { seekTo(c.start); closeMenu(); }, clock(c.start)];
          });
        }
        picks.forEach(function (p) {
          var b = menuItem(p[0], p[3] == null ? null : p[3], p[2], { radio: true, checked: p[1] });
          $.menu.append(b);
        });
      }
      if (focusFirst || menuReturn) {
        var first = $.menu.querySelector(view === 'root' ? '.filo-menu-item' : '[aria-checked="true"]') || $.menu.querySelector('.filo-menu-item');
        if (first) first.focus({ preventScroll: true });
      }
    }

    function openView(view) {
      renderMenu(view);
    }

    function menu(v) {
      var open = v == null ? $.menu.hidden : !!v;
      if (open) {
        help(false);
        menuReturn = box.contains(document.activeElement) ? document.activeElement : null;
        $.menu.hidden = false;
        box.classList.add('filo-menu-open');
        $.more.setAttribute('aria-expanded', 'true');
        wake();
        renderMenu('root');
      } else closeMenu();
    }

    function closeMenu() {
      if ($.menu.hidden) return;
      var hadFocus = $.menu.contains(document.activeElement);
      $.menu.hidden = true;
      menuView = null;
      box.classList.remove('filo-menu-open');
      $.more.setAttribute('aria-expanded', 'false');
      if (hadFocus) (menuReturn && box.contains(menuReturn) ? menuReturn : $.track).focus({ preventScroll: true });
      menuReturn = null;
      armHide();
    }

    function renderHelp() {
      $.help.textContent = '';
      var h = el('div', 'filo-help-title');
      h.textContent = 'Keys';
      var close = button('filo-help-close', 'Close', null);
      close.textContent = '\u00D7';
      close.addEventListener('click', function (e) { e.stopPropagation(); help(false); });
      var dl = el('dl', 'filo-keys');
      shortcuts(o).forEach(function (r) {
        var dt = el('dt'), dd = el('dd');
        dt.textContent = r[0];
        dd.textContent = r[1];
        dl.append(dt, dd);
      });
      $.help.append(close, h, dl);
    }

    function help(v) {
      var open = v == null ? $.help.hidden : !!v;
      if (open === !$.help.hidden) return;
      if (open) {
        closeMenu();
        renderHelp();
        $.help.hidden = false;
        box.classList.add('filo-help-open');
        wake();
      } else {
        var hadFocus = $.help.contains(document.activeElement);
        $.help.hidden = true;
        box.classList.remove('filo-help-open');
        if (hadFocus) $.track.focus({ preventScroll: true });
        armHide();
      }
    }

    function dismiss() {
      if (!$.help.hidden) { help(false); return true; }
      if (menuView && menuView !== 'root') { renderMenu('root'); return true; }
      if (!$.menu.hidden) { closeMenu(); return true; }
      return false;
    }

    function stop() {
      clearTimeout(commitTimer);
      pending = null;
      endPreview();
      closeMenu();
      help(false);
      media.pause();
      rest();
      emit('filo:stop', {});
    }

    function loadThumbnails(url) {
      thumbs = [];
      thumbsUrl = url || null;
      if (!url || typeof fetch !== 'function') return;
      var want = url;
      fetch(url, { credentials: 'same-origin' }).then(function (r) {
        if (!r.ok) throw new Error(String(r.status));
        return r.text();
      }).then(function (text) {
        if (thumbsUrl !== want) return;
        thumbs = parseVtt(text, new URL(url, location.href).href);
      }).catch(function () { if (thumbsUrl === want) thumbs = []; });
    }

    function setItem(next) {
      next = next || {};
      item.title = next.title || '';
      item.chapters = next.chapters || [];
      item.duration = next.duration || 0;
      if (next.kind) item.kind = next.kind;
      if ('thumbnails' in next) loadThumbnails(next.thumbnails);
      if ('qualities' in next) { qualities = next.qualities || []; quality = next.quality == null ? null : String(next.quality); }
      $.title.textContent = item.title;
      chapterIndex = -2;
      lastDuration = -1;
      lastSecond = -1;
      paintKind();
      paint();
      if (menuView) renderMenu(menuView);
    }

    function setQualities(list, current) {
      qualities = list || [];
      quality = current == null ? null : String(current);
      if (menuView) renderMenu(menuView);
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
      setQualities: setQualities,
      rate: rate,
      mute: mute,
      fullscreen: fullscreen,
      menu: menu,
      help: help,
      focus: function () { $.track.focus({ preventScroll: true }); },
      get shown() { return active; },
      get open() { return !$.menu.hidden || !$.help.hidden; },
      get pending() { return pending; },
      get root() { return box; },
      get media() { return media; },
      detach: function () {
        clearTimeout(commitTimer);
        clearTimeout(hideTimer);
        clearTimeout(sleepTimer);
        listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2], l[3]); });
        listeners = [];
        built.forEach(function (n) { n.remove(); });
        box.classList.remove('filo', 'filo-audio', 'filo-video', 'filo-active', 'filo-paused', 'filo-previewing',
          'filo-held', 'filo-dragging', 'filo-menu-open', 'filo-help-open', 'filo-fullscreen', 'filo-muted', 'filo-framed', 'filo-fill');
        if (hadControls) media.setAttribute('controls', '');
        if (created) {
          if (home.parent) home.parent.insertBefore(media, home.next && home.next.parentNode === home.parent ? home.next : box);
          box.remove();
        }
        delete media.filo;
      }
    };

    function onKey(e) {
      if (e.defaultPrevented) return;
      var path = e.composedPath ? e.composedPath() : [e.target];
      if (typing(path)) return;
      var inside = path.indexOf(box) >= 0;
      if (!o.globalKeys && !inside) return;
      if (e.key === 'Escape') {
        if (dismiss()) e.preventDefault();
        return;
      }
      if (!$.menu.hidden && inside && path.indexOf($.menu) >= 0) {
        if (menuKey(e)) e.preventDefault();
        return;
      }
      if (path[0] === $.level && /^(Arrow|Home|End|Page)/.test(e.key)) return;
      var a = keyAction(e, o);
      if (!a) return;
      if (a[0] === 'toggle' && (e.key === ' ' || e.key === 'Enter')) {
        for (var i = 0; i < path.length && path[i] !== box; i++) {
          var n = path[i];
          if (n.tagName === 'BUTTON' || n.tagName === 'A') return;
        }
      }
      e.preventDefault();
      if (a[0] !== 'showBar') wake();
      if (a[0] === 'stepRate') stepRate(a[1]);
      else api[a[0]](a[1]);
    }

    function menuKey(e) {
      var items = Array.prototype.slice.call($.menu.querySelectorAll('.filo-menu-item'));
      var i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { (items[i + 1] || items[0]).focus(); return true; }
      if (e.key === 'ArrowUp') { (items[i - 1] || items[items.length - 1]).focus(); return true; }
      if (e.key === 'ArrowLeft') { if (menuView !== 'root') renderMenu('root'); else closeMenu(); return true; }
      if (e.key === 'ArrowRight' && document.activeElement && document.activeElement.classList.contains('filo-menu-sub')) {
        document.activeElement.click();
        return true;
      }
      return false;
    }

    function timeAtX(x) {
      var r = $.rail.getBoundingClientRect();
      var f = r.width ? Math.max(0, Math.min(1, (x - r.left) / r.width)) : 0;
      return f * duration();
    }

    function interactive(target) {
      for (var n = target; n && n !== box; n = n.parentNode) {
        if (n === $.chrome || n === $.center || n === $.menu || n === $.help) return true;
      }
      return false;
    }

    on(o.globalKeys ? document : box, 'keydown', onKey);
    on($.play, 'click', toggle);
    on($.bigPlay, 'click', function (e) { e.stopPropagation(); toggle(); });
    on($.back, 'click', function () { skip(-o.step); });
    on($.fwd, 'click', function () { skip(o.step); });
    on($.bigBack, 'click', function (e) { e.stopPropagation(); skip(-o.step); });
    on($.bigFwd, 'click', function (e) { e.stopPropagation(); skip(o.step); });
    on($.mute, 'click', mute);
    on($.level, 'input', function () {
      var v = Number($.level.value);
      media.volume = v;
      media.muted = v === 0;
    });
    on($.more, 'click', function (e) { e.stopPropagation(); menu(); });
    on($.full, 'click', function () { fullscreen(); });
    on($.track, 'pointerdown', function (e) {
      if (e.button !== 0 || !duration()) return;
      dragging = true;
      box.classList.add('filo-held', 'filo-dragging');
      if ($.track.setPointerCapture) $.track.setPointerCapture(e.pointerId);
      wake();
      preview(timeAtX(e.clientX), null, true);
    });
    on($.track, 'pointermove', function (e) {
      if (dragging) return preview(timeAtX(e.clientX), null, true);
      if (e.pointerType === 'mouse' && duration()) preview(timeAtX(e.clientX));
    });
    on($.track, 'pointerup', function (e) {
      if (!dragging) return;
      dragging = false;
      box.classList.remove('filo-dragging');
      commit(timeAtX(e.clientX));
    });
    on($.track, 'pointercancel', function () {
      dragging = false;
      box.classList.remove('filo-dragging');
      endPreview();
      placeFill(frac(media.currentTime || 0));
    });
    on($.track, 'pointerleave', function () {
      if (!dragging && pending == null) endPreview();
    });
    on(box, 'pointerdown', function (e) {
      lastPointer = e.pointerType || 'mouse';
      swallow = false;
      if (!$.menu.hidden && !$.menu.contains(e.target) && !$.more.contains(e.target)) {
        closeMenu();
        swallow = !interactive(e.target);
      }
    });
    on(box, 'pointermove', function (e) {
      if (e.pointerType === 'mouse') wake();
    });
    on(box, 'pointerleave', function (e) {
      if (e.pointerType === 'mouse' && !media.paused && !holding() && autohide()) rest();
    });
    on(box, 'focusout', function (e) {
      if (e.relatedTarget && box.contains(e.relatedTarget)) return;
      if (!media.paused && !holding() && autohide()) rest();
    });
    on(box, 'click', function (e) {
      if (interactive(e.target) || audioMode()) return;
      if (swallow) { swallow = false; return; }
      if (!$.help.hidden) { help(false); return; }
      if (lastPointer === 'mouse') { toggle(); wake(); return; }
      if (active && !media.paused) rest();
      else wake();
    });
    on(box, 'dblclick', function (e) {
      if (interactive(e.target) || audioMode() || lastPointer !== 'mouse') return;
      fullscreen();
    });
    on(document, 'pointerdown', function (e) {
      if (!$.menu.hidden && !box.contains(e.target)) closeMenu();
    });
    on(document, 'fullscreenchange', function () { paintFull(); emit('filo:fullscreen', { on: fullscreenElement() === box }); });
    on(document, 'webkitfullscreenchange', paintFull);
    on(media, 'timeupdate', paint);
    on(media, 'durationchange', function () { lastDuration = -1; paint(); paintBuffered(); });
    on(media, 'loadedmetadata', function () { lastDuration = -1; paint(); });
    on(media, 'progress', paintBuffered);
    on(media, 'seeked', paintBuffered);
    on(media, 'play', paintPlay);
    on(media, 'pause', paintPlay);
    on(media, 'volumechange', paintVolume);
    on(media, 'ratechange', function () { if (menuView) renderMenu(menuView); });

    if (opts.rate) rate(opts.rate);
    box.classList.add('filo-active');
    setItem({ title: item.title, chapters: item.chapters, duration: item.duration, kind: item.kind, thumbnails: opts.thumbnails });
    paintBuffered();
    paintPlay();
    paintVolume();
    paintFull();
    media.filo = api;
    return api;
  }

  function fromData(n) {
    var a = n.getAttribute('data-filo-autohide');
    return {
      globalKeys: n.getAttribute('data-filo-keys') === 'global',
      title: n.getAttribute('data-filo-title') || n.getAttribute('title') || '',
      thumbnails: n.getAttribute('data-filo-thumbnails') || undefined,
      autohide: a == null ? undefined : Number(a),
      boil: n.getAttribute('data-filo-boil') !== 'off'
    };
  }

  function boot() {
    var nodes = document.querySelectorAll('video[data-filo], audio[data-filo]');
    for (var i = 0; i < nodes.length; i++) if (!nodes[i].filo) attach(nodes[i], fromData(nodes[i]));
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }

  return { attach: attach, clock: clock, parseVtt: parseVtt, shortcuts: shortcuts };
}));
