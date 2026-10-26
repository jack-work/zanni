"""filo in a real browser: one focus stop, the keymap, held keys that commit one
seek, pointer and touch scrubbing that seek once on release, focus-scoped keys,
show and hide, chapters, and that typing in a field is never a seek."""
import os
import sys

from playwright.sync_api import sync_playwright

PAGE = "file://" + os.path.abspath(sys.argv[1])


def now(pg):
    return pg.evaluate("document.getElementById('media').currentTime")


def seeks(pg):
    return pg.evaluate("seeks.length")


def ready(pg, query=""):
    pg.goto(PAGE + query)
    pg.wait_for_function("document.getElementById('media').readyState >= 1 && document.getElementById('media').duration > 500")


def near(a, b, tol=0.6):
    return abs(a - b) <= tol


def settle(pg):
    pg.wait_for_timeout(500)


def at(pg, t):
    pg.evaluate(f"document.getElementById('media').currentTime = {t}")
    pg.wait_for_function(f"Math.abs(document.getElementById('media').currentTime - {t}) < 0.5")
    pg.evaluate("seeks.length = 0")


with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox", "--autoplay-policy=no-user-gesture-required"])
    pg = b.new_page()
    ready(pg)

    stops = pg.evaluate("""() => [...document.querySelectorAll('.filo *')].filter(n => n.tabIndex >= 0).map(n => n.className)""")
    assert stops == ["filo-track"], f"the bar is one focus stop, got {stops}"
    assert pg.evaluate("document.querySelector('.filo-track').getAttribute('role')") == "slider"
    text = pg.evaluate("document.querySelector('.filo-track').getAttribute('aria-valuetext')")
    assert text == "0:00 of 10:00, Overture", text
    assert pg.locator(".filo-tick").count() == 3, "a notch for every chapter after the first"

    pg.keyboard.press("l")
    assert near(now(pg), 0), "a key previews before it seeks"
    assert pg.evaluate("document.querySelector('.filo').classList.contains('filo-previewing')")
    settle(pg)
    assert near(now(pg), 10), now(pg)
    assert seeks(pg) == 1

    at(pg, 100)
    for _ in range(6):
        pg.keyboard.press("l")
    settle(pg)
    assert near(now(pg), 160), now(pg)
    assert seeks(pg) == 1, f"six presses inside the window commit once, got {seeks(pg)}"

    for key, start, want in [
        ("h", 100, 90), ("H", 100, 70), ("L", 100, 130),
        ("ArrowLeft", 100, 90), ("ArrowRight", 100, 110),
        ("Shift+ArrowRight", 100, 130),
        ("Alt+l", 100, 101), ("Alt+h", 100, 99),
        ("Control+l", 100, 101), ("Control+h", 100, 99),
    ]:
        at(pg, start)
        pg.keyboard.press(key)
        settle(pg)
        assert near(now(pg), want), f"{key} from {start}: {now(pg)}, want {want}"

    for key, start, want in [
        ("5", 100, 300), ("0", 100, 0), ("Shift+Digit6", 300, 0), ("Shift+Digit4", 100, 600),
        ("Home", 300, 0), ("End", 100, 600),
        ("]", 100, 120), ("]", 130, 300), ("[", 130, 120), ("[", 121, 0),
        ("PageDown", 100, 120), ("PageUp", 130, 120),
    ]:
        at(pg, start)
        pg.keyboard.press(key)
        assert near(now(pg), want), f"{key} from {start}: {now(pg)}, want {want}"
        assert seeks(pg) == 1

    for key, start, want in [("MediaRewind", 100, 70), ("MediaFastForward", 100, 130)]:
        at(pg, start)
        pg.evaluate(f"document.body.dispatchEvent(new KeyboardEvent('keydown', {{key: '{key}', bubbles: true}}))")
        settle(pg)
        assert near(now(pg), want), f"{key}: {now(pg)}"

    pg.keyboard.press("m")
    assert pg.evaluate("document.getElementById('media').muted")
    pg.keyboard.press("m")
    assert not pg.evaluate("document.getElementById('media').muted")

    pg.keyboard.press("Space")
    pg.wait_for_function("!document.getElementById('media').paused")
    assert pg.evaluate("document.querySelector('.filo-play').getAttribute('aria-label')") == "Pause"
    pg.keyboard.press("Space")
    pg.wait_for_function("document.getElementById('media').paused")
    pg.evaluate("""() => { const e = new KeyboardEvent('keydown', {key: 'Unidentified', bubbles: true}); Object.defineProperty(e, 'keyCode', {value: 179}); document.body.dispatchEvent(e); }""")
    pg.wait_for_function("!document.getElementById('media').paused")
    pg.evaluate("player.toggle()")
    pg.wait_for_function("document.getElementById('media').paused")

    pg.keyboard.press("ArrowDown")
    assert pg.evaluate("document.querySelector('.filo').classList.contains('filo-hidden')")
    pg.keyboard.press("ArrowUp")
    assert not pg.evaluate("document.querySelector('.filo').classList.contains('filo-hidden')")
    pg.keyboard.press("ArrowDown")
    at(pg, 100)
    pg.keyboard.press("l")
    assert not pg.evaluate("document.querySelector('.filo').classList.contains('filo-hidden')"), "a seek key brings the bar back"
    settle(pg)

    pg.locator(".filo-track").focus()
    pg.keyboard.press("ArrowDown")
    assert pg.evaluate("document.activeElement.className") == "filo-track", "hiding the bar keeps its focus"
    pg.keyboard.press("ArrowUp")

    at(pg, 100)
    pg.locator("#field").focus()
    pg.keyboard.type("hl5$ ")
    settle(pg)
    assert near(now(pg), 100) and seeks(pg) == 0, "typing in a field is never a seek"
    assert pg.evaluate("document.getElementById('field').value") == "hl5$ "

    box = pg.locator(".filo-rail").bounding_box()
    y = box["y"] + box["height"] / 2
    at(pg, 100)
    pg.mouse.move(box["x"] + box["width"] * 0.25, y)
    pg.mouse.down()
    pg.mouse.move(box["x"] + box["width"] * 0.5, y, steps=5)
    pg.mouse.move(box["x"] + box["width"] * 0.75, y, steps=5)
    assert near(now(pg), 100), "dragging previews, it does not seek"
    flag = pg.evaluate("document.querySelector('.filo-flag-time').textContent")
    assert flag == "7:30", flag
    pg.mouse.up()
    assert near(now(pg), 450, 2), now(pg)
    assert seeks(pg) == 1, f"one drag, one seek, got {seeks(pg)}"

    pg.mouse.move(box["x"] + box["width"] * 0.1, y)
    assert pg.evaluate("document.querySelector('.filo').classList.contains('filo-previewing')"), "hover shows the flag"
    pg.mouse.move(box["x"] + box["width"] * 0.1, y - 200)
    assert not pg.evaluate("document.querySelector('.filo').classList.contains('filo-previewing')")

    ctx = b.new_context(has_touch=True, viewport={"width": 390, "height": 800})
    ph = ctx.new_page()
    ready(ph)
    box = ph.locator(".filo-rail").bounding_box()
    ph.touchscreen.tap(box["x"] + box["width"] * 0.5, box["y"] + box["height"] / 2)
    ph.wait_for_function("Math.abs(document.getElementById('media').currentTime - 300) < 3")
    assert seeks(ph) == 1
    assert ph.evaluate("getComputedStyle(document.querySelector('.filo-track')).touchAction") == "pan-y"
    ctx.close()

    ready(pg, "?keys=focus")
    pg.keyboard.press("l")
    settle(pg)
    assert near(now(pg), 0) and seeks(pg) == 0, "without global keys the page keeps its keys"
    pg.locator(".filo-track").focus()
    pg.keyboard.press("l")
    settle(pg)
    assert near(now(pg), 10), "with focus on the bar the keys seek"

    ready(pg, "?autohide=300")
    pg.evaluate("player.toggle()")
    pg.wait_for_function("document.querySelector('.filo').classList.contains('filo-hidden')", timeout=3000)
    pg.evaluate("player.stop()")
    assert pg.evaluate("document.getElementById('media').paused")

    b.close()
print("filo: ok")
