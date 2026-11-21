"""C3: the play icon shows on every turn that has spoken output, and only then.

Every unparked finished turn with prose has exactly one visible play icon in its
head, the same size on every turn, in the same place on the line, in normal and
hands-free mode and at both viewports. A turn with no prose has none.
"""
from kit import Door, Report, bundle_arg, until

from playwright.sync_api import sync_playwright

MAIN = "c0ffee01" * 4

FACTS = """() => [...document.querySelectorAll('.nodi-turn')].filter((t) => !t.hasAttribute('data-parked')).map((t) => {
  const icons = [...t.querySelectorAll('.nodi-turn-head .fw-play-icon')];
  const head = t.querySelector('.nodi-turn-head').getBoundingClientRect();
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
                    pg.wait_for_selector(".nodi-turn .nodi-turn-head")
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

                rep.run("play icon at %dx%d" % (width, height), run)
                ctx.close()
            browser.close()
    finally:
        door.stop()
    rep.finish()


main()
