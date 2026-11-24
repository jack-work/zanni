"""Hands-free autoplay (Gluck 11-20): with hands-free on a newly arrived reply plays by itself and
announces itself with the ping; replies that arrive back to back play in order; a reply that arrives while the
microphone is recording is held, then plays with the ping when the recording stops. With voice off no reply
is synthesised until a turn's Play is pressed. Chromium and WebKit with the iPhone profile (the recording case
needs the fake microphone and runs in Chromium only; headless WebKit exposes no audio sources, so there it asserts that a player takes the reply unasked, or does not)."""
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


def sources(events):
    return [e for e in events if e["ev"] == "src.start"]


PING_S = 0.16


def ping_times(events):
    return [e["w"] for e in sources_of(events) if abs(e["dur"] - PING_S) < 0.003]


def sources_of(events):
    return [e for e in events if e["ev"] == "src.start"]


def turn_start(events, turn):
    return next((e["w"] for e in events if e["ev"] == "state" and e.get("turn") == str(turn) and e["state"] in ("live", "draining")), None)


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
                    for _ in range(4):
                        pg.evaluate("document.querySelector('.fw-hands').scrollIntoView({ block: 'center' })")
                        pg.wait_for_timeout(1500)
                        pg.locator(".fw-hands").click()
                        if pg.locator(".fw-hands[aria-pressed='true']").count():
                            break
                    else:
                        pg.screenshot(path="/tmp/hands-free-%s-pressed.png" % engine)
                        raise AssertionError("the hands-free button never took the tap")
                    pg.wait_for_selector(".fw-hands[aria-pressed='true']", timeout=5000)
                try:
                    work(pg, door)
                except Exception:
                    try:
                        pg.screenshot(path="/tmp/hands-free-%s.png" % engine)
                    except Exception:
                        pass
                    raise
                events = pg.evaluate("window.__au")
                says = door.state()["says"]
                mounted = pg.evaluate("[...document.querySelectorAll('.voce')].map(v => v.dataset.for).filter(Boolean)")
                ctx.close()
                return events, says, mounted

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
                pg.locator(".fw-mic").click()
                until(pg, "document.querySelector('.fw').dataset.mic === 'recording'", 15000)
                say(pg, "just a [plain] hello")
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
                    events, _, mounted = session(engine, one, True)
                    rep.check("27" in mounted, "%s one: a player took the reply with no tap (%s)" % (engine, mounted))
                    if engine == "webkit":
                        return
                    rep.check(len(sources(events)) >= 5, "%s one: the reply played with no tap (%d sources)" % (engine, len(sources(events))))
                    ps, at = ping_times(events), turn_start(events, 27)
                    rep.check(len(ps) >= 1, "%s one: the arrival ping sounded" % engine)
                    rep.check(at is not None, "%s one: turn 27 went live by itself" % engine)
                    if ps and at:
                        rep.check(ps[0] <= at + 50, "%s one: the ping comes with the reply, not after it" % engine)

                def check_two(engine=engine):
                    events, _, mounted = session(engine, two, True)
                    rep.check("27" in mounted and "28" in mounted, "%s two: both replies got a player (%s)" % (engine, mounted))
                    if engine == "webkit":
                        return
                    a27, a28 = turn_start(events, 27), turn_start(events, 28)
                    rep.check(a27 is not None and a28 is not None and a27 < a28, "%s two: both replies played, in arrival order (%s, %s)" % (engine, a27, a28))
                    rep.check(len(ping_times(events)) >= 1, "%s two: an arrival pinged (%d)" % (engine, len(ping_times(events))))

                def check_silent(engine=engine):
                    events, says, mounted = session(engine, silent, False)
                    rep.check("27" not in mounted, "%s voice off: no player took the reply (%s)" % (engine, mounted))
                    rep.check(not sources(events), "%s voice off: nothing played by itself" % engine)
                    rep.check(says == [], "%s voice off: no reply was synthesised before a tap: %s" % (engine, says))

                def check_play(engine=engine):
                    def press(pg, door):
                        say(pg, "just a [plain] hello")
                        until(pg, "(() => { const t = document.querySelector(\".nodi-turn[data-turn='27']\"); return !!t && t.dataset.state !== 'open'; })()", 40000)
                        pg.wait_for_timeout(800)
                        rep.check(door.state()["says"] == [], "%s voice off: nothing synthesised before the tap: %s" % (engine, door.state()["says"]))
                        pg.locator(".nodi-turn[data-turn='27'] .fw-output-play [data-action='play']").click()
                        pg.wait_for_selector(".nodi-turn[data-turn='27'] .voce[data-state='idle']", timeout=30000)
                    events, says, mounted = session(engine, press, False)
                    if engine == "webkit":
                        rep.check("27" in mounted and says == [], "%s voice off: Play mounted a player on the stored copy, no synthesis (%s, %s)" % (engine, mounted, says))
                        return
                    plays = [e for e in events if e["ev"] == "media.play"] + sources(events)
                    rep.check(len(plays) >= 1, "%s voice off: Play on a turn played it (%d starts)" % (engine, len(plays)))
                    rep.check(says == [], "%s voice off: a turn with a stored copy plays it, no synthesis: %s" % (engine, says))

                rep.run(engine + ": hands-free reply autoplays with the ping", check_one)
                rep.run(engine + ": back-to-back replies play in order", check_two)
                rep.run(engine + ": voice off, nothing is synthesised unasked", check_silent)
                rep.run(engine + ": voice off, Play plays the stored copy", check_play)

            def check_held():
                events, _, mounted = session("chromium", held, True)
                rep.check(len(sources(events)) >= 5, "chromium held: the held reply played after the recording stopped (%d sources)" % len(sources(events)))
                ps, at = ping_times(events), turn_start(events, 27)
                rep.check(len(ps) >= 1 and at is not None and ps[-1] <= at + 200, "chromium held: ping, then the reply (%s, %s)" % (ps, at))

            rep.run("chromium: a reply during recording is held, then pings and plays", check_held)
            for browser, _ in engines.values():
                browser.close()
    finally:
        for d in doors:
            d.stop()
    rep.finish()


main()
