/* zanni · stilo — the writing surface.
 *
 * The stylus to scriba's copyist: one writes, the other transcribes. A
 * textarea wearing data-stilo gains a Write/Preview pair and a technical
 * face, and stays the same textarea underneath so a form still submits it.
 *
 * Preview is scriba's job. If scriba is not on the page the preview tab
 * shows plain text rather than lying about markup it cannot render.
 *
 * docs/stilo.md
 */
'use strict';

(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.zanni = root.zanni || {};
    root.zanni.stilo = api;
  }
}(typeof self !== 'undefined' ? self : this, function () {

  var seq = 0;

  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  }

  function attach(area) {
    if (!area || area.dataset.stiloReady) return null;

    var id = 'stilo-' + (++seq);
    var wrap = el('div', { class: 'stilo' });
    var bar = el('div', { class: 'stilo-bar', role: 'tablist' });
    var write = el('button', {
      type: 'button', class: 'stilo-tab', role: 'tab',
      'data-stilo-tab': 'write', 'aria-selected': 'true', 'aria-controls': id + '-write'
    }, 'Write');
    var read = el('button', {
      type: 'button', class: 'stilo-tab', role: 'tab',
      'data-stilo-tab': 'preview', 'aria-selected': 'false', 'aria-controls': id + '-preview'
    }, 'Preview');
    bar.appendChild(write);
    bar.appendChild(read);

    var view = el('div', {
      class: 'stilo-preview scriba', id: id + '-preview', role: 'tabpanel', hidden: 'hidden'
    });

    area.parentNode.insertBefore(wrap, area);
    wrap.appendChild(bar);
    wrap.appendChild(area);
    wrap.appendChild(view);

    area.classList.add('stilo-input');
    area.id = area.id || (id + '-write');
    area.setAttribute('role', 'tabpanel');
    area.dataset.stiloReady = '1';

    function show(which) {
      var previewing = which === 'preview';
      write.setAttribute('aria-selected', previewing ? 'false' : 'true');
      read.setAttribute('aria-selected', previewing ? 'true' : 'false');
      view.hidden = !previewing;
      area.hidden = previewing;
      if (!previewing) { area.focus(); return; }
      /* Rendered at the moment it is shown, never on every keystroke: the
         point of a tab is that the cost is paid once. */
      var text = area.value;
      if (!text.trim()) {
        view.textContent = '';
        view.appendChild(el('p', { class: 'stilo-empty' }, 'Nothing to preview.'));
      } else if (root().zanni && root().zanni.scriba) {
        root().zanni.scriba.render(view, text);
      } else {
        view.textContent = text;
      }
    }

    write.addEventListener('click', function () { show('write'); });
    read.addEventListener('click', function () { show('preview'); });

    /* A long description is easier to write than to submit: the save button
       may be scrolled away, so give the surface a commit key. */
    area.addEventListener('keydown', function (ev) {
      if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') {
        ev.preventDefault();
        wrap.dispatchEvent(new CustomEvent('stilo:commit', { bubbles: true }));
      }
    });

    return { root: wrap, input: area, preview: view, show: show };
  }

  function root() {
    return typeof self !== 'undefined' ? self : this;
  }

  function auto(scope) {
    var nodes = (scope || document).querySelectorAll('textarea[data-stilo]');
    var made = [];
    for (var i = 0; i < nodes.length; i++) {
      var h = attach(nodes[i]);
      if (h) made.push(h);
    }
    return made;
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { auto(); });
    } else {
      auto();
    }
  }

  return { attach: attach, auto: auto };
}));
