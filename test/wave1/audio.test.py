"""Gluck v0.33.2 bug 3: audio playback is gapless, never cuts itself off, and queues.

Instrumented in Chromium: every AudioBufferSource start and stop is logged with
its scheduled time, every media element play and pause, every player state.
  paced   a stream delivered a little faster than real time with jitter and
          hiccups (gateway frames re-timed in the page): no audible gap
  clip    a live reply arriving while a stored clip plays waits behind it, the
          clip is never paused mid-play
  queue   three replies in a row play one at a time, in order, no overlap
  stop    stopping a live reply silences every scheduled source
"""
import json
import math
import struct

from kit import Door, Report, bundle_arg, until

from playwright.sync_api import sync_playwright

MAIN = "c0ffee01" * 4

INSTRUMENT = """
(() => {
  window.__au = [];
  const log = (o) => window.__au.push(Object.assign({ w: Math.round(performance.now()) }, o));
  const origSrc = AudioContext.prototype.createBufferSource;
  AudioContext.prototype.createBufferSource = function () {
    const s = origSrc.call(this);
    const ctx = this;
    const start = s.start.bind(s), stop = s.stop.bind(s);
    s.start = (when) => { log({ ev: 'src.start', at: when, now: ctx.currentTime, dur: s.buffer.duration }); return start(when); };
    s.stop = () => { log({ ev: 'src.stop', now: ctx.currentTime }); return stop(); };
    return s;
  };
  const P = HTMLMediaElement.prototype;
  const play = P.play, pause = P.pause;
  P.play = function () { log({ ev: 'media.play' }); return play.call(this); };
  P.pause = function () { log({ ev: 'media.pause', ended: this.ended }); return pause.call(this); };
  new MutationObserver(() => {
    for (const v of document.querySelectorAll('.voce')) {
      if (v.__seen !== v.dataset.state) { v.__seen = v.dataset.state; log({ ev: 'state', turn: v.dataset.for, state: v.dataset.state }); }
    }
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-state'], childList: true });
})();
"""

PACE = """
(() => {
  const Real = window.WebSocket;
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  window.WebSocket = class extends EventTarget {
    constructor(url, protocols) {
      super();
      if (!/\\/audio\\//.test(String(url))) return new Real(url, protocols);
      this._ws = new Real(url, protocols);
      this._q = [];
      this._busy = false;
      this._n = 0;
      for (const t of ['open', 'close', 'error']) this._ws.addEventListener(t, () => this.dispatchEvent(new Event(t)));
      this._ws.addEventListener('message', (e) => { this._q.push(e.data); this._pump(); });
    }
    _pump() {
      if (this._busy) return;
      const data = this._q.shift();
      if (data === undefined) return;
      this._busy = true;
      let delay = 0;
      if (typeof data !== 'string') {
        this._n++;
        delay = this._n === 1 ? 400 : 100 / 1.3 + (rnd() * 2 - 1) * 60 + (this._n % 10 === 0 ? 200 : 0);
      }
      setTimeout(() => { this.dispatchEvent(new MessageEvent('message', { data })); this._busy = false; this._pump(); }, Math.max(0, delay));
    }
    get readyState() { return this._ws.readyState; }
    get binaryType() { return this._ws.binaryType; }
    set binaryType(v) { this._ws.binaryType = v; }
    send(d) { return this._ws.send(d); }
    close(a, b) { return this._ws.close(a, b); }
    get url() { return this._ws.url; }
  };
  for (const k of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) window.WebSocket[k] = Real[k];
})();
"""


def clip(seconds):
    n = int(24000 * seconds)
    pcm = b"".join(struct.pack("<h", int(8000 * math.sin(2 * math.pi * 300 * i / 24000))) for i in range(n))
    return b"RIFF" + struct.pack("<I", 36 + len(pcm)) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, 24000, 48000, 2, 16) + b"data" + struct.pack("<I", len(pcm)) + pcm


def silences(events):
    src = sorted((e for e in events if e["ev"] == "src.start"), key=lambda e: e["w"])
    out, prev_end = [], None
    for e in src:
        if prev_end is not None and e["at"] - prev_end > 0.01:
            out.append(round(e["at"] - prev_end, 3))
        prev_end = e["at"] + e["dur"]
    return out, len(src)


def main():
    bundle = bundle_arg()
    rep = Report("wave1 audio")
    doors = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])

            def session(pace, work):
                door = Door(bundle, 15)
                doors.append(door)
                ctx = browser.new_context(viewport={"width": 1280, "height": 800})
                ctx.add_init_script(INSTRUMENT)
                if pace:
                    ctx.add_init_script(PACE)
                pg = ctx.new_page()
                pg.goto(door.url + "#/gluck/" + MAIN)
                until(pg, "document.querySelector('.fw') && document.querySelector('.fw').dataset.link === 'live'", 15000)
                pg.wait_for_selector(".zr-composer .zr-input")
                pg.wait_for_timeout(800)
                pg.locator(".zr-composer .zr-grip").focus()
                pg.keyboard.press("Enter")
                pg.wait_for_selector(".zr-pit[data-snap='half']")
                pg.locator(".fw-voice").click()
                pg.keyboard.press("Escape")
                pg.wait_for_selector(".zr-pit", state="detached")
                pg.wait_for_timeout(400)
                work(pg)
                events = pg.evaluate("window.__au")
                ctx.close()
                return events

            def say(pg, text):
                pg.locator(".zr-input").fill(text)
                pg.locator(".zr-send").click()

            def paced(pg):
                say(pg, "just a [plain] hello")
                pg.wait_for_selector(".voce[data-state='idle']", timeout=20000)

            def check_paced():
                events = session(True, paced)
                gaps, n = silences(events)
                rep.note("paced: %d chunks, gaps %s" % (n, gaps))
                rep.check(n >= 20, "paced: the reply was played live (%d chunks)" % n)
                rep.check(not gaps, "paced: a stream a little faster than real time with hiccups plays without a gap, got %s" % gaps)

            def clipped(pg):
                wav = clip(6)
                pg.route("**/audio/key/**", lambda r: r.fulfill(status=200, body=wav, headers={"Content-Type": "audio/wav", "Accept-Ranges": "bytes"}))
                pg.locator(".nodi-turn[data-turn='26'] .fw-output-play [data-action='play']").click()
                pg.wait_for_selector(".nodi-turn[data-turn='26'] .voce[data-state='playing']", timeout=5000)
                pg.wait_for_timeout(300)
                say(pg, "just a [plain] hello")
                try:
                    pg.wait_for_selector(".nodi-turn[data-turn='27'] .voce", timeout=15000)
                except Exception:
                    print(pg.evaluate("window.__au.slice(-12)"), pg.evaluate("[...document.querySelectorAll('.nodi-turn')].map(n => n.dataset.turn + ':' + n.dataset.state).slice(-4)"), pg.evaluate("document.querySelector('.fw').dataset.audio"))
                    raise
                pg.wait_for_selector(".nodi-turn[data-turn='27'] .voce[data-state='idle']", timeout=30000)

            def check_clip():
                events = session(False, clipped)
                pauses = [e for e in events if e["ev"] == "media.pause" and not e["ended"]]
                rep.check(not pauses, "clip: a live reply never pauses the stored clip that is playing: %s" % pauses)
                end = next((e["w"] for e in events if e["ev"] == "state" and e["turn"] == "26" and e["state"] == "idle"), None)
                first = next((e["w"] for e in events if e["ev"] == "src.start"), None)
                rep.check(end is not None and first is not None and first >= end - 100, "clip: the reply starts after the clip ends (clip idle at %s, first source at %s)" % (end, first))

            def queued(pg):
                for i in range(3):
                    say(pg, "just a [plain] hello %d" % i)
                    pg.wait_for_timeout(250)
                pg.wait_for_selector(".nodi-turn[data-turn='29'] .voce[data-state='idle']", timeout=40000)

            def check_queue():
                events = session(False, queued)
                spans = {}
                for e in events:
                    if e["ev"] == "state" and e["state"] in ("draining", "live"):
                        spans.setdefault(e["turn"], e["w"])
                order = [t for t, _ in sorted(spans.items(), key=lambda kv: kv[1])]
                rep.check(order == sorted(order), "queue: replies play in arrival order: %s" % order)
                src = sorted((e for e in events if e["ev"] == "src.start"), key=lambda e: e["at"])
                over = [(a["at"], b["at"]) for a, b in zip(src, src[1:]) if b["at"] < a["at"] + a["dur"] - 0.005]
                rep.check(not over, "queue: no two sources overlap: %s" % over[:3])
                rep.check(not [e for e in events if e["ev"] == "src.stop"], "queue: nothing is stopped mid-reply")

            def stopped(pg):
                say(pg, "just a [plain] hello")
                pg.wait_for_selector(".voce[data-state='live'], .voce[data-state='draining']", timeout=15000)
                pg.wait_for_timeout(300)
                pg.locator(".voce .voce-play").first.click()
                pg.wait_for_timeout(1200)

            def check_stop():
                events = session(False, stopped)
                starts = [e for e in events if e["ev"] == "src.start"]
                stops = [e for e in events if e["ev"] == "src.stop"]
                rep.check(starts and stops, "stop: the reply played and was stopped (%d started, %d stopped)" % (len(starts), len(stops)))
                if stops:
                    at = stops[0]["now"]
                    pending = [e for e in starts if e["at"] + e["dur"] > at + 0.001]
                    rep.check(len(stops) >= len(pending), "stop: every source still scheduled is stopped (%d pending, %d stopped)" % (len(pending), len(stops)))
                    last_stop = max(e["w"] for e in stops)
                    rep.check(not [e for e in starts if e["w"] > last_stop], "stop: nothing is scheduled after the stop")

            rep.run("gapless paced stream", check_paced)
            rep.run("stored clip is not cut off by a live reply", check_clip)
            rep.run("replies queue in order", check_queue)
            rep.run("stop silences everything", check_stop)
            browser.close()
    finally:
        for d in doors:
            d.stop()
    rep.finish()


main()
