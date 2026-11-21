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

  var DELIM = /^\s{0,3}\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

  function cells(line) {
    var out = [], cur = '', tick = false, t = line.trim();
    if (t.charAt(0) === '|') t = t.slice(1);
    for (var k = 0; k < t.length; k++) {
      var c = t.charAt(k);
      if (c === '\\' && t.charAt(k + 1) === '|') { cur += '|'; k++; continue; }
      if (c === '`') tick = !tick;
      if (c === '|' && !tick) { out.push(cur.trim()); cur = ''; continue; }
      cur += c;
    }
    if (cur.trim() !== '' || t.charAt(t.length - 1) !== '|') out.push(cur.trim());
    return out;
  }

  function aligns(line) {
    return cells(line).map(function (c) {
      var l = c.charAt(0) === ':', r = c.charAt(c.length - 1) === ':';
      return l && r ? 'center' : r ? 'right' : l ? 'left' : '';
    });
  }

  function tableAt(lines, i) {
    if (i + 1 >= lines.length || lines[i].indexOf('|') < 0 || !DELIM.test(lines[i + 1]) || lines[i + 1].indexOf('-') < 0) return null;
    var head = cells(lines[i]), align = aligns(lines[i + 1]);
    if (head.length !== align.length || head.length < 1) return null;
    return { head: head, align: align };
  }

  function parse(lines, live) {
    var out = [], starts = [], para = [], paraAt = 0, i = 0, m;
    var flush = function () {
      if (para.length) { out.push({ kind: 'p', text: para.join('\n') }); starts.push(paraAt); }
      para = [];
    };
    var open = function (block, at) { flush(); out.push(block); starts.push(at); };
    var typing = function (k) { return live && k === lines.length - 1 && lines.length > 1; };
    while (i < lines.length) {
      var line = lines[i], at = i, tb;
      if ((m = FENCE.exec(line))) {
        var body = [], closed = false, mark = m[1];
        for (i++; i < lines.length; i++) {
          if (lines[i].trim().indexOf(mark) === 0 && /^\s*[`~]+\s*$/.test(lines[i])) { closed = true; i++; break; }
          body.push(lines[i]);
        }
        open({ kind: 'code', lang: m[2], text: body.join('\n'), open: !closed }, at);
        continue;
      }
      if (!line.trim()) { flush(); i++; continue; }
      if ((m = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line))) {
        open({ kind: 'h', level: m[1].length, text: m[2] }, at);
        i++;
        continue;
      }
      if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) { open({ kind: 'hr' }, at); i++; continue; }
      if ((tb = tableAt(lines, i))) {
        var rows = [];
        for (i += 2; i < lines.length && lines[i].trim() && lines[i].indexOf('|') >= 0 && !FENCE.test(lines[i]); i++) {
          if (typing(i)) { i++; break; }
          var row = cells(lines[i]);
          while (row.length < tb.head.length) row.push('');
          rows.push(row.slice(0, tb.head.length));
        }
        open({ kind: 'table', align: tb.align, head: tb.head, rows: rows }, at);
        continue;
      }
      if ((m = ITEM.exec(line))) {
        var list = { kind: m[2] ? 'ol' : 'ul', start: m[2] ? Number(m[2]) : 1, items: [] };
        while (i < lines.length && lines[i].trim() && !FENCE.test(lines[i])) {
          var it = ITEM.exec(lines[i]);
          if (it && !!it[2] === (list.kind === 'ol')) list.items.push(it[3]);
          else if (it) break;
          else list.items[list.items.length - 1] += '\n' + lines[i].trim();
          i++;
        }
        open(list, at);
        continue;
      }
      if (/^\s{0,3}>\s?/.test(line)) {
        var quote = [];
        while (i < lines.length && /^\s{0,3}>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^\s{0,3}>\s?/, ''));
        open({ kind: 'quote', text: quote.join('\n') }, at);
        continue;
      }
      if (!para.length) paraAt = i;
      para.push(line);
      i++;
    }
    flush();
    return { blocks: out, starts: starts };
  }

  function dropTyping(lines) {
    var n = lines.length;
    if (n < 2) return lines;
    var last = lines[n - 1];
    if (last !== '' && /^[\s|:\-]*$/.test(last) && last.indexOf('|') >= 0 && lines[n - 2].indexOf('|') >= 0) return lines.slice(0, n - 1);
    return lines;
  }

  function blocks(text, live) {
    var lines = String(text == null ? '' : text).split('\n');
    return parse(live ? dropTyping(lines) : lines, !!live).blocks;
  }

  function streamState() { return { text: '', live: false, blocks: [], offsets: [] }; }

  function lineOffsets(lines) {
    var at = 0, out = [];
    for (var k = 0; k < lines.length; k++) { out.push(at); at += lines[k].length + 1; }
    return out;
  }

  function stream(state, text, live) {
    text = String(text == null ? '' : text);
    live = !!live;
    var keep = 0, base = 0;
    if (state.blocks.length && text.length >= state.text.length && text.lastIndexOf(state.text, 0) === 0) {
      keep = state.blocks.length - 1;
      base = state.offsets[keep];
    } else {
      state.blocks = [];
      state.offsets = [];
    }
    var tail = text.slice(base), lines = tail.split('\n');
    var got = parse(live ? dropTyping(lines) : lines, live);
    var offs = lineOffsets(lines);
    state.blocks = state.blocks.slice(0, keep).concat(got.blocks);
    state.offsets = state.offsets.slice(0, keep).concat(got.starts.map(function (st) { return base + offs[st]; }));
    state.text = text;
    state.live = live;
    return state.blocks.slice();
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

  function argText(n, name) {
    if (!name) return undefined;
    var v;
    if (n.args && typeof n.args === 'object' && Object.prototype.hasOwnProperty.call(n.args, name)) v = n.args[name];
    else if (typeof n.input === 'string' && n.input) {
      try { var whole = JSON.parse(n.input); if (whole && typeof whole === 'object' && Object.prototype.hasOwnProperty.call(whole, name)) v = whole[name]; }
      catch (e) {
        var at = n.input.indexOf(JSON.stringify(name));
        var m = at < 0 ? null : /^\s*:\s*"((?:[^"\\]|\\.)*)/.exec(n.input.slice(at + JSON.stringify(name).length));
        if (m) { try { v = JSON.parse('"' + m[1].replace(/\\$/, '') + '"'); } catch (e2) { v = m[1]; } }
      }
    }
    if (v === undefined || v === null) return undefined;
    return typeof v === 'string' ? v : JSON.stringify(v);
  }

  function argsShown(n) {
    if (n.args === undefined) return '';
    var shown = n.args;
    if (n.body_arg && shown && typeof shown === 'object' && !Array.isArray(shown)) {
      shown = Object.assign({}, shown);
      delete shown[n.body_arg];
      if (!Object.keys(shown).length) return '';
    }
    return JSON.stringify(shown, null, 2);
  }

  function itemOf(n) {
    var type = n && n.type;
    var settled = !!(n && n.settled);
    var key = 'n' + (n && n.node != null ? n.node : '?');
    if (type === 'prose' || type === 'thinking') return { key: key, kind: type, node: n.node, text: n.markdown == null ? '' : String(n.markdown), settled: settled };
    if (type === 'steering') {
      var w = who(n.sender, n.sender_name);
      return { key: key, kind: 'steering', node: n.node, text: n.markdown == null ? '' : String(n.markdown), settled: settled, role: w.role, label: w.label };
    }
    if (type === 'tool') {
      return {
        key: key, kind: 'tool', node: n.node, settled: settled,
        name: n.name == null ? '' : String(n.name),
        status: n.status === 'ok' || n.status === 'error' ? n.status : 'running',
        summary: n.summary == null ? '' : String(n.summary),
        label: n.label == null ? '' : String(n.label),
        head: argText(n, n.head_arg) || '',
        body: n.body_arg ? argText(n, n.body_arg) : undefined,
        diff: n.diff === true,
        args: argsShown(n),
        input: n.input == null ? '' : String(n.input),
        output: n.output == null ? '' : String(n.output),
        outputBase: Number(n.output_base) > 0 ? Number(n.output_base) : 0,
        ms: n.started_at && n.finished_at && n.finished_at >= n.started_at ? n.finished_at - n.started_at : 0
      };
    }
    return { key: key, kind: 'unknown', node: n && n.node, type: type == null || type === '' ? 'unnamed' : String(type), text: n && n.markdown != null ? String(n.markdown) : '', settled: settled };
  }

  function endOf(end) {
    if (!end) return null;
    var reason = end.reason == null ? '' : String(end.reason);
    if (end.failed) return { kind: 'error', text: reason.replace(/^error:?\s*/, '') || 'failed' };
    if (reason && reason !== 'stop') return { kind: 'end', text: reason };
    return null;
  }

  function fromView(view, ends) {
    var msgs = (view.closed || []).map(function (m) { return { m: m, open: false }; });
    if (view.open) msgs.push({ m: view.open, open: true });
    var order = [], by = {};
    msgs.forEach(function (x) {
      var k = x.m.turn;
      if (!by[k]) { by[k] = { turn: k, nodes: [], open: false, input: null }; order.push(k); }
      var t = by[k];
      if (x.open) t.open = true;
      var segs = x.m.inquirySegments;
      if (!t.input && (x.m.inquiry !== undefined && x.m.inquiry !== '' || segs && segs.length)) t.input = { inquiry: x.m.inquiry, inquiry_segments: segs, at: x.m.at };
      (x.m.nodes || []).forEach(function (n, i) {
        t.nodes.push(Object.assign({}, n, { node: x.m.from + i, settled: !x.open }));
      });
    });
    return order.map(function (k) {
      var t = by[k], done = ends && ends[k];
      var end = done ? endOf({ reason: done.reason, failed: String(done.reason || '').indexOf('error') === 0 }) : null;
      return { key: 't' + k, turn: k, input: inputOf(t.input), items: t.nodes.map(itemOf), end: end, open: t.open && !done, sealed: !t.open };
    });
  }

  function model(view, ends) {
    return fromView(view || {}, ends);
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

  return {
    reveal: reveal,
    blocks: blocks,
    streamState: streamState,
    stream: stream,
    spans: spans,
    who: who,
    model: model,
    metricsLine: metricsLine,
    known: KNOWN
  };
}));
