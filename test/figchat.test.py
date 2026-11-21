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
      for (const n of host.querySelectorAll('script, img:not(.fw-head), iframe, object, embed, svg, style, link')) found.push('element ' + n.tagName);
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

        def attend(pg, door, aria, turn=None):
            pg.goto("about:blank")
            pg.goto(door.url + "#/gluck/" + aria + (":%d" % turn if turn else ""))
            until(pg, "document.querySelector('.fw') && document.querySelector('.fw').dataset.link === 'live'", timeout=15000)

        def turns_shown(pg):
            return pg.evaluate("[...document.querySelectorAll('.nodi-turn')].map(n => Number(n.dataset.turn))")

        for width, height in ((390, 844), (1280, 800)):
            pg = fresh(width, height)
            pg.goto(fast.url)
            pg.wait_for_selector(".fw-thread")
            assert pg.title() == "figaro web"
            until(pg, "document.fonts.check('26px \"Jacquard 24\"')")
            assert pg.evaluate("document.querySelectorAll('script:not([src]), style, [style]').length") == 0, "no inline script or style under the CSP"
            assert pg.locator(".fw-thread").count() == 8, "list is paged at eight"
            sans_free(pg, "the list at %d" % width)
            no_sideways(pg, width, "the list")
            assert not pg.errors, pg.errors
            snap(pg, "list-%d" % width)
            pg.close()

        for width, height in ((390, 844), (1280, 800)):
            tag = "%d" % width
            pg = fresh(width, height)
            attend(pg, fast, MAIN)

            first = turns_shown(pg)
            assert first and first[-1] == 26 and len(first) < 26, "tail page only: %s" % first
            assert first == sorted(first) and len(set(first)) == len(first), first
            pg.wait_for_selector(".fw-thread", state="attached")
            rows = pg.locator(".fw-thread").count()
            assert rows == 8, "list is paged at eight, got %d" % rows
            if width >= 900:
                assert pg.locator(".fw-side").is_visible(), "the list sits beside the transcript at 1280"
            else:
                assert not pg.locator(".fw-side").is_visible(), "one pane at 390"
            if width >= 900:
                pg.locator(".fw-more").click()
                until(pg, "document.querySelectorAll('.fw-thread').length > 8")
                depths = pg.evaluate("[...document.querySelectorAll('.fw-thread')].map(a => a.dataset.depth)")
                assert "1" in depths, "children are indented under their parent: %s" % depths
            snap(pg, "attend-light-" + tag)

            before = len(turns_shown(pg))
            for _ in range(40):
                if pg.locator(".nodi-turn[data-turn='4']").count():
                    break
                pg.evaluate("window.scrollTo(0, 0)")
                pg.wait_for_timeout(120)
            assert pg.locator(".nodi-turn[data-turn='4']").count() == 1, "scrolling up pages older turns in: %s" % turns_shown(pg)
            got = turns_shown(pg)
            assert len(got) - before >= 10, "read back ten turns or more: %d -> %d" % (before, len(got))
            assert got == sorted(got) and len(set(got)) == len(got), "older pages land in order without repeats: %s" % got
            assert pg.locator(".nodi-unknown").count() == 1, pg.locator(".nodi-unknown").count()
            assert "Unknown node: sparkle" in pg.locator(".nodi-unknown").inner_text()
            assert pg.locator(".nodi-said[data-from='aria'] .nodi-who").first.inner_text() == "Il Zanni"
            assert pg.locator(".nodi-said[data-from='caller'] .nodi-who").first.inner_text() == "the King"
            assert pg.locator(".nodi-said[data-from='you']").count() > 3
            assert pg.locator(".nodi-steering .nodi-who").first.inner_text() == "Il Zanni"
            tool = pg.locator(".nodi-turn[data-turn='7'] .nodi-tool")
            assert tool.evaluate("n => n.open") is False, "tool blocks are collapsed"
            tool.locator("summary").click()
            assert tool.evaluate("n => n.open") is True
            assert "go test" in tool.locator(".nodi-tool-args").inner_text(), tool.evaluate("n => n.outerHTML")
            assert tool.locator(".nodi-tool-out").is_visible()
            assert "clipped" in tool.locator(".nodi-clipped").inner_text(), "a clipped result says so"
            sans_free(pg, "history at %d" % width)
            no_sideways(pg, width, "history")
            assert not pg.errors, pg.errors
            pg.close()

        pg = fresh()
        attend(pg, fast, MAIN)
        pg.evaluate("window.scrollTo(0, 0)")
        until(pg, "document.querySelector('.nodi-turn') && Number(document.querySelector('.nodi-turn').dataset.turn) < 20", timeout=10000)
        pg.wait_for_timeout(400)
        anchor = pg.evaluate("window.scrollY")
        assert anchor > 0, "paging in older turns keeps the reader where they were, not at the top: %s" % anchor
        pg.close()

        deep = fresh()
        attend(deep, fast, MAIN, 12)
        deep.wait_for_selector(".nodi-turn[data-turn='12']")
        until(deep, "() => { const r = document.querySelector(\"[data-turn='12']\").getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight; }", timeout=10000)
        assert deep.locator(".nodi-said[data-from='you'] .nodi-who").count() >= 1
        assert "Gluck at the terminal" in deep.locator(".nodi-turn[data-turn='12']").inner_text(), "a terminal caller keeps its name"
        deep.close()

        pg = fresh()
        attend(pg, door(12), MAIN, 3)
        pg.wait_for_selector(".nodi-turn[data-turn='3']")
        pg.wait_for_timeout(300)
        assert hostile_findings(pg) == [], hostile_findings(pg)
        text = pg.locator(".nodi-turn[data-turn='3']").inner_text()
        assert EVIL in text, "hostile markup shows up as the characters it is"
        assert "U+202E" in text and "U+200B" in text, "bidi and zero width marks are boxed"
        assert pg.locator(".nodi-turn[data-turn='3'] .nodi-a[href^='javascript']").count() == 0
        assert not pg.errors, pg.errors
        pg.evaluate("document.querySelector('.fw-main').insertAdjacentHTML('beforeend', '<iframe></iframe>')")
        assert any(f.startswith("element") for f in hostile_findings(pg)), "negative control: an injected element must be reported"
        pg.close()

        refused = fresh()
        refused.goto(fast.url + "#/gluck/" + "f" * 32)
        until(refused, "document.querySelector('.fw').dataset.link === 'gone'", timeout=10000)
        assert "No such aria" in refused.locator(".fw-main").inner_text()
        refused.goto("about:blank")
        refused.goto(fast.url + "#/nowhere/" + MAIN)
        refused.wait_for_selector(".fw-main")
        assert "No such store" in refused.locator(".fw-main").inner_text()
        refused.close()

        browser.close()
    print("figaro web: ok")
finally:
    for d in doors:
        d.stop()
