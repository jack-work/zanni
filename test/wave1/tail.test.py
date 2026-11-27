"""A tab that sat a while comes back to the tail, and the transcript drops what is far above the reader.

Three cases at 390 and 1280: (away) the door drops, 120 turns happen while the page waits, the door
returns, and the page holds only the newest turns, at the bottom, having read a handful of pages, not
all of them; older turns come back on demand and join up; (stream) a pinned reader streaming 150 turns
never holds more than a bounded window; (still) a reader in the middle of a long history sees nothing
move when the turns far above are dropped, and Latest still reaches the end.
"""
import os
import time

from kit import Door, Report, bundle_arg, until

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
PRELOAD = os.path.join(os.path.dirname(os.path.dirname(HERE)), "bench", "door.js")
SHOTS = os.environ.get("TAIL_SHOTS", "")
MAIN = "c0ffee01" * 4
HELD = "Number(document.querySelector('.nodi-turns').dataset.held)"
SC = "document.querySelector('[data-zr-scroll]')"
STREAM = dict(fps=200, bytes=3000, chunk=150)
KEEP_ABOVE = 24
EVICT_BATCH = 24
CATCH_UP_PAGES = 4
LINK = "document.querySelector('.fw') && document.querySelector('.fw').dataset.link"


def reads(door):
    return len([c for c in door.state()["calls"] if c == "figaro.read"])


def attend(pg, door):
    pg.goto("about:blank")
    pg.goto(door.url + "#/gluck/" + MAIN)
    until(pg, LINK + " === 'live'", 30000)
    until(pg, "document.querySelectorAll('.nodi-turn').length > 3", 30000)
    pg.wait_for_timeout(600)


def idle(door, timeout=120):
    end = time.time() + timeout
    while time.time() < end:
        s = door.get("/__bench/status")
        if not s["running"] and not s["queued"]:
            return s
        time.sleep(0.25)
    raise AssertionError("the door never went idle")


def numbers(pg):
    return pg.evaluate("[...document.querySelectorAll('.nodi-turn')].map(t => Number(t.dataset.turn))")


def main():
    bundle = bundle_arg()
    rep = Report("wave1 tail")
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for width, height in ((390, 844), (1280, 800)):
            phone = width < 600
            options = dict(viewport={"width": width, "height": height}, is_mobile=phone, has_touch=phone)

            def away():
                door = Door(bundle, 40, preload=PRELOAD, **STREAM)
                try:
                    pg = browser.new_context(**options).new_page()
                    attend(pg, door)
                    before = reads(door)
                    door.get("/__bench/hold?on=1")
                    door.get("/__drop")
                    until(pg, LINK + " !== 'live'", 15000)
                    door.get("/__bench/send?count=120")
                    s = idle(door)
                    door.get("/__bench/hold?on=0")
                    until(pg, LINK + " === 'live'", 60000)
                    pg.wait_for_timeout(2500)
                    spent = reads(door) - before
                    held = pg.evaluate(HELD)
                    rep.check(s["turns"] >= 140, "%d away: the door has %d turns" % (width, s["turns"]))
                    rep.check(spent <= CATCH_UP_PAGES + 8, "%d away: %d reads to come back after 120 turns, want at most %d" % (width, spent, CATCH_UP_PAGES + 8))
                    rep.check(held <= 12, "%d away: holds %d turns after the return, want only the tail" % (width, held))
                    last = numbers(pg)[-1]
                    rep.check(last == s["turns"], "%d away: the newest turn on screen is %s, the door has %s" % (width, last, s["turns"]))
                    gap = pg.evaluate("%s.scrollHeight - %s.clientHeight - %s.scrollTop" % (SC, SC, SC))
                    rep.check(gap <= 2, "%d away: %.0f px from the bottom after the return" % (width, gap))
                    rep.check(pg.locator(".fw-older").count() == 1, "%d away: the Earlier turns button is offered" % width)
                    if SHOTS:
                        pg.screenshot(path=os.path.join(SHOTS, "tail-away-%d.png" % width))
                    pg.evaluate(SC + ".scrollTop = 0")
                    until(pg, HELD + " > %d" % held, 15000)
                    pg.wait_for_timeout(500)
                    ns = numbers(pg)
                    rep.check(all(b == a + 1 for a, b in zip(ns, ns[1:])), "%d away: older turns joined up as %s" % (width, ns))
                    rep.check(pg.evaluate(HELD) > held, "%d away: scrolling up loaded older turns on demand" % width)
                    pg.context.close()
                finally:
                    door.stop()

            rep.run("%d: a tab that was away reads the tail, not every page" % width, away)

            def stream():
                door = Door(bundle, 40, preload=PRELOAD, **STREAM)
                try:
                    pg = browser.new_context(**options).new_page()
                    attend(pg, door)
                    door.get("/__bench/send?count=150")
                    s = idle(door)
                    pg.wait_for_timeout(1500)
                    held = pg.evaluate(HELD)
                    limit = KEEP_ABOVE + EVICT_BATCH + 12
                    rep.check(held <= limit, "%d stream: holds %d of %d turns, want at most %d" % (width, held, s["turns"], limit))
                    rep.check(numbers(pg)[-1] == s["turns"], "%d stream: the newest turn is on screen" % width)
                    rep.check(pg.evaluate("%s.scrollHeight - %s.clientHeight - %s.scrollTop" % (SC, SC, SC)) <= 2, "%d stream: still at the bottom" % width)
                    pg.context.close()
                finally:
                    door.stop()

            rep.run("%d: a pinned reader holds a bounded window while turns stream in" % width, stream)

            def still():
                door = Door(bundle, 40, preload=PRELOAD, history=600, page=24000, **STREAM)
                try:
                    pg = browser.new_context(**options).new_page()
                    attend(pg, door)
                    for _ in range(200):
                        if pg.evaluate(HELD) >= 120:
                            break
                        pg.evaluate(SC + ".scrollTop = 0")
                        pg.wait_for_timeout(300)
                    full = pg.evaluate(HELD)
                    rep.check(full >= 120, "%d still: loaded only %d turns" % (width, full))
                    pg.wait_for_timeout(800)
                    pg.evaluate("window.__still = []")
                    pg.evaluate("""() => {
                      const sc = document.querySelector('[data-zr-scroll]');
                      sc.scrollTop = (sc.scrollHeight - sc.clientHeight) * 0.7;
                      const edge = sc.getBoundingClientRect().top;
                      let id = null;
                      const rows = window.__still;
                      const tick = () => {
                        const held = Number(document.querySelector('.nodi-turns').dataset.held);
                        if (id === null) {
                          const n = [...document.querySelectorAll('.nodi-turn')].find((t) => { const y = t.getBoundingClientRect().top; return y > edge + 20 && y < edge + sc.clientHeight - 100; });
                          if (n) id = n.dataset.turn;
                        }
                        const at = id === null ? null : document.querySelector('.nodi-turn[data-turn="' + id + '"]');
                        rows.push([held, at ? at.getBoundingClientRect().top : null]);
                        if (rows.length < 90) requestAnimationFrame(tick);
                      };
                      requestAnimationFrame(tick);
                    }""")
                    pg.wait_for_timeout(2500)
                    rows = pg.evaluate("window.__still")
                    held = [r[0] for r in rows]
                    tops = [r[1] for r in rows if r[1] is not None]
                    rep.check(min(held) < max(held) - 20, "%d still: the far turns were dropped (%s to %s)" % (width, max(held), min(held)))
                    rep.check(bool(tops) and max(tops) - min(tops) <= 1.5, "%d still: the turn under the reader moved %.1f px while the far turns went" % (width, (max(tops) - min(tops)) if tops else -1))
                    if SHOTS:
                        pg.screenshot(path=os.path.join(SHOTS, "tail-still-%d.png" % width))
                    pg.locator(".zr-latest").click()
                    until(pg, "%s.scrollHeight - %s.clientHeight - %s.scrollTop <= 2" % (SC, SC, SC), 15000)
                    rep.check(pg.locator(".zr-latest").count() == 0, "%d still: Latest took the reader to the end after the far turns were dropped" % width)
                    pg.context.close()
                finally:
                    door.stop()

            rep.run("%d: the reader in the middle sees nothing move when the far turns are dropped" % width, still)
        browser.close()
    rep.finish()


main()
