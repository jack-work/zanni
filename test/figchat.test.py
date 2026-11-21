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
      for (const n of host.querySelectorAll('*')) for (const a of n.attributes) if (/^on/i.test(a.name) || (a.name === 'style' && a.value.trim())) found.push('attribute ' + a.name + ' on ' + n.tagName + '.' + n.className);
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

        def send(pg, text):
            pg.locator(".fw-input").fill(text)
            pg.locator(".fw-send").click()

        def running(pg):
            return pg.evaluate("document.querySelector('.fw').hasAttribute('data-running')")

        for width, height, scheme in ((390, 844, "light"), (390, 844, "dark"), (1280, 800, "light"), (1280, 800, "dark")):
            pg = fresh(width, height, scheme)
            attend(pg, door(45), MAIN)
            idle = pg.locator(".fw-composer").bounding_box()
            assert idle["height"] <= 76, "an idle composer is at most 76px tall: %s" % idle
            send(pg, "please run the tests")
            pg.wait_for_selector(".nodi-turn[data-turn='27'] .nodi-tool[data-status='running']", timeout=10000)
            thinking = pg.locator(".nodi-turn[data-turn='27'] .nodi-thinking")
            assert thinking.evaluate("n => n.open") is False, "thinking is collapsed while it streams"
            assert pg.locator(".nodi-turn[data-turn='27'][data-state='open']").count() == 1
            strip = pg.locator(".fw-strip")
            assert strip.is_visible(), "the strip says a turn is running"
            assert pg.locator(".fw-input").get_attribute("placeholder") == "Steer figaro"
            assert pg.locator(".fw-send").inner_text() == "Steer"
            box = pg.locator(".fw-composer").bounding_box()
            assert box["height"] <= 120, "a running composer is at most 120px tall: %s" % box
            sbox = strip.bounding_box()
            assert sbox["height"] <= 44, "the strip is one line high: %s" % sbox
            tbox = pg.locator(".fw-strip-text").bounding_box()
            assert tbox["height"] <= 24, "the strip text never wraps: %s" % tbox
            assert box["x"] >= 0 and box["x"] + box["width"] <= width, "the composer stays inside the screen: %s" % box
            row = pg.locator(".fw-compose-row").bounding_box()
            assert row["width"] <= 46 * 16, "the input row sits at the transcript measure: %s" % row
            for b in pg.locator(".fw-stop").all():
                bb = b.bounding_box()
                assert bb["height"] >= 44, "stop buttons are 44px targets: %s" % bb
            assert pg.locator(".fw-strip-time").inner_text()[0].isdigit()
            pg.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)")
            pg.wait_for_timeout(100)
            last = pg.evaluate("(() => { const n = [...document.querySelectorAll('.nodi-turn-body > *')].pop(); return n.getBoundingClientRect().bottom; })()")
            top = pg.locator(".fw-composer").bounding_box()["y"]
            assert last <= top + 1, "scrolled to the bottom, the last node ends above the composer: %s vs %s" % (last, top)
            no_sideways(pg, width, "running turn")
            snap(pg, "running-%s-%d" % (scheme, width))
            pg.wait_for_selector(".nodi-turn[data-turn='27'] .nodi-tool[data-status='ok']", timeout=10000)
            pg.wait_for_selector(".nodi-turn[data-turn='27']:not([data-state='open'])", timeout=10000)
            until(pg, "!document.querySelector('.fw-strip')", timeout=5000)
            thinking.locator("summary").click()
            assert thinking.evaluate("n => n.open") is True
            assert "answer plainly" in thinking.locator(".nodi-thought").inner_text()
            kinds = pg.evaluate("[...document.querySelectorAll('.nodi-turn[data-turn=\"27\"] .nodi-turn-body > *')].map(n => n.className.split(' ')[0])")
            assert kinds == ["nodi-input", "nodi-thinking", "nodi-prose", "nodi-tool", "nodi-prose"], kinds
            assert "please run the tests" in pg.locator(".nodi-turn[data-turn='27'] .nodi-input").inner_text()
            assert pg.locator(".fw-input").input_value() == ""
            assert pg.locator(".nodi-metrics").inner_text().startswith("ctx"), "metrics sit quietly above the transcript"
            idle = pg.locator(".fw-composer").bounding_box()
            assert idle["height"] <= 76, "the composer settles back to its idle height: %s" % idle
            snap(pg, "live-%s-%d" % (scheme, width))
            sans_free(pg, "live turn %s %d" % (scheme, width))
            no_sideways(pg, width, "live turn")
            assert hostile_findings(pg) == [], hostile_findings(pg)
            assert not pg.errors, pg.errors
            pg.close()

        pg = fresh()
        drop_door = door(12)
        attend(pg, drop_door, MAIN)
        send(pg, "run it and then [drop] the line")
        until(pg, "document.querySelector('.fw').hasAttribute('data-running')", timeout=10000)
        pg.wait_for_selector(".nodi-turn[data-turn='27'] .nodi-tool", timeout=10000)
        drop_door.drop()
        until(pg, "document.querySelector('.fw').dataset.link === 'offline'", timeout=5000)
        until(pg, "document.querySelector('.fw').dataset.link === 'live'", timeout=15000)
        until(pg, "!document.querySelector('.fw').hasAttribute('data-running')", timeout=15000)
        for want in ("27", "28"):
            if pg.locator(".nodi-turn[data-turn='%s']" % want).count():
                prose = pg.locator(".nodi-turn[data-turn='%s'] .nodi-prose" % want).count()
                assert prose <= 2, "no node drawn twice after the reconnect: %d" % prose
        last = turns_shown(pg)[-1]
        body = pg.evaluate("[...document.querySelectorAll('.nodi-turn[data-turn=\"%d\"] .nodi-turn-body > *')].map(n => n.className.split(' ')[0])" % last)
        assert body == ["nodi-input", "nodi-thinking", "nodi-prose", "nodi-tool", "nodi-prose"], body
        assert pg.locator(".nodi-turn[data-turn='%d'] .nodi-tool[data-status='ok']" % last).count() == 1
        assert not [e for e in pg.errors if "WebSocket" not in e and "websocket" not in e and "ERR_" not in e], pg.errors
        pg.close()

        pg = fresh()
        attend(pg, door(12), MAIN)
        send(pg, EVIL)
        pg.wait_for_selector(".nodi-turn[data-turn='27'] .nodi-input")
        pg.wait_for_selector(".nodi-turn[data-turn='27']:not([data-state='open'])", timeout=10000)
        assert hostile_findings(pg) == [], hostile_findings(pg)
        assert EVIL in pg.locator(".nodi-turn[data-turn='27'] .nodi-input").inner_text()
        assert not pg.errors, pg.errors
        pg.close()

        pg = fresh()
        slow = door(150)
        attend(pg, slow, MAIN)
        send(pg, "please run the build")
        pg.wait_for_selector(".nodi-turn[data-turn='27'] .nodi-tool", timeout=15000)
        pg.locator(".fw-stop:not(.fw-stop-clear)").click()
        pg.wait_for_selector(".nodi-turn[data-turn='27'] .nodi-end", timeout=10000)
        assert "interrupted" in pg.locator(".nodi-turn[data-turn='27'] .nodi-end").inner_text()
        until(pg, "!document.querySelector('.fw').hasAttribute('data-running')")
        assert slow.state()["interrupts"] == ["keep"], slow.state()
        send(pg, "second run the tests")
        pg.wait_for_selector(".nodi-turn[data-turn='28'] .nodi-thinking", timeout=15000)
        send(pg, "queued thought")
        until(pg, "document.querySelector('.fw').hasAttribute('data-running')")
        pg.locator(".fw-stop-clear").click()
        until(pg, "!document.querySelector('.fw').hasAttribute('data-running')", timeout=10000)
        assert slow.state()["interrupts"] == ["keep", "clear"], slow.state()
        assert pg.locator(".nodi-turn[data-turn='29']").count() == 0, "a cleared queue starts no turn"
        pg.close()

        pg = fresh()
        attend(pg, door(150), MAIN)
        send(pg, "start a long run please")
        pg.wait_for_selector(".nodi-turn[data-turn='27'] .nodi-tool[data-status='running']", timeout=20000)
        send(pg, "also mind the dark theme")
        pg.wait_for_selector(".nodi-turn[data-turn='27'] .nodi-steering", timeout=20000)
        assert "also mind the dark theme" in pg.locator(".nodi-turn[data-turn='27'] .nodi-steering").inner_text()
        assert pg.locator(".nodi-turn[data-turn='27'] .nodi-steering .nodi-who").inner_text() == "You"
        pg.close()

        pg = fresh()
        attend(pg, door(12), MAIN)
        pg.locator(".fw-fork").click()
        until(pg, "location.hash.startsWith('#/gluck/') && !location.hash.includes('%s')" % MAIN, timeout=10000)
        until(pg, "document.querySelector('.fw').dataset.link === 'live' && document.querySelectorAll('.nodi-turn').length >= 1", timeout=10000)
        assert pg.locator(".nodi-turn").count() >= 1, "the alternative opens with the history it was cut from"
        pg.close()

        pg = fresh()
        draft_door = door(12)
        attend(pg, draft_door, MAIN)
        pg.locator(".fw-input").fill("half a thought")
        pg.wait_for_timeout(600)
        pg.locator(".fw-back").click()
        pg.wait_for_selector(".fw-thread")
        pg.locator(".fw-thread[data-id='%s']" % LANE).click()
        until(pg, "document.querySelector('.fw').dataset.link === 'live'", timeout=10000)
        assert pg.locator(".fw-input").input_value() == "", "another aria has its own draft"
        pg.goto("about:blank")
        pg.goto(draft_door.url + "#/gluck/" + MAIN)
        until(pg, "document.querySelector('.fw-input')", timeout=10000)
        assert pg.locator(".fw-input").input_value() == "half a thought", "the draft survives a reload"
        pg.close()

        pg = fresh()
        door_v = door(12)
        attend(pg, door_v, MAIN)
        assert pg.locator(".fw-voice").get_attribute("aria-pressed") == "false", "voice starts off"
        pg.locator(".fw-voice").click()
        assert pg.locator(".fw-voice").get_attribute("aria-pressed") == "true"
        send(pg, "just a [plain] hello")
        pg.wait_for_selector(".nodi-turn[data-turn='27'] .voce[data-for='27']", timeout=15000)
        assert pg.locator(".nodi-turn[data-turn='27'] .nodi-prose .voce").count() == 1, "one player per turn, inside a prose node"
        assert pg.locator(".nodi-turn[data-turn='27'] .voce").count() == 1
        until(pg, "document.querySelector('.voce').dataset.state !== 'none'", 10000)
        until(pg, "['idle','loading','playing','paused'].includes(document.querySelector('.voce').dataset.state)", 15000)
        sans_free(pg, "voice player")
        assert door_v.state()["audio"] >= 1, "the gateway audio socket was opened by the voice toggle"
        pg.wait_for_selector(".nodi-turn[data-turn='27']:not([data-state='open'])", timeout=10000)
        pg.locator(".nodi-turn[data-turn='26'] .fw-replay").click()
        pg.wait_for_selector(".nodi-turn[data-turn='26'] .voce[data-for='26']", timeout=5000)
        until(pg, "['loading','playing','idle'].includes(document.querySelector(\".nodi-turn[data-turn='26'] .voce\").dataset.state)", 10000)
        assert pg.evaluate("window.localStorage.length + window.sessionStorage.length") == 0 or not pg.evaluate("Object.keys(window.localStorage).concat(Object.keys(window.sessionStorage)).some(k => /voice|hands/i.test(k))"), "voice and hands-free are never stored"
        pg.close()

        pg = fresh()
        pg.goto("about:blank")
        door_h = door(12)
        attend(pg, door_h, MAIN)
        pg.locator(".fw-hands").click()
        assert pg.locator(".fw-hands").get_attribute("aria-pressed") == "true"
        assert pg.locator(".fw-voice").get_attribute("aria-pressed") == "true", "hands-free turns the voice on"
        pg.locator(".fw-mic").click()
        until(pg, "document.querySelector('.fw').dataset.mic === 'recording'", 10000)
        send(pg, "just a [plain] hello")
        until(pg, "document.querySelector('.fw').dataset.audio === 'recording-with-pending'", 15000)
        pg.wait_for_selector(".nodi-turn[data-turn='27']:not([data-state='open'])", timeout=10000)
        assert pg.locator(".nodi-turn[data-turn='27'] .voce").count() == 0, "a reply arriving while Gluck records makes no sound and shows no player yet"
        pg.locator(".fw-mic").click()
        pg.wait_for_selector(".nodi-turn[data-turn='27'] .voce[data-for='27']", timeout=15000)
        until(pg, "document.querySelector('.fw').dataset.audio !== 'recording-with-pending' && document.querySelector('.fw').dataset.audio !== 'recording'", 10000)
        until(pg, "['live','draining','idle','playing'].includes(document.querySelector('.voce').dataset.state)", 15000)
        pg.locator(".fw-hands").click()
        assert pg.locator(".fw-hands").get_attribute("aria-pressed") == "false"
        pg.goto("about:blank")
        attend(pg, door_h, MAIN)
        assert pg.locator(".fw-hands").get_attribute("aria-pressed") == "false" and pg.locator(".fw-voice").get_attribute("aria-pressed") == "false", "a reload starts with hands-free and voice off"
        pg.close()

        mic_door = door(12)
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        pg = ctx.new_page()
        pg.errors = []
        pg.on("pageerror", lambda e: pg.errors.append(str(e)))
        attend(pg, mic_door, MAIN)
        assert pg.locator(".fw-mic").is_enabled()
        pg.locator(".fw-input").fill("typed first")
        pg.locator(".fw-mic").tap()
        until(pg, "document.querySelector('.fw').dataset.mic === 'recording'", 10000)
        pg.wait_for_timeout(600)
        pg.locator(".fw-mic").tap()
        until(pg, "document.querySelector('.fw-input').value.includes('crossing count')", 10000)
        assert pg.locator(".fw-input").input_value() == "typed first what is the crossing count", pg.locator(".fw-input").input_value()
        posts = mic_door.state()["stt"]
        assert len(posts) == 1 and posts[0]["type"].startswith("audio/") and posts[0]["size"] > 0, posts
        assert posts[0]["aria"] == "gluck/" + MAIN, posts
        assert mic_door.state()["sent"] == [], "the transcript is not sent until Gluck sends it"
        assert pg.evaluate("document.activeElement.className") == "fw-input", "the transcript lands with the cursor in the composer"
        pg.locator(".fw-input").fill("edited words")
        pg.locator(".fw-send").tap()
        until(pg, "document.querySelector(\"[data-turn='27']\")", 10000)
        assert mic_door.state()["sent"][0]["text"] == "edited words"
        sans_free(pg, "composer after the mic")
        pg.evaluate("document.querySelector('.fw-send').style.fontFamily = 'Arial'")
        assert pg.evaluate(SANS), "negative control: a button set to Arial must be caught"
        assert not pg.errors, pg.errors
        ctx.close()

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
