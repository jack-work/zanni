"""C3: the play icon shows on every turn that has spoken output, and only then.

Every unparked finished turn with prose has exactly one visible play icon in its
head, the same size on every turn, in the same place on the line, in normal and
hands-free mode and at both viewports. A turn with no prose has none.
"""
from kit import Door, Report, bundle_arg, until

from playwright.sync_api import sync_playwright

MAIN = "c0ffee01" * 4

FACTS = """() => [...document.querySelectorAll('.nodi-turn')].filter((t) => !t.hasAttribute('data-parked')).map((t) => {
  const icons = [...t.querySelectorAll('.zr-sticky-bar .fw-play-icon')];
  const head = t.querySelector('.zr-sticky-bar').getBoundingClientRect();
  const b = icons[0] && icons[0].getBoundingClientRect();
  return { turn: t.dataset.turn, state: t.dataset.state, prose: t.querySelectorAll('.nodi-prose').length, icons: icons.length,
           shown: !!b && b.width > 0 && b.height > 0 && getComputedStyle(icons[0]).visibility !== 'hidden',
           w: b && Math.round(b.width), h: b && Math.round(b.height), mid: b && Math.round(b.y + b.height / 2 - head.y) };
})"""


def main():
    bundle = bundle_arg()
    rep = Report("wave1 play icon")
    door = Door(bundle, 15)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            for width, height in ((390, 844), (1280, 800)):
                ctx = browser.new_context(viewport={"width": width, "height": height}, is_mobile=width < 600, has_touch=width < 600)
                pg = ctx.new_page()

                def run():
                    pg.goto(door.url + "#/gluck/" + MAIN)
                    until(pg, "document.querySelector('.fw') && document.querySelector('.fw').dataset.link === 'live'", 15000)
                    pg.wait_for_selector(".nodi-turn .zr-sticky-bar")
                    pg.wait_for_timeout(800)
                    for mode in ("normal", "hands-free"):
                        if mode == "hands-free":
                            pg.locator(".fw-hands").click()
                            pg.wait_for_timeout(400)
                        facts = pg.evaluate(FACTS)
                        rep.check(len(facts) >= 2, "%s %s: turns are drawn" % (width, mode))
                        for f in facts:
                            want = 1 if f["state"] == "done" and f["prose"] else 0
                            rep.check(f["icons"] == want, "%s %s turn %s: %d play icons, want %d: %s" % (width, mode, f["turn"], f["icons"], want, f))
                            if want:
                                rep.check(f["shown"], "%s %s turn %s: the icon is visible: %s" % (width, mode, f["turn"], f))
                        sized = {(f["w"], f["h"], f["mid"]) for f in facts if f["icons"]}
                        rep.check(len(sized) == 1, "%s %s: every icon has the same size and place: %s" % (width, mode, sized))

                def three():
                    nonlocal pg
                    ctx.add_init_script("window.__plays = []; const p = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { window.__plays.push(this.src.split('/').slice(-2).join('/').split('?')[0]); return p.call(this); };")
                    pg = ctx.new_page()
                    pg.goto(door.url + "#/gluck/" + MAIN)
                    until(pg, "document.querySelector('.fw') && document.querySelector('.fw').dataset.link === 'live'", 15000)
                    pg.wait_for_selector(".nodi-turn[data-turn='26'] .zr-sticky-bar")
                    pg.wait_for_timeout(800)
                    t = ".nodi-turn[data-turn='26']"
                    rep.check(pg.locator(t + " [data-action='play']").count() == 3, "%d: three play buttons on a turn with an inquiry and output (got %d)" % (width, pg.locator(t + " [data-action='play']").count()))
                    labels = pg.evaluate("[...document.querySelectorAll(\"%s [data-action='play']\")].map((b) => [b.getAttribute('aria-label'), b.textContent.trim()])" % t)
                    rep.check(labels == [["Play inquiry and reply", "▸"], ["Play your message", "▸"], ["Play reply", "▸"]], "%d: top, under the inquiry, under the output, unlabelled but for aria: %s" % (width, labels))
                    sizes = pg.evaluate("""(() => {
                      const out = [];
                      for (const b of document.querySelectorAll("%s [data-action='play']")) {
                        const r = b.getBoundingClientRect();
                        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
                        for (let y = Math.floor(r.y) - 20; y <= r.bottom + 20; y++) for (let x = Math.floor(r.x) - 20; x <= r.right + 20; x++) {
                          const e = document.elementFromPoint(x + 0.5, y + 0.5);
                          if (e && (e === b || b.contains(e))) { x0 = Math.min(x0, x); x1 = Math.max(x1, x + 1); y0 = Math.min(y0, y); y1 = Math.max(y1, y + 1); }
                        }
                        const cs = getComputedStyle(b); const ink = b.querySelector('.zr-ink'); out.push({ w: r.width, h: r.height, outer: r.height + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom), glyph: ink ? parseFloat(getComputedStyle(ink).fontSize) : 0, hitW: x1 - x0, hitH: y1 - y0 });
                      }
                      return out;
                    })()""" % t)
                    for z in sizes:
                        rep.check(z["glyph"] <= 28 and z["outer"] <= 36, "%d: a play button is compact: glyph %spx, takes %spx of height" % (width, z["glyph"], z["outer"]))
                        rep.check(z["w"] >= 44 and z["h"] >= 44, "%d: its tap area is generous, %sx%s" % (width, z["w"], z["h"]))
                    pg.locator(t + " .zr-sticky-bar [data-action='play']").click()
                    pg.wait_for_timeout(4000)
                    plays = pg.evaluate("window.__plays")
                    rep.check(len(plays) >= 2 and plays[0].endswith("/in") and plays[1].endswith("/out"), "%d: the top button plays the inquiry, then the output: %s" % (width, plays))
                    pg.evaluate("window.__plays.length = 0")
                    pg.locator(t + " .fw-output-play [data-action='play']").click()
                    pg.wait_for_timeout(1500)
                    plays = pg.evaluate("window.__plays")
                    rep.check(len(plays) == 1 and plays[0].endswith("/out"), "%d: the button under the output plays only the output: %s" % (width, plays))

                rep.run("play icon at %dx%d" % (width, height), run)
                rep.run("three play buttons at %dx%d" % (width, height), three)
                ctx.close()
            browser.close()
    finally:
        door.stop()
    rep.finish()


main()
