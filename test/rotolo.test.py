"""rotolo in real browsers. Chromium: the panel's bar takes rotolo's size, the
thumb and track are the palette's pixels, the thumb lights on hover, and with
the class removed (the negative control) all three go back to the browser's.
Firefox: headless Playwright hides every scrollbar with its own !important
sheet, so only the computed scrollbar-color on a nested panel can be asked,
with the same control."""
import io
import os
import sys

from PIL import Image
from playwright.sync_api import sync_playwright

PAGE = "file://" + os.path.abspath(sys.argv[1])
ACCENT = (217, 169, 78)
GROUND_2 = (39, 18, 21)
HOVER = (225, 188, 121)


def near(a, b, tol=8):
    return all(abs(x - y) <= tol for x, y in zip(a, b))


def pixel(pg, x, y):
    shot = pg.screenshot(clip={"x": 0, "y": 0, "width": 600, "height": 400})
    return Image.open(io.BytesIO(shot)).convert("RGB").getpixel((int(x), int(y)))


def bar(pg):
    return pg.evaluate("""() => {
      const e = document.querySelector('#panel'), r = e.getBoundingClientRect();
      return {left: r.left, top: r.top, cw: e.clientWidth, ch: e.clientHeight,
              size: e.offsetWidth - 2 - e.clientWidth};
    }""")


with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"], ignore_default_args=["--hide-scrollbars"])
    pg = b.new_page(viewport={"width": 800, "height": 600})
    pg.goto(PAGE)
    g = bar(pg)
    assert g["size"] == 12, "the nested panel takes --rotolo-size: %r" % g
    x = g["left"] + 1 + g["cw"] + g["size"] / 2
    thumb_y = g["top"] + 1 + 8
    track_y = g["top"] + 1 + g["ch"] - 12
    assert near(pixel(pg, x, thumb_y), ACCENT), pixel(pg, x, thumb_y)
    assert near(pixel(pg, x, track_y), GROUND_2), pixel(pg, x, track_y)
    pg.mouse.move(x, thumb_y)
    pg.wait_for_timeout(200)
    assert near(pixel(pg, x, thumb_y), HOVER), "the thumb lights on hover: %r" % (pixel(pg, x, thumb_y),)
    pg.mouse.move(5, 5)

    pg.evaluate("document.documentElement.classList.remove('rotolo')")
    pg.wait_for_timeout(100)
    g = bar(pg)
    assert g["size"] != 12, "control: without the class the bar is the browser's width"
    x = g["left"] + 1 + g["cw"] + g["size"] / 2
    assert not near(pixel(pg, x, g["top"] + 1 + 8), ACCENT), "control: the thumb is not the accent"
    b.close()

    b = p.firefox.launch()
    pg = b.new_page()
    pg.goto(PAGE)
    color = "getComputedStyle(document.querySelector('#panel')).scrollbarColor"
    assert pg.evaluate(color) == "rgb(217, 169, 78) rgb(39, 18, 21)", pg.evaluate(color)
    pg.evaluate("document.documentElement.classList.remove('rotolo')")
    assert pg.evaluate(color) == "auto", "control: " + pg.evaluate(color)
    b.close()

print("rotolo: ok")
