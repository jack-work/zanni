"""The asks pit lists the figchat-orders form: one row per ask, sorted by stage then
oldest filed, each with owner, stage, age and the time spent in every stage it has
reached, and it follows the form live. Checked at a phone and a desktop width against
the real form shape (fixtures/orders.json) with the clock held at 2026-11-23 21:30 EST,
without horizontal overflow.
"""
import datetime
import json
import os

from kit import FIXTURES, Door, Report, bundle_arg, fixture, until

from playwright.sync_api import sync_playwright

MAIN = "c0ffee01" * 4
SHOTS = os.environ.get("FIGCHAT_SHOTS", "")
STAGES = ["filed", "lane", "ready", "cut", "live", "validated"]
NOW_MS = int(datetime.datetime.fromisoformat("2026-11-23T21:30:00-05:00").timestamp() * 1000)

FREEZE = """(() => {
  const fixed = %d;
  const Real = Date;
  class Frozen extends Real {
    constructor(...a) { if (a.length) super(...a); else super(fixed); }
    static now() { return fixed; }
  }
  window.Date = Frozen;
})();""" % NOW_MS

ROWS = """() => [...document.querySelectorAll('.fw-ask')].map((r) => ({
  id: r.dataset.id,
  stage: r.querySelector('.fw-ask-stage').textContent.replace(/[ ·]/g, ''),
  age: r.querySelector('.zr-pit-row-meta').textContent,
  spans: r.querySelector('.fw-ask-spans').textContent,
  open: r.getAttribute('aria-expanded'),
}))"""

FIT = """() => {
  const pit = document.querySelector('.zr-pit').getBoundingClientRect();
  const body = document.querySelector('.zr-pit-body');
  const out = [];
  for (const r of document.querySelectorAll('.fw-ask, .fw-ask-detail')) {
    const b = r.getBoundingClientRect();
    if (b.left < pit.left - 1 || b.right > pit.right + 1) out.push(r.dataset.id || 'detail');
  }
  return { rows: out, page: document.documentElement.scrollWidth - document.documentElement.clientWidth, body: body.scrollWidth - body.clientWidth };
}"""


def expected_ids(orders):
    def key(item):
        o = item[1]
        return (STAGES.index(o["state"]), datetime.datetime.fromisoformat(o["stages"]["filed"]).timestamp(), item[0])

    return [k for k, _ in sorted(orders.items(), key=key)]


def main():
    bundle = bundle_arg()
    rep = Report("wave1 asks pit")
    orders = fixture("orders.json")
    want = expected_ids(orders["orders"])
    door = Door(bundle, 15, orders=os.path.join(FIXTURES, "orders.json"))
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()

            def at(width, height, mobile):
                opts = {"viewport": {"width": width, "height": height}}
                if mobile:
                    opts.update(is_mobile=True, has_touch=True)
                ctx = browser.new_context(**opts)
                ctx.add_init_script(FREEZE)
                pg = ctx.new_page()
                pg.goto(door.url + "#/gluck/" + MAIN)
                until(pg, "document.querySelector('.fw') && document.querySelector('.fw').dataset.link === 'live'", 15000)
                pg.wait_for_selector(".zr-composer .zr-grip")
                pg.locator(".zr-composer .zr-grip").focus()
                pg.keyboard.press("Enter")
                pg.wait_for_selector(".zr-pit[data-snap='half']")
                return ctx, pg

            def snap(pg, name):
                if SHOTS:
                    os.makedirs(SHOTS, exist_ok=True)
                    pg.screenshot(path=os.path.join(SHOTS, name + ".png"))

            def run(width, height, mobile):
                ctx, pg = at(width, height, mobile)
                try:
                    until(pg, "!!document.querySelector('[data-action=asks] .zr-pit-row-meta') || !!document.querySelector('[data-action=asks]')", 5000)
                    meta = pg.locator("[data-action=asks] .zr-pit-row-meta").inner_text()
                    rep.check(meta == str(len(want)), "%d: the Asks row counts the asks: %r" % (width, meta))
                    pg.locator("[data-action=asks]").click()
                    pg.wait_for_selector(".fw-ask")
                    until(pg, "document.querySelectorAll('.fw-ask').length === %d" % len(want), 5000)
                    rows = pg.evaluate(ROWS)
                    rep.check([r["id"] for r in rows] == want, "%d: the rows are sorted by stage then oldest filed: %s" % (width, [r["id"] for r in rows][:6]))
                    rep.check(all(r["stage"] == orders["orders"][r["id"]]["state"] for r in rows), "%d: each row names the stage it has reached" % width)
                    row = next(r for r in rows if r["id"] == "compose-full-width")
                    rep.check(row["age"] == "asked 2d 10h ago", "%d: age since filed: %r" % (width, row["age"]))
                    rep.check(
                        row["spans"] == "waited 10m for lane · in lane 1d 13h · in ready 24m · in cut 11h 41m · in live 8h 35m",
                        "%d: time in each stage: %r" % (width, row["spans"]),
                    )
                    bad = next(r for r in rows if r["id"] == "backups")
                    rep.check(bad["spans"].startswith("waited <1m for lane"), "%d: a back-filled stamp before its predecessor reads as no time: %r" % (width, bad["spans"]))
                    pg.locator(".zr-pit-handle").focus()
                    pg.keyboard.press("ArrowUp")
                    pg.wait_for_selector(".zr-pit[data-snap='full']")
                    pg.wait_for_timeout(500)
                    fit = pg.evaluate(FIT)
                    rep.check(not fit["rows"] and fit["page"] <= 0 and fit["body"] <= 0, "%d: nothing overflows: %s" % (width, fit))
                    snap(pg, "asks-list-%d" % width)
                    first = pg.locator(".fw-ask").first
                    first.click()
                    pg.wait_for_selector(".fw-ask-detail")
                    rep.check(first.get_attribute("aria-expanded") == "true", "%d: a tap opens the row" % width)
                    full = orders["orders"][want[0]]["text"]
                    got = pg.locator(".fw-ask-detail").first.inner_text()
                    rep.check(full in got.replace("\n", " ") or full[:60] in got, "%d: the expanded row carries the full text" % width)
                    fit = pg.evaluate(FIT)
                    rep.check(not fit["rows"] and fit["page"] <= 0 and fit["body"] <= 0, "%d: nothing overflows while a row is open: %s" % (width, fit))
                    snap(pg, "asks-open-%d" % width)
                    first.click()
                    pg.wait_for_selector(".fw-ask-detail", state="detached")
                finally:
                    ctx.close()

            def live():
                ctx, pg = at(390, 844, True)
                try:
                    pg.locator("[data-action=asks]").click()
                    until(pg, "document.querySelectorAll('.fw-ask').length === %d" % len(want), 5000)
                    moved = json.loads(json.dumps(orders))
                    o = moved["orders"]["backups"]
                    o["stages"]["ready"] = "2026-11-23T21:00:00-05:00"
                    o["state"] = "ready"
                    door.set_orders(moved)
                    until(pg, "document.querySelector('.fw-ask[data-id=backups] .fw-ask-stage').textContent.includes('ready')", 5000)
                    ids = pg.evaluate(ROWS)
                    got = [r["id"] for r in ids]
                    rep.check(got == expected_ids(moved["orders"]), "a stage moved in the form moves the row: %s" % got[-5:])
                    rep.check(got.index("backups") > got.index("hands-free-autoplay"), "the moved ask sorts past the lane asks")
                finally:
                    ctx.close()

            rep.run("390 wide", lambda: run(390, 844, True))
            rep.run("1280 wide", lambda: run(1280, 800, False))
            rep.run("the pit follows the form", live)
            browser.close()
    finally:
        door.stop()
    rep.finish()


main()
