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
        ground: "#E7D4C4", ground2: "#DCC4B0", accent: "#7D2E2E",
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
      accent: pick("--z-accent", "#7D2E2E"),
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
      if (entry.host && entry.host.length > 16) {
        hostEl.setAttribute("data-tip-title", "Host");
        hostEl.setAttribute("data-tip-text", entry.host);
      }
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
          var chip = el("span", "z2-chip", k + "=" + v);
          chip.setAttribute("data-tip-title", k);
          chip.setAttribute("data-tip-text", v.length > 600 ? v.slice(0, 600) + "..." : v || k);
          chips.appendChild(chip);
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
        while (container.children.length > maxRows) {
          var first = container.children[0];
          if (!first) break;
          if (first.dataset && first.dataset.key) seen.delete(first.dataset.key);
          container.removeChild(first);
        }
      }
    };
  }

  function uplotSync(cache, id, host, seriesDefs, data, opts) {
    if (!host || typeof uPlot === "undefined") return null;
    opts = opts || {};
    host.classList.add("z2-uplot");
    var tk = tokens(host);
    var width = Math.max(220, host.clientWidth || 480);
    var fill = host.classList.contains("z2-fill");
    var height = fill ? Math.max(opts.height || 200, host.clientHeight - 44) : (opts.height || 200);
    var sig = JSON.stringify({
      s: seriesDefs.map(function (s) { return s.label + ":" + (s.scale || ""); }),
      cat: Boolean(opts.categorical),
      labels: opts.labels || null,
      scheme: tk.ground
    });
    var existing = cache[id];
    if (existing && existing.sig === sig) {
      if ((Math.abs(existing.width - width) >= 4 || Math.abs(existing.height - height) >= 4) && typeof existing.plot.setSize === "function") {
        existing.plot.setSize({ width: width, height: height });
        existing.width = width;
        existing.height = height;
      }
      existing.plot.setData(data);
      if (existing.describe) existing.describe(data);
      existing.bucket = opts.bucket || 0;
      return existing.plot;
    }
    if (existing && existing.plot) existing.plot.destroy();
    if (existing && existing.ro) existing.ro.disconnect();
    host.replaceChildren();
    var axisBase = {
      stroke: tk.muted,
      grid: { stroke: tk.rule, width: 1 },
      ticks: { stroke: tk.line, width: 1 },
      font: "12px " + tk.mono
    };
    var axes = opts.axes ? opts.axes(axisBase, tk) : [
      Object.assign({}, axisBase, opts.categorical ? { values: function (u, vals) { return vals.map(function (i) { return (opts.labels || [])[i] || ""; }); } } : {}),
      Object.assign({}, axisBase, { size: 58, values: function (u, vals) { return vals.map(opts.yfmt || function (v) { return v == null ? "" : String(v); }); } })
    ];
    var canZoom = Boolean(!opts.categorical && opts.onZoom);
    var conf = {
      width: width,
      height: height,
      cursor: Object.assign({ drag: { x: canZoom, y: false, setScale: false } }, opts.syncKey && !opts.categorical ? { sync: { key: opts.syncKey } } : {}),
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
        ]
      },
      series: [
        {
          value: opts.categorical
            ? function (u, v) { return (opts.labels || [])[v] || ""; }
            : function (u, v) { return v == null ? "" : (opts.xfmt ? opts.xfmt(v * 1000) : new Date(v * 1000).toLocaleTimeString()); }
        }
      ].concat(seriesDefs),
      legend: { live: false, markers: { fill: function (uInst, si) { var d = seriesDefs[si - 1]; return d ? (d.fill || d.stroke) : null; } } }
    };
    var legRows = [];
    var legOffset = 0;
    conf.hooks.setSeries = [function (uInst, si) {
      var rowEl = si ? legRows[si - 1 + legOffset] : null;
      if (rowEl) rowEl.setAttribute("aria-pressed", String(uInst.series[si].show !== false));
    }];
    var u = new uPlot(conf, data, host);
    var rec = { plot: u, sig: sig, width: width, height: height, bucket: opts.bucket || 0, dragMoved: false, hoverKey: "", ro: null, frame: 0, describe: null };
    cache[id] = rec;
    rec.describe = function (d) {
      var parts = [];
      for (var si = 0; si < seriesDefs.length; si++) {
        var col = d[si + 1] || [];
        var last = null, lastAt = -1, lo = null, hi = null;
        for (var k = 0; k < col.length; k++) {
          var v = col[k];
          if (v == null || !Number.isFinite(v)) continue;
          last = v; lastAt = k;
          if (lo == null || v < lo) lo = v;
          if (hi == null || v > hi) hi = v;
        }
        var say = function (v, at) { return seriesDefs[si].value ? seriesDefs[si].value(u, v, si + 1, at) : String(v); };
        parts.push(seriesDefs[si].label + (last == null ? " no data" : " latest " + say(last, lastAt) + (seriesDefs.length <= 6 ? ", low " + say(lo, lastAt) + ", high " + say(hi, lastAt) : "")));
      }
      var xs = d[0] || [];
      var span = opts.categorical || !xs.length ? "" : " " + xs.length + " points, " + (opts.xfmt ? opts.xfmt(xs[0] * 1000) + " to " + opts.xfmt(xs[xs.length - 1] * 1000) : "") + ".";
      u.over.setAttribute("aria-label", (opts.title ? opts.title + ". " : "") + parts.join("; ") + "." + span + " Arrow keys read values" + (canZoom ? ", shift and arrows select, Enter zooms." : "."));
    };
    u.over.setAttribute("role", "img");
    u.over.tabIndex = 0;
    rec.describe(data);
    if (typeof ResizeObserver !== "undefined") {
      rec.ro = new ResizeObserver(function () {
        if (rec.frame) return;
        rec.frame = requestAnimationFrame(function () {
          rec.frame = 0;
          if (host.closest && host.closest(".z2-moving")) return;
          var w = Math.max(220, host.clientWidth || 0);
          var leg = u.root.querySelector(".u-legend");
          var hh = host.classList.contains("z2-fill") ? Math.max(opts.height || 200, host.clientHeight - (leg ? leg.offsetHeight : 0) - 8) : (opts.height || 200);
          if (!w || (Math.abs(w - rec.width) < 4 && Math.abs(hh - rec.height) < 4)) return;
          rec.width = w;
          rec.height = hh;
          u.setSize({ width: w, height: hh });
        });
      });
      rec.ro.observe(host);
    }

    legRows = host.querySelectorAll(".u-legend .u-series");
    legOffset = legRows.length > seriesDefs.length ? 1 : 0;
    if (legOffset) legRows[0].classList.add("z2-ux");
    for (var lr = legOffset; lr < legRows.length; lr++) {
      var sd = seriesDefs[lr - legOffset];
      if (sd && !legRows[lr].hasAttribute("data-tip-text")) legRows[lr].setAttribute("data-tip-text", sd.label);
    }
    var legEl = host.querySelector(".u-legend");
    if (legEl && opts.compactLegend !== false) compactLegend(legEl);
    var rowSeries = function (rowEl) {
      var at = Array.prototype.indexOf.call(legRows, rowEl);
      return at < legOffset ? 0 : at + 1 - legOffset;
    };
    var solo = function (si) {
      var others = u.series.some(function (s, i) { return i > 0 && i !== si && s.show; });
      u.batch(function () {
        u.series.forEach(function (s, i) { if (i > 0) u.setSeries(i, { show: others ? i === si : true }); });
      });
    };
    if (legEl) {
      legEl.addEventListener("click", function (ev) {
        var rowEl = ev.target.closest && ev.target.closest(".u-series");
        var si = rowEl ? rowSeries(rowEl) : 0;
        if (!si || !(ev.shiftKey || ev.ctrlKey || ev.metaKey)) return;
        ev.stopPropagation();
        ev.preventDefault();
        solo(si);
      }, true);
      legEl.addEventListener("keydown", function (ev) {
        if (ev.key !== "Enter" && ev.key !== " ") return;
        var rowEl = ev.target.closest && ev.target.closest(".u-series");
        var si = rowEl ? rowSeries(rowEl) : 0;
        if (!si) return;
        ev.preventDefault();
        if (ev.shiftKey || ev.ctrlKey || ev.metaKey) solo(si);
        else u.setSeries(si, { show: !u.series[si].show });
      });
    }
    for (var li = legOffset; li < legRows.length; li++) {
      (function (rowEl, sDef) {
        if (!sDef) return;
        rowEl.tabIndex = 0;
        rowEl.setAttribute("role", "button");
        rowEl.setAttribute("aria-pressed", "true");
        if (!opts.tipEngine) return;
        var info = (opts.seriesTips && opts.seriesTips[sDef.label]) || sDef.tip || null;
        rowEl.setAttribute("data-tip-text", sDef.label);
        opts.tipEngine.bind(rowEl, function () {
          return {
            title: sDef.label,
            body: info ? (typeof info === "string" ? info : info.body) : null,
            kv: [["Click", "Show or hide"], ["Shift or Ctrl click", "Solo, again for all"]]
          };
        });
      })(legRows[li], seriesDefs[li - legOffset]);
    }

    var downX = 0, pointerType = "mouse", kbAnchor = -1;
    var tipAt = function (idx, pin) {
      if (!opts.tipEngine || idx == null || !u.data[0] || u.data[0][idx] == null) return false;
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
        group: "uplot:" + id,
        lockDelay: 900,
        depth: 0,
        pin: Boolean(pin),
        anchorRect: { left: cx - 4, right: cx + 4, top: cy - 8, bottom: cy + 8 },
        build: function () {
          var actions = [];
          if (!opts.categorical && opts.onPointClick) {
            actions.push({
              label: "Inspect nearest turn",
              onClick: function () { opts.onPointClick(xVal * 1000, rec.bucket); }
            });
          }
          if (canZoom) {
            actions.push({
              label: "Zoom in here",
              onClick: function () {
                var half = (u.scales.x.max - u.scales.x.min) / 8;
                opts.onZoom(Math.round((xVal - half) * 1000), Math.round((xVal + half) * 1000));
              }
            });
          }
          return {
            title: (opts.title ? opts.title + " · " : "") + titleStr,
            kv: kv,
            actions: actions
          };
        }
      });
      return true;
    };
    var leaveTip = function () {
      if (!opts.tipEngine) return;
      if (opts.tipEngine.leaveGroup) opts.tipEngine.leaveGroup("uplot:" + id);
      else if (rec.hoverKey) opts.tipEngine.leaveKey(rec.hoverKey);
      rec.hoverKey = "";
    };
    u.over.addEventListener("pointerdown", function (ev) { downX = ev.clientX; rec.dragMoved = false; pointerType = ev.pointerType || "mouse"; });
    u.over.addEventListener("pointermove", function (ev) {
      if (ev.buttons && Math.abs(ev.clientX - downX) >= 8) rec.dragMoved = true;
      if (!opts.tipEngine || ev.buttons || ev.pointerType === "touch") return;
      if (!tipAt(u.cursor.idx, false) && rec.hoverKey) { opts.tipEngine.leaveKey(rec.hoverKey); rec.hoverKey = ""; }
    });
    u.over.addEventListener("pointerleave", leaveTip);
    u.over.addEventListener("click", function (ev) {
      if (rec.dragMoved) { rec.dragMoved = false; return; }
      var idx = u.cursor.idx;
      if (idx == null || !u.data[0] || u.data[0][idx] == null) return;
      if (pointerType === "touch" && opts.tipEngine) {
        ev.stopPropagation();
        tipAt(idx, true);
        return;
      }
      if (!opts.categorical && opts.onPointClick) opts.onPointClick(u.data[0][idx] * 1000, rec.bucket);
    });
    var keyTo = function (idx) {
      var xs = u.data[0] || [];
      if (!xs.length) return -1;
      idx = Math.max(0, Math.min(xs.length - 1, idx));
      u.setCursor({ left: u.valToPos(xs[idx], "x"), top: u.over.clientHeight / 2 });
      return idx;
    };
    u.over.addEventListener("keydown", function (ev) {
      var xs = u.data[0] || [];
      var cur = u.cursor.idx == null ? xs.length : u.cursor.idx;
      var step = ev.key === "ArrowLeft" ? -1 : ev.key === "ArrowRight" ? 1 : ev.key === "PageUp" ? -10 : ev.key === "PageDown" ? 10 : 0;
      if (step || ev.key === "Home" || ev.key === "End") {
        ev.preventDefault();
        var from = u.cursor.idx == null ? (step < 0 ? xs.length - 1 : 0) : cur;
        var to = keyTo(ev.key === "Home" ? 0 : ev.key === "End" ? xs.length - 1 : (u.cursor.idx == null ? from : cur + step));
        if (to < 0) return;
        if (ev.shiftKey && canZoom) {
          if (kbAnchor < 0) kbAnchor = from;
          var a = u.valToPos(xs[Math.min(kbAnchor, to)], "x"), b = u.valToPos(xs[Math.max(kbAnchor, to)], "x");
          u.setSelect({ left: a, width: Math.max(0, b - a), top: 0, height: u.over.clientHeight }, false);
        } else if (kbAnchor >= 0) {
          kbAnchor = -1;
          u.setSelect({ left: 0, width: 0, top: 0, height: 0 }, false);
        }
        tipAt(to, false);
      } else if (ev.key === "Enter" || ev.key === " ") {
        if (u.cursor.idx == null) return;
        ev.preventDefault();
        if (kbAnchor >= 0 && kbAnchor !== u.cursor.idx && canZoom) {
          var t0 = xs[Math.min(kbAnchor, u.cursor.idx)] * 1000, t1 = xs[Math.max(kbAnchor, u.cursor.idx)] * 1000;
          kbAnchor = -1;
          u.setSelect({ left: 0, width: 0, top: 0, height: 0 }, false);
          if (t1 > t0 + 1000) opts.onZoom(Math.round(t0), Math.round(t1));
        } else if (!opts.categorical && opts.onPointClick) {
          opts.onPointClick(xs[u.cursor.idx] * 1000, rec.bucket);
        }
      }
    });
    u.over.addEventListener("blur", function () {
      leaveTip();
      if (kbAnchor >= 0) { kbAnchor = -1; u.setSelect({ left: 0, width: 0, top: 0, height: 0 }, false); }
    });
    return u;
  }

  function scrollableAt(node) {
    for (var cur = node; cur && cur.nodeType === 1; cur = cur.parentElement) {
      if (cur === document.body || cur === document.documentElement) break;
      var cs = getComputedStyle(cur);
      var y = /(auto|scroll)/.test(cs.overflowY) && cur.scrollHeight > cur.clientHeight + 1;
      var x = /(auto|scroll)/.test(cs.overflowX) && cur.scrollWidth > cur.clientWidth + 1;
      if (y || x) return cur;
    }
    return document.scrollingElement || document.documentElement;
  }

  var guardsOn = false;
  function holdGuards(opts) {
    if (guardsOn || typeof document === "undefined") return;
    guardsOn = true;
    opts = opts || {};
    var swallowAfter = opts.swallowAfter != null ? opts.swallowAfter : 500;
    var down = null, swallow = 0, lock = null;
    var now = function () { return typeof performance !== "undefined" ? performance.now() : Date.now(); };
    function release() {
      if (lock && lock.classList) lock.classList.remove("z2-scroll-lock");
      lock = null;
      document.documentElement.classList.remove("z2-rhold");
    }
    document.addEventListener("pointerdown", function (e) {
      down = { t: now(), button: e.button };
      if (e.button === 2) {
        release();
        lock = scrollableAt(e.target);
        if (lock !== document.scrollingElement && lock !== document.documentElement) lock.classList.add("z2-scroll-lock");
        document.documentElement.classList.add("z2-rhold");
      }
    }, true);
    function up(e) {
      if (down && now() - down.t >= swallowAfter) swallow = now();
      down = null;
      if (!e.buttons || !(e.buttons & 2)) release();
    }
    document.addEventListener("pointerup", up, true);
    document.addEventListener("mouseup", function (e) { if (down) up(e); }, true);
    document.addEventListener("pointercancel", function () { down = null; release(); }, true);
    window.addEventListener("blur", function () { down = null; release(); });
    ["click", "auxclick", "contextmenu"].forEach(function (type) {
      document.addEventListener(type, function (e) {
        if (swallow && now() - swallow < 120) {
          e.preventDefault();
          e.stopImmediatePropagation();
          if (type !== "contextmenu") swallow = 0;
        }
      }, true);
    });
    document.addEventListener("wheel", function (e) {
      if (!lock) return;
      e.preventDefault();
      var unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? (lock.clientHeight || window.innerHeight) : 1;
      lock.scrollBy({ left: e.deltaX * unit, top: e.deltaY * unit, behavior: "auto" });
    }, { capture: true, passive: false });
  }

  function compactLegend(legend, opts) {
    if (!legend || !legend.parentNode) return null;
    opts = opts || {};
    var shell = legend.parentNode.classList && legend.parentNode.classList.contains("z2-legend-shell") ? legend.parentNode : null;
    if (!shell) {
      shell = el("div", "z2-legend-shell");
      legend.parentNode.insertBefore(shell, legend);
      shell.appendChild(legend);
    }
    legend.classList.add("z2-legend-compact");
    var more = shell.querySelector(":scope > .z2-legend-more");
    if (!more) {
      more = el("button", "z2-legend-more", "more");
      more.type = "button";
      more.setAttribute("aria-expanded", "false");
      more.setAttribute("data-tip-text", "Show every legend entry in full; the row grows to fit.");
      shell.appendChild(more);
      more.addEventListener("click", function (ev) {
        ev.stopPropagation();
        var open = !shell.classList.contains("z2-open");
        shell.classList.toggle("z2-open", open);
        more.setAttribute("aria-expanded", String(open));
        measure();
        if (opts.onToggle) opts.onToggle(open);
      });
    }
    function measure() {
      var open = shell.classList.contains("z2-open");
      if (open) { more.hidden = false; more.textContent = "less"; return; }
      var labels = legend.querySelectorAll(".u-label, .z2-lbl");
      var body = legend.querySelector(":scope > tbody");
      var over = function (n) { return n.scrollWidth > n.clientWidth + 1 || n.scrollHeight > n.clientHeight + 1; };
      var cut = over(legend) || Boolean(body && over(body));
      for (var i = 0; !cut && i < labels.length; i++) if (labels[i].scrollWidth > labels[i].clientWidth + 1) cut = true;
      more.hidden = !cut;
      more.textContent = "more";
    }
    if (typeof ResizeObserver !== "undefined" && !shell._z2ro) {
      var frame = 0;
      shell._z2ro = new ResizeObserver(function () {
        if (frame) return;
        frame = requestAnimationFrame(function () { frame = 0; measure(); });
      });
      shell._z2ro.observe(legend);
    }
    requestAnimationFrame(measure);
    return { measure: measure };
  }

  function flip(els, mutate, opts) {
    opts = opts || {};
    var list = Array.prototype.slice.call(els || []);
    var before = list.map(function (el) { return el.getBoundingClientRect(); });
    mutate();
    var reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof Element === "undefined" || !Element.prototype.animate) return Promise.resolve();
    var duration = opts.duration || 280;
    var easing = opts.easing || "cubic-bezier(.2,.75,.25,1)";
    var runs = [];
    list.forEach(function (el, i) {
      var a = before[i], b = el.getBoundingClientRect();
      if (!b.width || !b.height) return;
      var dx = a.left - b.left, dy = a.top - b.top;
      var dw = b.width - a.width, dh = b.height - a.height;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(dw) < 1 && Math.abs(dh) < 1) return;
      var from = { transform: "translate(" + dx + "px," + dy + "px)" };
      var to = { transform: "translate(0,0)" };
      if (dw > 0 || dh > 0) {
        from.clipPath = "inset(0 " + Math.max(0, dw) + "px " + Math.max(0, dh) + "px 0)";
        to.clipPath = "inset(0 0 0 0)";
      }
      if (!a.width || !a.height) { from.opacity = 0; to.opacity = 1; }
      runs.push(el.animate([from, to], { duration: duration, easing: easing }).finished.catch(function () {}));
    });
    return Promise.all(runs).then(function () {});
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

  var tipEngineCounter = 0;

  function tips(opts) {
    opts = opts || {};
    var lockDelay = opts.lockDelay != null ? opts.lockDelay : 700;
    var hoverIntent = opts.hoverIntent != null ? opts.hoverIntent : 110;
    var bridgeGrace = opts.bridgeGrace != null ? opts.bridgeGrace : 340;
    var swapGrace = opts.swapGrace != null ? opts.swapGrace : 320;
    var skipDelay = opts.skipDelay != null ? opts.skipDelay : 500;
    var lastClose = -1e9;
    var engineId = ++tipEngineCounter;
    var quiet = 0;
    var storeKey = opts.storeKey || "z2.tips";
    var enabled = opts.enabled !== false;
    try { if (typeof localStorage !== "undefined" && localStorage.getItem(storeKey) === "off") enabled = false; } catch (_) {}
    var held = 0;
    var lastPointer = "mouse";
    var rules = createRuleManager();
    var bindings = new WeakMap();
    var stack = [];
    var intentTimer = 0;
    var pendingTarget = null;
    var nowFn = opts.now || function () { return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now(); };
    var raf = opts.raf || (typeof requestAnimationFrame === "function" ? requestAnimationFrame : function (fn) { return setTimeout(fn, 16); });
    var caf = opts.caf || (typeof cancelAnimationFrame === "function" ? cancelAnimationFrame : clearTimeout);

    function anchorBox(el) {
      var r = el.getBoundingClientRect();
      var row = el.closest && el.closest("[role=button], tr, li, .z2-kpi");
      var rr = row && row !== el ? row.getBoundingClientRect() : r;
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, rowTop: Math.min(r.top, rr.top), rowBottom: Math.max(r.bottom, rr.bottom) };
    }

    function clampPosition(rect, tipW, tipH, depth) {
      var vw = typeof window !== "undefined" && window.innerWidth ? window.innerWidth : 1280;
      var vh = typeof window !== "undefined" && window.innerHeight ? window.innerHeight : 800;
      var margin = 8;
      if (vw <= 520 && rect.rowBottom != null) {
        var inset = typeof document !== "undefined" ? parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--z-sticky-h")) || 0 : 0;
        var below = vh - margin - tipH;
        var sheetTop = rect.rowBottom + margin <= below ? below : Math.max(inset + margin, rect.rowTop - tipH - margin);
        return { left: margin, top: Math.max(margin, sheetTop) };
      }
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
      if (stack.length > depth) lastClose = nowFn();
      while (stack.length > depth) {
        var entry = stack.pop();
        if (entry.rafId) caf(entry.rafId);
        if (entry.leaveTimer) clearTimeout(entry.leaveTimer);
        if (entry.swapTimer) clearTimeout(entry.swapTimer);
        if (entry.node && entry.node.parentNode) entry.node.parentNode.removeChild(entry.node);
        describe(entry, null);
      }
    }

    function describe(entry, anchor) {
      var prev = entry.describes;
      if (prev && prev.removeAttribute && prev.getAttribute("aria-describedby") === entry.slotId) prev.removeAttribute("aria-describedby");
      entry.describes = null;
      if (anchor && anchor.setAttribute && anchor.removeAttribute) {
        entry.describes = anchor;
        anchor.setAttribute("aria-describedby", entry.slotId);
      }
    }

    function lockEntry(entry, pinHard) {
      if (!entry) return;
      entry.locked = true;
      if (pinHard) entry.pinned = true;
      entry.node.dataset.locked = "true";
      if (entry.node.classList) entry.node.classList.toggle("z2-pinned", Boolean(entry.pinned));
      entry.timerFill.setAttribute("width", "200");
      entry.badge.textContent = entry.pinned ? "PINNED · Esc" : "LOCKED · drag · Esc";
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
        var own = (target.getAttribute("aria-label") || target.textContent || "").replace(/\s+/g, " ").trim();
        if (own.length > 48 || own === text) own = "";
        return {
          title: target.getAttribute("data-tip-title") || own,
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

    function specOf(cfg) {
      if (cfg.spec) return cfg.spec;
      if (typeof cfg.build === "function") return cfg.build();
      return null;
    }

    function startTimer(entry) {
      if (entry.rafId) caf(entry.rafId);
      entry.rafId = 0;
      entry.start = nowFn();
      entry.timerFill.setAttribute("width", "0");
      var delay = entry.lockDelay;
      if (delay <= 0) { lockEntry(entry, false); return; }
      var tick = function () {
        if (stack.indexOf(entry) < 0 || entry.locked) return;
        var pct = Math.max(0, Math.min(1, (nowFn() - entry.start) / delay));
        entry.timerFill.setAttribute("width", (200 * pct).toFixed(1));
        if (pct >= 1) { lockEntry(entry, false); return; }
        entry.rafId = raf(tick);
      };
      entry.rafId = raf(tick);
    }

    function placeEntry(entry) {
      var r = entry.node.getBoundingClientRect ? entry.node.getBoundingClientRect() : { width: 280, height: 140 };
      var p = clampPosition(entry.anchorRect || { left: 24, top: 24, bottom: 44, right: 120 }, r.width || 280, r.height || 140, entry.depth);
      entry.coords = rules.place(entry.slotId, p.left, p.top, 40 + entry.depth);
    }

    function refill(entry, cfg, spec) {
      entry.key = cfg.key;
      entry.anchor = cfg.anchor || null;
      entry.anchorRect = cfg.anchorRect;
      describe(entry, entry.anchor);
      entry.titleEl.textContent = spec.title || "";
      entry.titleEl.hidden = !spec.title;
      entry.bodyHost.replaceChildren();
      renderSpecInto(entry.bodyHost, spec);
      placeEntry(entry);
    }

    function openEntry(cfg) {
      var depth = cfg.depth || 0;
      var cur = stack[depth];
      if (cur && cur.key === cfg.key) {
        cancelAncestorsLeave(depth);
        if (cur.swapTimer) { clearTimeout(cur.swapTimer); cur.swapTimer = 0; cur.pendingSwap = null; }
        if (cfg.pin) lockEntry(cur, true);
        return cur;
      }
      if (cur && cfg.group && cur.group === cfg.group && !cfg.pin) {
        if (!cur.locked) {
          var fresh = specOf(cfg);
          if (!fresh) return cur;
          closeFrom(depth + 1);
          cancelAncestorsLeave(depth);
          refill(cur, cfg, fresh);
          startTimer(cur);
          return cur;
        }
        if (cur.pinned || cur.hovered) return cur;
        cur.pendingSwap = cfg;
        if (!cur.swapTimer) {
          cur.swapTimer = setTimeout(function () {
            cur.swapTimer = 0;
            var next = cur.pendingSwap;
            cur.pendingSwap = null;
            if (!next || cur.hovered || cur.pinned || stack.indexOf(cur) < 0) return;
            closeFrom(depth);
            openEntry(next);
          }, swapGrace);
        }
        return cur;
      }
      for (var d = depth; d < stack.length; d++) {
        if (stack[d].pinned && !cfg.forceReplace) return stack[d];
      }
      var spec = specOf(cfg);
      if (!spec) return null;
      closeFrom(depth);
      cancelAncestorsLeave(depth);

      var slotId = "z2-tip-slot-" + engineId + "-" + depth;
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
      var titleEl = el("p", "z2-tip-title", spec.title || "");
      titleEl.hidden = !spec.title;
      var rightHead = el("div", "z2-pager-actions");
      var badge = el("span", "z2-tip-badge", "Rest to lock");
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
        group: cfg.group || "",
        lockDelay: cfg.lockDelay != null ? cfg.lockDelay : lockDelay,
        titleEl: titleEl,
        bodyHost: bodyHost,
        head: head,
        swapTimer: 0,
        pendingSwap: null,
        dragged: false,
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
        if (entry.swapTimer) { clearTimeout(entry.swapTimer); entry.swapTimer = 0; entry.pendingSwap = null; }
      });
      head.addEventListener("pointerdown", function (ev) {
        if (!entry.locked || ev.button !== 0 || (ev.target.closest && ev.target.closest(".z2-tip-close"))) return;
        ev.preventDefault();
        ev.stopPropagation();
        var sx = ev.clientX, sy = ev.clientY, ox = entry.coords.left, oy = entry.coords.top, frame = 0, lx = sx, ly = sy;
        if (head.setPointerCapture) head.setPointerCapture(ev.pointerId);
        tip.classList.add("z2-dragging");
        lockEntry(entry, true);
        var move = function (mv) {
          lx = mv.clientX; ly = mv.clientY;
          if (frame) return;
          frame = raf(function () {
            frame = 0;
            var r = tip.getBoundingClientRect();
            var vw = window.innerWidth, vh = window.innerHeight;
            var nx = Math.max(4 - r.width + 60, Math.min(vw - 60, ox + lx - sx));
            var ny = Math.max(4, Math.min(vh - 28, oy + ly - sy));
            entry.coords = rules.place(entry.slotId, nx, ny, 40 + entry.depth);
            entry.dragged = true;
          });
        };
        var up = function () {
          head.removeEventListener("pointermove", move);
          head.removeEventListener("pointerup", up);
          head.removeEventListener("pointercancel", up);
          tip.classList.remove("z2-dragging");
        };
        head.addEventListener("pointermove", move);
        head.addEventListener("pointerup", up);
        head.addEventListener("pointercancel", up);
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
      describe(entry, cfg.anchor);

      if (cfg.pin) lockEntry(entry, true);
      else startTimer(entry);
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
      if (!enabled && !pinImmediate) return null;
      var depth = depthForTrigger(trigger);
      if (depth > 0 && stack[depth - 1] && !stack[depth - 1].locked) return null;
      var spec = buildContentFromElement(trigger);
      if (!spec) return null;
      var rect = trigger.getBoundingClientRect ? anchorBox(trigger) : { left: 20, top: 20, bottom: 40, right: 100 };
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
      var pressTimer = 0;
      var isAction = function (t) {
        return Boolean(t && t.matches && t.matches("button, a[href], select, input, [role=button]") && !(t.classList && t.classList.contains("z2-term")));
      };
      document.addEventListener("pointerdown", function (e) {
        held = e.buttons || 1;
        lastPointer = e.pointerType || "mouse";
        clearTimeout(pressTimer);
        if (e.pointerType === "touch") {
          var pressed = findTrigger(e.target);
          if (pressed && isAction(pressed)) {
            pressTimer = setTimeout(function () {
              pressTimer = 0;
              closeFrom(depthForTrigger(pressed));
              triggerEnter(pressed, true);
            }, 500);
          }
        }
        if (e.target && e.target.closest && e.target.closest(".z2-tip")) return;
        for (var i = stack.length - 1; i >= 0; i--) {
          if (!stack[i].locked) closeFrom(i);
        }
        clearTimeout(intentTimer);
        pendingTarget = null;
      }, true);
      document.addEventListener("pointerup", function (e) { held = e.buttons || 0; clearTimeout(pressTimer); }, true);
      document.addEventListener("pointercancel", function () { held = 0; clearTimeout(pressTimer); }, true);
      document.addEventListener("contextmenu", function () { held = 0; }, true);

      document.addEventListener("pointerover", function (e) {
        if (!enabled || e.buttons || held) return;
        var trig = findTrigger(e.target);
        if (!trig) return;
        if (pendingTarget === trig) return;
        clearTimeout(intentTimer);
        pendingTarget = trig;
        intentTimer = setTimeout(function () {
          pendingTarget = null;
          if (held || !enabled) return;
          triggerEnter(trig, false);
        }, stack.length || nowFn() - lastClose < skipDelay ? Math.min(hoverIntent, 60) : hoverIntent);
      });

      document.addEventListener("pointerout", function (e) {
        if (e.pointerType === "touch") return;
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
        if (lastPointer === "touch") {
          var open = -1;
          for (var oi = 0; oi < stack.length; oi++) if (stack[oi].anchor === trig) open = oi;
          if (trig && isAction(trig)) {
            if (open < 0) closeFrom(depthForTrigger(trig));
          } else if (trig && open < 0) {
            closeFrom(depthForTrigger(trig));
            triggerEnter(trig, true);
          } else {
            closeFrom(open >= 0 ? open : 0);
          }
          return;
        }
        if (trig && trig.classList && trig.classList.contains("z2-term")) {
          e.preventDefault();
          triggerEnter(trig, true);
          return;
        }
        for (var ci = stack.length - 1; ci >= 0; ci--) {
          if (!stack[ci].pinned) closeFrom(ci);
        }
      });

      document.addEventListener("focusin", function (e) {
        if (!enabled || held || quiet || lastPointer === "touch") return;
        var trig = findTrigger(e.target);
        if (trig) triggerEnter(trig, false);
      });

      document.addEventListener("focusout", function (e) {
        var trig = findTrigger(e.target);
        if (!trig) return;
        for (var i = 0; i < stack.length; i++) {
          if (stack[i].anchor === trig) scheduleLeave(stack[i], stack[i].locked ? bridgeGrace : 120);
        }
      });

      document.addEventListener("keydown", function (e) {
        lastPointer = "keyboard";
        if (e.key === "Escape" && stack.length) {
          e.stopPropagation();
          closeFrom(stack.length - 1);
        }
      });

      if (typeof window !== "undefined" && window.addEventListener) {
        var reclamp = function () {
          stack.forEach(function (entry) {
            if (entry.dragged) return;
            if (entry.anchor && entry.anchor.getBoundingClientRect) {
              entry.anchorRect = anchorBox(entry.anchor);
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
        if ((!enabled || held) && !cfg.pin) return null;
        return openEntry({
          key: cfg.key,
          group: cfg.group || "",
          lockDelay: cfg.lockDelay,
          depth: cfg.depth || 0,
          anchor: cfg.anchor || null,
          anchorRect: cfg.anchorRect,
          spec: cfg.spec,
          build: cfg.build,
          pin: Boolean(cfg.pin),
          forceReplace: Boolean(cfg.forceReplace)
        });
      },
      enabled: function () { return enabled; },
      silent: function (fn) {
        quiet++;
        try { return fn(); } finally { quiet--; }
      },
      setEnabled: function (on) {
        enabled = Boolean(on);
        try { if (typeof localStorage !== "undefined") localStorage.setItem(storeKey, enabled ? "on" : "off"); } catch (_) {}
        if (!enabled) {
          for (var i = stack.length - 1; i >= 0; i--) if (!stack[i].pinned) closeFrom(i);
        }
        return enabled;
      },
      leaveKey: function (key) {
        for (var i = 0; i < stack.length; i++) {
          if (stack[i].key === key) scheduleLeave(stack[i], stack[i].locked ? bridgeGrace : 120);
        }
      },
      leaveGroup: function (group) {
        for (var i = 0; i < stack.length; i++) {
          if (stack[i].group === group) {
            if (stack[i].swapTimer) { clearTimeout(stack[i].swapTimer); stack[i].swapTimer = 0; stack[i].pendingSwap = null; }
            scheduleLeave(stack[i], stack[i].locked ? bridgeGrace : 120);
          }
        }
      },
      closeAll: function () { closeFrom(0); },
      _stack: stack,
      _triggerEnter: triggerEnter,
      _clampPosition: clampPosition
    };
  }

  function stickyInset() {
    var bars = Array.prototype.slice.call(arguments).filter(Boolean);
    var docEl = document.documentElement;
    function measure() {
      var h = bars.reduce(function (m, el) {
        var cs = getComputedStyle(el);
        if (cs.position !== "sticky" && cs.position !== "fixed") return m;
        var top = parseFloat(cs.top) || 0;
        return Math.max(m, top + el.getBoundingClientRect().height);
      }, 0);
      var v = Math.ceil(h) + "px";
      if (docEl.style.getPropertyValue("--z-sticky-h") !== v) docEl.style.setProperty("--z-sticky-h", v);
    }
    measure();
    if (typeof ResizeObserver === "function") {
      var ro = new ResizeObserver(measure);
      bars.forEach(function (el) { ro.observe(el); });
      return function () { ro.disconnect(); };
    }
    window.addEventListener("resize", measure);
    return function () { window.removeEventListener("resize", measure); };
  }

  root.z2 = Object.assign(root.z2 || {}, {
    stickyInset: stickyInset,
    tokens: tokens,
    onSchemeChange: onSchemeChange,
    relTime: relTime,
    meterSVG: meterSVG,
    waterfallSVG: waterfallSVG,
    copyChip: copyChip,
    logList: logList,
    uplotSync: uplotSync,
    flip: flip,
    holdGuards: holdGuards,
    compactLegend: compactLegend,
    tips: tips
  });
})(typeof window !== "undefined" ? window : globalThis);
