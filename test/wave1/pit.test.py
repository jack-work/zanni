"""Fuzz bug 3: the pit never keeps data-dragging or a stale height after a gesture.

Every way a gesture can end clears it: a cancelled touch right after the drag
starts (the browser took the pointer), a pointer released far from the grip,
and the pit closed by Escape while a finger is still down. After each, the pit
is not dragging, --zr-pit-h agrees with the snap (absent when closed), and the
next drag from the grip works.
"""
from kit import Door, Report, bundle_arg, until

from playwright.sync_api import sync_playwright

MAIN = "c0ffee01" * 4

FACTS = """() => {
  const p = document.querySelector('.zr-pit');
  return { open: !!p, snap: p && p.dataset.snap, dragging: !!p && p.hasAttribute('data-dragging'),
           h: document.documentElement.style.getPropertyValue('--zr-pit-h'), px: p ? Math.round(p.getBoundingClientRect().height) : 0 };
}"""


def main():
    bundle = bundle_arg()
    rep = Report("wave1 pit gestures")
    door = Door(bundle, 15)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
            pg = ctx.new_page()
            cdp = ctx.new_cdp_session(pg)

            def touch(kind, y=0, x=195):
                pts = [] if kind in ("touchEnd", "touchCancel") else [{"x": x, "y": y}]
                cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": pts})

            def settled(what):
                pg.wait_for_timeout(700)
                f = pg.evaluate(FACTS)
                rep.check(not f["dragging"], "%s: the pit is still dragging: %s" % (what, f))
                if f["open"] and f["snap"] != "closed":
                    rep.check(f["h"].endswith("px") and abs(int(f["h"][:-2]) - f["px"]) <= 2, "%s: --zr-pit-h %s disagrees with the pit %s" % (what, f["h"], f))
                else:
                    rep.check(f["h"] in ("", "0px"), "%s: the pit is closed but --zr-pit-h is %r" % (what, f["h"]))
                return f

            def grip_centre():
                b = pg.locator(".zr-composer .zr-grip").bounding_box()
                return b["x"] + b["width"] / 2, b["y"] + b["height"] / 2

            def run():
                pg.goto(door.url + "#/gluck/" + MAIN)
                until(pg, "document.querySelector('.fw') && document.querySelector('.fw').dataset.link === 'live'", 15000)
                pg.wait_for_selector(".zr-composer .zr-grip")
                pg.wait_for_timeout(600)
                x, y = grip_centre()
                touch("touchStart", y, x)
                touch("touchMove", y - 20, x)
                touch("touchMove", y - 60, x)
                touch("touchCancel")
                settled("touch cancelled just past the slop")

                x, y = grip_centre()
                touch("touchStart", y, x)
                for i in range(1, 9):
                    touch("touchMove", y - 40 * i, x)
                    pg.wait_for_timeout(20)
                touch("touchCancel")
                settled("touch cancelled mid drag")

                x, y = grip_centre()
                touch("touchStart", y, x)
                for i in range(1, 9):
                    touch("touchMove", y - 50 * i, x)
                    pg.wait_for_timeout(30)
                pg.wait_for_timeout(200)
                touch("touchEnd")
                f = settled("an ordinary drag after the cancels")
                rep.check(f["open"] and f["snap"] in ("half", "full"), "the next drag opens the pit: %s" % f)

                pg.keyboard.press("Escape")
                pg.wait_for_selector(".zr-pit", state="detached", timeout=3000)

            def same_frame():
                pg.goto(door.url + "#/gluck/" + MAIN)
                until(pg, "document.querySelector('.fw') && document.querySelector('.fw').dataset.link === 'live'", 15000)
                pg.wait_for_selector(".zr-composer .zr-grip")
                pg.wait_for_timeout(600)
                x, y = grip_centre()
                pg.mouse.move(x, y)
                pg.evaluate(
                    """([x, y]) => {
                      const grip = document.querySelector('.zr-composer .zr-grip');
                      const fire = (type, dy) => grip.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', button: 0, bubbles: true, cancelable: true, clientX: x, clientY: y + dy }));
                      fire('pointerdown', 0);
                      fire('pointermove', -30);
                      fire('pointermove', -60);
                      window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, pointerType: 'mouse', bubbles: true }));
                    }""",
                    [x, y],
                )
                settled("a pointer cancelled in the frame the drag began")

            rep.run("pit gestures end clean", run)
            ctx.close()
            ctx = browser.new_context(viewport={"width": 1280, "height": 800})
            pg = ctx.new_page()
            rep.run("a cancel in the frame a drag begins", same_frame)
            ctx.close()
            browser.close()
    finally:
        door.stop()
    rep.finish()


main()
