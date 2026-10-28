"""proscenio in a real browser, row by row against docs/proscenio.md: the wide
order, the narrow fold and its closing rules, search, hide on scroll with
keel's tap guards, drawers on three sides with the Tab-only trap, Escape's
order and the composer's own Escape, the tv mode, slots moved not cloned, and
a hidden header left alone."""
import os
import sys

from playwright.sync_api import sync_playwright

PAGE = "file://" + os.path.abspath(sys.argv[1])


def css(pg, name):
    return pg.evaluate(f"getComputedStyle(document.documentElement).getPropertyValue('{name}').trim()")


def x(pg, sel):
    return pg.evaluate(f"document.querySelector('{sel}').getBoundingClientRect().left")


def shown(pg, sel):
    return pg.evaluate(f"!!document.querySelector('{sel}').getClientRects().length && getComputedStyle(document.querySelector('{sel}')).visibility !== 'hidden'")


def logged(pg, name):
    return pg.evaluate(f"log.filter(e => e[0] === '{name}').map(e => e[1])")


def scroll(pg, y):
    pg.evaluate(f"window.scrollTo(0, {y})")
    pg.wait_for_timeout(80)


with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    errors = []

    wide = b.new_page(viewport={"width": 1280, "height": 700})
    wide.on("pageerror", lambda e: errors.append(str(e)))
    wide.goto(PAGE)
    order = ["#t-tree", "[data-slot=mark]", "#crumbs", "[data-slot=nav]", "#q", "#live", "#ref", "#cast", "#t-pane"]
    xs = [x(wide, s) for s in order]
    assert xs == sorted(xs), f"wide order is fixed by the component: {list(zip(order, xs))}"
    assert not shown(wide, ".proscenio-more"), "no fold on wide screens"
    assert css(wide, "--proscenio-pad") == "0px" and css(wide, "--proscenio-shown") == "0px"
    assert css(wide, "--proscenio-height") == "46px", css(wide, "--proscenio-height")
    wide.locator("#t-tree").click()
    assert logged(wide, "proscenio:drawer") == [{"id": "tree", "side": "left", "open": False}], "wide toggles only tell the page, starting from a shown column"
    assert not wide.evaluate("document.querySelector('#tree').classList.contains('proscenio-drawer-open')")
    wide.keyboard.press("/")
    assert wide.evaluate("document.activeElement.id") == "q", "/ focuses search"
    wide.keyboard.type("hello")
    assert wide.locator("#q").input_value() == "hello", "keys typed into search are text"
    wide.keyboard.press("Escape")
    assert wide.evaluate("document.activeElement.id") != "q"
    wide.evaluate("document.getElementById('cast').click()")
    assert wide.evaluate("casts") == 1 and wide.evaluate("document.querySelector('#bar .proscenio-actions #cast') !== null"), "slots are moved with their listeners"

    off = b.new_page(viewport={"width": 1280, "height": 700})
    off.goto(PAGE + "?key=off")
    off.keyboard.press("/")
    assert off.evaluate("document.activeElement.id") != "q", "keys.search off leaves / to the page"

    pg = b.new_page(viewport={"width": 390, "height": 700}, has_touch=True)
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(PAGE)
    assert pg.evaluate("getComputedStyle(document.getElementById('bar')).position") == "fixed"
    assert css(pg, "--proscenio-pad") == css(pg, "--proscenio-height") == css(pg, "--proscenio-shown") != "0px"
    for sel in ["[data-slot=nav]", "#live", "#ref"]:
        assert not shown(pg, sel), f"{sel} folds on narrow"
    assert not shown(pg, "#split"), "data-narrow=hide hides, not folds"
    for sel in ["#t-tree", "[data-slot=mark]", "#crumbs", "#cast", "#t-pane", ".proscenio-find", ".proscenio-more"]:
        assert shown(pg, sel), f"{sel} stays in the bar"
    assert not shown(pg, "#q")

    pg.locator(".proscenio-more").click()
    assert pg.evaluate("bar.proscenio.menuOpen") and shown(pg, "#ref") and shown(pg, "[data-slot=nav]")
    pg.mouse.click(200, 500)
    assert not pg.evaluate("bar.proscenio.menuOpen"), "an outside click closes the fold"
    pg.locator(".proscenio-more").click()
    pg.locator("[data-slot=nav] a").first.click()
    assert not pg.evaluate("bar.proscenio.menuOpen"), "choosing a link closes the fold"
    pg.locator(".proscenio-more").click()
    pg.select_option("#ref", "next")
    assert not pg.evaluate("bar.proscenio.menuOpen"), "a select's change closes the fold"
    pg.locator(".proscenio-more").click()
    pg.keyboard.press("Escape")
    assert not pg.evaluate("bar.proscenio.menuOpen")

    pg.locator(".proscenio-find").click()
    assert pg.evaluate("bar.proscenio.searching") and pg.evaluate("document.activeElement.id") == "q"
    assert shown(pg, "#q") and not shown(pg, "[data-slot=mark]") and shown(pg, ".proscenio-unfind")
    pg.keyboard.press("Escape")
    assert not pg.evaluate("bar.proscenio.searching") and shown(pg, "[data-slot=mark]")

    scroll(pg, 0)
    scroll(pg, 30)
    assert not pg.evaluate("bar.proscenio.hidden"), "within the bar's height it stays"
    scroll(pg, 400)
    assert pg.evaluate("bar.proscenio.hidden") and css(pg, "--proscenio-shown") == "0px", "scrolling down hides it"
    assert css(pg, "--proscenio-pad") != "0px", "the pad holds while hidden, so content does not jump"
    scroll(pg, 300)
    assert not pg.evaluate("bar.proscenio.hidden"), "scrolling up shows it"
    scroll(pg, 800)
    assert pg.evaluate("bar.proscenio.hidden")
    pg.evaluate("window.clicks = 0; document.addEventListener('click', () => clicks++)")
    pg.evaluate("document.body.style.userSelect = 'none'")
    pg.mouse.move(150, 20)
    pg.mouse.down()
    pg.mouse.move(150, 60, steps=4)
    pg.mouse.up()
    assert pg.evaluate("bar.proscenio.hidden"), "a drag in the top zone is not a tap"
    pg.evaluate("document.body.style.userSelect = ''")
    pg.mouse.move(150, 20)
    pg.mouse.down()
    pg.evaluate("getSelection().selectAllChildren(document.getElementById('main'))")
    pg.mouse.up()
    assert pg.evaluate("bar.proscenio.hidden"), "a press that changes the selection is not a tap"
    pg.evaluate("getSelection().removeAllRanges(); clicks = 0")
    pg.mouse.click(150, 20)
    assert not pg.evaluate("bar.proscenio.hidden"), "a tap in the top 48px brings it back"
    assert pg.evaluate("clicks") == 0, "and the tap's click is swallowed"
    scroll(pg, 1200)
    pg.locator(".proscenio-more").dispatch_event("click")
    assert not pg.evaluate("bar.proscenio.hidden") and pg.evaluate("bar.proscenio.menuOpen")
    scroll(pg, 1600)
    assert not pg.evaluate("bar.proscenio.hidden"), "an open fold holds the bar"
    pg.keyboard.press("Escape")

    scroll(pg, 0)
    pg.locator("#t-tree").click()
    assert pg.evaluate("bar.proscenio.drawerOpen") and shown(pg, "#tree") and shown(pg, ".proscenio-scrim")
    pg.wait_for_timeout(300)
    top = pg.evaluate("Math.round(document.getElementById('tree').getBoundingClientRect().top)")
    assert top == int(css(pg, "--proscenio-shown")[:-2]), f"the drawer sits below the bar, top {top}"
    assert pg.evaluate("document.activeElement.id") == "tree", "a tap focuses the drawer itself, so no keyboard rises"
    pg.keyboard.press("Tab")
    assert pg.evaluate("document.activeElement.textContent") == "alpha.go", "and Tab enters it"
    pg.keyboard.press("Shift+Tab")
    assert pg.evaluate("document.activeElement.id") == "tree-btn", "Tab wraps inside the drawer"
    pg.keyboard.press("Tab")
    assert pg.evaluate("document.activeElement.textContent") == "alpha.go"
    down = pg.evaluate("""() => { const e = new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true, cancelable: true});
      document.activeElement.dispatchEvent(e); return e.defaultPrevented }""")
    assert down is False, "arrows belong to the drawer's content"
    scroll(pg, 900)
    assert not pg.evaluate("bar.proscenio.hidden"), "an open drawer holds the bar"
    pg.keyboard.press("Escape")
    assert not pg.evaluate("bar.proscenio.drawerOpen") and pg.evaluate("document.activeElement.id") == "t-tree", "Escape closes and returns focus"
    pg.keyboard.press("Enter")
    pg.wait_for_timeout(250)
    assert pg.evaluate("document.activeElement.textContent") == "alpha.go", "opened from the keyboard, focus goes to the first control"
    pg.keyboard.press("Escape")
    pg.locator("#t-tree").click()
    pg.locator("#tree a").first.click()
    assert not pg.evaluate("bar.proscenio.drawerOpen"), "choosing a link closes the drawer"
    pg.locator("#t-tree").click()
    pg.locator(".proscenio-scrim").click(position={"x": 370, "y": 300})
    assert not pg.evaluate("bar.proscenio.drawerOpen"), "the scrim closes it"

    pg.locator("#t-pane").click()
    assert pg.evaluate("bar.proscenio.drawer.id") == "pane"
    pg.wait_for_timeout(300)
    pane = pg.evaluate("[Math.round(document.getElementById('pane').getBoundingClientRect().bottom), Math.round(document.getElementById('pane').getBoundingClientRect().height)]")
    assert pane[0] == 700 and 380 <= pane[1] <= 390, f"the bottom drawer is a 55vh sheet, got {pane}"
    pg.locator("#composer").focus()
    pg.keyboard.press("Escape")
    assert pg.evaluate("bar.proscenio.drawerOpen"), "Escape inside the composer is the composer's"
    pg.locator("#send").focus()
    pg.keyboard.press("Escape")
    assert not pg.evaluate("bar.proscenio.drawerOpen")
    scroll(pg, 0)
    scroll(pg, 1400)
    assert pg.evaluate("bar.proscenio.hidden")
    pg.evaluate("bar.proscenio.open(document.getElementById('pane'))")
    pg.wait_for_timeout(250)
    assert pg.evaluate("bar.proscenio.drawerOpen") and pg.evaluate("bar.proscenio.hidden"), "opening a drawer from code leaves the hidden bar hidden"
    scrim_top = pg.evaluate("Math.round(document.querySelector('.proscenio-scrim').getBoundingClientRect().top)")
    assert scrim_top == 0, f"the scrim follows the hidden bar, top {scrim_top}"
    pg.evaluate("bar.proscenio.close()")
    scroll(pg, 0)
    pg.locator("#t-tree").click()
    pg.evaluate("history.pushState({}, '', '#elsewhere'); dispatchEvent(new PopStateEvent('popstate'))")
    assert not pg.evaluate("bar.proscenio.drawerOpen"), "a route change closes the drawer"

    pg.evaluate("document.getElementById('bar').style.display = 'none'")
    pg.wait_for_timeout(100)
    assert css(pg, "--proscenio-pad") == "0px" and css(pg, "--proscenio-shown") == "0px"
    scroll(pg, 200)
    scroll(pg, 1000)
    pg.mouse.click(150, 20)
    assert pg.evaluate("document.getElementById('bar').style.display") == "none", "a header the page hides stays hidden"
    pg.evaluate("document.getElementById('bar').style.display = ''")
    pg.set_viewport_size({"width": 1280, "height": 700})
    pg.wait_for_timeout(100)
    assert not pg.evaluate("bar.proscenio.hidden") and not pg.evaluate("bar.proscenio.menuOpen"), "crossing 900px clears both"
    pg.set_viewport_size({"width": 600, "height": 700})
    pg.wait_for_timeout(100)
    pg.locator("#t-tree").click()
    pg.wait_for_timeout(250)
    assert pg.evaluate("bar.proscenio.drawerOpen")
    pg.evaluate("log.length = 0")
    pg.set_viewport_size({"width": 1280, "height": 700})
    pg.wait_for_timeout(150)
    assert not pg.evaluate("bar.proscenio.drawerOpen"), "crossing to wide closes an open drawer"
    assert pg.evaluate("document.querySelectorAll('.proscenio-scrim').length") == 0, "and takes its scrim with it"
    assert pg.evaluate("document.elementFromPoint(640, 400).className") != "proscenio-scrim"
    assert logged(pg, "proscenio:drawer") == [], "without telling a wide page to toggle its column"
    assert pg.evaluate("document.getElementById('t-tree').getAttribute('aria-expanded')") == "true"
    pg.locator("#t-tree").click()
    pg.locator("#t-tree").click()
    assert [e["open"] for e in logged(pg, "proscenio:drawer")] == [False, True], "wide events carry the column's state"
    pg.evaluate("bar.proscenio.destroy()")
    assert pg.evaluate("document.querySelectorAll('.proscenio-row, .proscenio-scrim').length") == 0
    assert pg.evaluate("document.getElementById('cast').parentElement.id") == "bar"

    tv = b.new_page(viewport={"width": 1920, "height": 600})
    tv.on("pageerror", lambda e: errors.append(str(e)))
    tv.goto(PAGE + "?mode=tv")
    assert tv.evaluate("document.getElementById('bar').getAttribute('data-mode')") == "tv"
    assert not shown(tv, "#q") and not shown(tv, "#t-tree") and not shown(tv, ".proscenio-more"), "tv has no search, toggles or fold"
    assert shown(tv, "#ref") and shown(tv, "[data-slot=nav]"), "tv never folds"
    assert tv.evaluate("getComputedStyle(document.getElementById('bar')).getPropertyValue('--proscenio-scale').trim()") == "1.5"
    tv.keyboard.press("/")
    assert tv.evaluate("document.activeElement.id") != "q"
    assert tv.evaluate("bar.proscenio.enter()") is True
    first = tv.evaluate("document.activeElement.textContent")
    assert first == "keel", first
    tv.keyboard.press("ArrowRight")
    assert tv.evaluate("document.activeElement.textContent") == "code"
    tv.keyboard.press("ArrowRight")
    tv.keyboard.press("ArrowLeft")
    assert tv.evaluate("document.activeElement.textContent") == "code", "left and right move between stops"
    assert tv.evaluate("getComputedStyle(document.activeElement).outlineStyle") == "solid", "the TV always shows focus"
    tv.keyboard.press("ArrowDown")
    assert len(logged(tv, "proscenio:leave")) == 1 and tv.evaluate("document.activeElement === document.body"), "down leaves the bar"
    tv.evaluate("bar.proscenio.enter()")
    assert tv.evaluate("document.activeElement.textContent") == "code", "enter() returns to the last stop"
    tv.evaluate("bar.proscenio.open(document.getElementById('tree'))")
    assert tv.evaluate("bar.proscenio.drawerOpen") and shown(tv, "#tree"), "a page can open a drawer on the TV"
    tv.keyboard.press("Escape")
    assert not tv.evaluate("bar.proscenio.drawerOpen")
    empty = tv.evaluate("""() => { const h = document.createElement('header'); document.body.prepend(h);
      return zanni.proscenio.attach(h, {mode: 'tv'}).enter() }""")
    assert empty is False, "enter() with no stops does nothing"

    assert not errors, errors
    b.close()
print("proscenio: ok")
