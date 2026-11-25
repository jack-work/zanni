"""The root opens a fresh figaro made with the landing outfit, with the pit half open on the tree."""
import re

from kit import Door, Report, bundle_arg, until

from playwright.sync_api import sync_playwright


def main():
    bundle = bundle_arg()
    rep = Report("wave1 landing")
    door = Door(bundle, 15)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            for width, height in ((1280, 800), (390, 844)):
                pg = browser.new_page(viewport={"width": width, "height": height})
                frames = []
                pg.on("websocket", lambda ws: ws.on("framesent", lambda f: frames.append(f if isinstance(f, str) else f.get("payload", ""))))

                def lands():
                    pg.goto(door.url)
                    until(pg, "/^#\\/gluck\\/[0-9a-f]{32}$/.test(location.hash)", 10000)
                    pg.wait_for_selector(".zr-pit[data-snap='half'] .zr-tree-row", timeout=10000)
                    made = [f for f in frames if "figaro.create" in f]
                    rep.check(len(made) == 1 and '"outfits":["landing"]' in made[0].replace(" ", ""), "%dpx: one figaro.create with the landing outfit: %s" % (width, made))
                    rep.check(not any("figaro.fork" in f for f in frames), "%dpx: nothing was forked" % width)
                    rep.check(pg.locator(".zr-pit .zr-pit-row[data-action='tree']").count() == 0, "%dpx: the pit shows the tree, not the controls" % width)

                rep.run("%dpx: the bare root lands on a fresh figaro with the tree" % width, lands)

                def stays():
                    before = len([f for f in frames if "figaro.create" in f])
                    pg.goto(door.url + "#/")
                    pg.reload()
                    pg.wait_for_selector(".zr-pit-knob", timeout=10000)
                    rep.check(re.search(r"#/$", pg.url) is not None, "%dpx: an explicit #/ stays the list: %s" % (width, pg.url))
                    rep.check(len([f for f in frames if "figaro.create" in f]) == before, "%dpx: and creates nothing" % width)

                rep.run("%dpx: #/ is still the list" % width, stays)
                pg.close()
            browser.close()
    finally:
        door.stop()
    rep.finish()


main()
