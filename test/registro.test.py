import os
import sys

from playwright.sync_api import sync_playwright

page_url = "file://" + os.path.abspath(sys.argv[1])

with sync_playwright() as p:
    browser = p.chromium.launch(args=["--no-sandbox"])
    page = browser.new_page(viewport={"width": 1280, "height": 800}, color_scheme="dark")
    page.goto(page_url)
    page.wait_for_function("document.querySelector('[data-proscenio]').proscenio")
    nav = page.locator("nav[aria-label='Dashboards']")
    assert nav.locator("a[aria-current='page']").get_attribute("href") == "/rou2/"
    assert nav.locator("a").all_text_contents() == ["figscope", "rou2"]
    assert nav.locator("a").all() and nav.is_visible()
    assert page.locator(".z2-scope [data-slot='mark']").inner_text() == "Scope"
    assert page.locator(".z2-scope-mark").evaluate("e => e.naturalWidth") == 26
    assert page.locator(".z2-scope-mark").evaluate("e => getComputedStyle(e).imageRendering") == "pixelated"
    for link in nav.locator("a").all():
        assert link.bounding_box()["height"] >= 44
    current = nav.locator("[aria-current='page']")
    assert current.evaluate("e => getComputedStyle(e).borderBottomColor") == "rgb(217, 169, 78)"
    assert page.locator("h2").evaluate("e => getComputedStyle(e).fontFamily").startswith('"Jacquard 24"')
    assert not page.locator(".z2-capacity-value").first.evaluate("e => getComputedStyle(e).fontFamily").startswith('"Jacquard 24"')
    assert page.locator(".z2-capacity-value").first.inner_text() == "Unavailable"
    assert page.locator(".z2-capacity-state").inner_text() == "Stale"
    assert page.locator("h3").all_text_contents() == ["Provider reported", "Observed headers", "Local usage"]
    dark_ground = page.locator("body").evaluate("e => getComputedStyle(e).backgroundColor")
    page.emulate_media(color_scheme="light")
    assert page.locator("body").evaluate("e => getComputedStyle(e).backgroundColor") != dark_ground
    assert current.evaluate("e => getComputedStyle(e).borderBottomColor") == "rgb(99, 74, 22)"
    page.emulate_media(color_scheme="dark")
    page.set_viewport_size({"width": 390, "height": 844})
    more = page.locator(".proscenio-more")
    assert more.is_visible()
    assert more.bounding_box()["height"] >= 44
    more.focus()
    page.keyboard.press("Enter")
    assert nav.is_visible()
    assert current.is_visible()
    page.keyboard.press("Escape")
    assert not nav.is_visible()
    assert more.evaluate("e => e === document.activeElement")
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    page.set_viewport_size({"width": 1280, "height": 800})
    page.locator("link[href$='z2-registro.css']").evaluate("e => e.remove()")
    assert current.evaluate("e => getComputedStyle(e).borderBottomStyle") == "none", "negative control: active underline belongs to registro"
    browser.close()

print("registro: ok")
