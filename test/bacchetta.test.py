"""bacchetta in a real browser: the cast button's dropdown, the remote's
controls and what each one asks of the screen, one seek per drag, the
minimised bar, the boil setting, the phone and wide layouts, the height
the page pads by, and destroy leaving nothing behind."""
import os
import sys

from playwright.sync_api import sync_playwright

PAGE = "file://" + os.path.abspath(sys.argv[1])


def logged(pg, name):
    return pg.evaluate(f"log.filter(e => e[0] === '{name}').map(e => e[1])")


def controls(pg):
    return [[c["action"], c.get("value")] for c in logged(pg, "bacchetta:control")]


def cast(pg):
    pg.locator("#cast").click()
    pg.locator(".bacchetta-screen", has_text="Living room TV").click()


with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    pg = b.new_page(viewport={"width": 390, "height": 800}, has_touch=True)
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(PAGE)

    assert pg.evaluate("document.querySelector('.bacchetta').hidden"), "the remote waits for a cast"
    assert pg.locator("#cast .bacchetta-icon").count() == 1, "the cast button wears the glyph"
    pg.locator("#cast").click()
    names = pg.locator(".bacchetta-screen-name").all_text_contents()
    assert names == ["Living room TV", "gluck \u00B7 desktop", "cheroot"], names
    assert pg.locator(".bacchetta-offline").count() == 1
    assert pg.evaluate("document.activeElement.classList.contains('bacchetta-screen')"), "the menu takes focus"
    pg.keyboard.press("ArrowDown")
    pg.keyboard.press("Escape")
    assert not pg.evaluate("caster.isOpen") and pg.evaluate("document.activeElement.id") == "cast"
    cast(pg)
    assert logged(pg, "bacchetta:cast")[0]["screen"]["id"] == "tv"
    assert not pg.evaluate("caster.isOpen")
    assert pg.evaluate("remote.shown && !remote.minimised")
    assert pg.locator(".bacchetta-to-name").text_content() == "Living room TV"
    assert pg.locator(".bacchetta-title").text_content() == "OL overview"

    geo = pg.evaluate("""() => { const r = document.querySelector('.bacchetta-sheet').getBoundingClientRect();
      return [Math.round(r.left), Math.round(r.right), Math.round(r.bottom),
        getComputedStyle(document.documentElement).getPropertyValue('--bacchetta-height').trim()] }""")
    assert geo[:3] == [0, 390, 800] and geo[3].endswith("px") and int(geo[3][:-2]) > 300, f"a phone gets the bottom sheet, got {geo}"

    for sel, want in [
        (".bacchetta-transport .bacchetta-play", ["toggle", None]),
        (".bacchetta-back", ["skip", -10]), (".bacchetta-fwd", ["skip", 10]),
        (".bacchetta-big-back", ["skip", -30]), (".bacchetta-big-fwd", ["skip", 30]),
        (".bacchetta-prev", ["chapter", -1]), (".bacchetta-next", ["chapter", 1]),
        (".bacchetta-bar", ["bar", None]), (".bacchetta-stop", ["stop", None]),
        (".bacchetta-up", ["key", "ArrowUp"]), (".bacchetta-left", ["key", "ArrowLeft"]),
        (".bacchetta-ok", ["key", "Enter"]), (".bacchetta-right", ["key", "ArrowRight"]),
        (".bacchetta-down", ["key", "ArrowDown"]),
    ]:
        pg.evaluate("log.length = 0")
        pg.locator(sel).click()
        assert controls(pg) == [want], f"{sel}: {controls(pg)}"
    assert logged(pg, "bacchetta:control")[0]["screen"]["id"] == "tv", "every control names its screen"

    pg.evaluate("log.length = 0")
    rail = pg.locator(".bacchetta-rail").bounding_box()
    y = rail["y"] + rail["height"] / 2
    pg.mouse.move(rail["x"] + rail["width"] * 0.2, y)
    pg.mouse.down()
    pg.mouse.move(rail["x"] + rail["width"] * 0.5, y, steps=5)
    pg.mouse.move(rail["x"] + rail["width"] * 0.75, y, steps=5)
    assert controls(pg) == [], "dragging asks nothing of the screen yet"
    fill = pg.evaluate("document.querySelector('.bacchetta-fill').style.transform")
    assert fill.startswith("scaleX(0.7"), f"the fill follows the drag, got {fill}"
    pg.mouse.up()
    c = controls(pg)
    assert len(c) == 1 and c[0][0] == "seekTo" and abs(c[0][1] - 2728 * 0.75) < 30, c

    pg.evaluate("remote.setNow({position: 100, playing: true})")
    t0 = pg.evaluate("document.querySelector('.bacchetta-elapsed').textContent")
    pg.wait_for_timeout(1300)
    t1 = pg.evaluate("document.querySelector('.bacchetta-elapsed').textContent")
    assert t0 == "1:40" and t1 in ("1:41", "1:42"), f"the clock runs between updates while playing: {t0} -> {t1}"
    pg.evaluate("remote.setNow({playing: false})")
    assert pg.evaluate("document.querySelector('.bacchetta-transport .bacchetta-play').getAttribute('aria-label')") == "Play"

    pg.locator(".bacchetta-shrink").click()
    assert pg.evaluate("remote.minimised")
    mini = pg.evaluate("""() => { const r = document.querySelector('.bacchetta-mini').getBoundingClientRect();
      return [Math.round(r.height), Math.round(r.bottom), getComputedStyle(document.querySelector('.bacchetta-sheet')).display,
        getComputedStyle(document.documentElement).getPropertyValue('--bacchetta-height').trim()] }""")
    assert mini[0] == 60 and mini[1] == 800 and mini[2] == "none" and mini[3] == "60px", f"minimised is a 60px bar, got {mini}"
    assert "OL overview" in pg.locator(".bacchetta-mini-now").text_content()
    pg.evaluate("log.length = 0")
    pg.locator(".bacchetta-mini-play").click()
    assert controls(pg) == [["toggle", None]]
    pg.locator(".bacchetta-grow").click()
    assert not pg.evaluate("remote.minimised")

    pg.locator(".bacchetta-more summary").click()
    pg.locator(".bacchetta-path-input").fill("cs7641/video/adamw.mp4")
    pg.keyboard.press("Enter")
    assert logged(pg, "bacchetta:path")[-1]["path"] == "cs7641/video/adamw.mp4"
    assert pg.locator(".bacchetta-path-input").input_value() == ""
    pg.locator(".bacchetta-boil input").check()
    assert pg.evaluate("remote.boiled") and logged(pg, "bacchetta:boil")[-1] == {"on": True}

    pg.evaluate("log.length = 0")
    pg.locator(".bacchetta-close").click()
    assert controls(pg) == [["stop", None]] and not pg.evaluate("remote.shown")
    assert pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--bacchetta-height')") == ""

    pg.evaluate("document.documentElement.style.setProperty('--filo-dock-height', '72px')")
    cast(pg)
    bottom = pg.evaluate("Math.round(document.querySelector('.bacchetta').getBoundingClientRect().bottom)")
    assert bottom == 728, f"the remote stacks above a docked filo bar, got {bottom}"
    pg.evaluate("document.documentElement.style.removeProperty('--filo-dock-height')")

    wide = b.new_page(viewport={"width": 1280, "height": 800})
    wide.goto(PAGE)
    cast(wide)
    geo = wide.evaluate("""() => { const r = document.querySelector('.bacchetta-sheet').getBoundingClientRect();
      return [Math.round(r.width), Math.round(1280 - r.right), Math.round(800 - r.bottom),
        getComputedStyle(document.documentElement).getPropertyValue('--bacchetta-height')] }""")
    assert geo == [380, 16, 16, ""], f"wide screens get a 380px card bottom-right that covers no scroll edge, got {geo}"
    wide.locator(".bacchetta-shrink").click()
    r = wide.evaluate("""() => { const r = document.querySelector('.bacchetta-mini').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.bottom)] }""")
    assert r == [1280, 800], f"minimised spans the bottom on wide screens too, got {r}"
    wide.evaluate("remote.destroy()")
    assert wide.evaluate("document.querySelectorAll('.bacchetta').length") == 0
    assert wide.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--bacchetta-height')") == ""
    wide.evaluate("caster.destroy()")
    assert wide.evaluate("document.querySelectorAll('.bacchetta-caster, .bacchetta-screens').length") == 0
    assert wide.evaluate("document.getElementById('cast').parentElement.tagName") == "BODY"

    assert not errors, errors
    b.close()
print("bacchetta: ok")
