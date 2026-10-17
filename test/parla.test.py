"""parla in a real browser: say, quip and its return, the *AHEM* that cuts a
quip short, a plain interrupt with no quip to cut, the drag wiggle, and that
reduced motion keeps the words but drops the animation."""
import os
import sys

from playwright.sync_api import sync_playwright

PAGE = "file://" + os.path.abspath(sys.argv[1])


def bubble(pg):
    return pg.evaluate("document.querySelector('.parla-bubble').textContent")


def classes(pg):
    return pg.evaluate("document.querySelector('.parla-bubble').className")


with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    pg = b.new_page()
    pg.goto(PAGE)
    pg.evaluate("window.f = document.querySelector('[data-parla]').parla")
    assert bubble(pg) == "Hover over a button to learn more.", bubble(pg)

    pg.evaluate("f.quip('a quip', 300)")
    assert bubble(pg) == "a quip" and pg.evaluate("f.quipping")
    pg.wait_for_timeout(450)
    assert bubble(pg) == "Hover over a button to learn more.", "a quip returns to the resting line"
    assert not pg.evaluate("f.quipping")

    pg.evaluate("f.quip('another quip', 5000)")
    pg.evaluate("f.interrupt('the explanation')")
    assert bubble(pg) == "*AHEM*", bubble(pg)
    assert "parla-wiggle" in classes(pg) and "parla-ahem" in classes(pg), classes(pg)
    pg.evaluate("f.interrupt('the other explanation')")
    assert bubble(pg) == "*AHEM*", "a second interrupt during the AHEM does not restart it"
    pg.wait_for_timeout(800)
    assert bubble(pg) == "the other explanation", bubble(pg)
    assert "parla-ahem" not in classes(pg)
    pg.wait_for_timeout(5000)
    assert bubble(pg) == "the other explanation", "the cut quip's timer must not fire later"

    pg.evaluate("f.interrupt('no quip to cut')")
    assert bubble(pg) == "no quip to cut", "an interrupt with no quip has no AHEM"

    pg.evaluate("f.rest()")
    assert bubble(pg) == "Hover over a button to learn more."
    pg.evaluate("f.say('<b>not markup</b>')")
    assert pg.evaluate("document.querySelector('.parla-bubble b')") is None
    assert bubble(pg) == "<b>not markup</b>"

    head = pg.locator(".parla-head").bounding_box()
    x, y = head["x"] + head["width"] / 2, head["y"] + head["height"] / 2
    pg.mouse.move(x, y); pg.mouse.down(); pg.mouse.move(x + 90, y + 40, steps=8); pg.mouse.up()
    pg.wait_for_timeout(50)
    assert "parla-wiggle" in classes(pg), "the bubble wiggles when Figaro is put down"

    calm = b.new_page(reduced_motion="reduce")
    calm.goto(PAGE)
    calm.evaluate("window.f = document.querySelector('[data-parla]').parla")
    calm.evaluate("f.quip('q', 5000); f.interrupt('e')")
    assert calm.evaluate("getComputedStyle(document.querySelector('.parla-bubble')).animationName") == "none"
    assert bubble(calm) == "*AHEM*"
    b.close()
print("parla ok")
