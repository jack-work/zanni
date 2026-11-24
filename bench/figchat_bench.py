import argparse
import datetime
import gzip
import json
import os
import re
import statistics
import subprocess
import sys
import time
import urllib.request

here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(here), "test"))
from playwright.sync_api import sync_playwright

from figchat_kit import MAIN, keystrokes, quantile, root, until

try:
    import brotli
except ImportError:
    brotli = None

HASHED = re.compile(r"-[A-Za-z0-9_-]{8}\.[a-z0-9]+$")
HELD = "Number(document.querySelector('.nodi-turns').dataset.held)"
GATEWAY_ASSETS = "private, max-age=3600"
LONG_REPLY = 24000
FRAME_MS = 40
CHUNK = 40
SESSION_TURNS = 500
SESSION_REPLY = 3000
SESSION_CHUNK = 150
SESSION_FPS = 200
SESSION_STEP = 100
PHONE = {"viewport": {"width": 390, "height": 844}, "device_scale_factor": 3, "is_mobile": True, "has_touch": True}

PROBE = """
(() => {
  const b = window.__bench = { k2p: [], events: [], longtasks: [], frames: [], commits: 0, fibers: [], where: {} };
  addEventListener('keydown', (e) => {
    const t0 = e.timeStamp;
    requestAnimationFrame(() => { const ch = new MessageChannel(); ch.port1.onmessage = () => b.k2p.push(performance.now() - t0); ch.port2.postMessage(0); });
  }, true);
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => b.longtasks.push([e.startTime, e.duration]))).observe({ type: 'longtask', buffered: true }); } catch (e) {}
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (e.name === 'keydown') b.events.push(e.duration); })).observe({ type: 'event', durationThreshold: 16, buffered: true }); } catch (e) {}
  b.rafOn = () => { b.frames = []; b.raf = true; let last = performance.now(); const tick = (t) => { if (!b.raf) return; b.frames.push(t - last); last = t; requestAnimationFrame(tick); }; requestAnimationFrame(tick); };
  b.rafOff = () => { b.raf = false; return b.frames; };
  const kinds = new Set([0, 1, 11, 14, 15]);
  const hostOf = (f) => { let n = f; while (n) { if (n.tag === 5) return n.stateNode; n = n.child; } return null; };
  b.walk = false;
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true, isDisabled: false, renderers: new Map(),
    inject(r) { const id = this.renderers.size + 1; this.renderers.set(id, r); return id; },
    onScheduleFiberRoot() {}, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {},
    onCommitFiberRoot(id, rootFiber) {
      b.commits++;
      if (!b.walk) return;
      const c = { total: 0, settled: 0, live: 0, other: 0, mounted: 0 };
      const all = document.querySelectorAll('.nodi-turn');
      const last = all[all.length - 1];
      const stack = [rootFiber.current];
      while (stack.length) {
        const f = stack.pop();
        const fresh = !f.alternate;
        if (kinds.has(f.tag) && (fresh || (f.flags & 1))) {
          if (fresh) c.mounted++;
          else {
            c.total++;
            const host = hostOf(f);
            const turn = host && host.closest && host.closest('.nodi-turn');
            if (!turn) { c.other++; const k = host ? host.tagName.toLowerCase() + '.' + String(host.className || '').split(' ')[0] : 'none'; b.where[k] = (b.where[k] || 0) + 1; }
            else if (turn === last) c.live++;
            else c.settled++;
          }
        }
        if (f.sibling) stack.push(f.sibling);
        if (f.child && (fresh || f.child !== f.alternate.child)) stack.push(f.child);
      }
      b.fibers.push(c);
    },
  };
})();
"""

FRAME = "new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(0))))"


def stats(xs):
    xs = [x for x in xs if x is not None]
    if not xs:
        return None
    return {"n": len(xs), "p50": round(statistics.median(xs), 2), "p95": round(quantile(xs, 0.95), 2), "max": round(max(xs), 2)}


def med(xs):
    xs = [x for x in xs if x is not None]
    return round(statistics.median(xs), 2) if xs else None


class Door:
    def __init__(self, bundle, step, asset_cache="", **mock):
        env = dict(os.environ, BENCH_ASSET_CACHE=asset_cache)
        flags = [x for k, v in mock.items() for x in ("--" + k, str(v))]
        self.proc = subprocess.Popen(["node", "-r", os.path.join(here, "door.js"), os.path.join(root, "test", "figchat-server.js"), bundle, str(step)] + flags, stdout=subprocess.PIPE, text=True, env=env)
        self.port = int(self.proc.stdout.readline())
        self.base = "http://127.0.0.1:%d" % self.port
        self.url = self.base + "/chat/"

    def get(self, path):
        return json.load(urllib.request.urlopen(self.base + path))

    def send(self, count=1, text="stream the run build please"):
        return self.get("/__bench/send?count=%d&text=%s" % (count, urllib.request.quote(text)))

    def status(self):
        return self.get("/__bench/status")

    def stop(self):
        self.proc.terminate()
        self.proc.wait()


def bundle_sizes(bundle):
    stats = json.load(open(os.path.join(bundle, "STATS.json")))["files"]
    chunks = []
    for name in sorted(os.listdir(bundle)):
        if name in ("SHA256SUMS", "THIRD-PARTY.txt", "STATS.json"):
            continue
        data = open(os.path.join(bundle, name), "rb").read()
        row = {"name": name, "raw": len(data), "gzip": len(gzip.compress(data, 9, mtime=0)), "hashed": bool(HASHED.search(name)), "initial": stats[name]["initial"]}
        if brotli:
            row["brotli"] = len(brotli.compress(data, quality=11))
        chunks.append(row)
    code = [c for c in chunks if c["name"].endswith((".js", ".css"))]
    first = [c for c in code if c["initial"]]
    total = lambda k: sum(c.get(k, 0) for c in first)
    lazy = {HASHED.sub("", c["name"]).rsplit(".", 1)[0]: {k: c.get(k) for k in ("raw", "gzip", "brotli")} for c in code if not c["initial"]}
    return {"chunks": chunks, "code_raw": total("raw"), "code_gzip": total("gzip"), "code_brotli": total("brotli") if brotli else None, "lazy": lazy,
            "all_raw": sum(c["raw"] for c in chunks), "unhashed": [c["name"] for c in chunks if not c["hashed"]]}


class Net:
    def __init__(self, cdp):
        self.cdp = cdp
        self.reset()
        cdp.send("Network.enable")
        cdp.on("Network.responseReceived", self.response)
        cdp.on("Network.loadingFinished", self.finished)
        cdp.on("Network.requestServedFromCache", lambda e: self.cached.add(e["requestId"]))
        cdp.on("Network.webSocketFrameReceived", lambda e: self.frame("in", e))
        cdp.on("Network.webSocketFrameSent", lambda e: self.frame("out", e))

    def reset(self):
        self.responses, self.bytes, self.cached = {}, {}, set()
        self.ws = {"in": [0, 0], "out": [0, 0]}
        self.kinds = {}

    def response(self, e):
        r = e["response"]
        self.responses[e["requestId"]] = {"url": r["url"], "status": r["status"], "disk": r.get("fromDiskCache", False), "cc": (r.get("headers") or {}).get("Cache-Control", "")}

    def finished(self, e):
        self.bytes[e["requestId"]] = e.get("encodedDataLength", 0)

    def frame(self, way, e):
        data = e["response"]["payloadData"]
        size = len(data.encode("utf-8"))
        self.ws[way][0] += 1
        self.ws[way][1] += size
        try:
            msg = json.loads(data)
        except ValueError:
            msg = {}
        params = msg.get("params") or {}
        kind = way + ":" + (msg.get("method") or ("reply" if "id" in msg else "other"))
        if msg.get("method") == "figaro.aria":
            part = (params.get("parts") or [{}])[0]
            kind += ":live" if "live" in part and part["live"].get("nodes") else ":part"
            row = self.kinds.setdefault(way + ":metrics", [0, 0])
            row[0] += 1
            row[1] += len(json.dumps(params.get("metrics") or {}, separators=(",", ":")))
        row = self.kinds.setdefault(kind, [0, 0])
        row[0] += 1
        row[1] += size

    def http(self):
        rows = []
        for rid, r in self.responses.items():
            rows.append({"url": r["url"].split("/chat/")[-1], "status": r["status"], "cache": rid in self.cached or r["disk"], "wire": self.bytes.get(rid, 0), "cc": r["cc"]})
        return rows


def paced(size, chunk=CHUNK, ms=FRAME_MS):
    return {"fps": 1000 // ms, "bytes": size, "chunk": chunk}


def say(what):
    sys.stderr.write("%s %s\n" % (time.strftime("%H:%M:%S"), what))
    sys.stderr.flush()


def run(bundle, quick=False, only=""):
    out = {"bundle": bundle_sizes(bundle)}
    reps = 2 if quick else 5
    keys = 40 if quick else 200
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--enable-precise-memory-info", "--js-flags=--expose-gc"])

        def page(ctx=None):
            ctx = ctx or browser.new_context(**PHONE)
            ctx.add_init_script(PROBE)
            pg = ctx.new_page()
            pg.errors = []
            pg.on("pageerror", lambda e: pg.errors.append(str(e)))
            cdp = ctx.new_cdp_session(pg)
            cdp.send("Performance.enable")
            pg.net = Net(cdp)
            pg.cdp = cdp
            return pg

        def metrics(pg):
            return {m["name"]: m["value"] for m in pg.cdp.send("Performance.getMetrics")["metrics"]}

        def attend(pg, d, aria=MAIN):
            pg.goto(d.url + "#/gluck/" + aria)
            until(pg, "document.querySelector('.fw') && document.querySelector('.fw').dataset.link === 'live'", 20000)
            until(pg, "document.querySelectorAll('.nodi-turn').length > 3", 20000)
            pg.evaluate(FRAME)

        def load_once(pg, d):
            pg.net.reset()
            pg.goto(d.url + "#/")
            until(pg, "document.querySelector('.fw') && document.querySelector('.fw').dataset.link === 'live' && document.querySelector('[data-testid=topology-row]')", 20000)
            ready = pg.evaluate("%s.then(() => performance.now())" % FRAME)
            paint = pg.evaluate("Object.fromEntries(performance.getEntriesByType('paint').map(e => [e.name, e.startTime]))")
            nav = pg.evaluate("(() => { const n = performance.getEntriesByType('navigation')[0]; return { dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd }; })()")
            long = pg.evaluate("window.__bench.longtasks.filter(t => t[0] < %f).reduce((a, t) => a + Math.max(0, t[1] - 50), 0)" % ready)
            rows = pg.net.http()
            return {"fp": paint.get("first-paint"), "fcp": paint.get("first-contentful-paint"), "tti": ready, "dcl": nav["dcl"], "blocking": long,
                    "requests": len(rows), "from_cache": sum(1 for r in rows if r["cache"] or r["status"] == 304), "wire": sum(r["wire"] for r in rows), "rows": rows}

        RECORD = """() => { const gaps = []; let last = performance.now(); let on = true;
          const tick = (t) => { gaps.push(t - last); last = t; if (on) requestAnimationFrame(tick); };
          requestAnimationFrame(tick);
          window.__pane = () => { on = false; return gaps.slice(1); }; }"""

        def pane_bench():
            d = Door(bundle, 40)
            ctx = browser.new_context(viewport={"width": 1280, "height": 800})
            pg = page(ctx)
            attend(pg, d)
            gaps = {"open": [], "close": [], "resize": []}

            def watch(kind, act):
                pg.evaluate(RECORD)
                act()
                pg.wait_for_timeout(450)
                gaps[kind] += pg.evaluate("window.__pane()")

            for _ in range(reps):
                watch("close", lambda: pg.locator(".fw-panes").click())
                watch("open", lambda: pg.locator(".fw-panes").click())
                pg.locator(".zr-pane-grip").focus()
                watch("resize", lambda: pg.keyboard.press("ArrowRight"))
                pg.keyboard.press("Home")
                pg.wait_for_timeout(300)
            errors = pg.errors
            ctx.close()
            d.stop()
            return {"frame_ms": {k: stats(v) for k, v in gaps.items()}, "errors": errors}

        say("pane")
        out["pane"] = pane_bench()
        if only == "pane":
            browser.close()
            return out

        say("load")
        d = Door(bundle, 40, asset_cache=GATEWAY_ASSETS)
        cold, warm, headers = [], [], {}
        for _ in range(reps):
            ctx = browser.new_context(**PHONE)
            pg = page(ctx)
            cold.append(load_once(pg, d))
            pg.close()
            pg = page(ctx)
            warm.append(load_once(pg, d))
            ctx.close()
        for r in cold[0]["rows"]:
            headers[re.sub(HASHED, "-HASH." + r["url"].rsplit(".", 1)[-1], r["url"]) if "." in r["url"] else r["url"] or "index"] = r["cc"]
        summary = lambda rs: {k: med([r[k] for r in rs]) for k in ("fp", "fcp", "tti", "dcl", "blocking", "requests", "from_cache", "wire")}
        out["load"] = {"asset_cache_control": GATEWAY_ASSETS, "cold": summary(cold), "warm": summary(warm), "headers": headers,
                       "warm_refetched": sorted({r["url"] for w in warm for r in w["rows"] if not r["cache"] and r["status"] != 304})}
        d.stop()

        def attach_bench(turns):
            d = Door(bundle, 40, history=turns)
            times, marks = [], []
            for _ in range(reps):
                pg = page()
                pg.goto(d.url + "#/")
                until(pg, "document.querySelector('.fw') && document.querySelector('.fw').dataset.link === 'live' && document.querySelector('[data-testid=topology-row]')", 20000)
                pg.evaluate(FRAME)
                t = pg.evaluate("""(aria) => new Promise((done) => {
                  const t0 = performance.now();
                  location.hash = '#/gluck/' + aria;
                  const look = () => { if (document.querySelectorAll('.nodi-turn').length > 3) requestAnimationFrame(() => { const ch = new MessageChannel(); ch.port1.onmessage = () => done(performance.now() - t0); ch.port2.postMessage(0); }); else requestAnimationFrame(look); };
                  look();
                })""", MAIN)
                times.append(t)
                until(pg, "performance.getEntriesByName('figchat:first-frame').length > 0", 10000)
                marks.append(pg.evaluate("(() => { const m = performance.getEntriesByName('figchat:first-frame')[0]; const a = performance.getEntriesByName('figchat:attach')[0]; return m && a ? m.startTime - a.startTime : null; })()"))
                pg.context.close()
            d.stop()
            return {"turns": turns, "first_frame": stats(times), "app_mark": stats(marks)}

        say("attach")
        out["attach"] = [attach_bench(26), attach_bench(10000)]

        def typing(throttle):
            d = Door(bundle, 40)
            pg = page()
            attend(pg, d)
            pg.cdp.send("Emulation.setCPUThrottlingRate", {"rate": throttle})
            pg.locator("[data-testid=composer-input]").tap()
            keystrokes(pg, 12, 10)
            pg.evaluate("window.__bench.k2p = []; window.__bench.events = []")
            idle_rt = keystrokes(pg, keys, 10)
            idle = pg.evaluate("window.__bench.k2p.splice(0)")
            idle_slow = pg.evaluate("window.__bench.events.splice(0).length")
            pg.locator("[data-testid=composer-input]").fill("")
            d.send()
            until(pg, "document.querySelector('.fw').hasAttribute('data-running')", 10000)
            pg.locator("[data-testid=composer-input]").focus()
            busy_rt = []
            while len(busy_rt) < keys:
                if not d.status()["running"]:
                    d.send()
                busy_rt += keystrokes(pg, 10, 10)
                if len(busy_rt) % 50 == 0:
                    pg.locator("[data-testid=composer-input]").fill("")
            busy = pg.evaluate("window.__bench.k2p.splice(0)")
            busy_slow = pg.evaluate("window.__bench.events.splice(0).length")
            until(pg, "fetch('/__bench/status').then(r => r.json()).then(s => !s.running && !s.queued)", 60000)
            d.send(count=2)
            until(pg, "document.querySelector('.fw').hasAttribute('data-running')", 10000)
            m0 = metrics(pg)
            c0 = pg.evaluate("window.__bench.commits")
            pg.evaluate("window.__bench.walk = true; window.__bench.fibers = []")
            t0 = time.time()
            pg.wait_for_timeout(3000)
            span = time.time() - t0
            fibers = pg.evaluate("window.__bench.walk = false; window.__bench.fibers.splice(0)")
            where = pg.evaluate("window.__bench.where")
            m1 = metrics(pg)
            commits = pg.evaluate("window.__bench.commits") - c0
            frames = span * 1000 / 40
            pg.evaluate("window.__bench.k2p = []")
            pg.locator("[data-testid=composer-input]").fill("")
            until(pg, "fetch('/__bench/status').then(r => r.json()).then(s => !s.running && !s.queued)", 120000)
            long_series = []
            pg.context.close()
            d.stop()
            d = Door(bundle, 40, **paced(LONG_REPLY))
            pg = page()
            attend(pg, d)
            pg.cdp.send("Emulation.setCPUThrottlingRate", {"rate": throttle})
            d.send()
            until(pg, "document.querySelector('.fw').hasAttribute('data-running')", 10000)
            pg.locator("[data-testid=composer-input]").focus()
            last = (time.time(), metrics(pg))
            while d.status()["running"]:
                keystrokes(pg, 25, 10)
                pg.locator("[data-testid=composer-input]").fill("")
                now = (time.time(), metrics(pg))
                window = (now[0] - last[0]) * 1000 / 40
                long_series.append({"reply_chars": pg.evaluate("(() => { const p = document.querySelectorAll('.nodi-prose'); return p.length ? p[p.length - 1].textContent.length : 0; })()"),
                                    "task_ms_per_frame": round((now[1]["TaskDuration"] - last[1]["TaskDuration"]) * 1000 / window, 2),
                                    "script_ms_per_frame": round((now[1]["ScriptDuration"] - last[1]["ScriptDuration"]) * 1000 / window, 2),
                                    "layout_ms_per_frame": round((now[1]["LayoutDuration"] - last[1]["LayoutDuration"]) * 1000 / window, 2),
                                    "style_ms_per_frame": round((now[1]["RecalcStyleDuration"] - last[1]["RecalcStyleDuration"]) * 1000 / window, 2),
                                    "keydown_to_paint": stats(pg.evaluate("window.__bench.k2p.splice(0)"))})
                last = now
            res = {
                "cpu_throttle": throttle,
                "streaming_long": {"reply_bytes": LONG_REPLY, "chunk": CHUNK, "frame_ms": FRAME_MS, "series": long_series,
                                   "keydown_to_paint_p95_last": long_series[-1]["keydown_to_paint"]["p95"] if long_series else None,
                                   "task_ms_per_frame_last": long_series[-1]["task_ms_per_frame"] if long_series else None},
                "idle": {"keydown_to_paint": stats(idle), "roundtrip": stats(idle_rt), "keys_over_16ms": idle_slow},
                "streaming": {"keydown_to_paint": stats(busy), "roundtrip": stats(busy_rt), "keys_over_16ms": busy_slow, "frame_ms": 40},
                "stream_frame": {
                    "react_commits_per_frame": round(commits / frames, 2),
                    "script_ms_per_frame": round((m1["ScriptDuration"] - m0["ScriptDuration"]) * 1000 / frames, 2),
                    "task_ms_per_frame": round((m1["TaskDuration"] - m0["TaskDuration"]) * 1000 / frames, 2),
                    "layouts_per_frame": round((m1["LayoutCount"] - m0["LayoutCount"]) / frames, 2),
                    "style_recalcs_per_frame": round((m1["RecalcStyleCount"] - m0["RecalcStyleCount"]) / frames, 2),
                    "components_rendered_per_frame": {k: round(sum(f[k] for f in fibers) / frames, 1) for k in ("total", "settled", "live", "other", "mounted")},
                    "outside_turns_per_frame": {k: round(v / frames, 1) for k, v in sorted(where.items(), key=lambda kv: -kv[1])[:8]},
                    "components_rendered_max_commit": {k: max([f[k] for f in fibers] or [0]) for k in ("total", "settled", "live", "other", "mounted")},
                    "dom_turns": pg.evaluate("document.querySelectorAll('.nodi-turn').length"),
                },
            }
            pg.context.close()
            d.stop()
            return res

        say("input")
        out["input"] = [typing(1), typing(4)]

        def history_curve(targets):
            d = Door(bundle, 40, history=max(targets) + 50, page=24000, **paced(6000))
            pg = page()
            attend(pg, d)
            held = HELD
            rows = []
            for target in targets:
                stall = time.time() + 240
                while pg.evaluate(held) < target and time.time() < stall:
                    n = pg.evaluate(held)
                    pg.evaluate("document.querySelector('[data-testid=transcript-scroller]').scrollTop = 0")
                    try:
                        until(pg, HELD + " > %d" % n, 5000)
                    except AssertionError:
                        pg.evaluate("document.querySelector('[data-testid=transcript-scroller]').scrollTop = 200")
                    pg.wait_for_timeout(450)
                pg.evaluate("document.querySelector('[data-testid=transcript-scroller]').scrollTop = 1e9")
                pg.cdp.send("Emulation.setCPUThrottlingRate", {"rate": 4})
                d.send()
                until(pg, "document.querySelector('.fw').hasAttribute('data-running')", 10000)
                pg.wait_for_timeout(1000)
                m0 = metrics(pg)
                t0 = time.time()
                pg.wait_for_timeout(3000)
                m1 = metrics(pg)
                frames = (time.time() - t0) * 1000 / 40
                pg.locator("[data-testid=composer-input]").focus()
                pg.evaluate("window.__bench.k2p = []")
                keystrokes(pg, 40, 10)
                k = pg.evaluate("window.__bench.k2p.splice(0)")
                pg.locator("[data-testid=composer-input]").fill("")
                per = lambda key: round((m1[key] - m0[key]) * 1000 / frames, 2)
                rows.append({"turns_held": pg.evaluate(held), "dom_nodes": pg.evaluate("document.getElementsByTagName('*').length"), "task_ms_per_frame": per("TaskDuration"),
                             "script_ms_per_frame": per("ScriptDuration"), "layout_ms_per_frame": per("LayoutDuration"), "style_ms_per_frame": per("RecalcStyleDuration"),
                             "keydown_to_paint": stats(k)})
                pg.cdp.send("Emulation.setCPUThrottlingRate", {"rate": 1})
                until(pg, "fetch('/__bench/status').then(r => r.json()).then(s => !s.running)", 120000)
            pg.context.close()
            d.stop()
            return {"cpu_throttle": 4, "frame_ms": 40, "rows": rows}

        say("history")
        out["history"] = history_curve([30, 200, 600] if quick else [30, 250, 1000, 2000])

        def webkit_typing():
            wk = p.webkit.launch()
            ctx = wk.new_context(**dict(p.devices["iPhone 15"], viewport={"width": 390, "height": 844}))
            ctx.add_init_script(PROBE)
            pg = ctx.new_page()
            d = Door(bundle, 40, **paced(LONG_REPLY))
            attend(pg, d)
            pg.locator("[data-testid=composer-input]").tap()
            keystrokes(pg, 12, 10)
            pg.evaluate("window.__bench.k2p = []")
            keystrokes(pg, keys, 10)
            idle = pg.evaluate("window.__bench.k2p.splice(0)")
            pg.locator("[data-testid=composer-input]").fill("")
            d.send()
            until(pg, "document.querySelector('.fw').hasAttribute('data-running')", 10000)
            pg.locator("[data-testid=composer-input]").focus()
            n = 0
            while d.status()["running"] and n < keys:
                keystrokes(pg, 25, 10)
                pg.locator("[data-testid=composer-input]").fill("")
                n += 25
            busy = pg.evaluate("window.__bench.k2p.splice(0)")
            grows = pg.evaluate("!(CSS.supports && CSS.supports('field-sizing', 'content'))")
            ctx.close()
            wk.close()
            d.stop()
            return {"browser": "webkit", "composer_autosize_js": grows, "idle": {"keydown_to_paint": stats(idle)}, "streaming_long": {"keydown_to_paint": stats(busy), "reply_bytes": LONG_REPLY}}

        say("webkit")
        out["input_webkit"] = webkit_typing()

        say("scroll")
        d = Door(bundle, 40, history=10000)
        pg = page()
        attend(pg, d)
        sc = "document.querySelector('[data-testid=transcript-scroller]')"
        pg.evaluate("window.__bench.longtasks = []; window.__bench.rafOn()")
        box = pg.locator("[data-testid=transcript-scroller]").bounding_box()
        pg.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        end = time.time() + (4 if quick else 12)
        while time.time() < end:
            pg.mouse.wheel(0, -1200)
            pg.wait_for_timeout(16)
        frames = pg.evaluate("window.__bench.rafOff()")
        long = pg.evaluate("window.__bench.longtasks.splice(0)")
        fps = len(frames) / (sum(frames) / 1000) if frames else 0
        out["scroll"] = {"history_turns": 10000, "fps": round(fps, 1), "frame_ms": stats(frames), "frames_over_33ms": sum(1 for f in frames if f > 33.4),
                         "longtasks": len(long), "longtask_ms": round(sum(t[1] for t in long), 1), "turns_loaded": pg.evaluate(HELD),
                         "dom_nodes": pg.evaluate("document.getElementsByTagName('*').length"), "scroll_top": pg.evaluate(sc + ".scrollTop")}
        pg.context.close()
        d.stop()

        say("memory")
        d = Door(bundle, 2)
        pg = page()
        attend(pg, d)
        per = 10 if quick else 25
        rounds = 3 if quick else 8
        samples = []

        def sample():
            pg.cdp.send("HeapProfiler.collectGarbage")
            m = metrics(pg)
            st = d.status()
            samples.append({"turns": st["turns"], "heap": m["JSHeapUsedSize"], "nodes": m["Nodes"], "dom": pg.evaluate("document.getElementsByTagName('*').length"), "listeners": m["JSEventListeners"]})

        sample()
        pg.net.reset()
        first_turns = samples[0]["turns"]
        for _ in range(rounds):
            for _ in range(per):
                d.send()
                until(pg, "fetch('/__bench/status').then(r => r.json()).then(s => !s.running && !s.queued)", 120000)
            pg.evaluate(FRAME)
            sample()
        streamed = samples[-1]["turns"] - first_turns
        slope = lambda k: round((samples[-1][k] - samples[1][k]) / max(1, samples[-1]["turns"] - samples[1]["turns"]), 1)
        out["memory"] = {"turns_streamed": streamed, "heap_start": samples[0]["heap"], "heap_end": samples[-1]["heap"], "heap_per_turn": slope("heap"),
                         "dom_per_turn": slope("dom"), "nodes_per_turn": slope("nodes"), "listeners_per_turn": slope("listeners"), "samples": samples}
        out["wire"] = {"turns": streamed, "door_in_bytes_per_turn": round(pg.net.ws["in"][1] / streamed), "door_in_frames_per_turn": round(pg.net.ws["in"][0] / streamed, 1),
                       "door_out_bytes_per_turn": round(pg.net.ws["out"][1] / streamed), "door_out_frames_per_turn": round(pg.net.ws["out"][0] / streamed, 1),
                       "reply_bytes": d.status()["last_bytes"], "reply": "stream the run build please (thinking, prose, bash tool, prose)",
                       "by_kind_per_turn": {k: [round(v[0] / streamed, 1), round(v[1] / streamed)] for k, v in sorted(pg.net.kinds.items())}}
        pg.evaluate("document.querySelector('[data-testid=transcript-scroller]').scrollTop = 0")
        pg.wait_for_timeout(500)
        pg.evaluate("window.__bench.longtasks = []; window.__bench.rafOn()")
        box = pg.locator("[data-testid=transcript-scroller]").bounding_box()
        pg.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        end = time.time() + (3 if quick else 8)
        down = 1
        while time.time() < end:
            pg.mouse.wheel(0, 1500 * down)
            pg.wait_for_timeout(16)
            if pg.evaluate("(() => { const s = document.querySelector('[data-testid=transcript-scroller]'); return s.scrollTop <= 0 || s.scrollHeight - s.clientHeight - s.scrollTop < 2; })()"):
                down = -down
        frames = pg.evaluate("window.__bench.rafOff()")
        long = pg.evaluate("window.__bench.longtasks.splice(0)")
        out["scroll_dom"] = {"turns_in_dom": pg.evaluate("document.querySelectorAll('.nodi-turn').length"), "dom_nodes": pg.evaluate("document.getElementsByTagName('*').length"),
                             "fps": round(len(frames) / (sum(frames) / 1000), 1) if frames else 0, "frame_ms": stats(frames), "frames_over_33ms": sum(1 for f in frames if f > 33.4),
                             "longtasks": len(long), "longtask_ms": round(sum(t[1] for t in long), 1)}
        pg.evaluate("location.hash = '#/'")
        until(pg, "!document.querySelector('.nodi-turn')", 10000)
        pg.wait_for_timeout(500)
        pg.cdp.send("HeapProfiler.collectGarbage")
        gone = metrics(pg)
        out["memory"]["after_detach"] = {"heap": gone["JSHeapUsedSize"], "nodes": gone["Nodes"], "listeners": gone["JSEventListeners"],
                                         "retained_per_turn": round((gone["JSHeapUsedSize"] - samples[0]["heap"]) / max(1, streamed), 1)}
        errors = pg.errors
        pg.context.close()
        d.stop()
        say("session")
        turns = 100 if quick else SESSION_TURNS
        step = 25 if quick else SESSION_STEP
        d = Door(bundle, 40, fps=SESSION_FPS, bytes=SESSION_REPLY, chunk=SESSION_CHUNK)
        pg = page()
        attend(pg, d)
        points = []

        def take():
            pg.evaluate(FRAME)
            pg.cdp.send("HeapProfiler.collectGarbage")
            m = metrics(pg)
            points.append({"turns": d.status()["turns"], "heap": m["JSHeapUsedSize"], "nodes": m["Nodes"], "dom": pg.evaluate("document.getElementsByTagName('*').length"), "listeners": m["JSEventListeners"],
                           "dom_turns": pg.evaluate("document.querySelectorAll('.nodi-turn').length")})

        take()
        pg.net.reset()
        began = points[0]["turns"]
        for _ in range(turns // step):
            d.send(count=step)
            until(pg, "fetch('/__bench/status').then(r => r.json()).then(s => !s.running && !s.queued)", 300000)
            take()
        done = points[-1]["turns"] - began
        rate = lambda k: round((points[-1][k] - points[1][k]) / max(1, points[-1]["turns"] - points[1]["turns"]), 1)
        out["session"] = {"turns": done, "reply_bytes": SESSION_REPLY, "chunk": SESSION_CHUNK, "fps": SESSION_FPS, "step": step,
                          "heap_start": points[0]["heap"], "heap_end": points[-1]["heap"], "heap_per_turn": rate("heap"), "dom_per_turn": rate("dom"),
                          "nodes_per_turn": rate("nodes"), "listeners_per_turn": rate("listeners"), "dom_end": points[-1]["dom"], "listeners_end": points[-1]["listeners"],
                          "door_in_bytes_per_turn": round(pg.net.ws["in"][1] / done), "door_in_frames_per_turn": round(pg.net.ws["in"][0] / done, 1),
                          "door_out_bytes_per_turn": round(pg.net.ws["out"][1] / done), "samples": points}
        errors += pg.errors
        pg.context.close()
        d.stop()
        out["errors"] = errors
        browser.close()
    return out


def main():
    ap = argparse.ArgumentParser(description="Benchmark a figchat-shell bundle and write one result file.")
    ap.add_argument("bundle")
    ap.add_argument("--out", help="result file; default bench/results/<date>-<sha>.json")
    ap.add_argument("--sha", default=os.environ.get("BENCH_SHA", ""))
    ap.add_argument("--only", choices=["", "pane"], default="", help="run one section, for a smoke run")
    ap.add_argument("--quick", action="store_true", help="fewer reps and keys, for a smoke run")
    a = ap.parse_args()
    sha = a.sha or subprocess.run(["git", "-C", root, "rev-parse", "--short", "HEAD"], capture_output=True, text=True).stdout.strip() or "unknown"
    res = {"date": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "sha": sha, "browser": "chromium", "viewport": "390x844", "quick": a.quick}
    res.update(run(os.path.abspath(a.bundle), a.quick, a.only))
    path = a.out or os.path.join(here, "results", "%s-%s.json" % (res["date"][:10], sha))
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w") as f:
        json.dump(res, f, indent=1, sort_keys=True)
        f.write("\n")
    print(path)


if __name__ == "__main__":
    main()
