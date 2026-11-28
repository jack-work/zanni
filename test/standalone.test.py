import json
import os
import struct
import sys
import zlib
from urllib.parse import urljoin, urlparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.sync_api import sync_playwright

from figchat_kit import HANG_MS, MAIN, Door, until

bundle = os.path.abspath(sys.argv[1])

doors = []
import atexit
atexit.register(lambda: [d.stop() for d in doors])

HEAD = """() => {
  const link = (sel) => { const n = document.querySelector(sel); return n ? { href: n.href, rel: n.getAttribute('rel'), sizes: n.getAttribute('sizes'), crossorigin: n.getAttribute('crossorigin') } : null; };
  const meta = (name) => { const n = document.querySelector('meta[name="' + name + '"]'); return n ? n.getAttribute('content') : null; };
  return {
    manifest: link('link[rel="manifest"]'),
    touch: link('link[rel="apple-touch-icon"]'),
    capable: meta('apple-mobile-web-app-capable'),
    mobileCapable: meta('mobile-web-app-capable'),
    bar: meta('apple-mobile-web-app-status-bar-style'),
    title: meta('apple-mobile-web-app-title'),
    theme: meta('theme-color'),
    viewport: meta('viewport'),
    ground: getComputedStyle(document.querySelector('.zr-pit-head')).backgroundColor,
  };
}"""


def rgb(css):
    return [float(v) for v in css[css.index("(") + 1 : css.index(")")].replace("/", ",").split(",")[:3]]


def hexed(css):
    return "#%02x%02x%02x" % tuple(round(v) for v in rgb(css))


def png_rows(body):
    pos, idat = 8, b""
    while pos < len(body):
        size, kind = struct.unpack(">I4s", body[pos : pos + 8])
        chunk = body[pos + 8 : pos + 8 + size]
        pos += 12 + size
        if kind == b"IHDR":
            width, height, depth, colour = struct.unpack(">IIBB", chunk[:10])
            assert (depth, colour) == (8, 2), "an 8-bit RGB PNG"
        elif kind == b"IDAT":
            idat += chunk
    raw = zlib.decompress(idat)
    stride = width * 3
    rows, prev, at = [], bytearray(stride), 0
    for _ in range(height):
        f = raw[at]
        line = bytearray(raw[at + 1 : at + 1 + stride])
        at += 1 + stride
        for k in range(stride):
            a = line[k - 3] if k >= 3 else 0
            b = prev[k]
            c = prev[k - 3] if k >= 3 else 0
            if f == 1:
                line[k] = (line[k] + a) & 255
            elif f == 2:
                line[k] = (line[k] + b) & 255
            elif f == 3:
                line[k] = (line[k] + ((a + b) >> 1)) & 255
            elif f == 4:
                guess = a + b - c
                pa, pb, pc = abs(guess - a), abs(guess - b), abs(guess - c)
                line[k] = (line[k] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        rows.append(line)
        prev = line
    return rows


def png_header(body):
    assert body[:8] == b"\x89PNG\r\n\x1a\n", "a PNG"
    width, height, depth, colour = struct.unpack(">IIBB", body[16:26])
    return width, height, depth, colour


def near(a, b, what, tol=3):
    assert max(abs(x - y) for x, y in zip(a, b)) <= tol, "%s: %s against %s" % (what, a, b)


def attend(pg, d):
    pg.goto(d.url + "#/gluck/" + MAIN)
    until(pg, "!!document.querySelector('.fw') && document.querySelector('.fw').dataset.link === 'live'")
    pg.wait_for_selector(".zr-pit .zr-pit-head .zr-input")
    pg.wait_for_timeout(500)


def home_screen(engine, ctx, pg, d):
    violations = []
    pg.on("console", lambda m: violations.append(m.text) if "Content Security Policy" in m.text or "Refused to" in m.text else None)
    attend(pg, d)
    head = pg.evaluate(HEAD)
    ground = hexed(head["ground"])

    assert head["capable"] == "yes" and head["mobileCapable"] == "yes", "%s: the page asks to open standalone: %s" % (engine, head)
    assert head["bar"] == "black-translucent", "%s: the status bar floats over the dark page: %s" % (engine, head["bar"])
    assert head["title"] == "figaro", "%s: the home screen label: %s" % (engine, head["title"])
    assert "viewport-fit=cover" in head["viewport"], "%s: the page reaches under the notch, so the safe areas are its own to keep: %s" % (engine, head["viewport"])
    assert head["theme"] == ground, "%s: theme-color is the composer's colour: %s against %s" % (engine, head["theme"], ground)

    link = head["manifest"]
    assert link and link["crossorigin"] == "use-credentials", "%s: the manifest link carries the session cookie (the edge signs people in before it serves anything): %s" % (engine, link)
    assert link["href"].startswith(d.url + "assets/") or link["href"].startswith(d.base + "/chat/assets/"), "%s: the manifest is a hashed asset beside the page: %s" % (engine, link["href"])
    reply = ctx.request.get(link["href"])
    assert reply.status == 200, "%s: the manifest is served: %s" % (engine, reply.status)
    assert reply.headers["content-type"].split(";")[0] == "application/manifest+json", "%s: the manifest has its own type: %s" % (engine, reply.headers["content-type"])
    doc = json.loads(reply.body())
    assert doc["display"] == "standalone", doc
    assert doc["name"] and doc["short_name"], doc
    served = urlparse(d.url).path
    assert doc["start_url"] == served and doc["scope"] == served, "%s: start_url and scope are the absolute base the page is served at (%s): %s, %s" % (engine, served, doc["start_url"], doc["scope"])
    start, scope = urljoin(link["href"], doc["start_url"]), urljoin(link["href"], doc["scope"])
    assert start == d.url, "%s: start_url opens the app's own page: %s against %s" % (engine, start, d.url)
    assert start.startswith(scope) and scope == d.url, "%s: scope holds the start page and nothing wider: %s" % (engine, scope)
    assert doc["theme_color"] == ground and doc["background_color"] == ground, "%s: the launch screen and the bar are the composer's colour: %s against %s" % (engine, doc, ground)

    icons = {(i["sizes"], i.get("purpose", "any")): i for i in doc["icons"]}
    for key in (("192x192", "any"), ("512x512", "any"), ("512x512", "maskable")):
        assert key in icons, "%s: the manifest lists the %s icon: %s" % (engine, key, sorted(icons))
        icon = icons[key]
        assert icon["type"] == "image/png", icon
        got = ctx.request.get(urljoin(link["href"], icon["src"]))
        assert got.status == 200 and got.headers["content-type"] == "image/png", "%s: the %s icon is served: %s" % (engine, key, got.status)
        side = int(key[0].split("x")[0])
        assert png_header(got.body())[:2] == (side, side), "%s: the %s icon is that size" % (engine, key)
        if key[1] == "maskable":
            rows = png_rows(got.body())
            for x, y in ((2, 2), (side - 3, 2), (2, side - 3), (side - 3, side - 3), (side // 2, 6), (6, side // 2), (side - 7, side // 2), (side // 2, side - 7)):
                near(list(rows[y][x * 3 : x * 3 + 3]), rgb(head["ground"]), "%s: the maskable icon is the composer's colour out to its edge at (%d, %d)" % (engine, x, y))

    touch = head["touch"]
    assert touch and touch["sizes"] == "180x180", "%s: an apple-touch-icon is declared: %s" % (engine, touch)
    got = ctx.request.get(touch["href"])
    assert got.status == 200 and got.headers["content-type"] == "image/png"
    width, height, _, colour = png_header(got.body())
    assert (width, height) == (180, 180) and colour == 2, "%s: the touch icon is 180 px and opaque, iOS paints a transparent one black: %s" % (engine, (width, height, colour))

    assert not violations, "%s: nothing the home screen needs is refused by the page's policy: %s" % (engine, violations)
    return head


def safe_areas(ctx, pg, d):
    cdp = ctx.new_cdp_session(pg)
    top, bottom, side = 47, 34, 20
    cdp.send("Emulation.setSafeAreaInsetsOverride", {"insets": {"top": top, "bottom": bottom, "left": side, "right": side}})
    pg.wait_for_timeout(300)
    got = pg.evaluate("""() => { const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
      return { status: r('.fw-status'), glyph: r('.fw-status-glyph'), input: r('.zr-input'), attach: r('.zr-attach'), pair: r('.zr-pill-pair'), view: innerHeight, wide: innerWidth }; }""")
    assert got["glyph"]["t"] >= top, "portrait standalone: the status bar's content starts below the clock: %s" % got["glyph"]
    assert got["status"]["t"] == 0, "and the bar itself reaches the top edge, so no page colour shows behind the clock: %s" % got["status"]
    assert got["input"]["b"] <= got["view"] - 18, "the composer clears the home indicator: input ends at %s of %s" % (got["input"]["b"], got["view"])
    pg.locator(".zr-pit-knob").press("ArrowUp")
    pg.wait_for_selector(".zr-pit[data-snap='half']")
    pg.locator(".zr-pit-knob").press("ArrowUp")
    pg.wait_for_selector(".zr-pit[data-snap='full']")
    pg.evaluate("Promise.all(document.getAnimations().map(a => a.finished.catch(() => null)))")
    full = pg.evaluate("document.querySelector('.zr-pit').getBoundingClientRect().top")
    assert full >= top - 1, "the full drawer stops under the clock, not behind it: %s" % full
    body = pg.evaluate("(() => { const b = document.querySelector('.zr-pit-body'); return { bottom: b.getBoundingClientRect().bottom, view: innerHeight, last: b.lastElementChild.getBoundingClientRect().bottom }; })()")
    pg.evaluate("document.querySelector('.zr-pit-body').scrollTop = 99999")
    last = pg.evaluate("document.querySelector('.zr-pit-body').lastElementChild.getBoundingClientRect().bottom")
    assert last <= body["view"] - bottom + 1, "the last control of the drawer scrolls clear of the home indicator: %s of %s" % (last, body["view"])
    pg.keyboard.press("Escape")
    pg.wait_for_selector(".zr-pit[role=dialog]", state="detached")

    pg.set_viewport_size({"width": 844, "height": 390})
    cdp.send("Emulation.setSafeAreaInsetsOverride", {"insets": {"top": 0, "bottom": 21, "left": 47, "right": 47}})
    pg.wait_for_timeout(400)
    land = pg.evaluate("""() => { const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
      return { glyph: r('.fw-status-glyph'), attach: r('.zr-attach'), pair: r('.zr-pill-pair'), wide: innerWidth, view: innerHeight, input: r('.zr-input') }; }""")
    assert land["glyph"]["l"] >= 47 and land["attach"]["l"] >= 47, "landscape standalone: nothing sits under the notch: %s" % land
    assert land["pair"]["r"] <= land["wide"] - 47, "nor under the other side: %s" % land
    assert land["input"]["b"] <= land["view"] - 7, "the composer clears the bar: %s" % land
    cdp.send("Emulation.setSafeAreaInsetsOverride", {"insets": {"top": 0, "bottom": 0, "left": 0, "right": 0}})


with sync_playwright() as p:
    webkit = p.webkit.launch()
    phone = dict(p.devices["iPhone 15"])
    phone["viewport"] = {"width": 390, "height": 844}
    phone["screen"] = {"width": 390, "height": 844}
    d = Door(bundle, 12)
    doors.append(d)
    ctx = webkit.new_context(**phone)
    ctx.set_default_timeout(HANG_MS)
    pg = ctx.new_page()
    home_screen("webkit", ctx, pg, d)
    ctx.close()
    webkit.close()

    chromium = p.chromium.launch()
    d = Door(bundle, 12)
    doors.append(d)
    ctx = chromium.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True)
    ctx.set_default_timeout(HANG_MS)
    pg = ctx.new_page()
    home_screen("chromium", ctx, pg, d)
    cdp = ctx.new_cdp_session(pg)
    seen = cdp.send("Page.getAppManifest")
    assert not seen.get("errors"), "chromium parses the manifest without complaint: %s" % seen.get("errors")
    assert json.loads(seen["data"])["display"] == "standalone"
    safe_areas(ctx, pg, d)
    ctx.close()
    chromium.close()
print("standalone: ok")
