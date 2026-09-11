/* zanni · scriba — markdown into the page.
 *
 * Named for the copyist: it transcribes, it does not compose.
 *
 * Lineage: gluck-herald's internal/md renders the same subset to Telegram
 * HTML, and this is a deliberate port of its algorithm, not a second design.
 * The ordering below (stash code, escape everything, then mark up) is the
 * part that carries the security property, and test/scriba.test.js keeps
 * herald's own corpus so a divergence in that ordering is visible.
 *
 * docs/scriba.md holds the laws and the divergences.
 */
'use strict';

(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.zanni = root.zanni || {};
    root.zanni.scriba = api;
  }
}(typeof self !== 'undefined' ? self : this, function () {

  var SAFE_SCHEMES = { 'http:': 1, 'https:': 1, 'mailto:': 1 };

  function escapeHTML(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function escapeAttr(s) {
    return escapeHTML(s).replace(/"/g, '&quot;');
  }

  /* The browser-only law. herald hands its href to Telegram, which will not
     execute it; a browser will. An unrecognised scheme is dropped rather
     than rendered as a dead link, because a link that does nothing when
     clicked is a worse lie than plain text. */
  function safeURL(raw) {
    var url = raw.replace(/&amp;/g, '&').trim();
    if (/^[#/]/.test(url)) return url;                 // relative or anchor
    var m = /^([a-zA-Z][a-zA-Z0-9+.-]*:)/.exec(url);
    if (!m) return 'https://' + url;                   // bare domain
    return SAFE_SCHEMES[m[1].toLowerCase()] ? url : null;
  }

  function toHTML(src) {
    if (src == null) return '';
    var stash = [];
    function keep(html) { return '\u0000' + (stash.push(html) - 1) + '\u0000'; }

    var s = String(src).replace(/\r\n/g, '\n');

    /* Code first and verbatim: nothing inside it may be marked up. */
    s = s.replace(/```[ \t]*([A-Za-z0-9_+-]*)[ \t]*\n([\s\S]*?)```/g, function (_, lang, body) {
      var open = lang ? '<pre><code class="language-' + escapeAttr(lang) + '">' : '<pre><code>';
      return keep(open + escapeHTML(body.replace(/\n+$/, '')) + '</code></pre>');
    });
    s = s.replace(/`([^`\n]+)`/g, function (_, code) {
      return keep('<code>' + escapeHTML(code) + '</code>');
    });

    s = escapeHTML(s);

    /* Links before autolink, and both stashed, or the autolinker would
       rewrite the href it just produced. */
    s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, function (whole, text, href) {
      var url = safeURL(href);
      return url === null ? text : keep(anchor(url, text));
    });
    s = s.replace(/(^|[\s(])((?:https?:\/\/|www\.)[^\s<>()]+[^\s<>().,;:!?])/g,
      function (_, lead, url) {
        var safe = safeURL(url);
        return safe === null ? lead + url : lead + keep(anchor(safe, url));
      });

    s = s.replace(/\*\*([^*\n]+)\*\*|__([^_\n]+)__/g, function (_, a, b) {
      return '<b>' + (a || b) + '</b>';
    });
    /* The delimiter must hug its text. herald's port of this rule does not
       require that, so it reads "2 * 3 * 4" as italics; see docs/scriba.md. */
    s = s.replace(/(^|[\s(])[*_](\S|\S[^*_\n]*\S)[*_]($|[\s).,!?;:])/g, '$1<i>$2</i>$3');
    s = s.replace(/~~([^~\n]+)~~/g, '<s>$1</s>');

    s = blocks(s);

    return s.replace(/\u0000(\d+)\u0000/g, function (_, i) {
      var v = stash[Number(i)];
      return v === undefined ? '' : v;
    }).trim();
  }

  function anchor(url, text) {
    return '<a href="' + escapeAttr(url) + '" target="_blank" rel="noopener noreferrer">'
      + text + '</a>';
  }

  /* The block layer, deliberately small: headings, bullet and ordered lists,
     rules, and paragraphs in which a single newline is a line break. Anything
     more wants a real parser, and this is a renderer for a details pane. */
  function blocks(s) {
    var out = [];
    var chunks = s.split(/\n{2,}/);
    for (var i = 0; i < chunks.length; i++) {
      var chunk = chunks[i].replace(/^\n+|\n+$/g, '');
      if (!chunk) continue;
      if (/^\u0000\d+\u0000$/.test(chunk)) { out.push(chunk); continue; }

      var heading = /^(#{1,6})[ \t]+(.+)$/.exec(chunk);
      if (heading && chunk.indexOf('\n') < 0) {
        var level = Math.min(heading[1].length + 2, 6);
        out.push('<h' + level + '>' + heading[2] + '</h' + level + '>');
        continue;
      }
      if (/^[ \t]*(?:[-*_][ \t]*){3,}$/.test(chunk)) { out.push('<hr>'); continue; }

      var lines = chunk.split('\n');
      if (lines.every(function (l) { return /^[ \t]*[-*+][ \t]+\S/.test(l); })) {
        out.push('<ul>' + lines.map(function (l) {
          return '<li>' + l.replace(/^[ \t]*[-*+][ \t]+/, '') + '</li>';
        }).join('') + '</ul>');
        continue;
      }
      if (lines.every(function (l) { return /^[ \t]*\d+[.)][ \t]+\S/.test(l); })) {
        out.push('<ol>' + lines.map(function (l) {
          return '<li>' + l.replace(/^[ \t]*\d+[.)][ \t]+/, '') + '</li>';
        }).join('') + '</ol>');
        continue;
      }
      out.push('<p>' + lines.join('<br>') + '</p>');
    }
    return out.join('\n');
  }

  /* The only place this library writes to the DOM. Callers hand it text;
     it never accepts HTML from anywhere else. */
  function render(el, src) {
    if (!el) return el;
    el.innerHTML = toHTML(src);
    el.classList.add('scriba');
    return el;
  }

  function auto(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll('[data-scriba]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.dataset.scribaDone) continue;
      render(el, el.textContent);
      el.dataset.scribaDone = '1';
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { auto(); });
    } else {
      auto();
    }
  }

  return { toHTML: toHTML, render: render, auto: auto, safeURL: safeURL };
}));
