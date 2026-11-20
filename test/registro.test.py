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
    assert page.locator(".z2-scope [data-slot='mark']").evaluate("e => getComputedStyle(e).fontFamily").startswith('"Jacquard 24"'), "the display face stays on the mark"
    assert page.locator("h2").evaluate("e => getComputedStyle(e).fontFamily").lstrip('"').startswith("EB Garamond"), "panel titles are in the text face, not blackletter"
    assert page.locator(".z2-capacity-value").first.inner_text() == "Unavailable"
    assert page.locator(".z2-capacity-state").inner_text() == "Stale"
    assert page.locator("h3").all_text_contents() == ["Provider reported", "Observed headers", "Local usage"]
    dark_ground = page.locator("body").evaluate("e => getComputedStyle(e).backgroundColor")
    page.emulate_media(color_scheme="light")
    assert page.locator("body").evaluate("e => getComputedStyle(e).backgroundColor") != dark_ground
    assert current.evaluate("e => getComputedStyle(e).borderBottomColor") == "rgb(125, 46, 46)"
    page.emulate_media(color_scheme="dark")
    page.set_viewport_size({"width": 390, "height": 844})
    more = page.locator(".proscenio-more")
    assert more.is_visible()
    assert more.bounding_box()["height"] >= 44
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    page.add_script_tag(path=os.path.join(os.path.dirname(os.path.abspath(sys.argv[1])), "..", "assets", "v2", "z2-scope.js"))
    page.evaluate("""(() => { const t = document.createElement('div'); t.className = 'z2-toolbar'; t.style.height = '120px'; document.body.prepend(t);
      window.__undo = z2.stickyInset(t); })()""")
    assert page.evaluate("getComputedStyle(document.querySelector('.z2-toolbar')).backgroundColor").startswith("rgb("), "the sticky toolbar is opaque"
    bottom = page.evaluate("(() => { const t = document.querySelector('.z2-toolbar'); return parseFloat(getComputedStyle(t).top) + t.getBoundingClientRect().height })()")
    pad = page.evaluate("parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop)")
    assert bottom <= pad <= bottom + 16, ("anchors and focus land below the sticky bars", bottom, pad)
    page.evaluate("window.__undo(); document.documentElement.style.removeProperty('--z-sticky-h'); document.querySelector('.z2-toolbar').style.position = 'static'; window.__undo = z2.stickyInset(document.querySelector('.z2-toolbar'))")
    assert page.evaluate("document.documentElement.style.getPropertyValue('--z-sticky-h')") == "0px", "a bar that does not stick adds no inset"
    page.evaluate("window.__undo(); document.documentElement.style.removeProperty('--z-sticky-h')")
    assert page.evaluate("parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop)") < bottom, "negative control: no bars, no inset"
    page.set_viewport_size({"width": 1280, "height": 800})
    page.emulate_media(color_scheme="light")
    page.evaluate("""(() => { const m = document.createElement('div'); m.id = 'chrome-probe';
      m.innerHTML = '<div class="z2-seg"><button class="z2-seg-b" id="seg-on" aria-pressed="true">24h</button><button class="z2-seg-b" id="seg-off" aria-pressed="false">3d</button></div>' +
        '<section class="z2-kpis"><div class="z2-kpi"><span class="z2-kl">turns</span><span class="z2-kv">1.7k</span><span class="z2-kn">10.4k rounds</span></div>' +
        '<div class="z2-kpi warn"><span class="z2-kl">cold restarts</span><span class="z2-kv">513</span><span class="z2-kn">write 128.22M</span></div></section>';
      document.querySelector('main').prepend(m); })()""")
    bg = "e => getComputedStyle(e).backgroundColor"
    page.hover("#seg-on")
    assert page.locator("#seg-on").evaluate(bg) == "rgb(125, 46, 46)", "a pressed segment keeps its fill under the pointer, so its label stays readable"
    page.hover("#seg-off")
    assert page.locator("#seg-off").evaluate(bg) != "rgb(125, 46, 46)", "negative control: hover alone does not press a segment"
    tile = page.locator("#chrome-probe .z2-kpi").first
    assert tile.evaluate("e => getComputedStyle(e).borderLeftWidth") == "0px", "KPI tiles are divided by hairlines, not edged cards"
    assert tile.locator(".z2-kn").bounding_box()["y"] >= tile.locator(".z2-kv").bounding_box()["y"] + 20, "the note sits under the value, never truncated beside it"
    assert page.locator("#chrome-probe .z2-kpi.warn .z2-kv").evaluate("e => getComputedStyle(e).color") == "rgb(135, 88, 15)", "a tile past its line still colours its value"
    assert page.locator(".z2-panel").first.evaluate("e => getComputedStyle(e).borderTopWidth") == "1px", "panels carry one hairline, the accent rule is the header's"
    page.locator("link[href$='z2-registro.css']").evaluate("e => e.remove()")
    assert current.evaluate("e => getComputedStyle(e).borderBottomStyle") == "none", "negative control: active underline belongs to registro"
    assert tile.evaluate("e => getComputedStyle(e).borderLeftWidth") == "3px", "negative control: the hairline strip belongs to registro"
    browser.close()

print("registro: ok")
