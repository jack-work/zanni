import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.sync_api import sync_playwright

from figchat_kit import MAIN, Door, until

bundle = os.path.abspath(sys.argv[1])
shots = os.environ.get("FIGCHAT_SHOTS", "")
SC = "document.querySelector('[data-zr-scroll]')"
LONG = "Could you walk me through exactly how the sticky header decides that a question has scrolled out from under it, and say what happens to the words when the pane is resized, because it looks wrong when the window is wide. " * 2

import atexit
d = Door(bundle, 12)
atexit.register(d.stop)


def geom(pg):
    return pg.evaluate("""() => {
      const sc = document.querySelector('[data-zr-scroll]').getBoundingClientRect();
      const bars = [...document.querySelectorAll('.zr-sticky')].map((n) => n.getBoundingClientRect()).filter((r) => r.bottom > sc.top && r.top < sc.bottom);
      return { sc: [sc.left, sc.width], bars: bars.map((r) => [r.left, r.width]) };
    }""")


def pin_a_turn(pg):
    pg.evaluate("""() => { const sc = document.querySelector('[data-zr-scroll]'); const t = [...document.querySelectorAll('.nodi-turn')].find((n) => n.querySelector('.nodi-input') && n.querySelector('.nodi-input').textContent.includes('sticky header decides')); sc.scrollTop += t.getBoundingClientRect().top - sc.getBoundingClientRect().top + 260; }""")
    until(pg, "!!document.querySelector('.zr-sticky[data-pinned]')", 5000)


def run(p, name, ctxargs, browser):
    ctx = browser.new_context(**ctxargs)
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(d.url + "#/gluck/" + MAIN)
    until(pg, "!!document.querySelector('.fw') && document.querySelector('.fw').dataset.link === 'live'", 20000)
    until(pg, "document.querySelectorAll('.nodi-turn').length > 0", 10000)
    pg.wait_for_timeout(800)
    pg.locator(".zr-input").fill(LONG)
    pg.locator(".zr-send").click() if ctxargs.get("is_mobile") else pg.keyboard.press("Enter")
    until(pg, "[...document.querySelectorAll('.nodi-input')].some((n) => n.textContent.includes('sticky header decides'))", 10000)
    pg.wait_for_timeout(1500)
    pg.evaluate("document.querySelector('[data-zr-scroll]').scrollTop -= 200")
    pin_a_turn(pg)
    got = pg.evaluate("""() => {
      const sc = document.querySelector('[data-zr-scroll]').getBoundingClientRect();
      const bars = [...document.querySelectorAll('.zr-sticky')].map((n) => n.getBoundingClientRect()).filter((r) => r.bottom > sc.top && r.top < sc.bottom);
      return { sc: [sc.left, sc.width], bars: bars.map((r) => [r.left, r.width]), lines: document.querySelectorAll('.zr-sticky[data-pinned] .zr-sticky-line .zr-ts-line').length, pinned: document.querySelectorAll('.zr-sticky[data-pinned]').length, jump: document.querySelectorAll('.zr-sticky[data-pinned] .zr-sticky-jump').length };
    }""")
    assert got["pinned"] >= 1 and got["lines"] >= 1 and got["jump"] >= 1, "%s: %s" % (name, got)
    for left, width in got["bars"]:
        assert abs(left - got["sc"][0]) < 1.5 and abs(width - got["sc"][1]) < 1.5, "%s: the bar spans the pane: %s" % (name, got)
    if shots:
        os.makedirs(shots, exist_ok=True)
        pg.screenshot(path=os.path.join(shots, "sticky-v2-%s.png" % name))
    w = ctxargs["viewport"]["width"]
    if w > 700:
        before = pg.evaluate("[...document.querySelectorAll('.zr-sticky[data-pinned] .zr-ts-line')].map((n) => n.textContent)")
        pg.set_viewport_size({"width": 260, "height": ctxargs["viewport"]["height"]})
        pg.wait_for_timeout(100)
        after = pg.evaluate("[...document.querySelectorAll('.zr-sticky[data-pinned] .zr-ts-line')].map((n) => n.textContent)")
        assert before != after, "%s: the lines were set again for the narrower box: %s" % (name, before)
        for t in after:
            assert t, name
        pg.set_viewport_size(ctxargs["viewport"])
    pin_a_turn(pg)
    moved = pg.evaluate("""() => { const sc = document.querySelector('[data-zr-scroll]'); const top = sc.scrollTop; const b = document.querySelector('.zr-sticky[data-pinned] .zr-sticky-jump'); if (!b) return null; b.click(); return top; }""")
    assert moved is not None, "%s: a pinned bar has a jump button" % name
    pg.wait_for_timeout(300)
    assert pg.evaluate(SC + ".scrollTop") != moved, "%s: the jump moved the transcript" % name
    assert not errors, errors
    ctx.close()


ONLY = os.environ.get("STICKY_ONLY", "")
_run = run


def run(p, name, *a):
    if not ONLY or name == ONLY:
        _run(p, name, *a)


with sync_playwright() as p:
    ch = p.chromium.launch()
    run(p, "1280", {"viewport": {"width": 1280, "height": 800}}, ch)
    run(p, "1920", {"viewport": {"width": 1920, "height": 1000}}, ch)
    run(p, "844", {"viewport": {"width": 844, "height": 390}, "has_touch": True, "is_mobile": True}, ch)
    run(p, "390", {"viewport": {"width": 390, "height": 844}, "has_touch": True, "is_mobile": True}, ch)
    ch.close()
    wk = p.webkit.launch()
    phone = dict(p.devices["iPhone 15"])
    phone["viewport"] = {"width": 390, "height": 844}
    phone["screen"] = {"width": 390, "height": 844}
    run(p, "webkit-390", phone, wk)
    wk.close()
d.stop()
print("sticky-v2 ok")
