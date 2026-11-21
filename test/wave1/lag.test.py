"""Bug 5, typing lag: keydown to paint while a reply streams.

200 keystrokes typed into the composer while the fake door streams a long
reply in 40 ms frames. Latency per key: performance.now() at keydown (capture
phase on window) to the first task after the next animation frame that
follows the input event, which runs after that frame's paint. Also counted:
long tasks, and how often the composer re-renders, read from React's devtools
hook (a commit where the Composer fiber's hook list is new is one render).
Bar: p95 under 50 ms while streaming.
"""
import json
import os

from kit import Door, Report, bundle_arg, until

from playwright.sync_api import sync_playwright

MAIN = "c0ffee01" * 4
KEYS = 200
BAR_MS = 50.0

PROBE = """
(() => {
  const lat = [];
  const pending = [];
  let down = 0;
  window.addEventListener('keydown', (e) => { if (e.key.length === 1) pending.push(performance.now()); }, true);
  document.addEventListener('input', (e) => {
    if (!e.target.classList || !e.target.classList.contains('zr-input')) return;
    const t0 = pending.shift();
    if (t0 === undefined) return;
    requestAnimationFrame(() => {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => lat.push(performance.now() - t0);
      ch.port2.postMessage(0);
    });
  }, true);
  const longs = [];
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) longs.push({ at: e.startTime, ms: e.duration }); }).observe({ type: 'longtask', buffered: true });
  } catch (e) {}
  const events = [];
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'keydown' || e.name === 'keypress' || e.name === 'input') events.push({ name: e.name, ms: e.duration, at: e.startTime }); }).observe({ type: 'event', durationThreshold: 16, buffered: true });
  } catch (e) {}
  const renders = { commits: 0, composer: 0, last: null, why: {}, lastProps: null, lastOuter: null };
  const owner = (f) => { for (let x = f.return; x; x = x.return) if (x.tag === 0 || x.tag === 11 || x.tag === 15) return x; return null; };
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    renderers: new Map(),
    inject(r) { const id = this.renderers.size + 1; this.renderers.set(id, r); return id; },
    onCommitFiberRoot(id, root) {
      renders.commits++;
      const form = document.querySelector('form.zr-composer');
      if (!form) return;
      let f = null;
      const stack = [root.current];
      while (stack.length) {
        const x = stack.pop();
        if (x.stateNode === form && x.tag === 5) { f = x; break; }
        if (x.sibling) stack.push(x.sibling);
        if (x.child) stack.push(x.child);
      }
      if (!f) return;
      const comp = owner(f);
      if (!comp) return;
      const outer = owner(comp);
      if (renders.last !== null && comp.memoizedState !== renders.last) {
        renders.composer++;
        const op = outer && outer.memoizedProps, lp = renders.lastProps;
        let why = 'own state or atoms';
        if (op && lp) {
          const changed = Object.keys(op).filter((k) => op[k] !== lp[k]);
          if (changed.length) why = 'props: ' + changed.join(',');
          else if (outer.memoizedState !== renders.lastOuter) why = 'outer composer state or atoms';
        }
        renders.why[why] = (renders.why[why] || 0) + 1;
      }
      renders.last = comp.memoizedState;
      renders.lastProps = outer && outer.memoizedProps;
      renders.lastOuter = outer && outer.memoizedState;
    },
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    checkDCE() {},
  };
  window.__lag = { lat, longs, events, renders, pending };
})();
"""


def pct(xs, q):
    if not xs:
        return None
    s = sorted(xs)
    return s[min(len(s) - 1, int(round(q * (len(s) - 1))))]


def main():
    bundle = bundle_arg()
    rep = Report("wave1 typing lag")
    door = Door(bundle, 40)
    results = {}
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            ctx = browser.new_context(viewport={"width": 1280, "height": 800})
            ctx.add_init_script(PROBE)
            pg = ctx.new_page()
            rate = float(os.environ.get("WAVE1_CPU_THROTTLE", "6"))
            if rate > 1:
                ctx.new_cdp_session(pg).send("Emulation.setCPUThrottlingRate", {"rate": rate})
            rep.note("cpu throttle %gx (Chromium CDP), a phone-class main thread" % rate)

            def session(streaming):
                pg.goto(door.url + "#/gluck/" + MAIN)
                until(pg, "document.querySelector('.fw') && document.querySelector('.fw').dataset.link === 'live'", 15000)
                pg.wait_for_selector(".zr-composer .zr-input")
                pg.wait_for_timeout(1000)
                if streaming:
                    pg.locator(".zr-input").fill("[long] stream something long")
                    pg.keyboard.press("Enter")
                    until(pg, "document.querySelector('.nodi-turn[data-state=\"open\"], .nodi-turn[data-state=\"running\"]') !== null || document.querySelector('.fw-status').dataset.state === 'running'", 8000)
                    pg.wait_for_timeout(800)
                pg.locator(".zr-input").click()
                pg.evaluate("() => { __lag.lat.length = 0; __lag.longs.length = 0; __lag.events.length = 0; __lag.renders.composer = 0; __lag.renders.commits = 0; __lag.renders.why = {}; __lag.t0 = performance.now(); }")
                text = ("the quick brown fox jumps over the lazy dog " * 6)[:KEYS]
                pg.keyboard.type(text, delay=25)
                pg.wait_for_timeout(300)
                still = pg.evaluate("document.querySelector('.fw-status') && document.querySelector('.fw-status').dataset.state")
                got = pg.evaluate("() => ({ lat: __lag.lat.slice(), longs: __lag.longs.filter(l => l.at >= __lag.t0), events: __lag.events.filter(e => e.at >= __lag.t0), renders: { commits: __lag.renders.commits, composer: __lag.renders.composer, why: __lag.renders.why }, span: performance.now() - __lag.t0 })")
                lat = got["lat"]
                frames = round(got["span"] / 40.0) if streaming else 0
                r = {
                    "keys": len(lat),
                    "p50": pct(lat, 0.5), "p95": pct(lat, 0.95), "max": max(lat) if lat else None,
                    "long_tasks": len(got["longs"]), "long_ms": round(sum(l["ms"] for l in got["longs"]), 1),
                    "slow_events": len(got["events"]),
                    "commits": got["renders"]["commits"], "composer_renders": got["renders"]["composer"], "composer_why": got["renders"]["why"],
                    "stream_frames_est": frames, "still_running_at_end": still,
                }
                results["streaming" if streaming else "idle"] = r
                rep.note(("streaming " if streaming else "idle ") + json.dumps(r))
                rep.check(len(lat) >= KEYS * 0.95, "%s: measured %d of %d keys" % ("streaming" if streaming else "idle", len(lat), KEYS))
                if streaming:
                    rep.check(still == "running", "the reply was still streaming when the last key landed (state %r)" % still)
                return r

            rep.run("idle baseline", lambda: session(False))

            def streaming():
                r = session(True)
                rep.check(r["p95"] is not None and r["p95"] < BAR_MS, "p95 keydown-to-paint while streaming is %.1f ms, bar %.0f ms" % (r["p95"] or -1, BAR_MS))
                rep.check(r["composer_renders"] <= r["keys"] + 5, "the composer re-rendered %d times for %d keys while streaming (stream frames re-render it)" % (r["composer_renders"], r["keys"]))

            rep.run("while a reply streams in 40 ms frames", streaming)
            browser.close()
    finally:
        door.stop()
    out = os.environ.get("WAVE1_LAG_OUT")
    if out:
        with open(out, "w") as fh:
            json.dump(results, fh, indent=1)
    rep.finish()


main()
