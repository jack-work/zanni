import json
import time
import os
import subprocess
import sys
import urllib.request

from playwright.sync_api import sync_playwright

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
shots = os.environ.get("FIGCHAT_SHOTS", "")
bundle = os.path.abspath(sys.argv[1])
MAIN = "c0ffee01" * 4
LANE = "c0ffee02" * 4
EVIL = '<img src=x onerror="window.__pwned=1">'


def hostile_findings(page):
    return page.evaluate("""() => {
      const found = [];
      if (window.__pwned) found.push('script ran');
      const host = document.querySelector('#app');
      for (const n of host.querySelectorAll('script, img:not(.figchat-head), iframe, object, embed, svg, style, link')) found.push('element ' + n.tagName);
      for (const n of host.querySelectorAll('*')) for (const a of n.attributes) if (/^on/i.test(a.name) || a.name === 'style') found.push('attribute ' + a.name);
      if (document.body.innerText.includes('\\u202e') || document.body.innerText.includes('\\u200b')) found.push('control char lives in the text');
      return found;
    }""")


def until(pg, js, timeout=10000):
    end = time.time() + timeout / 1000.0
    last = None
    while time.time() < end:
        last = pg.evaluate(js)
        if last:
            return last
        pg.wait_for_timeout(50)
    raise AssertionError("timed out waiting for: %s (last %r)" % (js, last))


SANS = """() => {
  const house = new Set(['EB Garamond','Jacquard 24','VT323']);
  const generic = new Set(['serif','monospace','Georgia','Times New Roman','Courier New','ui-monospace','SF Mono','Menlo','Consolas']);
  const bad = [];
  for (const n of document.querySelectorAll('body, body *')) {
    const cs = getComputedStyle(n);
    if (cs.display === 'none') continue;
    const own = [...n.childNodes].some(c => c.nodeType === 3 && c.textContent.trim()) || ['BUTTON','TEXTAREA','INPUT','SELECT'].includes(n.tagName) || n.tagName === 'TEXTAREA';
    if (!own) continue;
    const fams = cs.fontFamily.split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
    if (!house.has(fams[0]) || fams.some(f => !house.has(f) && !generic.has(f))) bad.push(n.tagName + '.' + n.className + ' => ' + cs.fontFamily);
  }
  return bad;
}"""


def sans_free(pg, what):
    bad = pg.evaluate(SANS)
    assert bad == [], "%s draws text outside the house faces: %s" % (what, bad)


def no_sideways(pg, width, what):
    got = pg.evaluate("[document.documentElement.scrollWidth, document.body.scrollWidth]")
    assert max(got) <= width, "%s scrolls sideways at %d: %s" % (what, width, got)


class Door:
    def __init__(self, bundle, step):
        self.proc = subprocess.Popen(["node", os.path.join(root, "test", "figchat-server.js"), bundle, str(step)], stdout=subprocess.PIPE, text=True)
        self.port = int(self.proc.stdout.readline())
        self.base = "http://127.0.0.1:%d" % self.port
        self.url = self.base + "/chat/"

    def state(self):
        return json.load(urllib.request.urlopen(self.base + "/__state"))

    def drop(self):
        urllib.request.urlopen(self.base + "/__drop").read()

    def stop(self):
        self.proc.terminate()
        self.proc.wait()


doors = []


def door(step):
    d = Door(bundle, step)
    doors.append(d)
    return d


fast = door(12)

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox", "--disable-audio-output", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"])

        def fresh(width=390, height=844, scheme="light"):
            phone = width < 600
            ctx = browser.new_context(viewport={"width": width, "height": height}, color_scheme=scheme, is_mobile=phone, has_touch=phone)
            pg = ctx.new_page()
            pg.errors = []
            pg.on("pageerror", lambda e: pg.errors.append(str(e)))
            pg.on("console", lambda m: pg.errors.append(m.text) if m.type == "error" else None)
            return pg

        def snap(pg, name):
            if shots:
                os.makedirs(shots, exist_ok=True)
                pg.screenshot(path=os.path.join(shots, name + ".png"))

        for width, height in ((390, 844), (1280, 800)):
            pg = fresh(width, height)
            pg.goto(fast.url)
            pg.wait_for_selector(".fw-title")
            assert pg.title() == "figaro web"
            assert pg.locator(".fw-title").inner_text() == "figaro web"
            until(pg, "document.fonts.check('26px \"Jacquard 24\"')")
            assert pg.evaluate("document.querySelectorAll('script:not([src]), style, [style]').length") == 0, "no inline script or style under the CSP"
            sans_free(pg, "the blank shell at %d" % width)
            no_sideways(pg, width, "the blank shell")
            assert not pg.errors, pg.errors
            snap(pg, "shell-%d" % width)
            pg.close()

        browser.close()
    print("figaro web: ok")
finally:
    for d in doors:
        d.stop()
