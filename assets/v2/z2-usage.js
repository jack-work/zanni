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

  function seatsOf(plans, nameOf) {
    var groups = {};
    (plans || []).forEach(function (pl) {
      if (!pl.account) return;
      var k = nameOf(pl) + "\u0000" + pl.account;
      (groups[k] = groups[k] || []).push(pl);
    });
    var out = {};
    Object.keys(groups).forEach(function (k) {
      var g = groups[k].slice().sort(function (a, b) { return String(a.plan).localeCompare(String(b.plan), "en", { numeric: true }); });
      if (g.length < 2) return;
      var named = g.map(function (pl) { var m = /-(\d+)$/.exec(pl.plan); return m ? Number(m[1]) : 1; });
      var distinct = named.every(function (n, i) { return n > 0 && named.indexOf(n) === i; });
      g.forEach(function (pl, i) { out[pl.plan] = { n: distinct ? named[i] : i + 1, of: g.length }; });
    });
    return out;
  }

  function primaryOf(recent) {
    var out = {};
    ((recent && recent.providers) || []).forEach(function (pv) {
      var best = null, total = 0, ran = 0;
      (pv.plans || []).forEach(function (pl) {
        var req = 0, seen = 0;
        (pl.access || []).forEach(function (a) {
          req += a.requests || 0;
          var t = Date.parse(a.last_seen);
          if (Number.isFinite(t) && t > seen) seen = t;
        });
        total += req;
        if (req > 0) ran++;
        if (req > 0 && (!best || req > best.requests || (req === best.requests && seen > best.seen))) best = { plan: pl.plan, requests: req, seen: seen };
      });
      if (best && ran > 1) out[pv.provider] = { plan: best.plan, requests: best.requests, total: total, span: Date.parse(recent.to) - Date.parse(recent.from) };
    });
    return out;
  }

  function tokensOf(a) {
    return (a.input_tokens || 0) + (a.output_tokens || 0) + (a.cache_read_tokens || 0) + (a.cache_write_tokens || 0);
  }

  function meter(cls) {
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "z2-usage-meter" + (cls ? " " + cls : ""));
    svg.setAttribute("viewBox", "0 0 100 8");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("role", "meter");
    svg.setAttribute("aria-valuemin", "0");
    svg.setAttribute("aria-valuemax", "100");
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

  function tipText(n, title, text) {
    if (!text) { n.removeAttribute("data-tip-text"); n.removeAttribute("data-tip-title"); return; }
    if (n.getAttribute("data-tip-text") !== text) n.setAttribute("data-tip-text", text);
    if (title) { if (n.getAttribute("data-tip-title") !== title) n.setAttribute("data-tip-title", title); }
    else n.removeAttribute("data-tip-title");
  }

  function off(n, yes) {
    if (yes) n.setAttribute("data-off", ""); else n.removeAttribute("data-off");
  }

  function setMeter(svg, pct, label, text) {
    var w = String(pct > 0 ? Math.max(1, Math.min(100, pct)) : 0);
    if (svg._fill.getAttribute("width") !== w) svg._fill.setAttribute("width", w);
    var now = String(Math.round(Math.max(0, Math.min(100, pct))));
    if (svg.getAttribute("aria-valuenow") !== now) svg.setAttribute("aria-valuenow", now);
    if (svg.getAttribute("aria-label") !== label) svg.setAttribute("aria-label", label);
    if (svg.getAttribute("aria-valuetext") !== text) svg.setAttribute("aria-valuetext", text);
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
    var primary = {};
    var openPlans = {};
    var bandOpen = !!opts.open;
    var openProvs = {};
    var lastPointer = "mouse";
    var NARROW = opts.narrowWidth || 760;
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
    var title = el("h2", null, opts.title || "Usage");
    head.appendChild(title);
    var stamp = el("p", "z2-usage-stamp");
    head.appendChild(stamp);
    var sum = el("div", "z2-usage-sum");
    sum.tabIndex = 0;
    sum.setAttribute("role", "button");
    var sumWho = el("span", "z2-usage-sum-who");
    var sumProv = el("b");
    var sumPlan = el("span", "z2-usage-sum-plan");
    sumWho.appendChild(sumProv); sumWho.appendChild(sumPlan);
    var sumFig = makeFig();
    var sumMore = el("span", "z2-usage-sum-more");
    sum.appendChild(sumWho); sum.appendChild(sumFig); sum.appendChild(sumMore);
    head.insertBefore(sum, stamp);
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

    function planFullName(pv, pl, seat, sep) {
      return [planLabel(pv, pl), pl.account, seat ? "seat " + seat.n : ""].filter(Boolean).join(sep);
    }

    function seats(pv) {
      return seatsOf(pv.plans, function (pl) { return planLabel(pv, pl); });
    }

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
      var set = function (c, v, title, label) {
        setText(c.val, v === "" ? "-" : v);
        setData(c.cell, "blank", v === "" ? "true" : null);
        tipText(c.cell, title, label || "");
      };
      set(s.req, fmtInt(a.requests), "Requests", fmtInt(a.requests) + " requests in the range" + (a.priced_requests != null ? ", " + fmtInt(a.priced_requests) + " priced" : ""));
      set(s.tok, fmtCompact(a.tokens), "Tokens", fmtInt(a.tokens) + " tokens: " + fmtInt(a.input_tokens) + " uncached in, " + fmtInt(a.output_tokens) + " out, " +
        fmtInt(a.cache_read_tokens) + " cache read, " + fmtInt(a.cache_write_tokens) + " cache write");
      set(s.cache, Number.isFinite(a.cache_read_share) && a.tokens > 0 ? Math.round(a.cache_read_share * 100) + "%" : "", "Cache read share", "Share of prompt tokens read from the provider's cache.");
      set(s.cost, a.list_cost_usd == null ? "" : fmtUSD(a.list_cost_usd), "List price", "What these requests would cost at list price. Not a bill.");
      var seen = Date.parse(a.last_seen);
      set(s.last, Number.isFinite(seen) ? span(now() - seen) + " ago" : "", "Last seen", Number.isFinite(seen) ? new Date(seen).toISOString() + " UTC" : "Not seen in 8 days.");
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

    function resetText(w) {
      var reset = Date.parse(w.reset_at);
      return Number.isFinite(reset) ? "resets in " + span(reset - now()) : "";
    }

    function resetTip(n, w) {
      var reset = Date.parse(w.reset_at);
      tipText(n, "Window reset", Number.isFinite(reset) ? "Resets " + localTime(reset) + ", in " + span(reset - now()) + " (" + new Date(reset).toISOString() + " UTC), " +
        (w.source === "provider_reported" ? "reported by the provider." : "from response headers.") : "");
    }

    function leftOf(w) {
      return Math.max(0, 100 - Math.round(w.used_percent));
    }

    function staleWords(st) {
      var word = STATUS_WORDS[st.status] || "";
      return "Stale: last read " + (st.age != null ? span(st.age) + " ago" : "some time ago") + (word ? ", when it said " + word : "") + ". Shown muted until a fresh reading arrives.";
    }

    function makeFig() {
      var n = el("span", "z2-usage-fig");
      var s = n._s = { val: el("b", "z2-usage-left"), unit: el("span", "z2-usage-unit", "% left"), stale: el("span", "z2-usage-stale"), meter: meter(), reset: el("span", "z2-usage-reset") };
      s.stale.setAttribute("aria-label", "stale");
      [s.val, s.unit, s.stale, s.meter, s.reset].forEach(function (c) { n.appendChild(c); });
      return n;
    }

    function fillFig(n, pv, lead, seat) {
      var s = n._s;
      off(n, !lead);
      if (!lead) return;
      var st = windowState(lead.w);
      var left = leftOf(lead.w);
      var name = planFullName(pv, lead.pl, seat, " ");
      setText(s.val, left);
      setMeter(s.meter, left, name + " " + windowName(lead.w.window) + " left", left + "% left" + (st.stale ? ", stale" : ""));
      setData(n, "tone", st.tone);
      off(s.stale, !st.stale);
      var reset = Date.parse(lead.w.reset_at);
      setText(s.reset, st.stale ? "" : resetText(lead.w));
      tipText(n, name, [windowName(lead.w.window) + " window: " + Math.round(lead.w.used_percent) + "% used, " + left + "% left.",
        Number.isFinite(reset) ? "Resets " + localTime(reset) + ", in " + span(reset - now()) + "." : "",
        st.stale ? staleWords(st) : (STATUS_WORDS[st.status] ? "The provider says: " + STATUS_WORDS[st.status] + "." : ""),
        lead.first ? "This is the plan the fleet used most in the last hour." : "This is the provider's busiest plan in the range."].filter(Boolean).join(" "));
    }

    function leadOf(pv) {
      var best = null, prim = primary[pv.provider];
      (pv.plans || []).forEach(function (pl) {
        var metered = (pl.windows || []).filter(function (w) { return Number.isFinite(w.used_percent); });
        if (!metered.length) return;
        var w = metered.filter(function (x) { return x.window === pl.binding; })[0] || metered.slice().sort(function (a, b) { return b.used_percent - a.used_percent; })[0];
        var first = !!prim && prim.plan === pl.plan;
        var score = (first ? 1e12 : 0) + sumAccess(pl.access || []).requests;
        if (!best || score > best.score || (score === best.score && w.used_percent > best.w.used_percent)) best = { pl: pl, w: w, score: score, first: first };
      });
      return best;
    }

    function stateText(st) {
      var word = STATUS_WORDS[st.status] || "";
      return st.stale ? (st.age != null ? span(st.age) + " old" : "stale") + (word ? ", was " + word : "") : word;
    }

    function makePlan() {
      var n = row("z2-usage-plan");
      var s = n._s = {};
      var name = el("div", "z2-usage-name");
      s.label = el("b");
      s.account = el("span", "z2-usage-chip");
      s.primary = el("span", "z2-usage-primary", "primary");
      name.appendChild(s.label); name.appendChild(s.account); name.appendChild(s.primary);
      s.win = el("span", "z2-usage-win");
      s.meter = meter();
      s.pct = el("b", "z2-usage-pct");
      s.pctVal = el("span", "z2-usage-val");
      s.pctUnit = el("span", "z2-usage-unit", "% left");
      s.pct.appendChild(s.pctVal); s.pct.appendChild(s.pctUnit);
      s.notes = el("span", "z2-usage-notes");
      s.stale = el("span", "z2-usage-stale");
      s.state = el("span", "z2-usage-state");
      s.reset = el("span", "z2-usage-reset");
      s.notes.appendChild(s.stale); s.notes.appendChild(s.state); s.notes.appendChild(s.reset);
      s.more = el("span", "z2-usage-more");
      s.more.setAttribute("aria-hidden", "true");
      s.others = el("span", "z2-usage-others");
      s.flags = el("span", "z2-usage-flags");
      s.notes.appendChild(s.flags);
      s.drill = el("span", "z2-usage-drill-link", "details");
      s.drill.tabIndex = 0;
      s.drill.setAttribute("role", "button");
      [name, s.win, s.meter, s.pct, s.notes, s.more, s.others, s.drill].forEach(function (c) { n.appendChild(c); });
      return n;
    }

    function windowTip(n, w, st) {
      var reset = Date.parse(w.reset_at);
      tipText(n, windowName(w.window) + " window", [Number.isFinite(w.used_percent) ? Math.round(w.used_percent) + "% used" : "", w.status ? "status " + w.status.replace(/_/g, " ") : "", Number.isFinite(reset) ? "resets " + localTime(reset) : "",
        w.source === "provider_reported" ? "reported by the provider" : "seen in response headers", st.age != null ? span(st.age) + " old" : ""].filter(Boolean).join(" \u00b7 "));
    }

    function makeOther() {
      var n = el("span", "z2-usage-other");
      var s = n._s = { name: el("span", "z2-usage-win"), meter: meter(), pct: el("span", "z2-usage-pct"), val: el("span", "z2-usage-val"), notes: el("span", "z2-usage-notes"),
        stale: el("span", "z2-usage-stale"), state: el("span", "z2-usage-state"), reset: el("span", "z2-usage-reset") };
      s.pct.appendChild(s.val); s.pct.appendChild(el("span", "z2-usage-unit", "% left"));
      s.notes.appendChild(s.stale); s.notes.appendChild(s.state); s.notes.appendChild(s.reset);
      n.appendChild(s.name); n.appendChild(s.meter); n.appendChild(s.pct); n.appendChild(s.notes);
      return n;
    }

    function fillOther(n, it) {
      var w = it.w, st = windowState(w), s = n._s;
      setText(s.name, windowName(w.window));
      var left = leftOf(w);
      setMeter(s.meter, left, it.plan + " " + windowName(w.window) + " left", left + "% left" + (st.stale ? ", stale" : ""));
      setText(s.val, left);
      setData(n, "tone", st.tone);
      setData(n, "age", st.stale && st.age != null ? ageTier(st.age) : null);
      setText(s.state, st.stale ? "" : stateText(st));
      off(s.state, !s.state.textContent);
      off(s.stale, !st.stale);
      tipText(s.stale, "Stale reading", st.stale ? staleWords(st) : "");
      setText(s.reset, resetText(w));
      windowTip(n, w, st);
    }

    function makeFlag() { return el("span", "z2-usage-flag"); }

    function fillFlag(n, it) {
      var w = it.w;
      setText(n, windowName(w.window) + " " + (w.status || "unknown").replace(/_/g, " "));
      windowTip(n, w, windowState(w));
    }

    function fillPlan(n, it) {
      var pv = it.pv, pl = it.pl, s = n._s;
      var open = !!openPlans[pv.provider + ":" + pl.plan];
      setData(n, "open", open ? "true" : "false");
      n.setAttribute("aria-expanded", String(open));
      setText(s.label, planLabel(pv, pl));
      var seat = it.seat;
      setText(s.account, pl.account ? pl.account + (seat ? " \u00b7 seat " + seat.n : "") : "");
      off(s.account, !pl.account);
      tipText(s.account, "Account", pl.account ? pl.account + (seat ? " \u00b7 seat " + seat.n + " of " + seat.of : "") + " \u00b7 upstream " + pl.plan : "");
      var lead0 = primary[pv.provider];
      var first = !!lead0 && lead0.plan === pl.plan;
      setData(n, "primary", first ? "true" : null);
      off(s.primary, !first);
      tipText(s.primary, "Primary seat", first ? "Carried " + fmtInt(lead0.requests) + " of " + fmtInt(lead0.total) + " " + (pv.label || pv.provider) + " requests in the last " +
        (Number.isFinite(lead0.span) ? span(lead0.span) : "hour") + ", more than any other plan." : "");
      var wins = pl.windows || [];
      var metered = wins.filter(function (w) { return Number.isFinite(w.used_percent); });
      var lead = metered.filter(function (w) { return w.window === pl.binding; })[0] ||
        metered.slice().sort(function (a, b) { return b.used_percent - a.used_percent; })[0] || null;
      var planName = planFullName(pv, pl, seat, " ");
      sync(s.others, metered.filter(function (w) { return w !== lead; }).map(function (w) { return { key: w.window, kind: "other", w: w, plan: planName }; }), makeOther, fillOther);
      sync(s.flags, wins.filter(function (w) { return !Number.isFinite(w.used_percent); }).map(function (w) { return { key: w.window, kind: "flag", w: w }; }), makeFlag, fillFlag);
      off(s.flags, !s.flags.children.length);
      tipText(s.label, planLabel(pv, pl), [pl.account ? "Account " + pl.account + (seat ? ", seat " + seat.n + " of " + seat.of : "") + ", upstream " + pl.plan + "." : "",
        s.flags.textContent ? "Also reported: " + Array.prototype.map.call(s.flags.children, function (f) { return f.textContent; }).join(", ") + "." : ""].filter(Boolean).join(" "));
      setData(n, "metered", lead ? "true" : "false");
      setData(n, "windows", String(metered.length));
      off(s.meter, !lead); off(s.pct, !lead); off(s.win, !lead);
      if (lead) {
        var st = windowState(lead);
        var pct = leftOf(lead);
        setText(s.win, windowName(lead.window));
        setMeter(s.meter, pct, planName + " " + windowName(lead.window) + " left",
          pct + "% left" + (STATUS_WORDS[st.status] ? ", " + STATUS_WORDS[st.status] : "") + (st.stale ? ", stale" : ""));
        setText(s.pctVal, pct);
        setData(n, "tone", st.tone);
        setData(n, "age", st.stale && st.age != null ? ageTier(st.age) : null);
        setText(s.state, st.stale ? "" : stateText(st));
        off(s.stale, !st.stale);
        tipText(s.stale, "Stale reading", st.stale ? staleWords(st) : "");
        setText(s.reset, resetText(lead));
        resetTip(s.reset, lead);
      } else {
        var seen = sumAccess(pl.access || []).last_seen;
        var sub = !/pay as you go/i.test(pl.label || "");
        setText(s.win, "");
        setData(n, "tone", "none");
        setData(n, "age", null);
        off(s.stale, true);
        setText(s.state, sub ? "no limit data" : "pay as you go");
        tipText(s.state, sub ? "No limit data" : "Pay as you go", sub ? "No limit window was reported or seen in headers for this plan" + (seen ? "; its last request was " + span(now() - Date.parse(seen)) + " ago." : ".") : "Billed per request; no plan window applies.");
        setText(s.reset, "");
      }
      off(s.state, !s.state.textContent);
      off(s.reset, !s.reset.textContent);
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
      s.seen = el("span", "z2-usage-stale z2-usage-seen");
      path.appendChild(s.seen);
      return n;
    }

    function fillAccess(n, it) {
      var a = it.a, s = n._s;
      setData(n, "open", openPlans[it.pv.provider + ":" + it.pl.plan] ? "true" : "false");
      setData(n, "gateway", a.gateway);
      setText(s.gw, a.gateway === "rou2" ? "rou2" : "direct");
      setText(s.where, a.gateway === "rou2" ? a.host + " \u00b7 " + a.via : "figaro@" + a.host);
      tipText(s.gw, a.gateway === "rou2" ? "Via rou2" : "Direct", a.gateway === "rou2" ? "Proxied by the rou2 gateway on " + a.host + " through upstream " + a.via + "." : "Sent straight to the provider by figaro on " + a.host + ".");
      fillNumbers(s.nums, Object.assign({ tokens: tokensOf(a) }, a));
      var d = disagreement(it.pl, a);
      off(s.seen, !d);
      tipText(s.seen, "This path disagrees", d ? d.charAt(0).toUpperCase() + d.slice(1) + ", not what the plan row shows." : "");
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
      n._s = { title: el("h3"), fig: makeFig(), total: el("span", "z2-usage-total"), caret: el("span", "z2-usage-more"), rows: el("div", "z2-usage-rows") };
      n._s.caret.setAttribute("aria-hidden", "true");
      var h = el("header", "z2-usage-prov-h");
      h.appendChild(n._s.title); h.appendChild(n._s.fig); h.appendChild(n._s.total); h.appendChild(n._s.caret);
      n.appendChild(h); n.appendChild(n._s.rows);
      return n;
    }

    function fillProvider(n, it) {
      var pv = it.pv, s = n._s;
      n._ref = { kind: "provider", provider: pv.provider };
      var all = sumAccess(allAccess(pv));
      if (it.kind === "quiet") {
        setData(n, "open", openPlans[pv.provider + ":"] ? "true" : "false");
        n.setAttribute("aria-expanded", String(!!openPlans[pv.provider + ":"]));
        setText(s.label, pv.label || pv.provider);
        var paths = allAccess(pv);
        var gws = paths.map(function (a) { return a.gateway === "rou2" ? "via rou2" : "direct"; }).filter(function (g, i, l) { return l.indexOf(g) === i; });
        setText(s.where, (pv.plans || []).map(function (pl) { return planLabel(pv, pl) + " " + pl.plan; }).join(", ") + (gws.length ? " \u00b7 " + gws.join(" + ") : ""));
        tipText(s.label, pv.label || pv.provider, "Pay as you go: " + s.where.textContent + ".");
        fillNumbers(s.nums, all);
        n.setAttribute("aria-label", n.textContent.replace(/\s+/g, " ").trim());
        return;
      }
      setText(s.title, pv.label || pv.provider);
      setText(s.total, fmtInt(all.requests) + " req");
      tipText(s.total, "In the range", fmtInt(all.requests) + " requests" + (all.list_cost_usd != null ? ", " + fmtUSD(all.list_cost_usd) + " at list price" : "") + " across " + (pv.plans || []).length + " plans.");
      var isOpen = !!openProvs[pv.provider];
      setData(n, "open", isOpen ? "true" : "false");
      n.setAttribute("aria-expanded", String(isOpen));
      var items = [];
      var seat = seats(pv);
      var top = leadOf(pv);
      fillFig(s.fig, pv, top, top ? seat[top.pl.plan] : null);
      n.setAttribute("aria-label", (pv.label || pv.provider) + ", " + (pv.plans || []).length + " plans" + (top ? ", " + s.fig.textContent.replace(/\s+/g, " ").trim() : ""));
      (pv.plans || []).forEach(function (pl) {
        items.push({ key: "p:" + pl.plan, kind: "plan", pv: pv, pl: pl, seat: seat[pl.plan] || null, ref: { kind: "plan", provider: pv.provider, plan: pl.plan } });
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
        var metered = (pv.plans || []).some(function (pl) { return (pl.windows || []).length > 0 || (!!pl.label && !/pay as you go/i.test(pl.label)); });
        return { key: pv.provider, kind: metered ? "prov" : "quiet", pv: pv };
      }), makeProvider, fillProvider);
      var gen = d && Date.parse(d.generated_at);
      var bad = ((d && d.sources && d.sources.enrichment) || []).filter(function (e) { return e.status && e.status !== "ok"; });
      setText(stamp, d ? [rangeText(d), Number.isFinite(gen) ? "as of " + clock.format(gen) : "",
        bad.map(function (e) { return e.name + " evidence " + e.status; }).join(", ")].filter(Boolean).join(" \u00b7 ") : "");
      tipText(title, opts.title || "Usage", d ? "How much of each plan is left, and what each provider carried: " + stamp.textContent + "." : "");
      setData(stamp, "tone", bad.length ? "warn" : null);
      var lead = null;
      provs.forEach(function (pv) {
        var top = leadOf(pv);
        if (!top) return;
        var req = sumAccess(allAccess(pv)).requests;
        if (!lead || req > lead.req || (req === lead.req && top.w.used_percent > lead.top.w.used_percent)) lead = { pv: pv, top: top, req: req };
      });
      band.dataset.open = bandOpen ? "true" : "false";
      sum.setAttribute("aria-expanded", String(bandOpen));
      off(sumWho, !lead);
      if (lead) {
        var seat = seats(lead.pv)[lead.top.pl.plan];
        setText(sumProv, lead.pv.label || lead.pv.provider);
        setText(sumPlan, planFullName(lead.pv, lead.top.pl, seat, " \u00b7 "));
        fillFig(sumFig, lead.pv, lead.top, seat);
      } else {
        fillFig(sumFig, null, null, null);
      }
      var others = provs.length - (lead ? 1 : 0);
      setText(sumMore, bandOpen ? "fold" : (lead ? "and " + others + " more\u2026" : provs.length + " providers\u2026"));
      off(sumMore, !provs.length);
      sum.setAttribute("aria-label", "Usage: " + sum.textContent.replace(/\s+/g, " ").trim());
    }

    function update(next, recent) {
      data = next;
      if (recent !== undefined) primary = primaryOf(recent);
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
      var seat = seats(pv);
      var node = el("div", "z2-usage-drill");
      plans.forEach(function (pl) {
        var sec = el("section");
        sec.appendChild(el("h4", null, planFullName(pv, pl, seat[pl.plan], " \u00b7 ") + " (" + pl.plan + ")"));
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
      var title = hit.plan ? (pv.label || pv.provider) + " \u00b7 " + planFullName(pv, hit.plan, seat[hit.plan.plan], " ") : (pv.label || pv.provider);
      return { title: title, node: node };
    }

    function focusables() {
      return Array.prototype.slice.call(band.querySelectorAll("[tabindex]")).filter(function (n) { return n.offsetParent !== null; });
    }

    function narrow() {
      return band.getBoundingClientRect().width <= NARROW;
    }

    function toggle(t) {
      var ref = t._ref;
      var key = ref.provider + ":" + (ref.kind === "plan" ? ref.plan : "");
      if (openPlans[key]) delete openPlans[key]; else openPlans[key] = true;
      if (data) paint();
    }

    function act(t, viaDrill) {
      if (t === sum) { bandOpen = !bandOpen; if (data) paint(); return; }
      if (t && t.classList.contains("z2-usage-prov")) {
        var k = t._ref.provider;
        if (openProvs[k]) delete openProvs[k]; else openProvs[k] = true;
        if (data) paint();
        return;
      }
      if (!t || !t._ref) return;
      if (t.classList.contains("z2-usage-quiet") || (narrow() && !viaDrill && t.classList.contains("z2-usage-plan"))) { toggle(t); return; }
      if (opts.onOpen) opts.onOpen(t._ref, t);
    }

    band.addEventListener("pointerdown", function (e) { lastPointer = e.pointerType || "mouse"; }, true);
    band.addEventListener("click", function (e) {
      var drill = e.target.closest(".z2-usage-drill-link");
      var t = e.target.closest(".z2-usage-plan, .z2-usage-access, .z2-usage-quiet, .z2-usage-sum");
      if (!t && e.target.closest(".z2-usage-prov-h")) t = e.target.closest(".z2-usage-prov");
      if (!drill && lastPointer === "touch" && e.target.closest("[data-tip-text]") && e.target.closest("[data-tip-text]") !== t && !e.target.closest(".z2-usage-sum-more")) return;
      act(t, !!drill);
    });
    band.addEventListener("keydown", function (e) {
      var t = e.target;
      if (!t._ref && t !== sum && !t.classList.contains("z2-usage-drill-link")) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        act(t.closest(".z2-usage-plan, .z2-usage-access, .z2-usage-quiet, .z2-usage-prov, .z2-usage-sum") || t, t.classList.contains("z2-usage-drill-link"));
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        var list = focusables();
        var next = list[list.indexOf(t) + (e.key === "ArrowDown" ? 1 : -1)];
        if (next) { e.preventDefault(); next.focus(); }
      }
    });

    return { root: band, update: update, fail: fail, detail: detail, repaint: function () { if (data) paint(); }, data: function () { return data; } };
  }

  root.z2 = Object.assign(root.z2 || {}, { usageBand: usageBand, usageWindowName: windowName, usageSeats: seatsOf, usagePrimary: primaryOf });
})(typeof window !== "undefined" ? window : globalThis);
