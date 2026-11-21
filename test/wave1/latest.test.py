"""Gluck v0.33.2 bug 2: the Latest pill is easy to hit.

The pill's tap target is at least 44x44 CSS px (the painted pill may be
smaller), every point of that target hit-tests to the pill, the composer does
not cover it, and while the pit is mounted the pill is not there to be hit
under the pit. A tap on the corner of the target scrolls to the latest turn.
390x844 as a touch phone and 1280x800 with a mouse.
"""
from kit import Door, Report, bundle_arg, until

from playwright.sync_api import sync_playwright

MAIN = "c0ffee01" * 4
MIN = 44

TARGET = """() => {
  const b = document.querySelector('.zr-latest');
  if (!b) return null;
  const r = b.getBoundingClientRect();
  const hit = (x, y) => { const e = document.elementFromPoint(x, y); return !!e && (e === b || b.contains(e)); };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let y = Math.floor(r.y) - 30; y <= Math.ceil(r.bottom) + 30; y++) {
    for (let x = Math.floor(r.x) - 30; x <= Math.ceil(r.right) + 30; x++) {
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight || !hit(x + 0.5, y + 0.5)) continue;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1);
    }
  }
  const composer = document.querySelector('.zr-composer').getBoundingClientRect();
  return { pill: [r.x, r.y, r.width, r.height], box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, composerTop: composer.top, bottom: y1, right: x1, vw: innerWidth, vh: innerHeight };
}"""


def main():
    bundle = bundle_arg()
    rep = Report("wave1 latest")
    door = Door(bundle, 15)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            for width, height in ((390, 844), (1280, 800)):
                phone = width < 600
                tag = "%dx%d" % (width, height)
                ctx = browser.new_context(viewport={"width": width, "height": height}, is_mobile=phone, has_touch=phone)
                pg = ctx.new_page()

                def run():
                    pg.goto(door.url + "#/gluck/" + MAIN)
                    until(pg, "document.querySelector('.fw') && document.querySelector('.fw').dataset.link === 'live'", 15000)
                    pg.wait_for_selector(".zr-composer .zr-input")
                    pg.wait_for_timeout(800)
                    pg.locator(".zr-input").fill("make the pill appear")
                    pg.locator(".zr-send").click()
                    for _ in range(3):
                        pg.wait_for_timeout(40)
                        pg.evaluate("(() => { const r = document.querySelector('[data-zr-scroll]') || document.scrollingElement; r.scrollTop = Math.max(300, r.scrollTop - 500); })()")
                    pg.wait_for_selector(".zr-latest", timeout=15000)
                    pg.wait_for_timeout(500)
                    t = pg.evaluate(TARGET)
                    rep.note("%s pill %s target %s" % (tag, t["pill"], t["box"]))
                    rep.check(t["box"]["w"] >= MIN and t["box"]["h"] >= MIN, "%s: the tap target is at least %dx%d: %s" % (tag, MIN, MIN, t))
                    rep.check(t["bottom"] <= t["composerTop"] + 0.5, "%s: the composer does not cover the target: %s" % (tag, t))
                    rep.check(t["right"] <= t["vw"] + 0.5 and t["box"]["x"] >= -0.5, "%s: the target is on screen: %s" % (tag, t))
                    pg.locator(".zr-composer .zr-grip").focus()
                    pg.keyboard.press("Enter")
                    pg.wait_for_selector(".zr-pit[data-snap='half']")
                    pg.wait_for_timeout(500)
                    under = pg.evaluate("""() => { const b = document.querySelector('.zr-latest'); if (!b) return 'gone'; const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return e === b || b.contains(e) ? 'on top' : 'covered'; }""")
                    rep.check(under != "covered", "%s: the pit does not sit over a live pill: %s" % (tag, under))
                    pg.keyboard.press("Escape")
                    pg.wait_for_selector(".zr-pit", state="detached", timeout=3000)
                    pg.wait_for_selector(".zr-latest")
                    pg.evaluate("Promise.all(document.getAnimations().map(a => a.finished.catch(() => null)))")
                    t = pg.evaluate(TARGET)
                    corner_x, corner_y = t["box"]["x"] + 3, t["box"]["y"] + 3
                    before = pg.evaluate("(() => { const r = document.querySelector('[data-zr-scroll]') || document.scrollingElement; return r.scrollHeight - r.clientHeight - r.scrollTop; })()")
                    if phone:
                        pg.touchscreen.tap(corner_x, corner_y)
                    else:
                        pg.mouse.click(corner_x, corner_y)
                    pg.wait_for_timeout(600)
                    after = pg.evaluate("(() => { const r = document.querySelector('[data-zr-scroll]') || document.scrollingElement; return r.scrollHeight - r.clientHeight - r.scrollTop; })()")
                    rep.check(after < before and after <= 200, "%s: a tap on the target's corner jumps to the latest turn (%s from the bottom before, %s after)" % (tag, before, after))

                def position():
                    pg.goto(door.url + "#/gluck/" + MAIN)
                    until(pg, "document.querySelector('.fw') && document.querySelector('.fw').dataset.link === 'live'", 15000)
                    pg.wait_for_selector(".zr-composer .zr-input")
                    pg.wait_for_timeout(800)
                    away = "(() => { const r = document.querySelector('[data-zr-scroll]') || document.scrollingElement; return r.scrollHeight - r.clientHeight - r.scrollTop; })()"
                    rep.check(pg.locator(".zr-latest").count() == 0, "%s: no pill at the bottom" % tag)
                    for gap in (40, 80):
                        pg.evaluate("((g) => { const r = document.querySelector('[data-zr-scroll]') || document.scrollingElement; r.scrollTop = r.scrollHeight - r.clientHeight - g; })(%d)" % gap)
                        pg.wait_for_timeout(300)
                        rep.check(pg.locator(".zr-latest").count() == 0, "%s: no pill within the last few lines (%d px up, at %s)" % (tag, gap, pg.evaluate(away)))
                    pg.evaluate("(() => { const r = document.querySelector('[data-zr-scroll]') || document.scrollingElement; r.scrollTop = r.scrollHeight - r.clientHeight - 400; })()")
                    pg.wait_for_selector(".zr-latest", timeout=3000)
                    alpha = pg.evaluate("(() => { const c = getComputedStyle(document.querySelector('.zr-latest')).backgroundColor; const m = c.match(/[\\d.]+/g).map(Number); return m.length > 3 ? m[3] : 1; })()")
                    rep.check(alpha < 0.7, "%s: the pill is clearly semi-transparent (alpha %s)" % (tag, alpha))
                    over = pg.evaluate("""(() => {
                      const b = document.querySelector('.zr-latest').getBoundingClientRect();
                      const hit = [];
                      for (const c of document.querySelectorAll('.nodi-turn [data-action], .fw-fork-here, .nodi-turn button, .nodi-turn summary')) {
                        const r = c.getBoundingClientRect();
                        if (r.width && r.height && r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top) hit.push(c.className);
                      }
                      return { centre: (b.left + b.right) / 2 / innerWidth, hit };
                    })()""")
                    rep.check(abs(over["centre"] - 0.5) < 0.05, "%s: the pill sits in the middle, clear of the controls at the edges: %s" % (tag, over))
                    rep.check(not over["hit"], "%s: the pill covers no turn control: %s" % (tag, over))
                    pg.evaluate("(() => { const r = document.querySelector('[data-zr-scroll]') || document.scrollingElement; r.scrollTop = r.scrollHeight - r.clientHeight - 20; })()")
                    pg.wait_for_timeout(300)
                    rep.check(pg.locator(".zr-latest").count() == 0, "%s: the pill goes when the view is back near the bottom" % tag)

                rep.run("latest at %s" % tag, run)
                rep.run("latest follows position at %s" % tag, position)
                ctx.close()
            browser.close()
    finally:
        door.stop()
    rep.finish()


main()
