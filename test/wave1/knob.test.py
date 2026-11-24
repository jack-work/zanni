"""v0.33.2 bug 1: the grip above the composer never floats over the pit.

While the pit is open or being dragged, the composer's grip is hidden and the
pit's own handle rides with it. At closed, mid-drag, half, full and while
closing, no point of the composer grip hit-tests to anything but the pit or the
page behind, and the pit's handle is the visible knob. Chromium as a phone
with touch and at 1280x800 with a mouse.
"""
from kit import Door, Report, bundle_arg, until

from playwright.sync_api import sync_playwright

MAIN = "c0ffee01" * 4

STATE = """() => {
  const g = document.querySelector('.zr-composer .zr-grip');
  const p = document.querySelector('.zr-pit');
  const gb = g.getBoundingClientRect();
  const hit = (x, y) => { const e = document.elementFromPoint(x, y); return !!e && (e === g || g.contains(e)); };
  const points = [[0.5, 0.5], [0.1, 0.5], [0.9, 0.5], [0.5, 0.1], [0.5, 0.9]].map(([a, b]) => hit(gb.x + gb.width * a, gb.y + gb.height * b));
  const handle = p && p.querySelector('.zr-pit-handle');
  const hb = handle && handle.getBoundingClientRect();
  return {
    pit: !!p, snap: p && p.dataset.snap, closing: !!p && p.dataset.snap === 'closed' && !p.hasAttribute('data-dragging'), dragging: !!p && p.hasAttribute('data-dragging'),
    pitTop: p ? p.getBoundingClientRect().top : null,
    gripVisibility: getComputedStyle(g).visibility, gripHit: points.some(Boolean),
    gripShown: getComputedStyle(g).visibility !== 'hidden',
    handleTop: hb ? hb.top : null, handleShown: !!handle && getComputedStyle(handle).visibility !== 'hidden',
  };
}"""


def finger(pg, cdp, phone):
    class Finger:
        def down(self, x, y):
            self.x, self.y = x, y
            if phone:
                cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y}]})
            else:
                pg.mouse.move(x, y)
                pg.mouse.down()

        def move(self, y, steps=8):
            y0 = self.y
            for i in range(1, steps + 1):
                yy = y0 + (y - y0) * i / steps
                if phone:
                    cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": self.x, "y": yy}]})
                else:
                    pg.mouse.move(self.x, yy)
                pg.wait_for_timeout(30)
            self.y = y

        def hold(self, ms=160):
            pg.wait_for_timeout(ms)

        def up(self):
            if phone:
                cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
            else:
                pg.mouse.up()

    return Finger()


def centre(loc):
    b = loc.bounding_box()
    return b["x"] + b["width"] / 2, b["y"] + b["height"] / 2


def main():
    bundle = bundle_arg()
    rep = Report("wave1 knob")
    door = Door(bundle, 15)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            for width, height in ((390, 844), (1280, 800)):
                phone = width < 600
                ctx = browser.new_context(viewport={"width": width, "height": height}, is_mobile=phone, has_touch=phone)
                pg = ctx.new_page()
                cdp = ctx.new_cdp_session(pg)
                tag = "%dx%d" % (width, height)

                def seen(what):
                    st = pg.evaluate(STATE)
                    if st["pit"]:
                        gone = st["closing"] and st["pitTop"] is not None and st["pitTop"] >= height - 4
                        rep.check(gone or not st["gripHit"], "%s %s: the composer grip is hit-testable over the pit: %s" % (tag, what, st))
                        if not st["closing"]:
                            rep.check(not st["gripShown"], "%s %s: the composer grip is hidden while the pit owns the gesture: %s" % (tag, what, st))
                        rep.check(st["handleShown"], "%s %s: the pit's own handle is the knob: %s" % (tag, what, st))
                    else:
                        rep.check(st["gripShown"], "%s %s: with the pit shut the grip shows: %s" % (tag, what, st))
                    return st

                def run():
                    pg.goto(door.url + "#/gluck/" + MAIN)
                    until(pg, "document.querySelector('.fw') && document.querySelector('.fw').dataset.link === 'live'", 15000)
                    pg.wait_for_selector(".zr-composer .zr-grip")
                    pg.wait_for_timeout(600)
                    seen("closed")
                    f = finger(pg, cdp, phone)
                    gx, gy = centre(pg.locator(".zr-composer .zr-grip"))
                    f.down(gx, gy)
                    f.move(gy - 12, steps=3)
                    seen("just past the slop of the drag")
                    f.move(height * 0.5)
                    seen("mid drag")
                    f.hold()
                    f.up()
                    until(pg, "(() => { const p = document.querySelector('.zr-pit'); return !!p && p.dataset.snap === 'half' && !p.hasAttribute('data-dragging'); })()", 4000)
                    pg.evaluate("Promise.all(document.getAnimations().map(a => a.finished.catch(() => null)))")
                    seen("half")
                    hx, hy = centre(pg.locator(".zr-pit-handle"))
                    f.down(hx, hy)
                    f.move(height * 0.05)
                    seen("handle drag toward full")
                    f.hold()
                    f.up()
                    until(pg, "(() => { const p = document.querySelector('.zr-pit'); return !!p && p.dataset.snap === 'full' && !p.hasAttribute('data-dragging'); })()", 4000)
                    pg.evaluate("Promise.all(document.getAnimations().map(a => a.finished.catch(() => null)))")
                    seen("full")
                    pg.keyboard.press("Escape")
                    pg.wait_for_timeout(120)
                    if pg.locator(".zr-pit").count():
                        seen("closing")
                    pg.wait_for_selector(".zr-pit", state="detached", timeout=3000)
                    seen("closed again")

                rep.run("knob at %s" % tag, run)
                ctx.close()
            browser.close()
    finally:
        door.stop()
    rep.finish()


main()
