"""The web door windows @recent and @arias to the newest rows with a root `more`.

The fake door serves 20 of 43 arias. The pit's tree and recent views show one
"N older" row, tapping it pages the rest in below the window without repeating
a windowed row, and a row that ages out of the window (a fork pushes the last
one off) is still reachable as an older row instead of vanishing as reaped.
"""
import os

from kit import Door, Report, bundle_arg, until

from playwright.sync_api import sync_playwright

MAIN = "c0ffee01" * 4
SHOTS = os.environ.get("OLDER_SHOTS", "")

ROWS = """(sel) => [...document.querySelectorAll(sel)].map((r) => ({ id: r.dataset.id || null, text: r.textContent.trim(), action: r.dataset.action || null }))"""
OLDER = ".zr-pit [data-action='older']"


def open_pit(pg):
    if not pg.locator(".zr-pit[role=dialog]").count():
        pg.locator(".zr-pit-knob").focus()
        pg.keyboard.press("Enter")
    pg.wait_for_selector(".zr-pit[data-snap='half']")


def attend(pg, door, aria):
    pg.goto("about:blank")
    pg.goto(door.url + "#/gluck/" + aria)
    until(pg, "document.querySelector('.fw') && document.querySelector('.fw').dataset.link === 'live'", 15000)
    pg.wait_for_selector(".nodi-turn")
    pg.wait_for_timeout(400)


def older_ids(pg):
    return [r["id"] for r in pg.evaluate(ROWS, ".zr-pit .zr-pit-row[data-id]") if r["id"] and r["action"] != "older"]


def main():
    bundle = bundle_arg()
    rep = Report("wave1 older arias")
    door = None
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            for width, height in ((1280, 800), (390, 844)):
                if door:
                    door.stop()
                door = Door(bundle, 15, figaros=30, window=20)
                ctx = browser.new_context(viewport={"width": width, "height": height}, reduced_motion="reduce")
                pg = ctx.new_page()

                def recent():
                    attend(pg, door, MAIN)
                    open_pit(pg)
                    pg.locator("[data-action='recent']").click()
                    pg.wait_for_selector(".zr-pit-row[data-id]")
                    windowed = older_ids(pg)
                    rep.check(len(windowed) == 20, "%d recent: %d window rows, want 20" % (width, len(windowed)))
                    rep.check(pg.locator(OLDER).count() == 1, "%d recent: want one older row, got %d" % (width, pg.locator(OLDER).count()))
                    rep.check(pg.locator(OLDER).first.inner_text().strip().endswith("23 older"), "%d recent: older row says %r" % (width, pg.locator(OLDER).first.inner_text()))
                    pg.locator(OLDER).first.click()
                    until(pg, "document.querySelectorAll(\".zr-pit .zr-pit-row[data-id]\").length >= 43", 8000)
                    every = older_ids(pg)
                    rep.check(len(every) == 43, "%d recent: %d rows after older, want 43" % (width, len(every)))
                    rep.check(len(set(every)) == len(every), "%d recent: an aria is listed twice" % width)
                    rep.check(every[:20] == windowed, "%d recent: the window rows moved when the older ones came in" % width)
                    rep.check(pg.locator(OLDER).count() == 0, "%d recent: the older row stays after the last page" % width)
                    if SHOTS:
                        pg.screenshot(path=os.path.join(SHOTS, "recent-older-%d.png" % width))
                    return windowed

                windowed = None

                def run_recent():
                    nonlocal windowed
                    windowed = recent()

                rep.run("%dpx: recent pages older arias below the window" % width, run_recent)

                def ages_out():
                    attend(pg, door, MAIN)
                    open_pit(pg)
                    pg.locator("[data-action='recent']").click()
                    pg.wait_for_selector(".zr-pit-row[data-id]")
                    before = older_ids(pg)
                    pg.locator(".fw-pit-back").first.click()
                    pg.locator("[data-action='tail-fork']").click()
                    until(pg, "(() => { const m = location.hash.match(/#\\/[^/]+\\/([0-9a-f]{32})/); return m && m[1] !== '%s'; })()" % MAIN, 8000)
                    until(pg, "document.querySelector('.fw').dataset.link === 'live'", 8000)
                    pg.wait_for_timeout(800)
                    open_pit(pg)
                    pg.locator("[data-action='recent']").click()
                    pg.wait_for_selector(".zr-pit-row[data-id]")
                    pg.wait_for_timeout(500)
                    after = older_ids(pg)
                    gone = [i for i in before if i not in after]
                    rep.check(len(after) == 20 and len(gone) == 1, "%d recent: the fork should push exactly one row out of a window of 20, got %d out, %d shown" % (width, len(gone), len(after)))
                    if len(gone) != 1:
                        return
                    last = gone[0]
                    pg.locator(".fw-pit-back").first.click()
                    pg.locator("[data-action='tree']").click()
                    pg.wait_for_selector(".zr-pit .fw-topology")
                    pg.wait_for_timeout(500)
                    rep.check(pg.locator(".zr-pit .fw-topology [data-id='%s']" % last).count() == 0, "%d tree: the aged out row %s is still in the window" % (width, last[:8]))
                    until(pg, "document.querySelectorAll(\".zr-pit [data-action='older']\").length === 1", 4000)
                    older = pg.locator(OLDER)
                    rep.check(older.first.inner_text().strip().endswith("24 older"), "%d tree: older row says %r, want 24" % (width, older.first.inner_text()))
                    older.first.click()
                    until(pg, "document.querySelectorAll(\".zr-pit .zr-pit-row[data-id]\").length >= 24", 8000)
                    ids = older_ids(pg)
                    rep.check(last in ids, "%d tree: the aged out row %s is not under older: %s" % (width, last[:8], ids))
                    rep.check(len(set(ids)) == len(ids) and len(ids) == 24, "%d tree: %d older rows, want 24 without repeats" % (width, len(ids)))
                    if SHOTS:
                        pg.screenshot(path=os.path.join(SHOTS, "tree-older-%d.png" % width))

                rep.run("%dpx: a row aging out of the window is an older row, not gone" % width, ages_out)
                ctx.close()
            browser.close()
    finally:
        if door:
            door.stop()
    rep.finish()


if __name__ == "__main__":
    main()
