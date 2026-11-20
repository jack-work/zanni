(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.zanni = root.zanni || {};
    root.zanni.nodi = api;
    root.nodi = api;
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb]/g;
  var KNOWN = { prose: 1, thinking: 1, steering: 1, tool: 1 };
  var ARIA_ID = /^[0-9a-f]{8,32}$/i;
  var CLIP = 4000;

  function reveal(text) {
    var s = String(text == null ? '' : text), parts = [], last = 0, m;
    CONTROL.lastIndex = 0;
    while ((m = CONTROL.exec(s))) {
      if (m.index > last) parts.push({ plain: s.slice(last, m.index) });
      parts.push({ mark: 'U+' + ('0000' + m[0].charCodeAt(0).toString(16).toUpperCase()).slice(-4) });
      last = m.index + 1;
    }
    if (last < s.length) parts.push({ plain: s.slice(last) });
    return parts;
  }

  var FENCE = /^\s{0,3}(`{3,}|~{3,})\s*([^`\s]*)[^`]*$/;
  var ITEM = /^\s{0,6}(?:([-*+])|(\d{1,9})[.)])\s+(.*)$/;
  var INLINE = /(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)|\*\*([^\s*](?:[\s\S]*?[^\s*])?)\*\*(?!\*)|\*([^\s*](?:[^*]*?[^\s*])?)\*(?!\*)|\[([^\]\n]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<>]*[^\s<>.,;:!?'")\]])/g;

  function safeHref(raw) {
    var m = /^(https?:\/\/|mailto:)[^\s]+$/i.exec(raw);
    return m ? raw : '';
  }

  function spans(text, depth) {
    var out = [], last = 0, m, re = new RegExp(INLINE.source, 'g');
    var plain = function (s) {
      if (!s) return;
      if (out.length && out[out.length - 1].kind === 'text') out[out.length - 1].text += s;
      else out.push({ kind: 'text', text: s });
    };
    while ((m = re.exec(text))) {
      plain(text.slice(last, m.index));
      last = m.index + m[0].length;
      if (m[1]) out.push({ kind: 'code', text: m[2] });
      else if (m[3] != null) out.push({ kind: 'b', spans: depth ? [{ kind: 'text', text: m[3] }] : spans(m[3], 1) });
      else if (m[4] != null) out.push({ kind: 'i', spans: depth ? [{ kind: 'text', text: m[4] }] : spans(m[4], 1) });
      else if (m[5] != null) {
        if (safeHref(m[6])) out.push({ kind: 'a', text: m[5], href: m[6] });
        else plain(m[0]);
      } else if (safeHref(m[7])) out.push({ kind: 'a', text: m[7], href: m[7] });
      else plain(m[0]);
    }
    plain(text.slice(last));
    return out;
  }

  function blocks(text) {
    var lines = String(text == null ? '' : text).split('\n'), out = [], para = [], i = 0, m;
    var flush = function () {
      if (para.length) out.push({ kind: 'p', text: para.join('\n') });
      para = [];
    };
    while (i < lines.length) {
      var line = lines[i];
      if ((m = FENCE.exec(line))) {
        flush();
        var body = [], closed = false, mark = m[1];
        for (i++; i < lines.length; i++) {
          if (lines[i].trim().indexOf(mark) === 0 && /^\s*[`~]+\s*$/.test(lines[i])) { closed = true; i++; break; }
          body.push(lines[i]);
        }
        out.push({ kind: 'code', lang: m[2], text: body.join('\n'), open: !closed });
        continue;
      }
      if (!line.trim()) { flush(); i++; continue; }
      if ((m = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line))) {
        flush();
        out.push({ kind: 'h', level: m[1].length, text: m[2] });
        i++;
        continue;
      }
      if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); out.push({ kind: 'hr' }); i++; continue; }
      if ((m = ITEM.exec(line))) {
        flush();
        var list = { kind: m[2] ? 'ol' : 'ul', start: m[2] ? Number(m[2]) : 1, items: [] };
        while (i < lines.length && lines[i].trim() && !FENCE.test(lines[i])) {
          var it = ITEM.exec(lines[i]);
          if (it && !!it[2] === (list.kind === 'ol')) list.items.push(it[3]);
          else if (it) break;
          else list.items[list.items.length - 1] += '\n' + lines[i].trim();
          i++;
        }
        out.push(list);
        continue;
      }
      if (/^\s{0,3}>\s?/.test(line)) {
        flush();
        var quote = [];
        while (i < lines.length && /^\s{0,3}>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^\s{0,3}>\s?/, ''));
        out.push({ kind: 'quote', text: quote.join('\n') });
        continue;
      }
      para.push(line);
      i++;
    }
    flush();
    return out;
  }

  function who(sender, name) {
    var s = sender == null ? '' : String(sender), n = name == null ? '' : String(name);
    if (!s) return { role: 'you', label: n || 'You' };
    if (ARIA_ID.test(s)) return { role: 'aria', label: n || s.slice(0, 8) };
    return { role: 'caller', label: n || s };
  }

  function inputOf(input) {
    if (!input) return null;
    if (input.inquiry !== undefined || input.inquiry_segments) {
      var raw = Array.isArray(input.inquiry_segments) && input.inquiry_segments.length ? input.inquiry_segments : [{ text: input.inquiry }];
      input = { at: input.at, segments: raw.map(function (g) { return { sender: g.sender, senderName: g.name, text: g.text }; }) };
    }
    var segs = Array.isArray(input.segments) && input.segments.length ? input.segments : [{ sender: input.sender, senderName: input.senderName, text: input.text }];
    return {
      at: input.at,
      parts: segs.map(function (s) {
        var w = who(s.sender, s.senderName);
        return { role: w.role, label: w.label, text: s.text == null ? '' : String(s.text) };
      })
    };
  }

  function native(n, sealed) {
    var settled = n.settled !== undefined ? !!n.settled : !!sealed;
    var type = n.type;
    if (type === 'prose' || type === 'thinking') return { kind: type, node: n.node, text: n.markdown, settled: settled };
    if (type === 'steering') return { kind: 'steering', node: n.node, text: n.markdown, sender: n.sender, senderName: n.sender_name, settled: settled };
    if (type === 'tool') {
      return { kind: 'tool', node: n.node, settled: settled, tool: { name: n.name, status: n.status, summary: n.summary, args: n.args, input: n.input, output: n.output, outputBase: n.output_base, startedAt: n.started_at, finishedAt: n.finished_at } };
    }
    return { kind: 'unknown', node: n.node, type: type, text: n.markdown, settled: settled };
  }

  function itemOf(n) {
    var kind = n && n.kind;
    if (kind === 'prose' || kind === 'thinking') return { key: 'n' + n.node, kind: kind, node: n.node, text: n.text == null ? '' : String(n.text), settled: !!n.settled };
    if (kind === 'steering') {
      var w = who(n.sender, n.senderName);
      return { key: 'n' + n.node, kind: kind, node: n.node, text: n.text == null ? '' : String(n.text), settled: !!n.settled, role: w.role, label: w.label };
    }
    if (kind === 'tool') {
      var t = n.tool || {};
      return {
        key: 'n' + n.node, kind: 'tool', node: n.node, settled: !!n.settled,
        name: t.name == null ? '' : String(t.name),
        status: t.status === 'ok' || t.status === 'error' ? t.status : 'running',
        summary: t.summary == null ? '' : String(t.summary),
        args: t.args === undefined ? '' : JSON.stringify(t.args, null, 2),
        input: t.input == null ? '' : String(t.input),
        output: t.output == null ? '' : String(t.output),
        outputBase: Number(t.outputBase) > 0 ? Number(t.outputBase) : 0,
        ms: t.startedAt && t.finishedAt && t.finishedAt >= t.startedAt ? t.finishedAt - t.startedAt : 0
      };
    }
    var type = kind === 'unknown' ? n.type : kind;
    return { key: 'n' + (n && n.node != null ? n.node : '?'), kind: 'unknown', node: n && n.node, type: type == null || type === '' ? 'unnamed' : String(type), text: n && n.text != null ? String(n.text) : '', settled: !!(n && n.settled) };
  }

  function endOf(end) {
    if (!end) return null;
    var reason = end.reason == null ? '' : String(end.reason);
    if (end.failed) return { kind: 'error', text: reason.replace(/^error:?\s*/, '') || 'failed' };
    if (reason && reason !== 'stop') return { kind: 'end', text: reason };
    return null;
  }

  function model(turns) {
    return (turns || []).map(function (t) {
      var isNative = t.inquiry !== undefined || t.inquiry_segments !== undefined;
      return {
        key: 't' + t.turn,
        turn: t.turn,
        input: inputOf(isNative ? t : t.input),
        items: (t.nodes || []).map(function (n, i) {
          if (n && n.node === undefined) n = Object.assign({}, n, { node: t.from !== undefined ? t.from + i : i });
          return itemOf(n && n.kind === undefined && n.type !== undefined ? native(n, t.sealed) : n);
        }),
        end: endOf(t.end),
        open: !t.end && !t.sealed,
        sealed: !!t.sealed
      };
    });
  }

  function metricsLine(m) {
    if (!m) return '';
    var k = function (n) {
      n = Number(n) || 0;
      return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n);
    };
    var parts = ['ctx ' + (m.context_exact ? '' : '~') + k(m.context_tokens), 'in ' + k(m.tokens_in), 'out ' + k(m.tokens_out)];
    var cache = (Number(m.cache_read_tokens) || 0) + (Number(m.cache_write_tokens) || 0);
    if (cache) parts.push('cache ' + k(cache));
    return parts.join(' \u00b7 ');
  }

  function dom(doc) {
    function put(n, s) {
      reveal(s).forEach(function (p) {
        if (p.mark) {
          var c = doc.createElement('span');
          c.className = 'nodi-ctl';
          c.textContent = p.mark;
          n.appendChild(c);
        } else if (n.lastChild && n.lastChild.nodeType === 3) n.lastChild.appendData(p.plain);
        else n.appendChild(doc.createTextNode(p.plain));
      });
      return n;
    }
    function el(tag, cls, s) {
      var n = doc.createElement(tag);
      if (cls) n.className = cls;
      if (s != null) put(n, s);
      return n;
    }
    function set(n, s) {
      n.replaceChildren();
      put(n, s);
    }
    function show(n, s) {
      var next = String(s == null ? '' : s);
      if (n.nodi !== next) { n.nodi = next; set(n, next); }
    }
    return { doc: doc, put: put, el: el, set: set, show: show };
  }

  function inline(d, n, list) {
    list.forEach(function (sp) {
      var c;
      if (sp.kind === 'text') { d.put(n, sp.text); return; }
      if (sp.kind === 'code') c = d.el('code', 'nodi-code', sp.text);
      else if (sp.kind === 'a') {
        c = d.el('a', 'nodi-a', sp.text);
        c.setAttribute('href', sp.href);
        c.setAttribute('rel', 'noopener noreferrer');
        c.setAttribute('target', '_blank');
      } else c = inline(d, d.el(sp.kind === 'b' ? 'strong' : 'em'), sp.spans);
      n.appendChild(c);
    });
    return n;
  }

  function blockEl(d, b) {
    var n;
    switch (b.kind) {
      case 'code':
        n = d.el('pre', 'nodi-pre');
        n.appendChild(d.el('code', '', b.text));
        return n;
      case 'h': return inline(d, d.el(b.level < 3 ? 'h3' : 'h4', 'nodi-h'), spans(b.text));
      case 'hr': return d.el('hr', 'nodi-hr');
      case 'ul':
      case 'ol':
        n = d.el(b.kind, 'nodi-list');
        if (b.kind === 'ol' && b.start !== 1) n.start = b.start;
        b.items.forEach(function (t) { n.appendChild(inline(d, d.el('li'), spans(t))); });
        return n;
      case 'quote': return inline(d, d.el('blockquote', 'nodi-quote'), spans(b.text));
      default: return inline(d, d.el('p', 'nodi-p'), spans(b.text));
    }
  }

  function markdownInto(d, host, state, text) {
    var next = blocks(text), old = state.blocks;
    for (var i = 0; i < next.length; i++) {
      var sig = JSON.stringify(next[i]);
      if (old[i] && old[i].sig === sig) continue;
      var made = blockEl(d, next[i]);
      if (old[i]) host.replaceChild(made, old[i].el);
      else host.appendChild(made);
      old[i] = { sig: sig, el: made };
    }
    while (old.length > next.length) host.removeChild(old.pop().el);
  }

  function settle(n, item) {
    if (item.settled) n.setAttribute('data-settled', '');
    else n.removeAttribute('data-settled');
  }

  function caretSummary(d, label) {
    var s = d.el('summary', 'nodi-sum');
    s.append(d.el('span', 'nodi-caret'), label);
    return s;
  }

  function stamp(d, ms) {
    var t = Number(ms);
    return isFinite(t) && t > 0 ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  }

  var renderers = {
    input: {
      create: function (d) {
        var n = d.el('div', 'nodi-input');
        var parts = [];
        return {
          el: n,
          update: function (item) {
            var sig = JSON.stringify(item);
            if (n.nodiSig === sig) return;
            n.nodiSig = sig;
            n.replaceChildren();
            parts = item.parts.map(function (p, i) {
              var box = d.el('div', 'nodi-said');
              box.setAttribute('data-from', p.role);
              var head = d.el('div', 'nodi-by');
              head.appendChild(d.el('span', 'nodi-who', p.label));
              var when = i === 0 ? stamp(d, item.at) : '';
              if (when) head.appendChild(d.el('span', 'nodi-when', when));
              box.append(head, d.el('div', 'nodi-said-text', p.text));
              n.appendChild(box);
              return box;
            });
            n.setAttribute('data-from', item.parts.length ? item.parts[0].role : 'you');
          }
        };
      }
    },
    prose: {
      create: function (d) {
        var n = d.el('div', 'nodi-prose');
        var text = d.el('div', 'nodi-text');
        var voice = d.el('div', 'nodi-voice');
        n.append(text, voice);
        var state = { blocks: [] };
        return {
          el: n,
          slot: voice,
          update: function (item) {
            settle(n, item);
            markdownInto(d, text, state, item.text);
          }
        };
      }
    },
    thinking: {
      create: function (d) {
        var n = d.el('details', 'nodi-thinking');
        var label = d.el('span', 'nodi-sum-label', 'Thinking');
        n.append(caretSummary(d, label));
        var body = d.el('div', 'nodi-thought');
        n.appendChild(body);
        return {
          el: n,
          update: function (item) {
            settle(n, item);
            d.show(body, item.text);
          }
        };
      }
    },
    steering: {
      create: function (d) {
        var n = d.el('div', 'nodi-steering');
        var by = d.el('div', 'nodi-by');
        var who = d.el('span', 'nodi-who');
        by.append(d.el('span', 'nodi-steer-tag', 'Steered by'), who);
        var body = d.el('div', 'nodi-said-text');
        n.append(by, body);
        return {
          el: n,
          update: function (item) {
            settle(n, item);
            n.setAttribute('data-from', item.role);
            d.show(who, item.label);
            d.show(body, item.text);
          }
        };
      }
    },
    tool: {
      create: function (d) {
        var n = d.el('details', 'nodi-tool');
        var name = d.el('span', 'nodi-tool-name');
        var sum = d.el('span', 'nodi-tool-summary');
        var status = d.el('span', 'nodi-tool-status');
        n.appendChild(caretSummary(d, name));
        n.firstChild.append(sum, status);
        var body = d.el('div', 'nodi-tool-body');
        var argsHead = d.el('div', 'nodi-label', 'Arguments');
        var args = d.el('pre', 'nodi-pre nodi-tool-args');
        var outHead = d.el('div', 'nodi-label', 'Result');
        var clipped = d.el('div', 'nodi-clipped');
        var out = d.el('pre', 'nodi-pre nodi-tool-out');
        body.append(argsHead, args, outHead, clipped, out);
        n.appendChild(body);
        return {
          el: n,
          update: function (item) {
            settle(n, item);
            n.setAttribute('data-status', item.status);
            d.show(name, item.name || 'tool');
            d.show(sum, item.summary);
            var label = item.status === 'running' ? 'running' : item.status === 'error' ? 'failed' : 'done';
            if (item.ms >= 1000) label += ' ' + (item.ms / 1000).toFixed(1) + 's';
            d.show(status, label);
            var shownArgs = item.args || item.input;
            argsHead.hidden = args.hidden = !shownArgs;
            d.show(args, shownArgs);
            var out0 = item.output.length > CLIP ? item.output.slice(item.output.length - CLIP) : item.output;
            outHead.hidden = out.hidden = !out0 && item.status === 'running';
            d.show(out, out0 || (item.status === 'running' ? '' : '(no output)'));
            var cut = item.outputBase > 0 || item.output.length > CLIP;
            clipped.hidden = !cut;
            d.show(clipped, cut ? 'Earlier output was clipped.' : '');
          }
        };
      }
    },
    unknown: {
      create: function (d) {
        var n = d.el('div', 'nodi-unknown');
        var label = d.el('div', 'nodi-label');
        var body = d.el('pre', 'nodi-pre');
        n.append(label, body);
        return {
          el: n,
          update: function (item) {
            settle(n, item);
            d.show(label, 'Unknown node: ' + item.type);
            body.hidden = !item.text;
            d.show(body, item.text);
          }
        };
      }
    },
    end: {
      create: function (d) {
        var n = d.el('p', 'nodi-end');
        return { el: n, update: function (item) { d.show(n, 'Turn ended: ' + item.text); } };
      }
    },
    error: {
      create: function (d) {
        var n = d.el('p', 'nodi-error');
        n.setAttribute('role', 'alert');
        return { el: n, update: function (item) { d.show(n, 'Turn failed: ' + item.text); } };
      }
    },
    metrics: {
      create: function (d) {
        var n = d.el('p', 'nodi-metrics');
        return { el: n, update: function (item) { d.show(n, metricsLine(item.metrics)); } };
      }
    }
  };

  function create(d, kind, item) {
    var r = renderers[renderers[kind] ? kind : 'unknown'].create(d);
    r.update(item);
    return r;
  }

  function sync(parent, want, from) {
    var cursor = from;
    want.forEach(function (n) {
      if (n === cursor) cursor = cursor.nextSibling;
      else parent.insertBefore(n, cursor);
    });
    while (cursor) {
      var gone = cursor;
      cursor = cursor.nextSibling;
      parent.removeChild(gone);
    }
  }

  function log(doc, host, opts) {
    opts = opts || {};
    var d = dom(doc), turns = {}, listeners = [];
    var api = { dom: d };

    function turnFor(m) {
      var t = turns[m.key];
      if (t) return t;
      var li = d.el('li', 'nodi-turn');
      li.setAttribute('data-turn', String(m.turn));
      var head = d.el('div', 'nodi-turn-head');
      head.appendChild(d.el('span', 'nodi-turn-no', 'Turn ' + m.turn));
      var tools = d.el('span', 'nodi-turn-tools');
      head.appendChild(tools);
      var body = d.el('div', 'nodi-turn-body');
      li.append(head, body);
      t = turns[m.key] = { li: li, body: body, tools: tools, parts: {}, turn: m.turn };
      if (opts.decorate) opts.decorate(t.tools, m.turn);
      return t;
    }

    function part(t, key, kind, item) {
      var p = t.parts[key];
      if (!p || p.kind !== kind) {
        p = t.parts[key] = { kind: kind, r: create(d, kind, item) };
        listeners.forEach(function (fn) { fn({ turn: t.turn, key: key, kind: kind, el: p.r.el, slot: p.r.slot || null, node: item.node }); });
      } else p.r.update(item);
      return p;
    }

    api.update = function (turnViews) {
      var ms = model(turnViews), live = {}, want = [];
      ms.forEach(function (m) {
        var t = turnFor(m), keep = {}, kids = [];
        live[m.key] = true;
        if (m.input && m.input.parts.length) { keep.input = true; kids.push(part(t, 'input', 'input', m.input).r.el); }
        m.items.forEach(function (it) { keep[it.key] = true; kids.push(part(t, it.key, it.kind, it).r.el); });
        if (m.end) { keep.end = true; kids.push(part(t, 'end', m.end.kind, m.end).r.el); }
        Object.keys(t.parts).forEach(function (k) { if (!keep[k]) delete t.parts[k]; });
        sync(t.body, kids, t.body.firstChild);
        t.li.setAttribute('data-state', m.end ? (m.end.kind === 'error' ? 'failed' : 'ended') : m.open ? 'open' : 'done');
        want.push(t.li);
      });
      Object.keys(turns).forEach(function (k) { if (!live[k]) delete turns[k]; });
      sync(host, want, host.firstChild);
    };
    api.on = function (fn) { listeners.push(fn); };
    api.turnEl = function (turn) { var t = turns['t' + turn]; return t ? t.li : null; };
    api.nodeEl = function (turn, node) {
      var t = turns['t' + turn], p = t && t.parts['n' + node];
      return p ? p.r.el : null;
    };
    api.slot = function (turn, node) {
      var t = turns['t' + turn], p = t && t.parts['n' + node];
      return p && p.r.slot ? p.r.slot : null;
    };
    return api;
  }

  function metricsView(doc, host) {
    var d = dom(doc), r = renderers.metrics.create(d);
    host.appendChild(r.el);
    return { update: function (m) { r.update({ metrics: m }); r.el.hidden = !m; } };
  }

  return {
    reveal: reveal,
    blocks: blocks,
    spans: spans,
    who: who,
    model: model,
    metricsLine: metricsLine,
    renderers: renderers,
    create: create,
    dom: dom,
    log: log,
    metricsView: metricsView,
    known: KNOWN
  };
}));
