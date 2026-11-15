'use strict';

(function (root) {
  var api = {};
  var number = function (n) { return typeof n === 'number' && isFinite(n) && n >= 0; };

  function describe(item) {
    item = item || {};
    var duration = number(item.duration) && item.duration > 0 ? item.duration : item.position && number(item.position.duration) && item.position.duration > 0 ? item.position.duration : null;
    var at = item.position && number(item.position.position) ? item.position.position : 0;
    return {
      key: typeof item.key === 'string' ? item.key : '',
      title: typeof item.title === 'string' && item.title.trim() ? item.title : item.key || 'Untitled',
      kind: item.kind === 'audio' ? 'audio' : item.kind === 'video' ? 'video' : null,
      duration: duration,
      resume: duration !== null && at > 5 && at < duration - 10 ? at : null,
      progress: duration !== null && at > 0 ? Math.min(1, at / duration) : null,
      poster: typeof item.poster === 'string' && item.poster.trim() ? imageUrl(item.poster) : null
    };
  }

  function imageUrl(src) {
    try {
      var url = new URL(src, location.href);
      return /^https?:$/.test(url.protocol) && url.origin === location.origin && !url.username && !url.password ? url.href : null;
    } catch (_) { return null; }
  }

  function clock(t) {
    var minutes = Math.floor(t / 60), seconds = String(Math.floor(t % 60)).padStart(2, '0');
    return minutes >= 60 ? Math.floor(minutes / 60) + ':' + String(minutes % 60).padStart(2, '0') + ':' + seconds : minutes + ':' + seconds;
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function artwork(info, cls) {
    var frame = el('div', cls);
    var fallback = el('span', cls + '-fallback', info.kind === 'audio' ? 'Audio' : info.kind === 'video' ? 'Video' : 'Media');
    frame.appendChild(fallback);
    if (info.poster) {
      var image = el('img', cls + '-image');
      image.alt = '';
      image.loading = 'lazy';
      image.decoding = 'async';
      image.addEventListener('load', function () { fallback.hidden = true; });
      image.addEventListener('error', function () { image.remove(); fallback.hidden = false; });
      image.src = info.poster;
      frame.appendChild(image);
    }
    return frame;
  }

  function mount(host, opts) {
    opts = opts || {};
    if (!host) return null;
    var section = el('section', 'catalogo');
    section.dataset.mode = opts.mode === 'tv' ? 'tv' : 'desktop';
    section.dataset.layout = opts.layout === 'shelf' ? 'shelf' : 'grid';
    var heading = el('h2', 'catalogo-heading', opts.title || 'My media');
    var list = el('div', 'catalogo-list');
    list.setAttribute('role', 'list');
    list.setAttribute('aria-label', opts.title || 'My media');
    section.append(heading, list);
    host.appendChild(section);
    var items = [], cards = [], activeKey = null, aimX = null;

    function activate(key, focus) {
      var index = items.findIndex(function (item) { return item.key === key; });
      if (index < 0) return false;
      activeKey = key;
      cards.forEach(function (card, i) { card.tabIndex = i === index ? 0 : -1; });
      if (focus) {
        cards[index].focus({ preventScroll: true });
        cards[index].scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
      return true;
    }

    function setItems(next) {
      var focused = section.contains(document.activeElement), oldIndex = items.findIndex(function (item) { return item.key === activeKey; });
      var seen = Object.create(null);
      items = (Array.isArray(next) ? next : []).filter(function (item) {
        if (!item || typeof item.key !== 'string' || !item.key || seen[item.key]) return false;
        seen[item.key] = true;
        return opts.resumeOnly ? describe(item).resume !== null : true;
      });
      list.replaceChildren();
      cards = items.map(function (item) {
        var info = describe(item), row = el('div', 'catalogo-cell');
        row.setAttribute('role', 'listitem');
        var button = el('button', 'catalogo-card');
        button.type = 'button';
        button.dataset.key = info.key;
        var frame = artwork(info, 'catalogo-art');
        if (info.progress !== null) {
          var progress = el('progress', 'catalogo-progress');
          progress.max = 1;
          progress.value = info.progress;
          progress.setAttribute('aria-label', 'Playback progress for ' + info.title);
          frame.appendChild(progress);
        }
        button.append(frame, el('span', 'catalogo-title', info.title));
        var detail = [];
        if (info.resume !== null) detail.push((info.kind === 'audio' ? 'Continue listening' : 'Continue watching') + ' · ' + clock(info.resume));
        else if (info.duration !== null) detail.push(clock(info.duration));
        if (detail.length) button.appendChild(el('span', 'catalogo-detail', detail.join(' · ')));
        button.addEventListener('focus', function () { activate(info.key, false); });
        button.addEventListener('click', function () {
          var detail = { key: info.key, item: item };
          section.dispatchEvent(new CustomEvent('catalogo:select', { bubbles: true, detail: detail }));
          if (typeof opts.onSelect === 'function') opts.onSelect(item);
        });
        row.appendChild(button);
        list.appendChild(row);
        return button;
      });
      if (!items.length) {
        list.appendChild(el('p', 'catalogo-empty', opts.empty || (opts.resumeOnly ? 'Nothing to continue.' : 'No media to show.')));
        activeKey = null;
        return;
      }
      if (!items.some(function (item) { return item.key === activeKey; })) activeKey = items[Math.max(0, Math.min(items.length - 1, oldIndex))].key;
      activate(activeKey, focused);
    }

    function keydown(event) {
      if (event.catalogoRemote && event.key === 'Enter' && cards.indexOf(document.activeElement) >= 0) {
        event.preventDefault();
        document.activeElement.click();
        return;
      }
      if (event.altKey || event.ctrlKey || event.metaKey || !/^(ArrowLeft|ArrowRight|ArrowUp|ArrowDown|Home|End)$/.test(event.key)) return;
      var index = cards.indexOf(document.activeElement);
      if (index < 0) return;
      section.classList.add('catalogo-keyboard');
      var rows = [];
      cards.forEach(function (card, i) {
        var rect = card.getBoundingClientRect();
        var row = rows.find(function (r) { return Math.abs(r.top - rect.top) < 2; });
        if (!row) { row = { top: rect.top, cards: [] }; rows.push(row); }
        row.cards.push({ index: i, x: rect.left + rect.width / 2 });
      });
      var rowIndex = rows.findIndex(function (row) { return row.cards.some(function (card) { return card.index === index; }); });
      var row = rows[rowIndex], column = row.cards.findIndex(function (card) { return card.index === index; }), target = null;
      if (event.key === 'ArrowLeft') target = row.cards[column - 1];
      if (event.key === 'ArrowRight') target = row.cards[column + 1];
      if (event.key === 'Home') target = row.cards[0];
      if (event.key === 'End') target = row.cards[row.cards.length - 1];
      if (/^(ArrowUp|ArrowDown)$/.test(event.key)) {
        if (aimX === null) aimX = row.cards[column].x;
        var nextRow = rows[rowIndex + (event.key === 'ArrowUp' ? -1 : 1)];
        if (nextRow) target = nextRow.cards.reduce(function (best, card) { return !best || Math.abs(card.x - aimX) < Math.abs(best.x - aimX) ? card : best; }, null);
      } else aimX = target ? target.x : row.cards[column].x;
      event.preventDefault();
      if (target) activate(items[target.index].key, true);
      else section.dispatchEvent(new CustomEvent('catalogo:edge', { bubbles: true, detail: { key: activeKey, direction: event.key } }));
    }

    function pointer() { section.classList.remove('catalogo-keyboard'); }
    list.addEventListener('keydown', keydown);
    list.addEventListener('pointerdown', pointer);
    setItems(opts.items || []);
    return {
      root: section,
      setItems: setItems,
      focus: function (key) { aimX = null; section.classList.add('catalogo-keyboard'); return activate(key || activeKey, true); },
      key: function (key) {
        if (!/^(ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Enter)$/.test(key)) return false;
        if (cards.indexOf(document.activeElement) < 0 && !activate(activeKey, true)) return false;
        var event = new KeyboardEvent('keydown', { key: key, bubbles: true, cancelable: true });
        event.catalogoRemote = true;
        section.classList.add('catalogo-keyboard');
        return !document.activeElement.dispatchEvent(event);
      },
      get focusedKey() { return activeKey; },
      setMode: function (mode) { section.dataset.mode = mode === 'tv' ? 'tv' : 'desktop'; },
      destroy: function () { list.removeEventListener('keydown', keydown); list.removeEventListener('pointerdown', pointer); section.remove(); }
    };
  }

  api.mount = mount;
  api.describe = describe;
  api.clock = clock;
  api.artwork = artwork;
  root.zanni = root.zanni || {};
  root.zanni.catalogo = api;
}(typeof self !== 'undefined' ? self : this));
