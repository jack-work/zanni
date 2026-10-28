'use strict';

(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.zanni = root.zanni || {};
    root.zanni.proscenio = api;
  }
}(typeof self !== 'undefined' ? self : this, function () {

  var NARROW = '(max-width: 899px)';
  var SCROLL_SLOP = 4, TAP_ZONE = 48, TAP_MS = 350, TAP_SLOP = 10;
  var SLOTS = ['drawer-toggle', 'mark', 'identity', 'nav', 'search', 'status', 'tool', 'action'];
  var SVG = 'http://www.w3.org/2000/svg';
  var ICONS = {
    search: 'M5 1h5v1h-5zM3 2h2v1h-2zM10 2h2v1h-2zM2 3h1v2h-1zM12 3h1v2h-1zM1 5h1v5h-1zM13 5h1v5h-1zM2 10h1v2h-1zM12 10h1v2h-1zM3 12h2v1h-2zM10 12h2v1h-2zM5 13h5v1h-5zM12 12h1v1h-1zM13 13h1v1h-1zM14 14h1v1h-1z',
    more: 'M1 7h3v3h-3zM6 7h3v3h-3zM11 7h3v3h-3z',
    close: 'M2 2h2v1h-2zM12 2h2v1h-2zM3 3h2v1h-2zM11 3h2v1h-2zM4 4h2v1h-2zM10 4h2v1h-2zM5 5h2v1h-2zM9 5h2v1h-2zM6 6h4v1h-4zM7 7h2v1h-2zM6 8h4v1h-4zM5 9h2v1h-2zM9 9h2v1h-2zM4 10h2v1h-2zM10 10h2v1h-2zM3 11h2v1h-2zM11 11h2v1h-2zM2 12h2v1h-2zM12 12h2v1h-2z'
  };
  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function el(tag, cls, attrs) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    for (var k in attrs || {}) n.setAttribute(k, attrs[k]);
    return n;
  }

  function icon(name) {
    var s = document.createElementNS(SVG, 'svg');
    s.setAttribute('class', 'proscenio-icon');
    s.setAttribute('viewBox', '0 0 16 16');
    s.setAttribute('shape-rendering', 'crispEdges');
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('focusable', 'false');
    var p = document.createElementNS(SVG, 'path');
    p.setAttribute('d', ICONS[name]);
    s.appendChild(p);
    return s;
  }

  function iconButton(cls, label, name) {
    var b = el('button', 'proscenio-button ' + cls, { type: 'button', 'aria-label': label, title: label });
    b.appendChild(icon(name));
    return b;
  }

  function watchModality() {
    var html = document.documentElement;
    if (html.hasAttribute('data-zanni-modality')) return;
    html.setAttribute('data-zanni-modality', '');
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) html.classList.add('zanni-pointing');
    document.addEventListener('pointerdown', function () { html.classList.add('zanni-pointing'); }, true);
    document.addEventListener('keydown', function () { html.classList.remove('zanni-pointing'); }, true);
  }

  function typing(t) {
    return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  }

  function visible(n) {
    return !!(n && n.getClientRects().length);
  }

  function attach(header, opts) {
    if (!header || header.proscenio) return header && header.proscenio;
    opts = opts || {};
    watchModality();
    var tv = opts.mode === 'tv';
    var keys = opts.keys || {};
    var html = document.documentElement;
    var narrowQuery = window.matchMedia(NARROW);
    var narrow = function () { return !tv && narrowQuery.matches; };

    var given = opts.slots || {};
    SLOTS.forEach(function (name) {
      var v = given[name];
      if (!v) return;
      (Array.isArray(v) ? v : [v]).forEach(function (n) {
        n.setAttribute('data-slot', name);
        header.appendChild(n);
      });
    });

    var original = Array.prototype.slice.call(header.childNodes);
    var slots = {};
    SLOTS.forEach(function (name) { slots[name] = []; });
    original.forEach(function (n) {
      if (n.nodeType === 1 && slots[n.getAttribute('data-slot')]) slots[n.getAttribute('data-slot')].push(n);
    });
    if (tv) {
      slots['drawer-toggle'].concat(slots.search).forEach(function (n) { n.hidden = true; });
    }

    var $ = {
      row: el('div', 'proscenio-row'),
      lead: el('div', 'proscenio-lead'),
      brand: el('div', 'proscenio-brand'),
      fold: el('div', 'proscenio-fold', { id: 'proscenio-fold-' + Math.random().toString(36).slice(2, 8) }),
      nav: el('div', 'proscenio-nav'),
      status: el('div', 'proscenio-status'),
      tools: el('div', 'proscenio-tools'),
      search: el('div', 'proscenio-search'),
      find: iconButton('proscenio-find', 'Search', 'search'),
      unfind: iconButton('proscenio-unfind', 'Close search', 'close'),
      actions: el('div', 'proscenio-actions'),
      more: iconButton('proscenio-more', 'More', 'more')
    };
    $.more.setAttribute('aria-expanded', 'false');
    $.more.setAttribute('aria-controls', $.fold.id);

    var trailing = el('div', 'proscenio-trail');
    slots['drawer-toggle'].forEach(function (n) {
      if (tv) return;
      var d = document.getElementById(n.getAttribute('aria-controls') || '');
      var side = d && d.getAttribute('data-side') || 'left';
      (side === 'left' ? $.lead : trailing).appendChild(n);
    });
    slots.mark.concat(slots.identity).forEach(function (n) { $.brand.appendChild(n); });
    slots.nav.forEach(function (n) { $.nav.appendChild(n); });
    slots.status.forEach(function (n) { $.status.appendChild(n); });
    slots.tool.forEach(function (n) { $.tools.appendChild(n); });
    slots.action.forEach(function (n) { $.actions.appendChild(n); });
    var input = !tv && slots.search[0];
    if (input) $.search.append($.find, input, $.unfind);
    $.fold.append($.nav, $.status, $.tools);
    $.row.append($.lead, $.brand, $.fold, $.search, $.actions, trailing, $.more);
    original.forEach(function (n) {
      if (n.nodeType !== 1) return;
      var mode = n.getAttribute('data-narrow');
      if (mode === 'fold' && !$.fold.contains(n)) {
        var slotMark = el('span', 'proscenio-home');
        n.parentNode.insertBefore(slotMark, n);
        n.proscenioHome = slotMark;
        n.classList.add('proscenio-foldable');
      }
    });
    var foldables = original.filter(function (n) { return n.proscenioHome; });
    if (!slots.nav.length && !slots.status.length && !slots.tool.length && !foldables.length) header.classList.add('proscenio-nofold');
    header.appendChild($.row);
    header.classList.add('proscenio');
    header.setAttribute('data-mode', tv ? 'tv' : 'default');
    [['lead', 'drawer-toggle'], ['nav', 'nav'], ['status', 'status'], ['tools', 'tool'], ['actions', 'action'], ['search', 'search']].forEach(function (g) {
      if (!$[g[0]].querySelector('[data-slot]') || (g[1] === 'search' && !input)) $[g[0]].classList.add('proscenio-empty');
    });


    var listeners = [];
    function on(t, type, fn, o) { t.addEventListener(type, fn, o); listeners.push([t, type, fn, o]); }
    function emit(type, detail) { header.dispatchEvent(new CustomEvent(type, { bubbles: true, detail: detail })); }

    var hidden = false, menuOpen = false, searching = false, drawer = null, drawerOpen = false, scrim = null, lastStop = null, drawers = [];

    function rendered() { return visible(header); }

    function measure() {
      var h = rendered() ? Math.round(header.getBoundingClientRect().height) : 0;
      html.style.setProperty('--proscenio-height', h + 'px');
      html.style.setProperty('--proscenio-pad', narrow() && rendered() ? h + 'px' : '0px');
      html.style.setProperty('--proscenio-shown', narrow() && rendered() && !hidden ? h + 'px' : '0px');
      html.classList.toggle('proscenio-drawers', narrow() || tv);
    }

    function setHidden(h) {
      h = !!h && narrow();
      if (h === hidden) return;
      hidden = h;
      if (h) menu(false);
      header.classList.toggle('proscenio-hidden', h);
      measure();
      emit('proscenio:hidden', { on: h });
    }

    function overlaid() { return menuOpen || searching || drawerOpen; }

    function menu(v) {
      var open = v == null ? !menuOpen : !!v;
      if (open && !narrow()) open = false;
      if (open === menuOpen) return;
      menuOpen = open;
      header.classList.toggle('proscenio-menu-open', open);
      $.more.setAttribute('aria-expanded', String(open));
      if (open) {
        var first = $.fold.querySelector(FOCUSABLE);
        if (first) first.focus({ preventScroll: true });
      } else if ($.fold.contains(document.activeElement) && narrow()) $.more.focus({ preventScroll: true });
      emit('proscenio:menu', { open: open });
    }

    function search(v) {
      if (!input) return;
      var open = v == null ? !searching : !!v;
      if (open === searching) {
        if (open) input.focus();
        return;
      }
      searching = open;
      header.classList.toggle('proscenio-searching', open && narrow());
      if (open) {
        setHidden(false);
        menu(false);
        input.focus();
      } else if (document.activeElement === input) {
        input.blur();
        if (narrow()) $.find.focus({ preventScroll: true });
      }
      emit('proscenio:search', { open: open });
    }

    function drawerFor(toggle) {
      var id = toggle && toggle.getAttribute('aria-controls');
      var d = id ? document.getElementById(id) : null;
      if (d && !d.classList.contains('proscenio-drawer')) {
        d.classList.add('proscenio-drawer');
        if (!d.hasAttribute('data-side')) d.setAttribute('data-side', 'left');
        if (!d.hasAttribute('tabindex')) d.setAttribute('tabindex', '-1');
        d.proscenioColumn = toggle.getAttribute('aria-expanded') !== 'false';
        drawers.push(d);
      }
      return d;
    }

    function openDrawer(d, v, toggle) {
      if (!d) return;
      var isOpen = drawer === d;
      var open = v == null ? !isOpen : !!v;
      if (!narrow() && !tv) {
        var shown = column(d, toggle);
        var want = v == null ? !shown : !!v;
        setColumn(d, toggle, want);
        emit('proscenio:drawer', { id: d.id, side: d.getAttribute('data-side'), open: want });
        return;
      }
      if (open === isOpen) return;
      if (open && drawer) openDrawer(drawer, false);
      var t = toggle || slots['drawer-toggle'].filter(function (x) { return x.getAttribute('aria-controls') === d.id; })[0];
      if (t) t.setAttribute('aria-expanded', String(open));
      if (open) {
        menu(false);
        if (!scrim) {
          scrim = el('div', 'proscenio-scrim');
          scrim.addEventListener('click', function () { if (drawer) openDrawer(drawer, false); });
        }
        d.parentNode.insertBefore(scrim, d);
        d.classList.add('proscenio-drawer-open');
        drawer = d;
        drawerOpen = true;
        d.proscenioReturn = document.activeElement;
        var first = html.classList.contains('zanni-pointing') ? d : d.querySelector(FOCUSABLE) || d;
        first.focus({ preventScroll: true });
      } else shut(d, t);
      emit('proscenio:drawer', { id: d.id, side: d.getAttribute('data-side'), open: open });
    }

    function shut(d, t) {
      d.classList.remove('proscenio-drawer-open');
      if (scrim) scrim.remove();
      if (t) t.setAttribute('aria-expanded', narrow() || tv ? 'false' : String(column(d, t)));
      drawer = null;
      drawerOpen = false;
      var back = d.proscenioReturn;
      if (d.contains(document.activeElement) && back && back.focus) back.focus({ preventScroll: true });
    }

    function toggleOf(d) {
      return slots['drawer-toggle'].filter(function (x) { return x.getAttribute('aria-controls') === d.id; })[0];
    }

    function column(d) {
      if (d.proscenioColumn == null) d.proscenioColumn = true;
      return d.proscenioColumn;
    }

    function setColumn(d, t, v) {
      d.proscenioColumn = v;
      t = t || toggleOf(d);
      if (t) t.setAttribute('aria-expanded', String(v));
    }

    function placeFoldables() {
      original.forEach(function (n) {
        if (!n.proscenioHome) return;
        if (narrow()) $.fold.insertBefore(n, $.fold.firstChild);
        else n.proscenioHome.parentNode.insertBefore(n, n.proscenioHome);
      });
    }

    function adopt(d) {
      if (!d.classList.contains('proscenio-drawer')) {
        d.classList.add('proscenio-drawer');
        if (!d.hasAttribute('data-side')) d.setAttribute('data-side', 'left');
        if (!d.hasAttribute('tabindex')) d.setAttribute('tabindex', '-1');
        drawers.push(d);
      }
      return d;
    }

    function stops() {
      return Array.prototype.slice.call($.row.querySelectorAll(FOCUSABLE)).filter(visible);
    }

    function enter() {
      var s = stops();
      if (!s.length) return false;
      var target = lastStop && s.indexOf(lastStop) >= 0 ? lastStop : s[0];
      target.focus({ preventScroll: true });
      return true;
    }

    function onKey(e) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') {
        if (typing(e.target) && e.target !== input) return;
        if (searching) { search(false); e.preventDefault(); return; }
        if (menuOpen) { menu(false); e.preventDefault(); return; }
        if (drawerOpen) { openDrawer(drawer, false); e.preventDefault(); return; }
        return;
      }
      if (e.key === 'Tab' && drawerOpen) {
        var f = Array.prototype.slice.call(drawer.querySelectorAll(FOCUSABLE)).filter(visible);
        if (!f.length) { e.preventDefault(); return; }
        var i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { f[f.length - 1].focus(); e.preventDefault(); }
        else if (!e.shiftKey && (i === f.length - 1 || i < 0)) { f[0].focus(); e.preventDefault(); }
        return;
      }
      if (tv && $.row.contains(document.activeElement)) {
        var s = stops(), j = s.indexOf(document.activeElement);
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          var next = s[j + (e.key === 'ArrowLeft' ? -1 : 1)];
          if (next) next.focus({ preventScroll: true });
          e.preventDefault();
          return;
        }
        if (e.key === 'ArrowDown') {
          lastStop = document.activeElement;
          document.activeElement.blur();
          e.preventDefault();
          emit('proscenio:leave', {});
          return;
        }
      }
      if (e.key === '/' && input && keys.search !== false && !typing(e.target) && rendered()) {
        e.preventDefault();
        search(true);
      }
    }

    var last = new WeakMap(), lastWindow = 0;
    function onScroll(e) {
      if (!narrow() || !rendered()) return;
      var t = e.target === document || e.target === window ? null : e.target;
      if (opts.scroller && opts.scroller !== window && t !== opts.scroller) return;
      if (opts.scroller === window && t) return;
      var y = t ? t.scrollTop : window.scrollY;
      var prev = t ? (last.get(t) || 0) : lastWindow;
      if (t) last.set(t, y); else lastWindow = y;
      if (y <= header.offsetHeight) setHidden(false);
      else if (y - prev > SCROLL_SLOP && !overlaid()) setHidden(true);
      else if (prev - y > SCROLL_SLOP) setHidden(false);
    }

    var tap = null;
    function moved(e, t) { return Math.hypot(e.clientX - t.x, e.clientY - t.y) > TAP_SLOP; }
    function swallow(e) { e.preventDefault(); e.stopPropagation(); }

    on($.more, 'click', function (e) { e.stopPropagation(); menu(); });
    on($.find, 'click', function () { search(true); });
    on($.unfind, 'click', function () { search(false); });
    if (input) on(input, 'blur', function () {
      setTimeout(function () {
        if (searching && document.activeElement !== input && !$.search.contains(document.activeElement) && !input.value) search(false);
      }, 0);
    });
    slots['drawer-toggle'].forEach(function (t) {
      drawerFor(t);
      on(t, 'click', function () { openDrawer(drawerFor(t), null, t); });
    });
    on(document, 'click', function (e) {
      if (drawerOpen && narrow() && drawer.contains(e.target) && e.target.closest && e.target.closest('a[href]')) openDrawer(drawer, false);
    });
    on(window, 'popstate', function () { if (drawerOpen) openDrawer(drawer, false); });
    on($.fold, 'click', function (e) { if (narrow() && e.target.closest && e.target.closest('a, button')) menu(false); });
    on($.fold, 'change', function () { if (narrow()) menu(false); });
    on(document, 'click', function (e) { if (menuOpen && !$.fold.contains(e.target) && !$.more.contains(e.target)) menu(false); });
    on(document, 'keydown', onKey);
    on(document, 'scroll', onScroll, { capture: true, passive: true });
    on(header, 'focusin', function () { if (hidden) setHidden(false); });
    on(document, 'pointerdown', function (e) {
      tap = narrow() && hidden && rendered() && e.isPrimary && e.clientY < TAP_ZONE
        ? { x: e.clientX, y: e.clientY, at: e.timeStamp, sel: String(getSelection()) } : null;
    }, { capture: true, passive: true });
    on(document, 'pointermove', function (e) { if (tap && moved(e, tap)) tap = null; }, { capture: true, passive: true });
    on(document, 'pointerup', function (e) {
      var t = tap;
      tap = null;
      if (!t || moved(e, t) || e.timeStamp - t.at > TAP_MS || String(getSelection()) !== t.sel) return;
      setHidden(false);
      document.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(function () { document.removeEventListener('click', swallow, true); }, 500);
    }, true);
    var swipe = null;
    on(document, 'pointerdown', function (e) {
      swipe = drawerOpen && drawer.contains(e.target) ? { x: e.clientX, y: e.clientY } : null;
    }, true);
    on(document, 'pointerup', function (e) {
      if (!swipe) return;
      var dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
      var side = drawer.getAttribute('data-side');
      swipe = null;
      var across = Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy);
      var down = dy > 60 && dy > 2 * Math.abs(dx);
      if ((across && ((side === 'left' && dx < 0) || (side === 'right' && dx > 0))) || (down && side === 'bottom')) openDrawer(drawer, false);
    }, true);
    var onBreak = function () {
      menu(false);
      setHidden(false);
      header.classList.toggle('proscenio-searching', searching && narrow());
      if (drawerOpen && !narrow() && !tv) shut(drawer, toggleOf(drawer));
      slots['drawer-toggle'].forEach(function (t) {
        var d = drawerFor(t);
        if (d) t.setAttribute('aria-expanded', String(narrow() ? false : column(d, t)));
      });
      placeFoldables();
      measure();
    };
    if (narrowQuery.addEventListener) on(narrowQuery, 'change', onBreak);
    var ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    if (ro) ro.observe(header);
    placeFoldables();
    measure();

    var api = {
      open: function (what) {
        if (what === 'menu') menu(true);
        else if (what === 'search') search(true);
        else if (what && what.nodeType === 1) openDrawer(drawerFor(slots['drawer-toggle'].filter(function (t) { return t.getAttribute('aria-controls') === what.id; })[0]) || adopt(what), true);
      },
      close: function () { search(false); menu(false); if (drawer) openDrawer(drawer, false); },
      show: function () { setHidden(false); },
      enter: enter,
      setIdentity: function (v) {
        var id = slots.identity[0];
        if (!id) return;
        if (typeof v === 'string') id.textContent = v;
        else if (v) { id.textContent = ''; id.appendChild(v); }
      },
      get hidden() { return hidden; },
      get menuOpen() { return menuOpen; },
      get searching() { return searching; },
      get drawerOpen() { return drawerOpen; },
      get drawer() { return drawer; },
      destroy: function () {
        api.close();
        listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2], l[3]); });
        if (ro) ro.disconnect();
        original.forEach(function (n) { if (n.hidden && tv) n.hidden = false; header.appendChild(n); });
        $.row.remove();
        header.classList.remove('proscenio', 'proscenio-hidden', 'proscenio-menu-open', 'proscenio-searching', 'proscenio-nofold');
        header.removeAttribute('data-mode');
        original.forEach(function (n) { if (n.proscenioHome) { n.proscenioHome.remove(); delete n.proscenioHome; n.classList.remove('proscenio-foldable'); } });
        drawers.forEach(function (d) { d.classList.remove('proscenio-drawer', 'proscenio-drawer-open'); });
        ['--proscenio-height', '--proscenio-pad', '--proscenio-shown'].forEach(function (k) { html.style.removeProperty(k); });
        html.classList.remove('proscenio-drawers');
        delete header.proscenio;
      }
    };
    header.proscenio = api;
    return api;
  }

  function boot() {
    var nodes = document.querySelectorAll('[data-proscenio]');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.proscenio || n.getAttribute('data-proscenio') === 'manual') continue;
      attach(n, { mode: n.getAttribute('data-proscenio') === 'tv' ? 'tv' : 'default', keys: { search: n.getAttribute('data-proscenio-search-key') !== 'off' } });
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }

  return { attach: attach };
}));
