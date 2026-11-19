(function (root) {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";
  var WINDOW_NAMES = { five_hour: "5 h", seven_day: "7 d", seven_day_opus: "7 d Opus", seven_day_sonnet: "7 d Sonnet", overage: "overage", daily: "1 d" };
  var STATUS_WORDS = { allowed_warning: "warning", rejected: "limit reached" };
  var OBSERVED_STALE_MS = 5 * 60000;
  var HOT_PERCENT = 90;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function setText(n, v) {
    v = v == null ? "" : String(v);
    if (n.textContent !== v) n.textContent = v;
  }

  function setData(n, k, v) {
    if (v == null || v === "") { if (k in n.dataset) delete n.dataset[k]; }
    else if (n.dataset[k] !== String(v)) n.dataset[k] = String(v);
  }

  function minutesName(min) {
    if (min % 1440 === 0) return min / 1440 + " d";
    if (min % 60 === 0) return min / 60 + " h";
    return min + " min";
  }

  function windowName(w) {
    if (!w) return "window";
    if (WINDOW_NAMES[w]) return WINDOW_NAMES[w];
    var m = /^[a-z]+_(\d+)m$/.exec(w);
    if (m) return minutesName(Number(m[1]));
    m = /^(\d+)([hd])$/.exec(w);
    if (m) return m[1] + " " + m[2];
    m = /^(\d+)([hd])_(.+)$/.exec(w);
    if (m) return m[1] + " " + m[2] + " \u201c" + m[3] + "\u201d";
    return w.replace(/_/g, " ");
  }

  function span(ms) {
    ms = Math.abs(ms);
    if (ms < 90000) return Math.round(ms / 1000) + " s";
    if (ms < 90 * 60000) return Math.round(ms / 60000) + " min";
    if (ms < 36 * 3600000) return Math.round(ms / 3600000) + " h";
    return Math.round(ms / 86400000) + " d";
  }

  function ageTier(ms) {
    return ms < 3600000 ? "1" : ms < 86400000 ? "2" : "3";
  }

  function fmtInt(n) {
    return Number.isFinite(n) ? Math.round(n).toLocaleString("en-US") : "";
  }

  function fmtCompact(n) {
    if (!Number.isFinite(n)) return "";
    var a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toFixed(2) + "B";
    if (a >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (a >= 1e4) return (n / 1e3).toFixed(0) + "K";
    if (a >= 1e3) return (n / 1e3).toFixed(1) + "K";
    return String(Math.round(n));
  }

  function fmtUSD(n) {
    if (!Number.isFinite(n)) return "";
    if (n > 0 && n < 0.01) return "<$0.01";
    return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function tokensOf(a) {
    return (a.input_tokens || 0) + (a.output_tokens || 0) + (a.cache_read_tokens || 0) + (a.cache_write_tokens || 0);
  }

  function meter(cls) {
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "z2-usage-meter" + (cls ? " " + cls : ""));
    svg.setAttribute("viewBox", "0 0 100 8");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("role", "img");
    var bg = document.createElementNS(SVG_NS, "rect");
    bg.setAttribute("class", "z2-usage-meter-bg");
    bg.setAttribute("width", "100");
    bg.setAttribute("height", "8");
    var fill = document.createElementNS(SVG_NS, "rect");
    fill.setAttribute("class", "z2-usage-meter-fill");
    fill.setAttribute("height", "8");
    fill.setAttribute("width", "0");
    svg.appendChild(bg);
    svg.appendChild(fill);
    svg._fill = fill;
    return svg;
  }

  function off(n, yes) {
    if (yes) n.setAttribute("data-off", ""); else n.removeAttribute("data-off");
  }

  function setMeter(svg, pct, label) {
    var w = String(pct > 0 ? Math.max(1, Math.min(100, pct)) : 0);
    if (svg._fill.getAttribute("width") !== w) svg._fill.setAttribute("width", w);
    if (svg.getAttribute("aria-label") !== label) svg.setAttribute("aria-label", label);
  }

  function sync(parent, items, make, fill) {
    var have = {};
    Array.prototype.forEach.call(parent.children, function (n) { if (n.dataset.key != null) have[n.dataset.key] = n; });
    var want = items.map(function (it) {
      var n = have[it.key];
      if (!n || n.dataset.kind !== it.kind) {
        n = make(it);
        n.dataset.key = it.key;
        n.dataset.kind = it.kind;
      } else {
        delete have[it.key];
      }
      fill(n, it);
      return n;
    });
    Object.keys(have).forEach(function (k) { parent.removeChild(have[k]); });
    want.forEach(function (n, i) { if (parent.children[i] !== n) parent.insertBefore(n, parent.children[i] || null); });
  }

  function usageBand(host, opts) {
    opts = opts || {};
    var now = opts.now || Date.now;
    var planLabel = opts.planLabel || function (pv, pl) { return pl.label || pl.plan; };
    var data = null;
    var clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZone: opts.timeZone });
    var day = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: opts.timeZone });
    var dayKey = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: opts.timeZone });

    function localTime(ms) {
      var p = {};
      day.formatToParts(ms).forEach(function (x) { p[x.type] = x.value; });
      var hm = p.hour + ":" + p.minute;
      return dayKey.format(ms) === dayKey.format(now()) ? hm : p.weekday + " " + p.day + " " + hm;
    }

    var band = el("section", "z2-usage");
    band.dataset.state = "loading";
    band.setAttribute("aria-busy", "true");
    band.setAttribute("aria-label", opts.title || "Plans and usage");
    var head = el("header", "z2-usage-head");
    head.appendChild(el("h2", null, opts.title || "Plans and usage"));
    var stamp = el("p", "z2-usage-stamp");
    head.appendChild(stamp);
    var note = el("p", "z2-usage-note");
    off(note, true);
    var body = el("div", "z2-usage-body");
    var skel = el("div", "z2-usage-skel");
    skel.setAttribute("aria-hidden", "true");
    for (var i = 0; i < 4; i++) skel.appendChild(el("span"));
    band.appendChild(head);
    band.appendChild(note);
    band.appendChild(skel);
    band.appendChild(body);
    host.replaceChildren(band);

    function row(cls) {
      var n = el("div", cls);
      n.tabIndex = 0;
      n.setAttribute("role", "button");
      return n;
    }

    function numCell(n, key, unit, lead) {
      var c = el("span", "z2-usage-num");
      c.dataset.col = key;
      var u = el("span", "z2-usage-unit", unit);
      var v = el("span", "z2-usage-val");
      if (lead) { c.dataset.lead = ""; c.appendChild(u); c.appendChild(v); } else { c.appendChild(v); c.appendChild(u); }
      n.appendChild(c);
      return { cell: c, val: v, unit: u };
    }

    function numbers(n) {
      return {
        req: numCell(n, "req", "req"),
        tok: numCell(n, "tok", "tok"),
        cache: numCell(n, "cache", "cache", true),
        cost: numCell(n, "cost", "list", true),
        last: numCell(n, "last", "last", true)
      };
    }

    function fillNumbers(s, a) {
      var set = function (c, v, label) {
        setText(c.val, v === "" ? "-" : v);
        setData(c.cell, "blank", v === "" ? "true" : null);
        if (label) c.cell.title = label;
      };
      set(s.req, fmtInt(a.requests));
      set(s.tok, fmtCompact(a.tokens), fmtInt(a.tokens) + " tokens: " + fmtInt(a.input_tokens) + " uncached in, " + fmtInt(a.output_tokens) + " out, " +
        fmtInt(a.cache_read_tokens) + " cache read, " + fmtInt(a.cache_write_tokens) + " cache write");
      set(s.cache, Number.isFinite(a.cache_read_share) && a.tokens > 0 ? Math.round(a.cache_read_share * 100) + "%" : "", "cache read share of prompt tokens");
      set(s.cost, a.list_cost_usd == null ? "" : fmtUSD(a.list_cost_usd), "list-price equivalent, not a bill");
      var seen = Date.parse(a.last_seen);
      set(s.last, Number.isFinite(seen) ? span(now() - seen) + " ago" : "", Number.isFinite(seen) ? new Date(seen).toISOString() : "not seen in 8 days");
    }

    function sumAccess(list) {
      var t = { requests: 0, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, list_cost_usd: null, last_seen: null };
      list.forEach(function (a) {
        t.requests += a.requests || 0;
        t.input_tokens += a.input_tokens || 0;
        t.output_tokens += a.output_tokens || 0;
        t.cache_read_tokens += a.cache_read_tokens || 0;
        t.cache_write_tokens += a.cache_write_tokens || 0;
        if (a.list_cost_usd != null) t.list_cost_usd = (t.list_cost_usd || 0) + a.list_cost_usd;
        if (a.last_seen && (!t.last_seen || Date.parse(a.last_seen) > Date.parse(t.last_seen))) t.last_seen = a.last_seen;
      });
      t.tokens = tokensOf(t);
      var prompt = t.input_tokens + t.cache_read_tokens + t.cache_write_tokens;
      t.cache_read_share = prompt > 0 ? t.cache_read_tokens / prompt : null;
      return t;
    }

    function allAccess(pv) {
      return (pv.plans || []).reduce(function (acc, pl) { return acc.concat(pl.access || []); }, []);
    }

    function windowState(w) {
      var known = Number.isFinite(w.used_percent);
      var fetched = Date.parse(w.fetched_at);
      var age = Number.isFinite(fetched) ? now() - fetched : null;
      var status = w.status || "unknown";
      var tone = w.stale ? "stale" : status === "rejected" ? "rejected" : known && w.used_percent >= HOT_PERCENT ? "hot" : status;
      return { known: known, stale: !!w.stale, age: age, status: status, tone: tone };
    }

    function makePlan() {
      var n = row("z2-usage-plan");
      var s = n._s = {};
      var name = el("div", "z2-usage-name");
      s.label = el("b");
      s.account = el("span", "z2-usage-chip");
      name.appendChild(s.label); name.appendChild(s.account);
      s.win = el("span", "z2-usage-win");
      s.meter = meter();
      s.pct = el("b", "z2-usage-pct");
      s.pctVal = el("span", "z2-usage-val");
      s.pctUnit = el("span", "z2-usage-unit", "%");
      s.pct.appendChild(s.pctVal); s.pct.appendChild(s.pctUnit);
      s.state = el("span", "z2-usage-state");
      s.detail = el("div", "z2-usage-detail");
      s.reset = el("span", "z2-usage-reset");
      s.others = el("span", "z2-usage-others");
      s.detail.appendChild(s.reset); s.detail.appendChild(s.others);
      n.appendChild(name); n.appendChild(s.win); n.appendChild(s.meter); n.appendChild(s.pct); n.appendChild(s.state); n.appendChild(s.detail);
      return n;
    }

    function makeOther() {
      var n = el("span", "z2-usage-other");
      n._s = { name: el("span", "z2-usage-other-name"), meter: meter("z2-usage-meter-s"), val: el("span", "z2-usage-val") };
      n.appendChild(n._s.name); n.appendChild(n._s.meter); n.appendChild(n._s.val);
      return n;
    }

    function fillOther(n, it) {
      var w = it.w, st = windowState(w);
      setText(n._s.name, windowName(w.window));
      off(n._s.meter, !st.known);
      if (st.known) {
        setMeter(n._s.meter, w.used_percent, windowName(w.window) + " " + Math.round(w.used_percent) + "% used");
        setText(n._s.val, Math.round(w.used_percent) + "%" + (st.stale && st.age != null ? " \u00b7 " + span(st.age) + " old" : ""));
        setData(n, "tone", st.tone);
        setData(n, "age", st.stale && st.age != null ? ageTier(st.age) : null);
      } else {
        setText(n._s.val, (w.status || "unknown").replace(/_/g, " "));
        setData(n, "tone", "flag");
        setData(n, "age", null);
      }
      var reset = Date.parse(w.reset_at);
      n.title = [windowName(w.window), w.status ? "status " + w.status.replace(/_/g, " ") : "", Number.isFinite(reset) ? "resets " + localTime(reset) : "",
        w.source === "provider_reported" ? "reported by the provider" : "seen in response headers", st.age != null ? span(st.age) + " old" : ""].filter(Boolean).join(" \u00b7 ");
    }

    function fillPlan(n, it) {
      var pv = it.pv, pl = it.pl, s = n._s;
      setText(s.label, planLabel(pv, pl));
      setText(s.account, pl.account || "");
      off(s.account, !pl.account);
      s.account.title = pl.account ? "account " + pl.account : "";
      var wins = pl.windows || [];
      var metered = wins.filter(function (w) { return Number.isFinite(w.used_percent); });
      var lead = metered.filter(function (w) { return w.window === pl.binding; })[0] ||
        metered.slice().sort(function (a, b) { return b.used_percent - a.used_percent; })[0] || null;
      var rest = wins.filter(function (w) { return w !== lead; });
      sync(s.others, rest.map(function (w) { return { key: w.window, kind: "other", w: w }; }), makeOther, fillOther);
      setData(n, "metered", lead ? "true" : "false");
      off(s.meter, !lead); off(s.pct, !lead); off(s.win, !lead);
      if (lead) {
        var st = windowState(lead);
        var pct = Math.round(lead.used_percent);
        setText(s.win, windowName(lead.window));
        setMeter(s.meter, lead.used_percent, windowName(lead.window) + " " + pct + "% used" + (st.stale ? ", stale" : ""));
        setText(s.pctVal, pct);
        setData(n, "tone", st.tone);
        setData(n, "age", st.stale && st.age != null ? ageTier(st.age) : null);
        var word = STATUS_WORDS[st.status] || "";
        setText(s.state, st.stale ? (st.age != null ? span(st.age) + " old" : "stale") + (word ? ", was " + word : "") : word);
        var reset = Date.parse(lead.reset_at);
        setText(s.reset, Number.isFinite(reset) ? "resets " + localTime(reset) + " \u00b7 in " + span(reset - now()) : "");
        s.reset.title = Number.isFinite(reset) ? new Date(reset).toISOString() : "";
      } else {
        var seen = sumAccess(pl.access || []).last_seen;
        var sub = !/pay as you go/i.test(pl.label || "");
        setText(s.win, "");
        setData(n, "tone", "none");
        setData(n, "age", null);
        setText(s.state, sub ? "no recent limit data" + (seen ? " \u00b7 last seen " + span(now() - Date.parse(seen)) + " ago" : "") : "pay as you go");
        setText(s.reset, "");
      }
      n.setAttribute("aria-label", n.textContent.replace(/\s+/g, " ").trim() || pl.plan);
    }

    function disagreement(pl, a) {
      var out = [];
      (a.observed || []).forEach(function (o) {
        if (!Number.isFinite(o.used_percent)) return;
        var p = (pl.windows || []).filter(function (w) { return w.window === o.window; })[0];
        if (!p || !Number.isFinite(p.used_percent) || Math.round(p.used_percent) === Math.round(o.used_percent)) return;
        var age = now() - Date.parse(o.fetched_at);
        out.push(windowName(o.window) + " " + Math.round(o.used_percent) + "%" + (Number.isFinite(age) && (o.stale || age > OBSERVED_STALE_MS) ? " (" + span(age) + " old)" : ""));
      });
      return out.length ? "this path last saw " + out.join(", ") : "";
    }

    function makeAccess() {
      var n = row("z2-usage-access");
      var s = n._s = {};
      var path = el("span", "z2-usage-path");
      s.gw = el("span", "z2-usage-gw");
      s.where = el("span", "z2-usage-where");
      path.appendChild(s.gw); path.appendChild(s.where);
      n.appendChild(path);
      s.nums = numbers(n);
      s.seen = el("span", "z2-usage-seen");
      n.appendChild(s.seen);
      return n;
    }

    function fillAccess(n, it) {
      var a = it.a, s = n._s;
      setData(n, "gateway", a.gateway);
      setText(s.gw, a.gateway === "rou2" ? "rou2" : "direct");
      setText(s.where, a.gateway === "rou2" ? a.host + " \u00b7 " + a.via : "figaro@" + a.host);
      s.gw.title = a.gateway === "rou2" ? "proxied by the rou2 gateway" : "sent straight to the provider by a figaro host";
      fillNumbers(s.nums, Object.assign({ tokens: tokensOf(a) }, a));
      var d = disagreement(it.pl, a);
      setText(s.seen, d);
      off(s.seen, !d);
      n.setAttribute("aria-label", n.textContent.replace(/\s+/g, " ").trim());
    }

    function makeItem(it) { return it.kind === "plan" ? makePlan() : makeAccess(); }
    function fillItem(n, it) {
      n._ref = it.ref;
      if (it.kind === "plan") fillPlan(n, it); else fillAccess(n, it);
    }

    function makeProvider(it) {
      var n;
      if (it.kind === "quiet") {
        n = row("z2-usage-quiet");
        var s = n._s = {};
        var path = el("span", "z2-usage-path");
        s.label = el("b");
        s.where = el("span", "z2-usage-where");
        path.appendChild(s.label); path.appendChild(s.where);
        n.appendChild(path);
        s.nums = numbers(n);
        return n;
      }
      n = el("section", "z2-usage-prov");
      n.tabIndex = 0;
      n._s = { title: el("h3"), total: el("span", "z2-usage-total"), rows: el("div", "z2-usage-rows") };
      var h = el("header", "z2-usage-prov-h");
      h.appendChild(n._s.title); h.appendChild(n._s.total);
      n.appendChild(h); n.appendChild(n._s.rows);
      return n;
    }

    function fillProvider(n, it) {
      var pv = it.pv, s = n._s;
      n._ref = { kind: "provider", provider: pv.provider };
      var all = sumAccess(allAccess(pv));
      if (it.kind === "quiet") {
        setText(s.label, pv.label || pv.provider);
        var paths = allAccess(pv);
        var gws = paths.map(function (a) { return a.gateway === "rou2" ? "via rou2" : "direct"; }).filter(function (g, i, l) { return l.indexOf(g) === i; });
        setText(s.where, (pv.plans || []).map(function (pl) { return planLabel(pv, pl) + " " + pl.plan; }).join(", ") + (gws.length ? " \u00b7 " + gws.join(" + ") : ""));
        fillNumbers(s.nums, all);
        n.setAttribute("aria-label", n.textContent.replace(/\s+/g, " ").trim());
        return;
      }
      setText(s.title, pv.label || pv.provider);
      setText(s.total, fmtInt(all.requests) + " req" + (all.list_cost_usd != null ? " \u00b7 list " + fmtUSD(all.list_cost_usd) : ""));
      n.setAttribute("aria-label", (pv.label || pv.provider) + ", " + (pv.plans || []).length + " plans");
      var items = [];
      (pv.plans || []).forEach(function (pl) {
        items.push({ key: "p:" + pl.plan, kind: "plan", pv: pv, pl: pl, ref: { kind: "plan", provider: pv.provider, plan: pl.plan } });
        var paths = pl.access || [];
        var used = paths.filter(function (a) { return a.requests > 0; });
        (used.length ? used : paths.slice(0, 1)).forEach(function (a) {
          items.push({ key: "a:" + [pl.plan, a.gateway, a.host, a.via].join(":"), kind: "access", pv: pv, pl: pl, a: a,
            ref: { kind: "access", provider: pv.provider, plan: pl.plan, gateway: a.gateway, host: a.host, via: a.via } });
        });
      });
      sync(s.rows, items, makeItem, fillItem);
    }

    function rangeText(d) {
      var from = Date.parse(d.from), to = Date.parse(d.to);
      return Number.isFinite(from) && Number.isFinite(to) ? "usage over " + span(to - from) : "";
    }

    function paint() {
      var d = data;
      var provs = (d && d.providers) || [];
      sync(body, provs.map(function (pv) {
        var metered = (pv.plans || []).some(function (pl) { return (pl.windows || []).length > 0 || /subscription|unidentified/i.test(pl.label || ""); });
        return { key: pv.provider, kind: metered ? "prov" : "quiet", pv: pv };
      }), makeProvider, fillProvider);
      var gen = d && Date.parse(d.generated_at);
      var bad = ((d && d.sources && d.sources.enrichment) || []).filter(function (e) { return e.status && e.status !== "ok"; });
      setText(stamp, d ? [rangeText(d), Number.isFinite(gen) ? "as of " + clock.format(gen) : "",
        bad.map(function (e) { return e.name + " evidence " + e.status; }).join(", ")].filter(Boolean).join(" \u00b7 ") : "");
      setData(stamp, "tone", bad.length ? "warn" : null);
    }

    function update(next) {
      data = next;
      band.removeAttribute("aria-busy");
      paint();
      var empty = !((next && next.providers) || []).length;
      band.dataset.state = empty ? "empty" : "ready";
      off(note, !empty);
      note.removeAttribute("role");
      setText(note, empty ? (opts.emptyText || "No plan or usage data in this range.") : "");
    }

    function fail(err) {
      band.removeAttribute("aria-busy");
      band.dataset.state = "error";
      off(note, false);
      note.setAttribute("role", "alert");
      var gen = data && Date.parse(data.generated_at);
      var msg = err && err.message ? err.message : String(err || "request failed");
      setText(note, "Could not load plans: " + msg + (Number.isFinite(gen) ? ". Showing the answer from " + clock.format(gen) + ", " + span(now() - gen) + " old." : "."));
    }

    function find(ref) {
      var pv = ((data && data.providers) || []).filter(function (p) { return p.provider === ref.provider; })[0];
      if (!pv) return null;
      var pl = ref.plan ? (pv.plans || []).filter(function (p) { return p.plan === ref.plan; })[0] : null;
      return { provider: pv, plan: pl || null };
    }

    function table(cols, rows) {
      var wrap = el("div", "z2-scroll");
      var t = el("table", "z2-table");
      var hr = el("tr");
      cols.forEach(function (c) { var th = el("th", c[0] === ">" ? "num" : null, c.replace(/^>/, "")); th.scope = "col"; hr.appendChild(th); });
      var thead = el("thead"); thead.appendChild(hr);
      var tb = el("tbody");
      rows.forEach(function (r) {
        var tr = el("tr");
        r.forEach(function (v, i) { tr.appendChild(el("td", cols[i][0] === ">" ? "num" : null, v == null || v === "" ? "-" : v)); });
        tb.appendChild(tr);
      });
      t.appendChild(thead); t.appendChild(tb);
      wrap.appendChild(t);
      return wrap;
    }

    function windowRows(list, lead) {
      return (list || []).map(function (w) {
        var f = Date.parse(w.fetched_at), r = Date.parse(w.reset_at);
        return (lead || []).concat([windowName(w.window), w.window, Number.isFinite(w.used_percent) ? Math.round(w.used_percent) + "%" : "", (w.status || "").replace(/_/g, " "),
          Number.isFinite(r) ? localTime(r) + " (in " + span(r - now()) + ")" : "", w.source === "provider_reported" ? "provider" : "headers",
          Number.isFinite(f) ? span(now() - f) + " old" + (w.stale ? ", stale" : "") : ""]);
      });
    }

    function detail(ref) {
      var hit = find(ref);
      if (!hit) return null;
      var pv = hit.provider;
      var plans = hit.plan ? [hit.plan] : (pv.plans || []);
      var node = el("div", "z2-usage-drill");
      plans.forEach(function (pl) {
        var sec = el("section");
        sec.appendChild(el("h4", null, planLabel(pv, pl) + (pl.account ? " \u00b7 " + pl.account : "") + " (" + pl.plan + ")"));
        if ((pl.windows || []).length) sec.appendChild(table(["window", "raw", ">used", "status", "resets", "source", "age"], windowRows(pl.windows)));
        else sec.appendChild(el("p", "z2-usage-stamp", "No limit windows reported or observed for this plan."));
        sec.appendChild(table(["path", ">req", ">uncached in", ">out", ">cache read", ">cache write", ">cache", ">priced", ">list $", "last seen"],
          (pl.access || []).map(function (a) {
            var seen = Date.parse(a.last_seen);
            return [(a.gateway === "rou2" ? "via rou2, " + a.host + ", " + a.via : "direct, figaro@" + a.host), fmtInt(a.requests), fmtInt(a.input_tokens), fmtInt(a.output_tokens),
              fmtInt(a.cache_read_tokens), fmtInt(a.cache_write_tokens), Number.isFinite(a.cache_read_share) ? Math.round(a.cache_read_share * 100) + "%" : "",
              fmtInt(a.priced_requests), a.list_cost_usd == null ? "" : fmtUSD(a.list_cost_usd), Number.isFinite(seen) ? localTime(seen) + " (" + span(now() - seen) + " ago)" : ""];
          })));
        var obs = [];
        (pl.access || []).forEach(function (a) {
          obs = obs.concat(windowRows(a.observed, [(a.gateway === "rou2" ? "via rou2, " + a.host : "direct, " + a.host)]));
        });
        if (obs.length) {
          sec.appendChild(el("h5", null, "Windows as each path saw them"));
          sec.appendChild(table(["path", "window", "raw", ">used", "status", "resets", "source", "age"], obs));
        }
        node.appendChild(sec);
      });
      if (data.join_rule) node.appendChild(el("p", "z2-usage-stamp", "How paths join plans: " + data.join_rule + "."));
      var title = hit.plan ? (pv.label || pv.provider) + " \u00b7 " + planLabel(pv, hit.plan) + (hit.plan.account ? " " + hit.plan.account : "") : (pv.label || pv.provider);
      return { title: title, node: node };
    }

    function focusables() {
      return Array.prototype.slice.call(band.querySelectorAll("[tabindex]"));
    }

    band.addEventListener("click", function (e) {
      var t = e.target.closest(".z2-usage-plan, .z2-usage-access, .z2-usage-quiet");
      if (t && t._ref && opts.onOpen) opts.onOpen(t._ref, t);
    });
    band.addEventListener("keydown", function (e) {
      var t = e.target;
      if (!t._ref) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (opts.onOpen) opts.onOpen(t._ref, t);
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        var list = focusables();
        var next = list[list.indexOf(t) + (e.key === "ArrowDown" ? 1 : -1)];
        if (next) { e.preventDefault(); next.focus(); }
      }
    });

    return { root: band, update: update, fail: fail, detail: detail, repaint: function () { if (data) paint(); }, data: function () { return data; } };
  }

  root.z2 = Object.assign(root.z2 || {}, { usageBand: usageBand, usageWindowName: windowName });
})(typeof window !== "undefined" ? window : globalThis);
