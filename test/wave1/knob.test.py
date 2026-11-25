"""v0.33.2 bug 1, as the drawer has it now: one tab, riding the drawer's top border.

The composer is the drawer's head, so there is no second grip to float over
the pit. At closed, mid-drag, half, full and while closing, the tab's bar sits
on the drawer's top edge and nothing covers the tab. Chromium as a phone with
touch and at 1280x800 with a mouse, which drags by the tab because a mouse
drag over the field selects text.
"""
from kit import Door, Report, bundle_arg, until

from playwright.sync_api import sync_playwright

MAIN = "c0ffee01" * 4

STATE = """() => {
  const g = document.querySelector('.zr-pit-knob');
  const bar = g.querySelector('.zr-pit-knob-bar').getBoundingClientRect();
  const p = document.querySelector('.zr-pit');
  const gb = g.getBoundingClientRect();
  const hit = (x, y) => { const e = document.elementFromPoint(x, y); return !!e && (e === g || g.contains(e)); };
  const points = [[0.5, 0.5], [0.1, 0.5], [0.9, 0.5], [0.5, 0.1], [0.5, 0.9]].map(([a, b]) => hit(gb.x + gb.width * a, gb.y + gb.height * b));
  return { snap: p.dataset.snap, dragging: p.hasAttribute('data-dragging'), pitTop: p.getBoundingClientRect().top, barMid: bar.top + bar.height / 2, tabHit: points.every(Boolean), onScreen: gb.bottom <= innerHeight && gb.top >= 0 };
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
                    rep.check(abs(st["barMid"] - st["pitTop"]) <= 2, "%s %s: the tab's bar rides the drawer's top border: %s" % (tag, what, st))
                    if st["onScreen"]:
                        rep.check(st["tabHit"], "%s %s: something covers the tab: %s" % (tag, what, st))
                    return st

                def run():
                    pg.goto(door.url + "#/gluck/" + MAIN)
                    until(pg, "document.querySelector('.fw') && document.querySelector('.fw').dataset.link === 'live'", 15000)
                    pg.wait_for_selector(".zr-pit-knob")
                    pg.wait_for_timeout(600)
                    seen("closed")
                    f = finger(pg, cdp, phone)
                    gx, gy = centre(pg.locator(".zr-composer .zr-input" if phone else ".zr-pit-knob"))
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
                    hx, hy = centre(pg.locator(".zr-composer .zr-input" if phone else ".zr-pit-knob"))
                    f.down(hx, hy)
                    f.move(height * 0.05)
                    seen("drag toward full")
                    f.hold()
                    f.up()
                    until(pg, "(() => { const p = document.querySelector('.zr-pit'); return !!p && p.dataset.snap === 'full' && !p.hasAttribute('data-dragging'); })()", 4000)
                    pg.evaluate("Promise.all(document.getAnimations().map(a => a.finished.catch(() => null)))")
                    seen("full")
                    pg.keyboard.press("Escape")
                    pg.wait_for_timeout(120)
                    if pg.locator(".zr-pit[role=dialog]").count():
                        seen("closing")
                    pg.wait_for_selector(".zr-pit[role=dialog]", state="detached", timeout=3000)
                    seen("closed again")

                rep.run("knob at %s" % tag, run)
                ctx.close()
            browser.close()
    finally:
        door.stop()
    rep.finish()


main()
