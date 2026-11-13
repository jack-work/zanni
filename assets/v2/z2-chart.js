/* zanni2 · z2-chart.js — z2.chart: an interactive stacked-bar chart over EVENTS (one row per thing that happened: a
 * merged PR, a deploy, a page), aggregated in the browser so the reader picks how to count and how to slice.
 * Needs z2.js (z2.state). No dependencies, DOM only (no innerHTML). Styles: z2.css (.z2-chart*).
 *
 *   z2.chart(host, {
 *     id,                      URL-state prefix (?<id>.u=files&<id>.i=6h ...); defaults are never written
 *     rows,                    [{t: ms, ...}] one per event; every other field is read through the accessors below
 *     now,                     ms: the right edge (the data's fetch time; default Date.now())
 *     units:     [{key, label, of(row) -> number, fmt?(n) -> string}]       the unit toggle; first = default unless unit
 *     intervals: [{key, label, ms}]                                         bin widths; "w" aligns to Monday, "d" to
 *                                                                           local midnight, smaller to the local hour
 *     ranges:    [{key, label, ms}]                                         how far back from now
 *     splits:    [{key, label, of(row) -> series key}]                      what one colour is
 *     modes:     default [per interval, running total]
 *     unit, interval, range, split, mode: default keys
 *     color(seriesKey, i) -> CSS colour (default var(--z-series-<i+1>)), order(keys) -> keys (stack order, bottom first)
 *     rowLabel(row) -> string, rowHref(row) -> url        the events listed in the tooltip of a bin (up to 8)
 *     ref(unitKey, intervalMs) -> number | null           a dashed per-bin reference line (a target), labelled "target"
 *     title, empty: "words when the window holds nothing", emptyClass: extra placard class
 *   }) -> { render(), set({unit, interval, range, split, mode}), destroy() }
 *
 * Interaction: the toggles are radiogroups (arrow keys move, Enter/Space pick); a toggle that cannot apply to the current
 * range (fewer than 2 bins, or more than 400) is disabled. Legend buttons hide/show a series; with any hidden, "all"
 * brings them back. The plot is one focusable control: hover or Left/Right/Home/End reads a bin into the tip
 * (aria-live), click or Enter pins it (its event links become clickable), Escape or a second click unpins. Width
 * follows the container (ResizeObserver); height is the width over phi squared, clamped.
 */
(function (root) {
  "use strict";
  var SVGNS = "http://www.w3.org/2000/svg";
  var PHI = (1 + Math.sqrt(5)) / 2;
  var HOUR = 3600000, DAY = 24 * HOUR;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function sv(tag, attrs) {
    var e = document.createElementNS(SVGNS, tag);
    for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    return e;
  }

  // ---- pure parts (exported for the test) ----

  /** the start of t's bin: local hour (or k-hour block), local midnight, or Monday midnight */
  function align(t, ms) {
    var d = new Date(t);
    if (ms >= 7 * DAY) {
      d.setHours(0, 0, 0, 0);
      var back = (d.getDay() + 6) % 7; // Monday = 0
      d.setDate(d.getDate() - back);
      return d.getTime();
    }
    if (ms >= DAY) { d.setHours(0, 0, 0, 0); return d.getTime(); }
    var k = Math.max(1, Math.round(ms / HOUR));
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() - (d.getHours() % k));
    return d.getTime();
  }

  /** the next bin start after t0 (calendar steps, so a DST day is still one day) */
  function step(t0, ms) {
    var d = new Date(t0);
    if (ms >= 7 * DAY) d.setDate(d.getDate() + 7);
    else if (ms >= DAY) d.setDate(d.getDate() + 1);
    else d.setHours(d.getHours() + Math.max(1, Math.round(ms / HOUR)));
    return d.getTime();
  }

  /** how many bins a range holds at an interval (what disables a toggle) */
  function binCount(rangeMs, intervalMs, now) {
    var n = 0, t = align(now - rangeMs, intervalMs);
    while (t <= now && n < 10000) { t = step(t, intervalMs); n++; }
    return n;
  }

  /**
   * rows -> bins over [now - range, now]. o: {now, rangeMs, intervalMs, value(row), series(row), hidden: Set, cumulative}
   * -> {bins: [{t0, t1, partial, total, by: {key: v}, rows}], keys (every series seen, by total desc), total, max}
   * A row outside the window is dropped; a row whose value is not a finite number counts 0 (never NaN).
   */
  function bin(rows, o) {
    var lo = o.now - o.rangeMs, bins = [], t = align(lo, o.intervalMs);
    while (t <= o.now && bins.length < 10000) {
      var t1 = step(t, o.intervalMs);
      bins.push({ t0: t, t1: t1, partial: t1 > o.now, total: 0, by: {}, rows: [] });
      t = t1;
    }
    var seen = {}, hidden = o.hidden || { has: function () { return false; } };
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!(r.t >= lo && r.t <= o.now)) continue;
      var k = String(o.series(r));
      var v = +o.value(r);
      if (!isFinite(v)) v = 0;
      seen[k] = (seen[k] || 0) + v;
      // the bin: binary search on t0
      var a = 0, b = bins.length - 1;
      while (a < b) { var m = (a + b + 1) >> 1; if (bins[m].t0 <= r.t) a = m; else b = m - 1; }
      var B = bins[a];
      if (!B || r.t < B.t0) continue;
      if (hidden.has(k)) continue;
      B.rows.push(r);
      B.by[k] = (B.by[k] || 0) + v;
      B.total += v;
    }
    var keys = Object.keys(seen).sort(function (x, y) { return seen[y] - seen[x] || (x < y ? -1 : 1); });
    if (o.cumulative) {
      var run = {}, tot = 0;
      bins.forEach(function (B) {
        for (var k2 in B.by) run[k2] = (run[k2] || 0) + B.by[k2];
        tot += B.total;
        B.by = Object.assign({}, run);
        B.total = tot;
      });
    }
    var total = 0, max = 0;
    bins.forEach(function (B) { if (B.total > max) max = B.total; });
    total = o.cumulative ? (bins.length ? bins[bins.length - 1].total : 0) : bins.reduce(function (s, B) { return s + B.total; }, 0);
    return { bins: bins, keys: keys, total: total, max: max };
  }

  /** about n round ticks from 0 to >= max: [0, step, 2 step, ...] (1, 2, 2.5, 5 x 10^k) */
  function ticks(max, n) {
    if (!(max > 0)) return [0, 1];
    var raw = max / Math.max(1, n || 4), p = Math.pow(10, Math.floor(Math.log10(raw))), s = p;
    [1, 2, 2.5, 5, 10].some(function (m) { s = m * p; return s >= raw; });
    if (s < 1 && max >= 1) s = 1;
    var out = [];
    for (var v = 0; v < max + s * 0.999; v += s) out.push(+v.toFixed(10));
    if (out.length < 2) out.push(s);
    return out;
  }

  /** 1234 -> "1.2k", 0.5 -> "0.5", 12 -> "12" */
  function fmt(n) {
    if (n == null || !isFinite(n)) return "\u2014";
    var a = Math.abs(n);
    if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
    if (a >= 1e3) return (n / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, "") + "k";
    if (a > 0 && a < 10 && n % 1) return n.toFixed(1);
    return String(Math.round(n));
  }

  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function day(t) { var d = new Date(t); return MON[d.getMonth()] + " " + d.getDate(); }
  function hh(t) { var d = new Date(t); return (d.getHours() < 10 ? "0" : "") + d.getHours() + ":00"; }
  /** the axis label of a bin and the longer one for the tip */
  function label(B, ms, long) {
    if (ms >= 7 * DAY) return (long ? "week of " : "wk ") + day(B.t0);
    if (ms >= DAY) return day(B.t0);
    var midnight = new Date(B.t0).getHours() === 0;
    if (long) return day(B.t0) + " " + hh(B.t0) + "\u2013" + hh(B.t1);
    return midnight ? day(B.t0) : hh(B.t0);
  }

  // ---- the widget ----

  var DEFAULT_MODES = [{ key: "bin", label: "per interval" }, { key: "run", label: "running total" }];

  function chart(host, opt) {
    var S = root.z2 && root.z2.state;
    var id = opt.id || "chart";
    var units = opt.units || [{ key: "n", label: "count", of: function () { return 1; } }];
    var intervals = opt.intervals || [{ key: "d", label: "day", ms: DAY }];
    var ranges = opt.ranges || [{ key: "all", label: "all", ms: 14 * DAY }];
    var splits = opt.splits || [{ key: "all", label: "all", of: function () { return "all"; } }];
    var modes = opt.modes || DEFAULT_MODES;
    var now = opt.now || Date.now();
    var rows = (opt.rows || []).filter(function (r) { return r && isFinite(r.t); });
    var pick = function (list, key) { return list.filter(function (x) { return x.key === key; })[0] || list[0]; };
    var defs = { u: (opt.unit || units[0].key), i: (opt.interval || intervals[0].key), r: (opt.range || ranges[ranges.length - 1].key),
      s: (opt.split || splits[0].key), m: (opt.mode || modes[0].key) };
    var st = {};
    function load() {
      for (var k in defs) st[k] = S ? S.get(id + "." + k, defs[k]) : defs[k];
      var h = S ? S.get(id + ".h", "") : "";
      st.h = new Set(h ? h.split(",") : []);
    }
    function save() {
      if (!S) return;
      var o = {};
      for (var k in defs) o[id + "." + k] = st[k] === defs[k] ? "" : st[k];
      o[id + ".h"] = Array.from(st.h).join(",");
      S.set(o);
    }
    load();

    var wrap = el("div", "z2-chart");
    wrap.setAttribute("data-z2-chart", id);
    var bar = el("div", "z2-chart-ctl");
    var legend = el("div", "z2-legend");
    legend.setAttribute("aria-label", "series");
    var sum = el("p", "z2-chart-sum");
    var plot = el("div", "z2-chart-plot");
    plot.tabIndex = 0;
    plot.setAttribute("role", "group");
    var tip = el("div", "z2-chart-tip");
    tip.setAttribute("role", "status");
    tip.setAttribute("aria-live", "polite");
    tip.hidden = true;
    var empty = el("p", "z2-empty" + (opt.emptyClass ? " " + opt.emptyClass : ""), opt.empty || "Nothing in this window.");
    empty.hidden = true;
    if (opt.title) wrap.append(el("p", "z2-chart-title", opt.title));
    wrap.append(bar, sum, legend, plot, empty);
    plot.append(tip);
    host.replaceChildren(wrap);

    // a segmented radiogroup; disabled(key) greys an option out
    var groups = [];
    function seg(name, key, list, disabled) {
      if (list.length < 2) return;
      var g = el("div", "z2-ctl");
      var lab = el("span", "z2-ctl-l", name);
      var box = el("div", "z2-seg");
      box.setAttribute("role", "radiogroup");
      box.setAttribute("aria-label", name);
      var btns = list.map(function (x) {
        var b = el("button", "z2-seg-b", x.label);
        b.type = "button";
        b.setAttribute("role", "radio");
        b.dataset.key = x.key;
        b.addEventListener("click", function () { if (!b.disabled) { st[key] = x.key; fix(); save(); render(); } });
        box.append(b);
        return b;
      });
      box.addEventListener("keydown", function (e) {
        var dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
        if (!dir) return;
        e.preventDefault();
        var on = btns.filter(function (b) { return !b.disabled; });
        var i = on.indexOf(document.activeElement);
        var n = on[(i + dir + on.length) % on.length];
        if (n) { n.focus(); n.click(); }
      });
      g.append(lab, box);
      bar.append(g);
      groups.push({ key: key, btns: btns, disabled: disabled || function () { return false; } });
    }
    var rangeMs = function () { return pick(ranges, st.r).ms; };
    var badInterval = function (k) { var n = binCount(rangeMs(), pick(intervals, k).ms, now); return n < 2 || n > 400; };
    seg("count", "u", units);
    seg("interval", "i", intervals, badInterval);
    seg("range", "r", ranges);
    seg("colour by", "s", splits);
    seg("show", "m", modes);

    // the interval must suit the range: else the finest allowed one that is not finer than asked, else any allowed
    function fix() {
      ["u", "r", "s", "m"].forEach(function (k) {
        var list = { u: units, r: ranges, s: splits, m: modes }[k];
        if (!list.some(function (x) { return x.key === st[k]; })) st[k] = defs[k];
      });
      if (!intervals.some(function (x) { return x.key === st.i; }) || badInterval(st.i)) {
        var want = (pick(intervals, st.i) || intervals[0]).ms;
        var ok = intervals.filter(function (x) { return !badInterval(x.key); });
        var coarser = ok.filter(function (x) { return x.ms >= want; });
        st.i = (coarser[0] || ok[ok.length - 1] || intervals[0]).key;
      }
    }
    fix();

    var data = null, active = -1, pinned = false, lastW = 0;
    var geo = null;

    function colorOf(k, i) {
      return opt.color ? opt.color(k, i) : "var(--z-series-" + ((i % 8) + 1) + ")";
    }

    function render() {
      groups.forEach(function (g) {
        g.btns.forEach(function (b) {
          var dis = g.disabled(b.dataset.key);
          b.disabled = dis;
          b.setAttribute("aria-checked", String(b.dataset.key === st[g.key]));
          b.tabIndex = b.dataset.key === st[g.key] ? 0 : -1;
        });
      });
      var U = pick(units, st.u), I = pick(intervals, st.i), R = pick(ranges, st.r), SP = pick(splits, st.s);
      data = bin(rows, { now: now, rangeMs: R.ms, intervalMs: I.ms, value: U.of, series: SP.of, hidden: st.h, cumulative: st.m === "run" });
      var keys = opt.order ? opt.order(data.keys.slice()) : data.keys;
      data.keys = keys;
      var f = U.fmt || fmt;
      // legend
      legend.replaceChildren();
      keys.forEach(function (k, i) {
        var b = el("button", "z2-legend-b");
        b.type = "button";
        b.setAttribute("aria-pressed", String(!st.h.has(k)));
        var sw = el("span", "z2-sw");
        sw.style.background = colorOf(k, i);
        b.append(sw, document.createTextNode(k));
        b.addEventListener("click", function () {
          if (st.h.has(k)) st.h.delete(k); else st.h.add(k);
          if (st.h.size >= keys.length) st.h.clear(); // hiding the last one shows all again: never an empty chart by accident
          save(); render();
        });
        legend.append(b);
      });
      if (st.h.size) {
        var all = el("button", "z2-legend-b z2-legend-all", "all");
        all.type = "button";
        all.addEventListener("click", function () { st.h.clear(); save(); render(); });
        legend.append(all);
      }
      legend.hidden = keys.length < 2 && !st.h.size;
      // summary: the total, the average per interval, the peak
      var nb = data.bins.length, run = st.m === "run";
      var peak = null;
      if (!run) data.bins.forEach(function (B) { if (B.total > 0 && (!peak || B.total > peak.total)) peak = B; });
      sum.replaceChildren(el("b", null, f(data.total) + " " + U.label), " in the last " + R.label);
      if (!run && nb) sum.append(" \u00b7 " + f(data.total / nb) + " a " + I.label + " on average");
      if (peak) sum.append(" \u00b7 peak " + f(peak.total) + " (" + label(peak, I.ms, true) + ")");
      var refV = opt.ref && !run ? opt.ref(U.key, I.ms) : null;
      if (refV != null && isFinite(refV)) sum.append(" \u00b7 target " + f(refV) + " a " + I.label);
      draw(U, I, f, refV);
    }

    function draw(U, I, f, refV) {
      var W = Math.max(280, Math.floor(plot.getBoundingClientRect().width || host.getBoundingClientRect().width || 640));
      lastW = W;
      var H = Math.round(Math.max(220, Math.min(420, W / (PHI * PHI))));
      var none = !(data.total > 0) && !data.bins.some(function (B) { return B.total > 0; });
      empty.hidden = !none;
      Array.prototype.slice.call(plot.querySelectorAll("svg")).forEach(function (s) { s.remove(); });
      var max = Math.max(data.max, refV != null && isFinite(refV) ? refV : 0);
      var tk = ticks(max, Math.max(2, Math.round(H / 70)));
      var top = tk[tk.length - 1] || 1;
      var yl = tk.reduce(function (m, v) { return Math.max(m, f(v).length); }, 1);
      var L = 14 + yl * 7.5, Rp = 10, T = 12, B = 30;
      var pw = W - L - Rp, ph = H - T - B;
      var n = data.bins.length, slot = pw / Math.max(1, n), bw = Math.max(1, slot / PHI);
      var y = function (v) { return T + ph - (v / top) * ph; };
      var svg = sv("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H, class: "z2-chart-svg", role: "img",
        "aria-label": (opt.title || "chart") + ": " + f(data.total) + " " + U.label + " in " + n + " bins of one " + I.label });
      // grid + y labels
      var grid = sv("g", { class: "z2-grid", "aria-label": "grid" });
      tk.forEach(function (v) {
        var yy = Math.round(y(v)) + 0.5;
        grid.append(sv("line", { x1: L, x2: W - Rp, y1: yy, y2: yy }));
        var t = sv("text", { x: L - 6, y: yy + 4, "text-anchor": "end", class: "z2-ax" });
        t.textContent = f(v);
        grid.append(t);
      });
      svg.append(grid);
      // bars
      var marks = sv("g", { class: "z2-bars" });
      geo = [];
      data.bins.forEach(function (Bn, i) {
        var x = L + i * slot + (slot - bw) / 2, acc = 0;
        data.keys.forEach(function (k, ki) {
          var v = Bn.by[k] || 0;
          if (!(v > 0)) return;
          var y0 = y(acc), y1 = y(acc + v);
          var r = sv("rect", { x: x.toFixed(2), y: y1.toFixed(2), width: bw.toFixed(2), height: Math.max(0.5, y0 - y1).toFixed(2),
            class: "z2-bar" + (Bn.partial ? " z2-partial" : "") });
          r.style.fill = colorOf(k, ki);
          marks.append(r);
          acc += v;
        });
        geo.push({ x0: L + i * slot, x1: L + (i + 1) * slot, cx: x + bw / 2 });
      });
      svg.append(marks);
      // reference (target) line
      if (refV != null && isFinite(refV) && refV > 0) {
        var ry = Math.round(y(refV)) + 0.5;
        var ref = sv("g", { class: "z2-refl", "aria-label": "rule: target" });
        ref.append(sv("line", { x1: L, x2: W - Rp, y1: ry, y2: ry }));
        var rt = sv("text", { x: W - Rp - 2, y: ry - 5, "text-anchor": "end", class: "z2-ax z2-ref-t" });
        rt.textContent = "target " + f(refV);
        ref.append(rt);
        svg.append(ref);
      }
      // x labels: every k-th bin so no two touch (about 7 px a character + a gap)
      var xa = sv("g", { class: "z2-xaxis", "aria-label": "axis" });
      var longest = data.bins.reduce(function (m, Bn) { return Math.max(m, label(Bn, I.ms).length); }, 4);
      var every = Math.max(1, Math.ceil((longest * 7.2 + 14) / slot));
      var lastRight = -Infinity;
      data.bins.forEach(function (Bn, i) {
        if (i % every) return;
        var cx = L + i * slot + slot / 2, s = label(Bn, I.ms), half = s.length * 3.6;
        if (cx - half < lastRight + 8 || cx + half > W) return;
        var t = sv("text", { x: cx.toFixed(1), y: H - 10, "text-anchor": "middle", class: "z2-ax" });
        t.textContent = s;
        xa.append(t);
        lastRight = cx + half;
      });
      xa.append(sv("line", { x1: L, x2: W - Rp, y1: T + ph + 0.5, y2: T + ph + 0.5, class: "z2-base" }));
      svg.append(xa);
      // the active bin's cursor band
      var cur = sv("rect", { class: "z2-cursor", y: T, height: ph, x: 0, width: 0, "aria-label": "frame" });
      cur.setAttribute("fill", "transparent");
      svg.insertBefore(cur, marks);
      plot.insertBefore(svg, tip);
      plot.setAttribute("aria-label", (opt.title || "chart") + ". Left and Right read one " + I.label + " at a time; Enter pins it.");
      geo.cur = cur;
      if (active >= n) active = n - 1;
      if (active >= 0) show(active, pinned); else hideTip();
    }

    function hideTip() { tip.hidden = true; if (geo && geo.cur) geo.cur.setAttribute("width", 0); }

    function show(i, pin) {
      if (!data || !geo || i < 0 || i >= data.bins.length) return;
      active = i;
      pinned = !!pin;
      var Bn = data.bins[i], U = pick(units, st.u), I = pick(intervals, st.i), f = U.fmt || fmt;
      var g = geo[i];
      geo.cur.setAttribute("x", g.x0.toFixed(1));
      geo.cur.setAttribute("width", Math.max(1, g.x1 - g.x0).toFixed(1));
      geo.cur.style.fill = "var(--z-tint)";
      tip.replaceChildren();
      tip.classList.toggle("z2-pinned", pinned);
      var head = el("p", "z2-tip-h");
      head.append(el("b", null, label(Bn, I.ms, true)), (Bn.partial ? " (so far)" : ""));
      tip.append(head, el("p", "z2-tip-v", f(Bn.total) + " " + U.label + (st.m === "run" ? " running total" : "")));
      var ul = el("ul", "z2-tip-l");
      data.keys.forEach(function (k, ki) {
        var v = Bn.by[k];
        if (!(v > 0)) return;
        var li = el("li");
        var sw = el("span", "z2-sw");
        sw.style.background = colorOf(k, ki);
        li.append(sw, k + " ", el("b", null, f(v)));
        ul.append(li);
      });
      if (ul.childNodes.length > 1) tip.append(ul);
      if (opt.rowLabel && st.m !== "run" && Bn.rows.length) {
        var ev = el("p", "z2-tip-e");
        var shown = Bn.rows.slice().sort(function (a, b) { return +U.of(b) - +U.of(a); }).slice(0, 8);
        shown.forEach(function (r, j) {
          if (j) ev.append(" ");
          var txt = opt.rowLabel(r) + (U.key !== "prs" && U.key !== "n" ? " (" + f(+U.of(r) || 0) + ")" : "");
          var href = opt.rowHref && opt.rowHref(r);
          var a = href ? el("a", null, txt) : el("span", null, txt);
          if (href) { a.href = href; a.target = "_blank"; a.rel = "noopener"; a.tabIndex = pinned ? 0 : -1; }
          ev.append(a);
        });
        if (Bn.rows.length > 8) ev.append(" +" + (Bn.rows.length - 8) + " more");
        tip.append(ev);
      }
      if (!pinned) tip.append(el("p", "z2-tip-k", "click or Enter to pin"));
      tip.hidden = false;
      // place: beside the bin, kept inside the plot
      var pr = plot.getBoundingClientRect(), tw = tip.offsetWidth || 220;
      var left = g.cx + 14;
      if (left + tw > pr.width - 4) left = Math.max(4, g.x0 - tw - 10);
      tip.style.left = Math.round(left) + "px";
    }

    function binAt(clientX) {
      if (!geo || !geo.length) return -1;
      var x = clientX - plot.getBoundingClientRect().left;
      for (var i = 0; i < geo.length; i++) if (x >= geo[i].x0 && x < geo[i].x1) return i;
      return x < geo[0].x0 ? 0 : geo.length - 1;
    }
    plot.addEventListener("pointermove", function (e) { if (!pinned && !(e.target.closest && e.target.closest(".z2-chart-tip"))) show(binAt(e.clientX), false); });
    plot.addEventListener("pointerleave", function () { if (!pinned) { active = -1; hideTip(); } });
    plot.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest(".z2-chart-tip a")) return;
      var i = binAt(e.clientX);
      if (pinned && i === active) { pinned = false; show(i, false); return; }
      show(i, true);
    });
    plot.addEventListener("keydown", function (e) {
      var n = data ? data.bins.length : 0;
      if (!n) return;
      var i = active < 0 ? n - 1 : active;
      if (e.key === "ArrowLeft") i = Math.max(0, i - 1);
      else if (e.key === "ArrowRight") i = Math.min(n - 1, i + 1);
      else if (e.key === "Home") i = 0;
      else if (e.key === "End") i = n - 1;
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); show(i, !pinned); return; }
      else if (e.key === "Escape") { pinned = false; active = -1; hideTip(); return; }
      else return;
      e.preventDefault();
      show(i, pinned);
    });
    plot.addEventListener("focus", function () { if (active < 0 && data && data.bins.length) show(data.bins.length - 1, false); });
    plot.addEventListener("blur", function (e) { if (!pinned && !(e.relatedTarget && plot.contains(e.relatedTarget))) { active = -1; hideTip(); } });

    var ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(function () {
      var w = Math.floor(plot.getBoundingClientRect().width);
      if (w && Math.abs(w - lastW) > 2) render();
    }) : null;
    if (ro) ro.observe(plot);
    var onPop = function () { load(); fix(); render(); };
    if (S) S.on(onPop);

    render();
    return {
      render: render,
      set: function (o) { var m = { unit: "u", interval: "i", range: "r", split: "s", mode: "m" }; for (var k in o) if (m[k]) st[m[k]] = o[k]; fix(); save(); render(); },
      destroy: function () { if (ro) ro.disconnect(); host.replaceChildren(); },
      _state: st,
    };
  }

  var z2 = root.z2 || (root.z2 = {});
  z2.chart = chart;
  z2._chart = { align: align, step: step, bin: bin, ticks: ticks, fmt: fmt, binCount: binCount, label: label, PHI: PHI };
})(typeof window !== "undefined" ? window : globalThis);
