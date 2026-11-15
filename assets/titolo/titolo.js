'use strict';

(function (root) {
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function mount(host, opts) {
    opts = opts || {};
    if (!host) return null;
    if (!root.zanni || !root.zanni.catalogo) throw new Error('titolo requires catalogo');
    var catalogo = root.zanni.catalogo;
    var section = el('section', 'titolo');
    section.dataset.mode = opts.mode === 'tv' ? 'tv' : 'desktop';
    host.appendChild(section);
    var item = null, action = null;

    function setItem(next) {
      var restoreFocus = section.contains(document.activeElement);
      item = next || {};
      var info = catalogo.describe(item);
      var fragment = document.createDocumentFragment();
      if (typeof opts.onBack === 'function') {
        var back = el('button', 'titolo-back', 'Back');
        back.type = 'button';
        back.addEventListener('click', function () { opts.onBack(item); });
        fragment.appendChild(back);
      }
      fragment.appendChild(catalogo.artwork(info, 'titolo-art'));
      var body = el('div', 'titolo-body');
      body.appendChild(el('h1', 'titolo-title', info.title));
      var metadata = [];
      if (info.kind === 'audio') metadata.push('Audio');
      if (info.kind === 'video') metadata.push('Video');
      if (info.duration !== null) metadata.push(catalogo.clock(info.duration));
      if (metadata.length) body.appendChild(el('p', 'titolo-meta', metadata.join(' · ')));
      action = el('button', 'titolo-play', info.resume !== null ? 'Resume · ' + catalogo.clock(info.resume) : info.kind === 'audio' ? 'Listen' : 'Play');
      action.type = 'button';
      action.disabled = !info.key;
      action.addEventListener('click', function () {
        var detail = { key: info.key, item: item, position: info.resume === null ? 0 : info.resume };
        section.dispatchEvent(new CustomEvent('titolo:play', { bubbles: true, detail: detail }));
        if (typeof opts.onPlay === 'function') opts.onPlay(item, detail.position);
      });
      body.appendChild(action);
      if (info.progress !== null) {
        var progress = el('progress', 'titolo-progress');
        progress.max = 1;
        progress.value = info.progress;
        progress.setAttribute('aria-label', 'Playback progress for ' + info.title);
        body.appendChild(progress);
      }
      fragment.appendChild(body);
      section.replaceChildren(fragment);
      if (restoreFocus) action.focus({ preventScroll: true });
    }

    setItem(opts.item);
    return {
      root: section,
      setItem: setItem,
      focus: function () { if (action) action.focus({ preventScroll: true }); },
      setBusy: function (busy) { if (action) action.disabled = !!busy || !catalogo.describe(item).key; },
      setMode: function (mode) { section.dataset.mode = mode === 'tv' ? 'tv' : 'desktop'; },
      destroy: function () { section.remove(); }
    };
  }

  root.zanni = root.zanni || {};
  root.zanni.titolo = { mount: mount };
}(typeof self !== 'undefined' ? self : this));
