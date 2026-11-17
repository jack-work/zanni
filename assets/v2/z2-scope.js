(function (root) {
  "use strict";
  var SVGNS = "http://www.w3.org/2000/svg";

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  }

  function svgEl(tag, attrs) {
    var n = document.createElementNS(SVGNS, tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (attrs[k] != null) n.setAttribute(k, String(attrs[k]));
      });
    }
    return n;
  }

  function splitTopComma(inner) {
    var depth = 0;
    for (var i = 0; i < inner.length; i++) {
      var ch = inner.charAt(i);
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      else if (ch === "," && depth === 0) {
        return [inner.slice(0, i).trim(), inner.slice(i + 1).trim()];
      }
    }
    return [inner.trim(), inner.trim()];
  }

  function resolveLightDark(val, isDark) {
    if (!val) return val;
    var trimmed = val.trim();
    if (trimmed.indexOf("light-dark(") === 0 && trimmed.charAt(trimmed.length - 1) === ")") {
      var parts = splitTopComma(trimmed.slice(11, -1));
      return isDark ? parts[1] : parts[0];
    }
    return trimmed;
  }

  function detectDark(cs) {
    var bg = (cs.backgroundColor || cs.color || "").match(/\d+/g);
    if (!bg || bg.length < 3) return false;
    var lum = (Number(bg[0]) * 299 + Number(bg[1]) * 587 + Number(bg[2]) * 114) / 1000;
    return cs.backgroundColor && bg.length >= 3 && !(bg.length >= 4 && Number(bg[3]) === 0) ? lum < 128 : lum >= 128;
  }

  function withAlpha(color, alpha) {
    if (!color) return color;
    var hex = color.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
      var r = parseInt(hex.slice(1, 3), 16);
      var g = parseInt(hex.slice(3, 5), 16);
      var b = parseInt(hex.slice(5, 7), 16);
      return "rgba(" + r + ", " + g + ", " + b + ", " + alpha + ")";
    }
    return hex;
  }

  function tokens(target) {
    var node = target || (typeof document !== "undefined" ? document.body || document.documentElement : null);
    if (!node || typeof getComputedStyle !== "function") {
      return {
        ink: "#1A0D0F", muted: "#694B3F", rule: "#CDB39F", line: "#A5887B",
        ground: "#E7D4C4", ground2: "#DCC4B0", accent: "#634A16",
        ok: "#335949", warn: "#8E3B0B", fail: "#972C1D",
        mono: "ui-monospace, monospace",
        withAlpha: withAlpha,
        series: ["#7E1F22", "#7A5A1E", "#3A6B2E", "#3F5480", "#6B3A6E", "#1F6672", "#5E4A42", "#A8452A"]
      };
    }
    var bodyNode = (typeof document !== "undefined" && document.body) || node;
    var cs = getComputedStyle(bodyNode);
    var isDark = detectDark(cs);
    var pick = function (name, fb) {
      var raw = (cs.getPropertyValue(name) || "").trim();
      return resolveLightDark(raw, isDark) || fb;
    };
    var series = [];
    for (var i = 1; i <= 8; i++) series.push(pick("--z-series-" + i, "#7E1F22"));
    return {
      ink: pick("--z-ink", "#1A0D0F"),
      muted: pick("--z-muted", "#694B3F"),
      rule: pick("--z-rule", "#CDB39F"),
      line: pick("--z-line", "#A5887B"),
      ground: pick("--z-ground", "#E7D4C4"),
      ground2: pick("--z-ground-2", "#DCC4B0"),
      accent: pick("--z-accent", "#634A16"),
      ok: pick("--z-ok", "#335949"),
      warn: pick("--z-warn", "#8E3B0B"),
      fail: pick("--z-fail", "#972C1D"),
      mono: pick("--z-mono", "ui-monospace, monospace"),
      withAlpha: withAlpha,
      series: series
    };
  }

  function onSchemeChange(fn) {
    var cleanups = [];
    if (typeof matchMedia === "function") {
      var mq = matchMedia("(prefers-color-scheme: dark)");
      var h = function () { fn(); };
      mq.addEventListener("change", h);
      cleanups.push(function () { mq.removeEventListener("change", h); });
    }
    if (typeof MutationObserver === "function" && typeof document !== "undefined") {
      var mo = new MutationObserver(function () { fn(); });
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-scheme", "data-theme"] });
      cleanups.push(function () { mo.disconnect(); });
    }
    return function () { cleanups.forEach(function (c) { c(); }); };
  }

  function relTime(value, nowMs) {
    var ms = typeof value === "number" ? value : (typeof value === "string" ? Date.parse(value) : NaN);
    if (!Number.isFinite(ms)) return null;
    var now = Number.isFinite(nowMs) ? nowMs : Date.now();
    var diff = ms - now;
    var abs = Math.abs(diff);
    var unit;
    if (abs < 45000) unit = Math.round(abs / 1000) + "s";
    else if (abs < 3600000) unit = Math.round(abs / 60000) + "m";
    else if (abs < 86400000) {
      var hrs = Math.floor(abs / 3600000), mins = Math.round((abs % 3600000) / 60000);
      unit = mins ? hrs + "h " + mins + "m" : hrs + "h";
    } else unit = (abs / 86400000).toFixed(1) + "d";
    return diff >= 0 ? "in " + unit : unit + " ago";
  }

  function meterSVG(percent, state, opts) {
    if (typeof percent !== "number" || !Number.isFinite(percent)) return null;
    opts = opts || {};
    var clamped = Math.max(0, Math.min(100, percent));
    var w = 200, h = 10;
    var tone = clamped >= (opts.badAt || 90) ? "bad" : clamped >= (opts.warnAt || 70) ? "warn" : "ok";
    var svg = svgEl("svg", {
      viewBox: "0 0 " + w + " " + h,
      preserveAspectRatio: "none",
      class: "z2-meter",
      role: "img",
      "aria-label": Math.round(clamped) + "% used" + (state === "stale" ? " (stale)" : "")
    });
    svg.appendChild(svgEl("rect", { x: 0.5, y: 0.5, width: w - 1, height: h - 1, class: "z2-meter-bg" }));
    if (clamped > 0) {
      var fillW = Math.max(2, (w - 2) * (clamped / 100));
      var bar = svgEl("rect", {
        x: 1, y: 1, width: fillW.toFixed(1), height: h - 2,
        class: "z2-meter-fill",
        "data-tone": tone,
        "data-stale": state === "stale" ? "true" : "false"
      });
      svg.appendChild(bar);
    }
    return svg;
  }

  function waterfallSVG(rows, opts) {
    opts = opts || {};
    var t0 = opts.start != null ? opts.start : 0;
    var t1 = opts.end != null ? opts.end : 1;
    var span = Math.max(1e-6, t1 - t0);
    var W = 1000, H = 18;
    var wrap = el("div", "z2-wf");
    var pos = function (v) { return Math.max(0, Math.min(W, ((v - t0) / span) * W)); };
    rows.forEach(function (row) {
      var line = el("div", "z2-wf-row");
      var lab = el("div", "z2-wf-lab", row.label || "");
      lab.title = row.label || "";
      var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, preserveAspectRatio: "none", class: "z2-wf-track", "aria-hidden": "true" });
      (row.segments || []).forEach(function (s) {
        if (s.start == null || s.end == null || s.end < s.start) return;
        var x = pos(s.start), x2 = pos(s.end);
        var r = svgEl("rect", {
          x: x.toFixed(1),
          y: 3,
          width: Math.max(2, x2 - x).toFixed(1),
          height: 12,
          fill: s.color || "currentColor"
        });
        if (s.title) {
          var title = svgEl("title");
          title.textContent = s.title;
          r.appendChild(title);
        }
        svg.appendChild(r);
      });
      (row.ticks || []).forEach(function (tk) {
        if (tk.at == null) return;
        var tx = pos(tk.at).toFixed(1);
        var l = svgEl("line", { x1: tx, y1: 0, x2: tx, y2: H, stroke: tk.color || "currentColor", "stroke-width": 2 });
        if (tk.title) {
          var tt = svgEl("title");
          tt.textContent = tk.title;
          l.appendChild(tt);
        }
        svg.appendChild(l);
      });
      var val = el("div", "z2-wf-val" + (row.tone ? " z2-cell-" + row.tone : ""), row.value || "");
      line.append(lab, svg, val);
      wrap.appendChild(line);
    });
    return wrap;
  }

  function copyChip(commandText) {
    var box = el("div", "z2-copy");
    var code = el("code", null, commandText);
    var btn = el("button", "z2-btn", "Copy");
    btn.type = "button";
    btn.addEventListener("click", function () {
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(commandText).then(function () {
          btn.textContent = "Copied";
          setTimeout(function () { btn.textContent = "Copy"; }, 1400);
        });
      }
    });
    box.append(code, btn);
    return box;
  }

  function logList(host, opts) {
    opts = opts || {};
    var maxRows = opts.maxRows || 300;
    var fmtTime = opts.fmtTime || function (t) { return new Date(t).toISOString().replace("T", " ").slice(0, 19); };
    var container = el("div", "z2-logs");
    host.replaceChildren(container);
    var seen = new Set();

    function buildItem(entry) {
      var key = entry.id || (entry.t + ":" + (entry.host || "") + ":" + (entry.severity || "") + ":" + (entry.body || ""));
      var item = el("div", "z2-log-item");
      item.dataset.key = key;
      var head = el("button", "z2-log-head");
      head.type = "button";
      head.setAttribute("aria-expanded", "false");
      var sev = String(entry.severity || "INFO").toUpperCase();
      var sevEl = el("span", "z2-sev", sev);
      sevEl.dataset.sev = sev;
      var timeEl = el("span", "z2-log-time", fmtTime(entry.t));
      if (entry.t) {
        var at = new Date(entry.t);
        if (!isNaN(at.getTime())) {
          timeEl.setAttribute("data-tip-title", "Observed");
          timeEl.setAttribute("data-tip-text", at.toLocaleString() + " (" + at.toISOString() + ")");
        }
      }
      var hostEl = el("span", "z2-log-host", entry.host || "local");
      var msgEl = el("span", "z2-log-msg", entry.body || "");
      head.append(timeEl, sevEl, hostEl, msgEl);

      var attrs = entry.attrs && typeof entry.attrs === "object" ? entry.attrs : {};
      var keys = Object.keys(attrs);
      var dl = el("dl", "z2-log-attrs");
      dl.hidden = true;
      if (keys.length) {
        var chips = el("div", "z2-log-chips");
        keys.slice(0, 5).forEach(function (k) {
          var v = typeof attrs[k] === "object" ? JSON.stringify(attrs[k]) : String(attrs[k]);
          chips.appendChild(el("span", "z2-chip", k + "=" + v));
        });
        if (keys.length > 5) chips.appendChild(el("span", "z2-chip", "+" + (keys.length - 5) + " more"));
        head.appendChild(chips);
        keys.forEach(function (k) {
          var v = typeof attrs[k] === "object" ? JSON.stringify(attrs[k]) : String(attrs[k]);
          dl.append(el("dt", null, k), el("dd", null, v));
        });
      }
      head.addEventListener("click", function () {
        if (!keys.length) return;
        dl.hidden = !dl.hidden;
        head.setAttribute("aria-expanded", String(!dl.hidden));
      });
      item.append(head, dl);
      return { key: key, node: item };
    }

    return {
      replace: function (items) {
        seen.clear();
        var count = 0;
        var frag = document.createDocumentFragment();
        (items || []).slice(0, maxRows).forEach(function (entry) {
          var built = buildItem(entry);
          if (seen.has(built.key)) return;
          seen.add(built.key);
          count++;
          frag.appendChild(built.node);
        });
        if (!count) {
          var empty = el("p", "z2-empty", opts.emptyText || "No matching log records in this window.");
          container.replaceChildren(empty);
          return;
        }
        container.replaceChildren(frag);
      },
      prepend: function (newItems) {
        if (!newItems || !newItems.length) return;
        var empty = container.querySelector(".z2-empty");
        if (empty) empty.remove();
        var frag = document.createDocumentFragment();
        newItems.forEach(function (entry) {
          var built = buildItem(entry);
          if (seen.has(built.key)) return;
          seen.add(built.key);
          frag.appendChild(built.node);
        });
        container.insertBefore(frag, container.firstChild);
        while (container.children.length > maxRows) {
          var last = container.lastElementChild;
          if (!last) break;
          if (last.dataset && last.dataset.key) seen.delete(last.dataset.key);
          container.removeChild(last);
        }
      },
      append: function (olderItems) {
        if (!olderItems || !olderItems.length) return;
        var empty = container.querySelector(".z2-empty");
        if (empty) empty.remove();
        var frag = document.createDocumentFragment();
        olderItems.forEach(function (entry) {
          var built = buildItem(entry);
          if (seen.has(built.key)) return;
          seen.add(built.key);
          frag.appendChild(built.node);
        });
        container.appendChild(frag);
      }
    };
  }

  function uplotSync(cache, id, host, seriesDefs, data, opts) {
    if (!host || typeof uPlot === "undefined") return null;
    opts = opts || {};
    host.classList.add("z2-uplot");
    var tk = tokens(host);
    var width = Math.max(220, host.clientWidth || 480);
    var height = opts.height || 200;
    var sig = JSON.stringify({
      s: seriesDefs.map(function (s) { return s.label + ":" + (s.scale || ""); }),
      cat: Boolean(opts.categorical),
      labels: opts.labels || null,
      scheme: tk.ground
    });
    var existing = cache[id];
    if (existing && existing.sig === sig) {
      if (Math.abs(existing.width - width) >= 4 && typeof existing.plot.setSize === "function") {
        existing.plot.setSize({ width: width, height: height });
        existing.width = width;
      }
      existing.plot.setData(data);
      existing.bucket = opts.bucket || 0;
      return existing.plot;
    }
    if (existing && existing.plot) existing.plot.destroy();
    host.replaceChildren();
    var axisBase = {
      stroke: tk.muted,
      grid: { stroke: tk.rule, width: 1 },
      ticks: { stroke: tk.line, width: 1 },
      font: "11px " + tk.mono
    };
    var axes = opts.axes ? opts.axes(axisBase, tk) : [
      Object.assign({}, axisBase, opts.categorical ? { values: function (u, vals) { return vals.map(function (i) { return (opts.labels || [])[i] || ""; }); } } : {}),
      Object.assign({}, axisBase, { size: 58, values: function (u, vals) { return vals.map(opts.yfmt || function (v) { return v == null ? "" : String(v); }); } })
    ];
    var canZoom = Boolean(!opts.categorical && opts.onZoom);
    var conf = {
      width: width,
      height: height,
      cursor: { drag: { x: canZoom, y: false, setScale: false } },
      scales: Object.assign({ x: { time: !opts.categorical } }, opts.scales || {}),
      axes: axes,
      hooks: {
        setSelect: [
          function (uInst) {
            if (!canZoom) return;
            var sel = uInst.select;
            if (!sel || sel.width < 8) return;
            var t0 = uInst.posToVal(sel.left, "x") * 1000;
            var t1 = uInst.posToVal(sel.left + sel.width, "x") * 1000;
            uInst.setSelect({ left: 0, width: 0 }, false);
            if (Number.isFinite(t0) && Number.isFinite(t1) && t1 > t0 + 1000) {
              opts.onZoom(Math.round(t0), Math.round(t1));
            }
          }
        ],
        setLegend: [
          function (uInst) {
            host.classList.toggle("z2-idle", uInst.cursor.idx == null);
          }
        ]
      },
      series: [
        {
          value: opts.categorical
            ? function (u, v) { return (opts.labels || [])[v] || ""; }
            : function (u, v) { return v == null ? "" : (opts.xfmt ? opts.xfmt(v * 1000) : new Date(v * 1000).toLocaleTimeString()); }
        }
      ].concat(seriesDefs),
      legend: { live: true }
    };
    var u = new uPlot(conf, data, host);
    var rec = { plot: u, sig: sig, width: width, bucket: opts.bucket || 0, dragMoved: false, hoverKey: "" };
    cache[id] = rec;

    var legRows = host.querySelectorAll(".u-legend .u-series");
    var legOffset = legRows.length > seriesDefs.length ? 1 : 0;
    if (legOffset) legRows[0].classList.add("z2-ux");
    if (opts.tipEngine && opts.seriesTips) {
      for (var li = legOffset; li < legRows.length; li++) {
        (function (rowEl, sDef) {
          if (!sDef) return;
          var info = opts.seriesTips[sDef.label] || sDef.tip;
          if (!info) return;
          rowEl.setAttribute("data-tip-text", sDef.label);
          opts.tipEngine.bind(rowEl, function () {
            return {
              title: sDef.label,
              body: typeof info === "string" ? info : info.body,
              kv: [["Click", "Toggle series visibility"], ["Shift / Ctrl + Click", "Isolate series"]]
            };
          });
        })(legRows[li], seriesDefs[li - legOffset]);
      }
    }

    var downX = 0;
    u.over.addEventListener("pointerdown", function (ev) { downX = ev.clientX; rec.dragMoved = false; });
    u.over.addEventListener("pointermove", function (ev) {
      if (ev.buttons && Math.abs(ev.clientX - downX) >= 8) rec.dragMoved = true;
      if (!opts.tipEngine || ev.buttons) return;
      var idx = u.cursor.idx;
      if (idx == null || !u.data[0] || u.data[0][idx] == null) {
        if (rec.hoverKey) { opts.tipEngine.leaveKey(rec.hoverKey); rec.hoverKey = ""; }
        return;
      }
      var xVal = u.data[0][idx];
      var key = "uplot:" + id + ":" + idx;
      rec.hoverKey = key;
      var overRect = u.over.getBoundingClientRect();
      var cx = overRect.left + (u.cursor.left || 0);
      var cy = overRect.top + (u.cursor.top || 24);
      var kv = [];
      for (var si = 0; si < seriesDefs.length; si++) {
        var sMeta = u.series[si + 1];
        if (sMeta && sMeta.show === false) continue;
        var rawV = u.data[si + 1] ? u.data[si + 1][idx] : null;
        var formatted = seriesDefs[si].value ? seriesDefs[si].value(u, rawV, si + 1, idx) : (rawV == null ? "-" : String(rawV));
        kv.push([seriesDefs[si].label, formatted]);
      }
      var titleStr = opts.categorical
        ? String((opts.labels || [])[xVal] || xVal)
        : (opts.xfmt ? opts.xfmt(xVal * 1000) : new Date(xVal * 1000).toLocaleString());
      opts.tipEngine.openAt({
        key: key,
        depth: 0,
        anchorRect: { left: cx - 4, right: cx + 4, top: cy - 8, bottom: cy + 8 },
        build: function () {
          var actions = [];
          if (!opts.categorical && opts.onPointClick) {
            actions.push({
              label: "Inspect nearest turn",
              onClick: function () { opts.onPointClick(xVal * 1000, rec.bucket); }
            });
          }
          return {
            title: (opts.title ? opts.title + " · " : "") + titleStr,
            body: canZoom ? "Drag across chart to zoom window; click legend pills to toggle series." : null,
            kv: kv,
            actions: actions
          };
        }
      });
    });
    u.over.addEventListener("pointerleave", function () {
      if (opts.tipEngine && rec.hoverKey) {
        opts.tipEngine.leaveKey(rec.hoverKey);
        rec.hoverKey = "";
      }
    });
    if (!opts.categorical && opts.onPointClick) {
      u.over.addEventListener("click", function () {
        if (rec.dragMoved) { rec.dragMoved = false; return; }
        var idx = u.cursor.idx;
        if (idx == null || !u.data[0] || u.data[0][idx] == null) return;
        opts.onPointClick(u.data[0][idx] * 1000, rec.bucket);
      });
    }
    return u;
  }

  function createRuleManager() {
    var sheet = null;
    var indices = {};
    function ensureSheet() {
      if (sheet) return sheet;
      if (typeof document === "undefined" || !document.styleSheets) return null;
      for (var i = 0; i < document.styleSheets.length; i++) {
        try {
          var s = document.styleSheets[i];
          if (s && s.cssRules != null) { sheet = s; return sheet; }
        } catch (_) {}
      }
      return null;
    }
    return {
      place: function (slotId, left, top, zIndex) {
        var x = Math.round(left), y = Math.round(top), z = zIndex || 40;
        var s = ensureSheet();
        if (!s) return { left: x, top: y, zIndex: z };
        var sel = "#" + slotId;
        var ruleText = sel + " { left: " + x + "px; top: " + y + "px; z-index: " + z + "; }";
        if (indices[slotId] != null && s.cssRules[indices[slotId]] && s.cssRules[indices[slotId]].selectorText === sel) {
          var st = s.cssRules[indices[slotId]].style;
          st.setProperty("left", x + "px");
          st.setProperty("top", y + "px");
          st.setProperty("z-index", String(z));
        } else {
          var idx = s.insertRule(ruleText, s.cssRules.length);
          indices[slotId] = idx;
        }
        return { left: x, top: y, zIndex: z };
      }
    };
  }

  var tipSlotCounter = 0;

  function tips(opts) {
    opts = opts || {};
    var lockDelay = opts.lockDelay != null ? opts.lockDelay : 700;
    var hoverIntent = opts.hoverIntent != null ? opts.hoverIntent : 70;
    var bridgeGrace = opts.bridgeGrace != null ? opts.bridgeGrace : 340;
    var rules = createRuleManager();
    var bindings = new WeakMap();
    var stack = [];
    var intentTimer = 0;
    var pendingTarget = null;
    var nowFn = opts.now || function () { return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now(); };
    var raf = opts.raf || (typeof requestAnimationFrame === "function" ? requestAnimationFrame : function (fn) { return setTimeout(fn, 16); });
    var caf = opts.caf || (typeof cancelAnimationFrame === "function" ? cancelAnimationFrame : clearTimeout);

    function clampPosition(rect, tipW, tipH, depth) {
      var vw = typeof window !== "undefined" && window.innerWidth ? window.innerWidth : 1280;
      var vh = typeof window !== "undefined" && window.innerHeight ? window.innerHeight : 800;
      var margin = 8;
      var left = rect.left + depth * 12;
      var top = rect.bottom + 8;
      if (top + tipH > vh - margin && rect.top - tipH - 8 >= margin) {
        top = rect.top - tipH - 8;
      }
      if (left + tipW > vw - margin) left = vw - tipW - margin;
      if (left < margin) left = margin;
      if (top + tipH > vh - margin) top = Math.max(margin, vh - tipH - margin);
      if (top < margin) top = margin;
      return { left: left, top: top };
    }

    function cancelAncestorsLeave(upToDepth) {
      for (var i = 0; i <= upToDepth && i < stack.length; i++) {
        if (stack[i] && stack[i].leaveTimer) {
          clearTimeout(stack[i].leaveTimer);
          stack[i].leaveTimer = 0;
        }
      }
    }

    function closeFrom(depth) {
      while (stack.length > depth) {
        var entry = stack.pop();
        if (entry.rafId) caf(entry.rafId);
        if (entry.leaveTimer) clearTimeout(entry.leaveTimer);
        if (entry.node && entry.node.parentNode) entry.node.parentNode.removeChild(entry.node);
      }
    }

    function lockEntry(entry, pinHard) {
      if (!entry) return;
      entry.locked = true;
      if (pinHard) entry.pinned = true;
      entry.node.dataset.locked = "true";
      if (entry.node.classList) entry.node.classList.toggle("z2-pinned", Boolean(entry.pinned));
      entry.timerFill.setAttribute("width", "200");
      entry.badge.textContent = entry.pinned ? "PINNED · Esc" : "LOCKED · Esc";
      entry.closeBtn.hidden = false;
    }

    function scheduleLeave(entry, delay) {
      if (!entry || entry.pinned) return;
      if (entry.leaveTimer) clearTimeout(entry.leaveTimer);
      entry.leaveTimer = setTimeout(function () {
        var idx = stack.indexOf(entry);
        if (idx < 0) return;
        for (var k = idx + 1; k < stack.length; k++) {
          if (stack[k].hovered || stack[k].pinned) return;
        }
        if (!entry.hovered) closeFrom(idx);
      }, delay);
    }

    function buildContentFromElement(target) {
      if (bindings.has(target)) return bindings.get(target)(target);
      var tmplId = target.getAttribute && target.getAttribute("data-tip");
      if (tmplId && typeof document !== "undefined" && document.getElementById) {
        var tmpl = document.getElementById(tmplId);
        if (tmpl) {
          var titleAttr = target.getAttribute("data-tip-title") || tmpl.getAttribute("data-title") || "";
          var frag = tmpl.content ? tmpl.content.cloneNode(true) : tmpl.cloneNode(true);
          return { title: titleAttr, body: frag };
        }
      }
      var text = target.getAttribute && target.getAttribute("data-tip-text");
      if (text) {
        return {
          title: (target.getAttribute && target.getAttribute("data-tip-title")) || "",
          body: text
        };
      }
      return null;
    }

    function renderSpecInto(bodyHost, spec) {
      if (spec.body) {
        if (typeof spec.body === "string") bodyHost.appendChild(el("p", null, spec.body));
        else bodyHost.appendChild(spec.body);
      }
      if (spec.kv && spec.kv.length) {
        var dl = el("dl", "z2-tip-kv");
        spec.kv.forEach(function (pair) {
          if (!pair || pair[1] == null || pair[1] === "") return;
          dl.append(el("dt", null, String(pair[0])), el("dd", null, String(pair[1])));
        });
        bodyHost.appendChild(dl);
      }
      if (spec.actions && spec.actions.length) {
        var act = el("div", "z2-tip-actions");
        spec.actions.forEach(function (a) {
          var b = el("button", "z2-btn", a.label);
          b.type = "button";
          b.addEventListener("click", function (ev) {
            ev.stopPropagation();
            if (a.onClick) a.onClick();
            if (a.closeOnRun !== false) closeFrom(0);
          });
          act.appendChild(b);
        });
        bodyHost.appendChild(act);
      }
    }

    function openEntry(cfg) {
      var depth = cfg.depth || 0;
      if (stack[depth] && stack[depth].key === cfg.key) {
        cancelAncestorsLeave(depth);
        if (cfg.pin) lockEntry(stack[depth], true);
        return stack[depth];
      }
      for (var d = depth; d < stack.length; d++) {
        if (stack[d].pinned && !cfg.forceReplace) return stack[d];
      }
      closeFrom(depth);
      cancelAncestorsLeave(depth);

      var spec = cfg.spec;
      if (!spec) return null;

      var slotId = "z2-tip-slot-" + (++tipSlotCounter);
      var tip = el("div", "z2-tip");
      tip.id = slotId;
      tip.setAttribute("role", "tooltip");
      tip.dataset.depth = String(depth);
      tip.dataset.locked = "false";

      var timerSvg = svgEl("svg", { viewBox: "0 0 200 3", preserveAspectRatio: "none", class: "z2-tip-timer", "aria-hidden": "true" });
      var timerBg = svgEl("rect", { x: 0, y: 0, width: 200, height: 3, class: "z2-tip-timer-bg" });
      var timerFill = svgEl("rect", { x: 0, y: 0, width: 0, height: 3, class: "z2-tip-timer-fill" });
      timerSvg.append(timerBg, timerFill);

      var inner = el("div", "z2-tip-inner");
      var head = el("div", "z2-tip-head");
      var titleEl = el("p", "z2-tip-title", spec.title || "Details");
      var rightHead = el("div", "z2-pager-actions");
      var badge = el("span", "z2-tip-badge", "Hold to lock");
      var closeBtn = el("button", "z2-tip-close", "x");
      closeBtn.type = "button";
      closeBtn.setAttribute("aria-label", "Close tooltip");
      closeBtn.hidden = true;
      rightHead.append(badge, closeBtn);
      head.append(titleEl, rightHead);

      var bodyHost = el("div", "z2-tip-body");
      renderSpecInto(bodyHost, spec);
      inner.append(head, bodyHost);
      tip.append(timerSvg, inner);

      var hostRoot = (typeof document !== "undefined" && document.body) || opts.mount;
      if (hostRoot) hostRoot.appendChild(tip);

      var entry = {
        key: cfg.key,
        depth: depth,
        anchor: cfg.anchor || null,
        anchorRect: cfg.anchorRect,
        node: tip,
        slotId: slotId,
        timerFill: timerFill,
        badge: badge,
        closeBtn: closeBtn,
        locked: false,
        pinned: false,
        hovered: false,
        start: nowFn(),
        rafId: 0,
        leaveTimer: 0,
        coords: { left: 8, top: 8 }
      };

      closeBtn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        var idx = stack.indexOf(entry);
        if (idx >= 0) closeFrom(idx);
      });

      tip.addEventListener("pointerenter", function () {
        entry.hovered = true;
        cancelAncestorsLeave(entry.depth);
      });
      tip.addEventListener("pointerleave", function () {
        entry.hovered = false;
        scheduleLeave(entry, 240);
      });
      tip.addEventListener("mousedown", function (ev) {
        if (ev.button === 1) {
          ev.preventDefault();
          lockEntry(entry, true);
        }
      });

      var tipRect = tip.getBoundingClientRect ? tip.getBoundingClientRect() : { width: 280, height: 140 };
      var placed = clampPosition(cfg.anchorRect || { left: 24, top: 24, bottom: 44, right: 120 }, tipRect.width || 280, tipRect.height || 140, depth);
      entry.coords = rules.place(slotId, placed.left, placed.top, 40 + depth);

      stack.push(entry);

      if (cfg.pin || lockDelay <= 0) {
        lockEntry(entry, Boolean(cfg.pin));
      } else {
        var tick = function () {
          if (stack.indexOf(entry) < 0 || entry.locked) return;
          var elapsed = nowFn() - entry.start;
          var pct = Math.max(0, Math.min(1, elapsed / lockDelay));
          timerFill.setAttribute("width", (200 * pct).toFixed(1));
          if (pct >= 1) {
            lockEntry(entry, false);
            return;
          }
          entry.rafId = raf(tick);
        };
        entry.rafId = raf(tick);
      }
      return entry;
    }

    function findTrigger(target) {
      var cur = target;
      while (cur && cur !== document) {
        if (bindings.has(cur)) return cur;
        if (cur.getAttribute && (cur.getAttribute("data-tip") || cur.getAttribute("data-tip-text"))) return cur;
        cur = cur.parentNode;
      }
      return null;
    }

    function depthForTrigger(trigger) {
      var cur = trigger;
      while (cur && cur !== document) {
        if (cur.classList && cur.classList.contains("z2-tip") && cur.dataset && cur.dataset.depth != null) {
          return Number(cur.dataset.depth) + 1;
        }
        cur = cur.parentNode;
      }
      return 0;
    }

    function triggerEnter(trigger, pinImmediate) {
      var depth = depthForTrigger(trigger);
      if (depth > 0 && stack[depth - 1] && !stack[depth - 1].locked) return null;
      var spec = buildContentFromElement(trigger);
      if (!spec) return null;
      var rect = trigger.getBoundingClientRect ? trigger.getBoundingClientRect() : { left: 20, top: 20, bottom: 40, right: 100 };
      return openEntry({
        key: trigger,
        depth: depth,
        anchor: trigger,
        anchorRect: rect,
        spec: spec,
        pin: pinImmediate,
        forceReplace: pinImmediate
      });
    }

    if (typeof document !== "undefined" && document.addEventListener) {
      document.addEventListener("pointerover", function (e) {
        var trig = findTrigger(e.target);
        if (!trig) return;
        if (pendingTarget === trig) return;
        clearTimeout(intentTimer);
        pendingTarget = trig;
        intentTimer = setTimeout(function () {
          pendingTarget = null;
          triggerEnter(trig, false);
        }, hoverIntent);
      });

      document.addEventListener("pointerout", function (e) {
        var trig = findTrigger(e.target);
        if (!trig) return;
        if (e.relatedTarget && trig.contains && trig.contains(e.relatedTarget)) return;
        if (pendingTarget === trig) {
          clearTimeout(intentTimer);
          pendingTarget = null;
        }
        for (var i = 0; i < stack.length; i++) {
          if (stack[i].anchor === trig) {
            scheduleLeave(stack[i], stack[i].locked ? bridgeGrace : 120);
          }
        }
      });

      document.addEventListener("auxclick", function (e) {
        if (e.button !== 1) return;
        var trig = findTrigger(e.target);
        if (!trig) return;
        e.preventDefault();
        triggerEnter(trig, true);
      });

      document.addEventListener("click", function (e) {
        var insideTip = e.target && e.target.closest && e.target.closest(".z2-tip");
        if (insideTip) return;
        var trig = findTrigger(e.target);
        if (trig && trig.classList && trig.classList.contains("z2-term")) {
          e.preventDefault();
          triggerEnter(trig, true);
          return;
        }
        if (stack.length) closeFrom(0);
      });

      document.addEventListener("focusin", function (e) {
        var trig = findTrigger(e.target);
        if (trig) triggerEnter(trig, false);
      });

      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && stack.length) {
          e.stopPropagation();
          closeFrom(stack.length - 1);
        }
      });

      if (typeof window !== "undefined" && window.addEventListener) {
        var reclamp = function () {
          stack.forEach(function (entry) {
            if (entry.anchor && entry.anchor.getBoundingClientRect) {
              entry.anchorRect = entry.anchor.getBoundingClientRect();
            }
            var r = entry.node.getBoundingClientRect ? entry.node.getBoundingClientRect() : { width: 280, height: 140 };
            var p = clampPosition(entry.anchorRect || { left: 24, top: 24, bottom: 44, right: 120 }, r.width || 280, r.height || 140, entry.depth);
            entry.coords = rules.place(entry.slotId, p.left, p.top, 40 + entry.depth);
          });
        };
        window.addEventListener("resize", reclamp);
        window.addEventListener("scroll", reclamp, true);
      }
    }

    return {
      bind: function (node, fn) {
        if (node && typeof fn === "function") bindings.set(node, fn);
      },
      openAt: function (cfg) {
        return openEntry({
          key: cfg.key,
          depth: cfg.depth || 0,
          anchor: cfg.anchor || null,
          anchorRect: cfg.anchorRect,
          spec: typeof cfg.build === "function" ? cfg.build() : cfg.spec,
          pin: Boolean(cfg.pin),
          forceReplace: Boolean(cfg.forceReplace)
        });
      },
      leaveKey: function (key) {
        for (var i = 0; i < stack.length; i++) {
          if (stack[i].key === key) scheduleLeave(stack[i], stack[i].locked ? bridgeGrace : 120);
        }
      },
      closeAll: function () { closeFrom(0); },
      _stack: stack,
      _triggerEnter: triggerEnter,
      _clampPosition: clampPosition
    };
  }

  root.z2 = Object.assign(root.z2 || {}, {
    tokens: tokens,
    onSchemeChange: onSchemeChange,
    relTime: relTime,
    meterSVG: meterSVG,
    waterfallSVG: waterfallSVG,
    copyChip: copyChip,
    logList: logList,
    uplotSync: uplotSync,
    tips: tips
  });
})(typeof window !== "undefined" ? window : globalThis);
