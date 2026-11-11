/* zanni2 · z2.js — behaviour for z2.css, no dependencies, DOM only (no innerHTML).
 *
 *   z2.state            deep-link state in the URL: get(key, fallback), set({key: value}) (replaceState, no reload),
 *                       on(fn) (back/forward); values are strings; an empty value removes the key
 *   z2.kpi(host, {label, value, note, cls, tip})   one tile of a .z2-kpis strip; value null -> "—" (no answer, never 0)
 *   z2.spark(values, {ref, cls})                   an <svg class="z2-spark">: null breaks the line (a gap stays a gap)
 *   z2.sortable(table, {key})                      click/Enter on a th[data-sort] sorts tbody rows (numbers by value,
 *                                                  "—"/"" last); the order lives in the URL under `key` ("col" or "-col")
 */
(function (root) {
  "use strict";
  var SVGNS = "http://www.w3.org/2000/svg";

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  var state = {
    get: function (key, fallback) {
      var v = new URLSearchParams(location.search).get(key);
      return v == null ? fallback : v;
    },
    set: function (obj) {
      var q = new URLSearchParams(location.search);
      Object.keys(obj).forEach(function (k) {
        var v = obj[k];
        if (v == null || v === "") q.delete(k); else q.set(k, String(v));
      });
      var s = q.toString();
      history.replaceState(history.state, "", location.pathname + (s ? "?" + s : "") + location.hash);
    },
    on: function (fn) { addEventListener("popstate", function () { fn(new URLSearchParams(location.search)); }); },
  };

  function kpi(host, t) {
    var d = el("div", "z2-kpi" + (t.cls ? " " + t.cls : ""));
    d.append(el("span", "z2-kl", t.label), el("span", "z2-kv", t.value == null ? "\u2014" : String(t.value)));
    if (t.note) d.append(el("span", "z2-kn", t.note));
    if (t.tip) d.title = t.tip;
    host.appendChild(d);
    return d;
  }

  function spark(vals, opt) {
    opt = opt || {};
    var W = 120, H = 32, P = 2;
    var svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("class", "z2-spark" + (opt.cls ? " " + opt.cls : ""));
    svg.setAttribute("aria-hidden", "true");
    if (!vals || !vals.length) return svg;
    var hi = opt.ref || 0;
    vals.forEach(function (v) { if (v != null && v > hi) hi = v; });
    if (hi <= 0) hi = 1;
    var x = function (i) { return P + (i * (W - 2 * P)) / Math.max(1, vals.length - 1); };
    var y = function (v) { return H - P - (v / hi) * (H - 2 * P); };
    var line = "", area = "", run = [];
    function flush() {
      if (!run.length) return;
      line += run.map(function (p, k) { return (k ? "L" : "M") + x(p[0]).toFixed(1) + "," + y(p[1]).toFixed(1); }).join("");
      area += "M" + x(run[0][0]).toFixed(1) + "," + (H - P) + run.map(function (p) { return "L" + x(p[0]).toFixed(1) + "," + y(p[1]).toFixed(1); }).join("") +
        "L" + x(run[run.length - 1][0]).toFixed(1) + "," + (H - P) + "Z";
      run = [];
    }
    vals.forEach(function (v, i) { if (v == null) flush(); else run.push([i, v]); });
    flush();
    function path(d, cls) {
      var p = document.createElementNS(SVGNS, "path");
      p.setAttribute("d", d); p.setAttribute("class", cls); p.setAttribute("vector-effect", "non-scaling-stroke");
      svg.appendChild(p);
    }
    if (area) path(area, "z2-area");
    if (opt.ref) path("M" + P + "," + y(opt.ref).toFixed(1) + "L" + (W - P) + "," + y(opt.ref).toFixed(1), "z2-ref");
    if (line) path(line, "z2-line");
    return svg;
  }

  // the sort key of a cell: data-v if present, else a number when the text is one, else the text; blank/"—" sorts last
  function cellKey(td) {
    if (!td) return null;
    var raw = td.dataset && td.dataset.v != null ? td.dataset.v : td.textContent.trim();
    if (raw === "" || raw === "\u2014" || raw === "-") return null;
    var n = Number(String(raw).replace(/[,\s]/g, ""));
    return isNaN(n) ? String(raw).toLowerCase() : n;
  }
  function compare(a, b, dir) {
    if (a === b) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    if (typeof a !== typeof b) return (typeof a === "number" ? -1 : 1) * dir;
    return (a < b ? -1 : 1) * dir;
  }

  function sortable(table, opt) {
    opt = opt || {};
    var key = opt.key || "sort";
    var heads = Array.prototype.slice.call(table.querySelectorAll("thead th[data-sort]"));
    function apply(spec) {
      var desc = spec.charAt(0) === "-", name = desc ? spec.slice(1) : spec;
      var th = heads.filter(function (h) { return h.dataset.sort === name; })[0];
      heads.forEach(function (h) { h.setAttribute("aria-sort", h === th ? (desc ? "descending" : "ascending") : "none"); });
      if (!th) return;
      var col = Array.prototype.indexOf.call(th.parentElement.children, th);
      var body = table.tBodies[0];
      var rows = Array.prototype.slice.call(body.rows);
      rows.sort(function (r1, r2) { return compare(cellKey(r1.cells[col]), cellKey(r2.cells[col]), desc ? -1 : 1); });
      rows.forEach(function (r) { body.appendChild(r); });
    }
    heads.forEach(function (h) {
      h.tabIndex = 0;
      h.setAttribute("aria-sort", "none");
      var go = function () {
        var cur = state.get(key, "");
        var next = cur === h.dataset.sort ? "-" + h.dataset.sort : h.dataset.sort;
        state.set((function () { var o = {}; o[key] = next; return o; })());
        apply(next);
      };
      h.addEventListener("click", go);
      h.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    });
    var initial = state.get(key, opt.initial || "");
    if (initial) apply(initial);
    state.on(function (q) { apply(q.get(key) || opt.initial || ""); });
    return { apply: apply };
  }

  root.z2 = { state: state, kpi: kpi, spark: spark, sortable: sortable, _cellKey: cellKey, _compare: compare };
})(typeof window !== "undefined" ? window : globalThis);
