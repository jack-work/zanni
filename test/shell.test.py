"""Shell in a real browser, from the served package, row by row against keel's viewer tests
(theme-toggle.py, panes.py, compact-bar.py): the theme follows the system until a pick that
differs from it, the pick survives a reload and the system's own scheme forgets it; the panes
resize by drag and by key, collapse, and are remembered as JSON, with no style attribute; the
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


def drag(pg, sel, dx):
    box = pg.locator(sel).bounding_box()
    x, y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    pg.mouse.move(x, y)
    pg.mouse.down()
    pg.mouse.move(x + dx, y, steps=6)
    pg.mouse.up()
    pg.wait_for_timeout(120)


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


MOTION = """(id) => document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.id === id)
  .flatMap(a => a.effect.getKeyframes().flatMap(k => Object.keys(k))).filter(k => !['offset', 'easing', 'composite', 'computedOffset'].includes(k))"""


def props(pg, id):
    return sorted(set(pg.evaluate(MOTION, id)))


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
    check("hosts fired once, naming main, the left pane and the right pane", pg.evaluate("shellLog.filter(e => e[0] === 'hosts').map(e => e[1])") == [{"main": "main", "left": "tree", "right": "pane"}], pg.evaluate("shellLog"))
    check("the tree opens at 280", width(pg, "#tree") == 280, width(pg, "#tree"))
    check("the comments pane opens at 360", width(pg, "#pane") == 360, width(pg, "#pane"))
    check("both columns have a separator", pg.locator("#tree [role=separator], #pane [role=separator]").count() == 2)
    check("the stable control ids exist", all(pg.locator(s).count() == 1 for s in ["#b-tree", "#b-pane", "#b-theme", "#b-repo", "#b-crumbs"]))
    order = ["#b-tree", "#b-repo", "#b-crumbs", "#b-nav", "#b-live", "#b-zoom", "#b-theme", "#b-pane"]
    xs = pg.evaluate("(sels) => sels.map(s => document.querySelector(s).getBoundingClientRect().left)", order)
    check("the wide bar keeps keel's order", xs == sorted(xs), list(zip(order, xs)))
    check("no menu button on a wide bar", not pg.locator(".zr-bar-menu").is_visible())
    bar_h = "%dpx" % pg.evaluate("Math.round(document.querySelector('#bar').getBoundingClientRect().height)")
    check("wide: pad and shown are 0, height is the bar's", var(pg, "--proscenio-pad") == "0px" and var(pg, "--proscenio-shown") == "0px" and var(pg, "--proscenio-height") == bar_h != "0px", (var(pg, "--proscenio-pad"), var(pg, "--proscenio-shown"), var(pg, "--proscenio-height"), bar_h))
    check("an unresized shell carries no style attribute", pg.evaluate("[document.documentElement, document.body, ...document.querySelectorAll('#root *')].filter(n => n.hasAttribute('style')).length") == 0)
    shot(pg, "wide")
    pg.click("#b-tree")
    pg.wait_for_timeout(300)
    check("the bar toggle collapses the tree", width(pg, "#tree") == 0 and pg.get_attribute("#b-tree", "aria-expanded") == "false", width(pg, "#tree"))
    pg.click("#b-tree")
    pg.wait_for_timeout(150)
    check("and brings it back at its width", width(pg, "#tree") == 280)
    drag(pg, "#tree .zr-pane-grip", 70)
    check("a drag widens the tree", width(pg, "#tree") == 350, width(pg, "#tree"))
    drag(pg, "#pane .zr-pane-grip", 60)
    check("the comments pane drags the other way", width(pg, "#pane") == 300, width(pg, "#pane"))
    drag(pg, "#tree .zr-pane-grip", -1000)
    check("a drag far past the minimum collapses it", width(pg, "#tree") == 0 and pg.get_attribute("#b-tree", "aria-expanded") == "false", width(pg, "#tree"))
    pg.click("#b-tree")
    pg.wait_for_timeout(150)
    pg.locator("#tree .zr-pane-grip").focus()
    before = width(pg, "#tree")
    pg.keyboard.press("ArrowRight")
    check("the separator answers ArrowRight", width(pg, "#tree") == before + 16, (before, width(pg, "#tree")))
    pg.keyboard.press("Enter")
    pg.wait_for_timeout(300)
    check("and Enter collapses", width(pg, "#tree") == 0)
    pg.click("#b-tree")
    pg.wait_for_timeout(120)
    kept = width(pg, "#tree")
    check("pane state is JSON {w, open}", json.loads(stored(pg, "paperd.tree")) == {"w": kept, "open": True} and json.loads(stored(pg, "paperd.pane")) == {"w": 300, "open": True}, (stored(pg, "paperd.tree"), stored(pg, "paperd.pane")))
    pg.reload()
    pg.wait_for_selector("#main .doc")
    pg.wait_for_timeout(250)
    check("widths survive a reload", width(pg, "#tree") == kept and width(pg, "#pane") == 300, (width(pg, "#tree"), width(pg, "#pane")))
    pg.click("#b-pane")
    pg.reload()
    pg.wait_for_selector("#main .doc")
    pg.wait_for_timeout(250)
    check("a collapsed comments pane stays collapsed", width(pg, "#pane") == 0)
    check("the main view takes the room", width(pg, "#main") > 1280 - kept - 4, width(pg, "#main"))
    c.close()

    c, pg, errors = load(b, 1280, 800)
    pg.click("#b-tree")
    check("closing a docked pane animates transform and opacity only", props(pg, "tree") == ["opacity", "transform"], props(pg, "tree"))
    pg.wait_for_timeout(400)
    check("and the column is gone once it has left", width(pg, "#tree") == 0 and not pg.evaluate("document.querySelector('#tree').hasAttribute('data-leaving')"))
    pg.click("#b-tree")
    check("opening animates transform and opacity only", props(pg, "tree") == ["opacity", "transform"], props(pg, "tree"))
    pg.wait_for_timeout(400)
    pg.locator("#tree .zr-pane-grip").focus()
    pg.keyboard.press("ArrowRight")
    check("a key resize slides the neighbour by transform only", props(pg, "main") == ["transform"], props(pg, "main"))
    pg.wait_for_timeout(300)
    drag(pg, "#tree .zr-pane-grip", 30)
    check("a drag is direct: no animation follows it", props(pg, "main") == [] and props(pg, "tree") == [])
    pg.click("#b-pane")
    check("the right pane closes with transform and opacity too", props(pg, "pane") == ["opacity", "transform"], props(pg, "pane"))
    c.close()

    c, pg, errors = load(b, 1280, 800, reduced_motion="reduce")
    pg.click("#b-tree")
    check("reduced motion: closing a pane starts no animation and the column goes at once", pg.evaluate("document.getAnimations().length") == 0 and width(pg, "#tree") == 0)
    pg.click("#b-tree")
    pg.locator("#tree .zr-pane-grip").focus()
    pg.keyboard.press("ArrowRight")
    check("reduced motion: opening and resizing start none", pg.evaluate("document.getAnimations().length") == 0)
    c.close()
    c, pg, errors = load(b, 390, 844, has_touch=True, is_mobile=True, reduced_motion="reduce")
    ms = pg.evaluate("(() => { const v = getComputedStyle(document.querySelector('#tree')).transitionDuration.split(',')[0].trim(); return v.endsWith('ms') ? parseFloat(v) : parseFloat(v) * 1000; })()")
    check("reduced motion: the drawer's transition is instant", ms <= 1, ms)
    c.close()
    c, pg, errors = load(b, 390, 844, has_touch=True, is_mobile=True)
    check("the drawer and the bar move by transform, the sheet too", all(pg.evaluate("(s) => getComputedStyle(document.querySelector(s)).transitionProperty.split(',')[0].trim()", s) == "transform" for s in ["#tree", "#pane", "#bar"]))
    c.close()

    c, pg, errors = load(b, 1280, 800)
    pg.evaluate("localStorage.setItem('paperd.tree', '0'); localStorage.setItem('paperd.pane', '1')")
    pg.reload()
    pg.wait_for_selector("#main .doc")
    pg.wait_for_timeout(250)
    check("a stored 0 or 1 is ignored: both columns open at their defaults", width(pg, "#tree") == 280 and width(pg, "#pane") == 360, (width(pg, "#tree"), width(pg, "#pane")))
    pg.click("#tree [role=tab]:nth-of-type(2)")
    check("the left tab is remembered", stored(pg, "paperd.tree.tab") == "Pages" and pg.evaluate("shellLog.filter(e => e[0] === 'open').length") == 0)
    c.close()

    for w, h in ((360, 780), (390, 844)):
        c, pg, errors = load(b, w, h, has_touch=True, is_mobile=True)
        cdp = c.new_cdp_session(pg)
        row = pg.evaluate(ROW)
        ids = [r["id"] for r in row]
        mids = [(r["t"] + r["b"]) / 2 for r in row]
        check("%d: one row of files, path, comments, more, inside the screen" % w, ids == ["b-tree", "b-crumbs", "b-pane", "more"] and max(mids) - min(mids) < 3 and max(r["r"] for r in row) <= w, row)
        check("%d: pad, shown and height agree, and the main view is padded by the pad" % w, var(pg, "--proscenio-pad") == var(pg, "--proscenio-shown") == var(pg, "--proscenio-height") != "0px" and pg.evaluate("getComputedStyle(document.querySelector('#main')).paddingTop") == var(pg, "--proscenio-pad"))
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
        scroll(pg, 700)
        check("%d: scrolling up shows it" % w, not pg.evaluate(HIDDEN) and var(pg, "--proscenio-shown") == var(pg, "--proscenio-height"))
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
        pg.evaluate("document.querySelector('#b-tree').focus()")
        pg.wait_for_timeout(200)
        check("%d: focusing a bar control shows a hidden bar" % w, not pg.evaluate(HIDDEN))
        scroll(pg, 0)

        pg.tap("#b-tree")
        pg.wait_for_timeout(500)
        tree = pg.evaluate("(() => { const t = document.querySelector('#tree'); const r = t.getBoundingClientRect(); return { open: t.hasAttribute('data-open'), left: r.left, top: r.top, role: t.getAttribute('role'), modal: t.getAttribute('aria-modal') } })()")
        check("%d: the files button opens a drawer below the bar" % w, tree["open"] and tree["left"] == 0 and tree["top"] == int(var(pg, "--proscenio-shown")[:-2]) and tree["role"] == "dialog" and tree["modal"] == "true", tree)
        check("%d: focus moves into the drawer, and a scrim shows" % w, pg.evaluate("document.querySelector('#tree').contains(document.activeElement)") and pg.locator(".zr-scrim").count() == 1)
        check("%d: opening the drawer left the desktop column state alone" % w, stored(pg, "paperd.tree") is not None and json.loads(stored(pg, "paperd.tree"))["open"] is True)
        if w == 390:
            shot(pg, "drawer-390")
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(450)
        check("%d: Escape closes the drawer and focus goes back to its button" % w, not pg.evaluate("document.querySelector('#tree').hasAttribute('data-open')") and pg.evaluate("document.activeElement.id") == "b-tree")
        pg.tap("#b-pane")
        pg.wait_for_timeout(500)
        sheet = pg.evaluate("(() => { const t = document.querySelector('#pane'); const r = t.getBoundingClientRect(); return { open: t.hasAttribute('data-open'), bottom: r.bottom, h: r.height, vh: innerHeight } })()")
        check("%d: the comments button opens a bottom sheet" % w, sheet["open"] and abs(sheet["bottom"] - sheet["vh"]) < 1 and sheet["h"] > 100, sheet)
        if w == 390:
            shot(pg, "sheet-390")
        touch(cdp, pg, 200, 60)
        pg.wait_for_timeout(450)
        check("%d: the scrim closes the sheet" % w, not pg.evaluate("document.querySelector('#pane').hasAttribute('data-open')"))
        pg.tap("#b-tree")
        pg.wait_for_timeout(450)
        pg.tap("#b-pane")
        pg.wait_for_timeout(450)
        check("%d: opening the sheet closes the drawer" % w, pg.evaluate("document.querySelector('#pane').hasAttribute('data-open') && !document.querySelector('#tree').hasAttribute('data-open')"))
        check("%d: no page error" % w, not errors, errors)
        c.close()

    c, pg, errors = load(b, 844, 390, has_touch=True, is_mobile=True)
    check("844x390 is under the 900 breakpoint: the narrow form, one row, no sideways overflow", pg.locator(".zr-bar-menu").is_visible() and pg.evaluate("document.documentElement.scrollWidth") <= 844 and width(pg, "#main") == 844, width(pg, "#main"))
    shot(pg, "landscape-844x390")
    c.close()

    c, pg, errors = load(b, 1280, 800)
    pg.set_viewport_size({"width": 700, "height": 800})
    pg.wait_for_timeout(300)
    check("crossing below the breakpoint turns the columns into overlays and shows the menu", pg.locator(".zr-bar-menu").is_visible() and not pg.evaluate("document.querySelector('#tree').hasAttribute('data-open')"))
    check("and below the breakpoint no separator shows", not pg.locator("#tree .zr-pane-grip").is_visible())
    pg.set_viewport_size({"width": 1280, "height": 800})
    pg.wait_for_timeout(300)
    check("crossing back restores the columns", width(pg, "#tree") == 280 and pg.locator(".zr-bar-menu").is_hidden())
    check("no page error", not errors, errors)
    c.close()
    b.close()

print("%d failed" % len(fails) if fails else "ok")
sys.exit(1 if fails else 0)
