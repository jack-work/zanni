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
    if (existing && existing.sig === sig && Math.abs(existing.width - width) < 4) {
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
    var conf = {
      width: width,
      height: height,
      cursor: { drag: { x: false, y: false } },
      scales: Object.assign({ x: { time: !opts.categorical } }, opts.scales || {}),
      axes: axes,
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
    var rec = { plot: u, sig: sig, width: width, bucket: opts.bucket || 0 };
    cache[id] = rec;
    if (!opts.categorical && opts.onPointClick) {
      u.over.addEventListener("click", function () {
        var idx = u.cursor.idx;
        if (idx == null || !u.data[0] || u.data[0][idx] == null) return;
        opts.onPointClick(u.data[0][idx] * 1000, rec.bucket);
      });
    }
    return u;
  }

  root.z2 = Object.assign(root.z2 || {}, {
    tokens: tokens,
    onSchemeChange: onSchemeChange,
    relTime: relTime,
    meterSVG: meterSVG,
    waterfallSVG: waterfallSVG,
    copyChip: copyChip,
    logList: logList,
    uplotSync: uplotSync
  });
})(typeof window !== "undefined" ? window : globalThis);
