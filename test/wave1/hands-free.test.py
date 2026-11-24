"""Hands-free autoplay (Gluck 11-20): with hands-free on a newly arrived reply plays by itself and
announces itself with the ping; replies that arrive back to back play in order; a reply that arrives while the
microphone is recording is held, then plays with the ping when the recording stops. With voice off no reply
is synthesised until a turn's Play is pressed. Chromium and WebKit with the iPhone profile (the recording case
needs the fake microphone and runs in Chromium only)."""
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


PING_MAX_S = 0.3


def sources(events):
    return [e for e in events if e["ev"] == "src.start"]


def pings(events):
    return [e for e in sources(events) if e["dur"] < PING_MAX_S]


def replies(events):
    return [e for e in sources(events) if e["dur"] >= PING_MAX_S]


def main():
    bundle = bundle_arg()
    rep = Report("wave1 hands-free autoplay")
    doors = []
    try:
        with sync_playwright() as p:
            engines = {
                "chromium": (p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"]), {"viewport": {"width": 1280, "height": 800}, "permissions": ["microphone"]}),
                "webkit": (p.webkit.launch(), {"viewport": {"width": 390, "height": 844}, "is_mobile": True, "has_touch": True}),
            }

            def session(engine, work, hands):
                browser, opts = engines[engine]
                door = Door(bundle, 15)
                doors.append(door)
                ctx = browser.new_context(**opts)
                ctx.add_init_script(INSTRUMENT)
                pg = ctx.new_page()
                pg.set_default_timeout(20000)
                pg.goto(door.url + "#/gluck/" + MAIN)
                until(pg, "document.querySelector('.fw') && document.querySelector('.fw').dataset.link === 'live'", 15000)
                pg.wait_for_selector(".zr-composer .zr-input")
                pg.wait_for_timeout(800)
                if hands:
                    pg.locator(".fw-hands").click()
                    pg.wait_for_selector(".fw-hands[aria-pressed='true']")
                work(pg, door)
                events = pg.evaluate("window.__au")
                says = door.state()["says"]
                ctx.close()
                return events, says

            def say(pg, text):
                pg.locator(".zr-input").fill(text)
                pg.locator(".zr-send").click()

            def one(pg, door):
                say(pg, "just a [plain] hello")
                pg.wait_for_selector(".nodi-turn[data-turn='27'] .voce[data-state='idle']", timeout=40000)

            def two(pg, door):
                say(pg, "just a [plain] hello one")
                pg.wait_for_timeout(250)
                say(pg, "just a [plain] hello two")
                pg.wait_for_selector(".nodi-turn[data-turn='28'] .voce[data-state='idle']", timeout=60000)

            def held(pg, door):
                say(pg, "just a [plain] hello")
                pg.locator(".fw-mic").click()
                until(pg, "document.querySelector('.fw').dataset.audio === 'recording-with-pending'", 20000)
                pg.wait_for_timeout(1500)
                rep.check(not sources(pg.evaluate("window.__au")), "chromium held: nothing plays while recording")
                pg.locator(".fw-mic").click()
                pg.wait_for_selector(".nodi-turn[data-turn='27'] .voce[data-state='idle']", timeout=40000)

            def silent(pg, door):
                say(pg, "just a [plain] hello")
                until(pg, "(() => { const t = document.querySelector(\".nodi-turn[data-turn='27']\"); return !!t && t.dataset.state !== 'open'; })()", 40000)
                pg.wait_for_timeout(1000)

            for engine in ("chromium", "webkit"):
                def check_one(engine=engine):
                    events, _ = session(engine, one, True)
                    ps, rs = pings(events), replies(events)
                    rep.check(len(rs) >= 5, "%s one: the reply played with no tap (%d sources)" % (engine, len(rs)))
                    rep.check(len(ps) >= 1, "%s one: the arrival ping sounded" % engine)
                    if ps and rs:
                        rep.check(ps[0]["w"] <= rs[0]["w"], "%s one: the ping comes before the reply" % engine)

                def check_two(engine=engine):
                    events, _ = session(engine, two, True)
                    spans = {}
                    for e in events:
                        if e["ev"] == "state" and e["state"] in ("draining", "live"):
                            spans.setdefault(e["turn"], e["w"])
                    order = [t for t, _ in sorted(spans.items(), key=lambda kv: kv[1])]
                    rep.check(order[-2:] == ["27", "28"], "%s two: both replies played, in arrival order: %s" % (engine, order))
                    src = sorted(replies(events), key=lambda e: e["at"])
                    over = [(a["at"], b["at"]) for a, b in zip(src, src[1:]) if b["at"] < a["at"] + a["dur"] - 0.005]
                    rep.check(not over, "%s two: no overlap: %s" % (engine, over[:3]))

                def check_silent(engine=engine):
                    events, says = session(engine, silent, False)
                    rep.check(not sources(events), "%s voice off: nothing played by itself" % engine)
                    rep.check(says == [], "%s voice off: no reply was synthesised before a tap: %s" % (engine, says))

                def check_play(engine=engine):
                    def press(pg, door):
                        pg.locator(".nodi-turn[data-turn='26'] .fw-output-play [data-action='play']").click()
                        pg.wait_for_selector(".nodi-turn[data-turn='26'] .voce[data-state='idle']", timeout=30000)
                    events, says = session(engine, press, False)
                    rep.check(says.count(26) == 1, "%s voice off: Play synthesised the turn once, on press: %s" % (engine, says))

                rep.run(engine + ": hands-free reply autoplays with the ping", check_one)
                rep.run(engine + ": back-to-back replies play in order", check_two)
                rep.run(engine + ": voice off, nothing is synthesised unasked", check_silent)
                rep.run(engine + ": voice off, Play synthesises on press", check_play)

            def check_held():
                events, _ = session("chromium", held, True)
                rs = replies(events)
                rep.check(len(rs) >= 5, "chromium held: the held reply played after the recording stopped (%d sources)" % len(rs))
                ps = pings(events)
                rep.check(len(ps) >= 1, "chromium held: the ping sounded when it was released")
                if rs and ps:
                    rep.check(ps[-1]["w"] <= rs[0]["w"] + 50, "chromium held: ping, then the reply")

            rep.run("chromium: a reply during recording is held, then pings and plays", check_held)
            for browser, _ in engines.values():
                browser.close()
    finally:
        for d in doors:
            d.stop()
    rep.finish()


main()
