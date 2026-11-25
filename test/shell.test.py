"""Shell in a real browser, from the served package, row by row against keel's viewer tests
(theme-toggle.py, compact-bar.py): the theme follows the system until a pick that
differs from it, the pick survives a reload and the system's own scheme forgets it; the
phone bar is one row that fits, folds the rest into a menu that closes, leaves on scroll down,
returns on scroll up or a short tap at the top, and a long press, a sideways drag or a tap
below the top do not bring it back; the header's variables are what keel's sticky rules read.

  python3 test/shell.test.py BUNDLE_DIR      (BUNDLE_DIR is packages.zanni-react's output)
"""
import base64
import hashlib
import http.server
import json
import os
import re
import sys
import threading

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUNDLE = os.path.abspath(sys.argv[1])
SHOTS = os.environ.get("SHELL_SHOTS", "")
VERSION = json.load(open(os.path.join(ROOT, "assets/manifest.json")))["version"]
TYPES = {".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".woff2": "font/woff2", ".json": "application/json"}


def page_for_version():
    html = open(os.path.join(ROOT, "examples/shell.html")).read()
    old = re.search(r'<script type="importmap">(.*?)</script>', html, re.S).group(1)
    new = re.sub(r"/(react|runtime)/\d+\.\d+\.\d+/", lambda m: "/%s/%s/" % (m.group(1), VERSION), old)
    digest = base64.b64encode(hashlib.sha256(new.encode()).digest()).decode()
    html = html.replace(old, new)
    html = re.sub(r"'sha256-[^']+'", "'sha256-%s'" % digest, html)
    return re.sub(r"/zanni/react/\d+\.\d+\.\d+/index\.css", "/zanni/react/%s/index.css" % VERSION, html).encode()


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/examples/shell.html":
            body, kind = page_for_version(), "text/html"
        else:
            if path.startswith("/zanni/"):
                base, rel = BUNDLE, path[len("/zanni/"):]
            else:
                base, rel = ROOT, path.lstrip("/")
            full = os.path.realpath(os.path.join(base, rel))
            if not full.startswith(base) or not os.path.isfile(full):
                self.send_response(404)
                self.end_headers()
                return
            body, kind = open(full, "rb").read(), TYPES.get(os.path.splitext(full)[1], "application/octet-stream")
        self.send_response(200)
        self.send_header("Content-Type", kind)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
URL = "http://127.0.0.1:%d/examples/shell.html" % server.server_address[1]

fails = []


def check(name, ok, detail=""):
    print(("PASS  " if ok else "FAIL  ") + name + (("  -- " + str(detail)) if detail and not ok else ""))
    if not ok:
        fails.append(name)
    sys.stdout.flush()


def width(pg, sel):
    return pg.evaluate("(s) => Math.round(document.querySelector(s).getBoundingClientRect().width)", sel)


def var(pg, name):
    return pg.evaluate("(n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim()", name)



def load(b, w, h, **ctx):
    c = b.new_context(viewport={"width": w, "height": h}, **ctx)
    pg = c.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.goto(URL)
    pg.wait_for_selector("#main .doc")
    pg.wait_for_timeout(250)
    return c, pg, errors


def stored(pg, key):
    return pg.evaluate("(k) => localStorage.getItem(k)", key)


ROW = """() => [...document.querySelectorAll('#bar [data-slot], #bar .zr-bar-menu')].filter(e => e.getBoundingClientRect().width && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden')
  .map(e => { const r = e.getBoundingClientRect(); const id = e.id || (e.classList.contains('zr-bar-menu') ? 'more' : (e.querySelector('[id]') || {}).id || e.dataset.slot); return { id, l: r.left, r: r.right, t: r.top, b: r.bottom }; })
  .sort((a, b) => a.l - b.l)"""
HIDDEN = "() => document.querySelector('#bar').hasAttribute('data-hidden')"
MENU = "() => document.querySelector('#bar').hasAttribute('data-menu')"


def touch(cdp, pg, x, y, hold=60, dx=0):
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y}]})
    if dx:
        for i in range(1, 6):
            cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x + dx * i / 5, "y": y}]})
    pg.wait_for_timeout(hold)
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    pg.wait_for_timeout(350)


def scroll(pg, y):
    pg.evaluate("(y) => { document.querySelector('#main').scrollTop = y; }", y)
    pg.wait_for_timeout(250)






def shot(pg, name):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        pg.screenshot(path=os.path.join(SHOTS, name + ".png"))


with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])

    c, pg, errors = load(b, 1280, 800, color_scheme="dark")
    state = lambda: pg.evaluate("() => ({ theme: document.documentElement.dataset.theme, scheme: getComputedStyle(document.documentElement).colorScheme, bg: getComputedStyle(document.body).backgroundColor })")
    s = state()
    check("a dark system starts dark, with nothing stored", s["theme"] == "dark" and stored(pg, "paperd.theme") is None and s["scheme"] == "dark", s)
    dark_bg = s["bg"]
    pg.click("#b-theme")
    pg.wait_for_timeout(200)
    s = state()
    check("the toggle switches the page", s["theme"] == "light" and s["bg"] != dark_bg and s["scheme"] == "light", s)
    check("the pick is stored", stored(pg, "paperd.theme") == "light")
    check("onTheme hears each theme", pg.evaluate("shellLog.filter(e => e[0] === 'theme').map(e => e[1])") == ["dark", "light"])
    pg.reload()
    pg.wait_for_selector("#main .doc")
    check("the pick survives a reload", state()["theme"] == "light")
    pg.click("#b-theme")
    pg.wait_for_timeout(200)
    check("picking the system scheme forgets the override", state()["theme"] == "dark" and stored(pg, "paperd.theme") is None)
    pg.emulate_media(color_scheme="light")
    pg.wait_for_timeout(250)
    check("with no pick, a system change is followed live", state()["theme"] == "light")
    pg.emulate_media(color_scheme="dark")
    pg.wait_for_timeout(200)
    check("and a pick that differs from the system outlasts a system change", state()["theme"] == "dark")
    c.close()

    c, pg, errors = load(b, 1280, 800)
    check("hosts fired once, naming main", pg.evaluate("shellLog.filter(e => e[0] === 'hosts').map(e => e[1])") == [{"main": "main"}], pg.evaluate("shellLog"))
    check("the stable control ids exist", all(pg.locator(s).count() == 1 for s in ["#b-theme", "#b-repo", "#b-crumbs"]))
    order = ["#b-repo", "#b-crumbs", "#b-nav", "#b-live", "#b-zoom", "#b-theme"]
    xs = pg.evaluate("(sels) => sels.map(s => document.querySelector(s).getBoundingClientRect().left)", order)
    check("the wide bar keeps keel's order", xs == sorted(xs), list(zip(order, xs)))
    check("no menu button on a wide bar", not pg.locator(".zr-bar-menu").is_visible())
    bar_h = "%dpx" % pg.evaluate("Math.round(document.querySelector('#bar').getBoundingClientRect().height)")
    check("wide: pad and shown are 0, height is the bar's", var(pg, "--proscenio-pad") == "0px" and var(pg, "--proscenio-shown") == "0px" and var(pg, "--proscenio-height") == bar_h != "0px", (var(pg, "--proscenio-pad"), var(pg, "--proscenio-shown"), var(pg, "--proscenio-height"), bar_h))
    check("an unresized shell carries no style attribute", pg.evaluate("[document.documentElement, document.body, ...document.querySelectorAll('#root *')].filter(n => n.hasAttribute('style')).length") == 0)
    shot(pg, "wide")
    c.close()

    c, pg, errors = load(b, 390, 844, has_touch=True, is_mobile=True)
    check("the bar moves by transform", pg.evaluate("getComputedStyle(document.querySelector('#bar')).transitionProperty.split(',')[0].trim()") == "transform")
    c.close()

    for w, h in ((360, 780), (390, 844)):
        c, pg, errors = load(b, w, h, has_touch=True, is_mobile=True)
        cdp = c.new_cdp_session(pg)
        row = pg.evaluate(ROW)
        ids = [r["id"] for r in row]
        mids = [(r["t"] + r["b"]) / 2 for r in row]
        check("%d: one row of path and more, inside the screen" % w, ids == ["b-crumbs", "more"] and max(mids) - min(mids) < 3 and max(r["r"] for r in row) <= w, row)
        check("%d: pad, shown and height agree, and the main view is padded by the pad" % w, var(pg, "--proscenio-pad") == var(pg, "--proscenio-shown") == var(pg, "--proscenio-height") != "0px" and pg.evaluate("Math.round(document.querySelector('#doc-head').getBoundingClientRect().top)") == int(var(pg, "--proscenio-pad")[:-2]))
        check("%d: the bar is fixed" % w, pg.evaluate("getComputedStyle(document.querySelector('#bar')).position") == "fixed")
        check("%d: no style attribute anywhere" % w, pg.evaluate("[document.documentElement, document.body, ...document.querySelectorAll('#root *')].filter(n => n.hasAttribute('style')).length") == 0)
        check("%d: nothing overflows sideways" % w, pg.evaluate("document.documentElement.scrollWidth") <= w)
        if w == 390:
            shot(pg, "narrow-390")
        pg.tap(".zr-bar-menu")
        pg.wait_for_timeout(200)
        items = pg.evaluate("""() => [...document.querySelectorAll('#bar .zr-bar-fold a, #bar .zr-bar-fold button, #bar .zr-bar-fold .chip')]
          .filter(e => e.getBoundingClientRect().width).map(e => { const r = e.getBoundingClientRect();
            return { t: (e.textContent || e.id).trim().slice(0, 20), inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight }; })""")
        got = " ".join(i["t"] for i in items)
        check("%d: the menu holds repo, History, Diff, live, zoom and the theme" % w, all(x in got for x in ["fx", "History", "Diff", "live", "zoom", "dark"]), got)
        check("%d: every menu item is on screen" % w, all(i["inside"] for i in items), [i for i in items if not i["inside"]])
        if w == 390:
            shot(pg, "menu-390")
        touch(cdp, pg, 180, 600)
        check("%d: a tap outside closes the menu" % w, not pg.evaluate(MENU))
        pg.tap(".zr-bar-menu")
        before = pg.evaluate("document.documentElement.dataset.theme")
        pg.tap("#b-theme")
        pg.wait_for_timeout(200)
        check("%d: the theme toggle works from the menu and closes it" % w, before != pg.evaluate("document.documentElement.dataset.theme") and not pg.evaluate(MENU))
        pg.tap(".zr-bar-menu")
        pg.tap("#b-history")
        check("%d: choosing a link closes the menu" % w, not pg.evaluate(MENU))
        pg.tap(".zr-bar-menu")
        pg.keyboard.press("Escape")
        check("%d: Escape closes the menu" % w, not pg.evaluate(MENU))

        scroll(pg, 400)
        scroll(pg, 900)
        check("%d: scrolling down hides the bar" % w, pg.evaluate(HIDDEN))
        check("%d: the bar leaves by transform" % w, pg.evaluate("getComputedStyle(document.querySelector('#bar')).transform") != "none")
        check("%d: shown is 0 while the pad holds" % w, var(pg, "--proscenio-shown") == "0px" and var(pg, "--proscenio-pad") != "0px")
        check("%d: a sticky rule on --proscenio-shown rides at the top of the view while the bar is away" % w, pg.evaluate("Math.round(document.querySelector('#doc-head').getBoundingClientRect().top)") == 0)
        scroll(pg, 700)
        check("%d: scrolling up shows it" % w, not pg.evaluate(HIDDEN) and var(pg, "--proscenio-shown") == var(pg, "--proscenio-height"))
        check("%d: and rides below it once it is back" % w, pg.evaluate("Math.round(document.querySelector('#doc-head').getBoundingClientRect().top)") == int(var(pg, "--proscenio-shown")[:-2]))
        scroll(pg, 1400)
        check("%d: down again hides it" % w, pg.evaluate(HIDDEN))
        touch(cdp, pg, 200, 20, hold=700)
        check("%d: a long press at the top does not show it" % w, pg.evaluate(HIDDEN))
        touch(cdp, pg, 250, 20, dx=-80)
        check("%d: a sideways drag at the top does not show it" % w, pg.evaluate(HIDDEN))
        touch(cdp, pg, 200, 300)
        check("%d: a tap below the top zone does not show it" % w, pg.evaluate(HIDDEN))
        touch(cdp, pg, 200, 20)
        check("%d: a short tap at the top shows it" % w, not pg.evaluate(HIDDEN))
        scroll(pg, 2400)
        pg.wait_for_timeout(200)
        pg.evaluate("document.querySelector('.zr-bar-menu').focus()")
        pg.wait_for_timeout(200)
        check("%d: focusing a bar control shows a hidden bar" % w, not pg.evaluate(HIDDEN))
        scroll(pg, 0)

        check("%d: no page error" % w, not errors, errors)
        c.close()

    c, pg, errors = load(b, 844, 390, has_touch=True, is_mobile=True)
    check("844x390 is under the 900 breakpoint: the narrow form, one row, no sideways overflow", pg.locator(".zr-bar-menu").is_visible() and pg.evaluate("document.documentElement.scrollWidth") <= 844 and width(pg, "#main") == 844, width(pg, "#main"))
    shot(pg, "landscape-844x390")
    c.close()

    c, pg, errors = load(b, 1280, 800)
    pg.set_viewport_size({"width": 700, "height": 800})
    pg.wait_for_timeout(300)
    check("crossing below the breakpoint shows the menu", pg.locator(".zr-bar-menu").is_visible())
    pg.set_viewport_size({"width": 1280, "height": 800})
    pg.wait_for_timeout(300)
    check("crossing back hides it", pg.locator(".zr-bar-menu").is_hidden())
    check("no page error", not errors, errors)
    c.close()
    b.close()

print("%d failed" % len(fails) if fails else "ok")
sys.exit(1 if fails else 0)
