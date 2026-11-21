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


def press_ms(pg):
    return pg.evaluate("(() => { const v = getComputedStyle(document.querySelector('.zr-send')).transitionDuration.split(',')[0].trim(); return v.endsWith('ms') ? parseFloat(v) : parseFloat(v) * 1000; })()")


def settle_motion(pg):
    pg.evaluate("Promise.all(document.getAnimations().map(a => a.finished.catch(() => null)))")


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


def hit_area(pg, loc, what):
    got = loc.evaluate("""n => {
      const b = n.getBoundingClientRect();
      const coarse = matchMedia('(pointer: coarse)').matches;
      const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
      const reach = [[cx, cy - 21], [cx, cy + 21]].map(([x, y]) => { const t = document.elementFromPoint(x, y); return !!t && (t === n || n.contains(t)); });
      return { coarse, height: b.height, reach };
    }""")
    assert got["height"] <= 36, "%s is a compact control, not a 44px box: %s" % (what, got)
    if got["coarse"]:
        assert all(got["reach"]), "%s keeps a 44px hit area on a coarse pointer: %s" % (what, got)


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
            pg.wait_for_selector(".zr-thread")
            assert pg.title() == "figaro web"
            until(pg, "document.fonts.check('26px \"Jacquard 24\"')")
            assert pg.evaluate("document.querySelectorAll('script:not([src]), style, [style]').length") == 0, "no inline script or style under the CSP"
            assert pg.locator(".zr-thread").count() == 8, "list is paged at eight"
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
            pg.wait_for_selector(".zr-thread", state="attached")
            rows = pg.locator(".zr-thread").count()
            assert rows == 8, "list is paged at eight, got %d" % rows
            if width >= 900:
                assert pg.locator(".fw-side").is_visible(), "the list sits beside the transcript at 1280"
            else:
                assert not pg.locator(".fw-side").is_visible(), "one pane at 390"
            if width >= 900:
                pg.locator(".fw-more").click()
                until(pg, "document.querySelectorAll('.zr-thread').length > 8")
                depths = pg.evaluate("[...document.querySelectorAll('.zr-thread')].map(a => a.dataset.depth)")
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
            until(pg, "document.querySelector(\".nodi-turn[data-turn='7'] .nodi-tool-args\").innerText.includes('go test')", 5000)
            tool.locator(".nodi-tool-out").wait_for(state="visible", timeout=5000)
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
            pg.locator(".zr-input").fill(text)
            pg.locator(".zr-send").click()

        def running(pg):
            return pg.evaluate("document.querySelector('.fw').hasAttribute('data-running')")

        for width, height, scheme in ((390, 844, "light"), (390, 844, "dark"), (1280, 800, "light"), (1280, 800, "dark")):
            pg = fresh(width, height, scheme)
            attend(pg, door(45), MAIN)
            idle = pg.locator(".zr-composer").bounding_box()
            assert idle["height"] <= 76, "an idle composer is at most 76px tall: %s" % idle
            send(pg, "please run the tests")
            pg.wait_for_selector(".nodi-turn[data-turn='27'] .nodi-tool[data-status='running']", timeout=10000)
            thinking = pg.locator(".nodi-turn[data-turn='27'] .nodi-thinking")
            assert thinking.evaluate("n => n.open") is False, "thinking is collapsed while it streams"
            assert pg.locator(".nodi-turn[data-turn='27'][data-state='open']").count() == 1
            strip = pg.locator(".zr-strip")
            assert strip.is_visible(), "the strip says a turn is running"
            assert pg.locator(".zr-input").get_attribute("placeholder") == "Steer figaro"
            assert pg.locator(".zr-send").inner_text() == "Steer"
            box = pg.locator(".zr-composer").bounding_box()
            assert box["height"] <= 120, "a running composer is at most 120px tall: %s" % box
            sbox = strip.bounding_box()
            assert sbox["height"] <= 44, "the strip is one line high: %s" % sbox
            tbox = pg.locator(".zr-strip-text").bounding_box()
            assert tbox["height"] <= 24, "the strip text never wraps: %s" % tbox
            assert box["x"] >= 0 and box["x"] + box["width"] <= width, "the composer stays inside the screen: %s" % box
            row = pg.locator(".zr-compose-row").bounding_box()
            assert row["width"] <= 46 * 16, "the input row sits at the transcript measure: %s" % row
            for b in pg.locator(".fw-stop").all():
                hit_area(pg, b, "stop buttons")
            assert pg.locator(".zr-strip-time").inner_text()[0].isdigit()
            pg.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)")
            pg.wait_for_timeout(100)
            last = pg.evaluate("(() => { const n = [...document.querySelectorAll('.nodi-turn-body > *')].pop(); return n.getBoundingClientRect().bottom; })()")
            top = pg.locator(".zr-composer").bounding_box()["y"]
            assert last <= top + 1, "scrolled to the bottom, the last node ends above the composer: %s vs %s" % (last, top)
            no_sideways(pg, width, "running turn")
            snap(pg, "running-%s-%d" % (scheme, width))
            pg.wait_for_selector(".nodi-turn[data-turn='27'] .nodi-tool[data-status='ok']", timeout=10000)
            pg.wait_for_selector(".nodi-turn[data-turn='27']:not([data-state='open'])", timeout=10000)
            until(pg, "!document.querySelector('.zr-strip')", timeout=5000)
            thinking.locator("summary").click()
            assert thinking.evaluate("n => n.open") is True
            until(pg, "document.querySelector(\".nodi-turn[data-turn='27'] .nodi-thought\").innerText.includes('answer plainly')", 5000)
            kinds = pg.evaluate("[...document.querySelectorAll('.nodi-turn[data-turn=\"27\"] .nodi-turn-body > *')].map(n => n.className.split(' ')[0])")
            assert kinds == ["nodi-input", "nodi-thinking", "nodi-prose", "nodi-tool", "nodi-prose"], kinds
            assert "please run the tests" in pg.locator(".nodi-turn[data-turn='27'] .nodi-input").inner_text()
            assert pg.locator(".zr-input").input_value() == ""
            assert pg.locator(".nodi-metrics").inner_text().startswith("ctx"), "metrics sit quietly above the transcript"
            idle = pg.locator(".zr-composer").bounding_box()
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
        pg.locator(".zr-input").fill("half a thought")
        pg.wait_for_timeout(600)
        pg.locator(".fw-back").click()
        pg.wait_for_selector(".zr-thread")
        pg.locator(".zr-thread[data-id='%s']" % LANE).click()
        until(pg, "document.querySelector('.fw').dataset.link === 'live'", timeout=10000)
        assert pg.locator(".zr-input").input_value() == "", "another aria has its own draft"
        pg.goto("about:blank")
        pg.goto(draft_door.url + "#/gluck/" + MAIN)
        until(pg, "document.querySelector('.zr-input')", timeout=10000)
        assert pg.locator(".zr-input").input_value() == "half a thought", "the draft survives a reload"
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
        pg.locator(".nodi-turn[data-turn='26'] .fw-play").click()
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
        pg.locator(".zr-input").fill("typed first")
        pg.locator(".fw-mic").tap()
        until(pg, "document.querySelector('.fw').dataset.mic === 'recording'", 10000)
        pg.wait_for_timeout(600)
        pg.locator(".fw-mic").tap()
        until(pg, "document.querySelector('.zr-input').value.includes('crossing count')", 10000)
        assert pg.locator(".zr-input").input_value() == "typed first what is the crossing count", pg.locator(".zr-input").input_value()
        posts = mic_door.state()["stt"]
        assert len(posts) == 1 and posts[0]["type"].startswith("audio/") and posts[0]["size"] > 0, posts
        assert posts[0]["aria"] == "gluck/" + MAIN, posts
        assert mic_door.state()["sent"] == [], "the transcript is not sent until Gluck sends it"
        assert pg.evaluate("document.activeElement.className") == "zr-input", "the transcript lands with the cursor in the composer"
        pg.locator(".zr-input").fill("edited words")
        pg.locator(".zr-send").tap()
        until(pg, "document.querySelector(\"[data-turn='27']\")", 10000)
        assert mic_door.state()["sent"][0]["text"] == "edited words"
        sans_free(pg, "composer after the mic")
        pg.evaluate("document.querySelector('.zr-send').style.fontFamily = 'Arial'")
        assert pg.evaluate(SANS), "negative control: a button set to Arial must be caught"
        assert not pg.errors, pg.errors
        ctx.close()

        pg = fresh()
        say_door = door(12)
        attend(pg, say_door, MAIN, 5)
        pg.wait_for_selector(".nodi-turn[data-turn='5']")
        assert pg.locator(".fw-voice").get_attribute("aria-pressed") == "false", "voice is off while Play asks the gateway to speak"
        pg.locator(".nodi-turn[data-turn='5'] .fw-play").click()
        for _ in range(100):
            if say_door.state()["says"] == [5]:
                break
            pg.wait_for_timeout(100)
        assert say_door.state()["says"] == [5], "a turn whose stored audio expired is asked of the gateway: %s" % say_door.state()["says"]
        until(pg, "(() => { const v = document.querySelector(\".nodi-turn[data-turn='5'] .voce\"); return !!v && ['live','draining','idle','playing'].includes(v.dataset.state); })()", 10000)
        assert pg.locator(".voce[data-state='expired']").count() == 0
        assert say_door.state()["audio"] >= 1, "the gateway socket opened for the ask"
        pg.locator(".nodi-turn[data-turn='6'] .fw-play").click()
        for _ in range(100):
            if say_door.state()["says"] == [5, 6]:
                break
            pg.wait_for_timeout(100)
        assert say_door.state()["says"] == [5, 6], say_door.state()["says"]
        until(pg, "(() => { const v = document.querySelector(\".nodi-turn[data-turn='6'] .voce\"); return !!v && ['loading','playing','idle'].includes(v.dataset.state); })()", 10000)
        pg.wait_for_timeout(500)
        assert pg.locator(".nodi-turn[data-turn='6'] .voce[data-state='expired']").count() == 0, "the gateway said it had the audio, and Play found it"
        assert hostile_findings(pg) == [], hostile_findings(pg)
        pg.close()

        for width, height in ((390, 844), (1280, 800)):
            sheet_door = door(12)
            phone = width < 600
            ctx = browser.new_context(viewport={"width": width, "height": height}, is_mobile=phone, has_touch=phone)
            pg = ctx.new_page()
            pg.errors = []
            pg.on("pageerror", lambda e: pg.errors.append(str(e)))
            pg.on("console", lambda m: pg.errors.append(m.text) if m.type == "error" else None)
            attend(pg, sheet_door, MAIN)
            pg.locator(".zr-input").fill("typed")
            said = pg.locator(".nodi-turn[data-turn='26'] .nodi-said").first
            said.scroll_into_view_if_needed()
            said.tap() if phone else said.click()
            pg.wait_for_selector(".fw-sheet")
            settle_motion(pg)
            box = pg.locator(".fw-sheet").bounding_box()
            assert abs(box["y"] + box["height"] - height) <= 1, "the sheet sits on the bottom edge: %s" % box
            assert box["x"] >= 0 and box["x"] + box["width"] <= width, box
            assert pg.locator(".fw-sheet-act").all_inner_texts() == ["Play", "Re-transcribe"]
            for b in pg.locator(".fw-sheet-act").all():
                hit_area(pg, b, "sheet actions")
            snap(pg, "sheet-%d" % width)
            sans_free(pg, "the sheet at %d" % width)
            pg.locator(".fw-sheet-act[data-action='play']").click()
            pg.wait_for_selector(".fw-sheet .voce", timeout=5000)
            until(pg, "['loading','playing','idle','expired','error'].includes(document.querySelector('.fw-sheet .voce').dataset.state)", 10000)
            pg.locator(".fw-sheet-act[data-action='retranscribe']").click()
            pg.wait_for_selector(".fw-sheet-text", timeout=5000)
            assert pg.locator(".fw-sheet-text").inner_text() == "re-heard words"
            assert sheet_door.state()["retranscribed"] == ["gluck/" + MAIN + ":26/in"], sheet_door.state()["retranscribed"]
            pg.locator(".fw-sheet-act[data-action='use']").click()
            pg.wait_for_selector(".fw-sheet", state="detached", timeout=3000)
            assert pg.locator(".zr-input").input_value() == "typed re-heard words"
            prose = pg.locator(".nodi-turn[data-turn='26'] .nodi-prose").first
            prose.tap() if phone else prose.click()
            pg.wait_for_selector(".fw-sheet[data-kind='prose']")
            assert pg.locator(".fw-sheet-act").all_inner_texts() == ["Play"]
            pg.keyboard.press("Escape")
            pg.wait_for_selector(".fw-sheet", state="detached", timeout=3000)
            assert not pg.errors, pg.errors
            ctx.close()

        def finger(pg, cdp, phone):
            class Finger:
                def down(self, x, y):
                    self.x, self.y = x, y
                    if phone:
                        cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y}]})
                    else:
                        pg.mouse.move(x, y)
                        pg.mouse.down()

                def move(self, y, steps=8, gap=30):
                    y0 = self.y
                    for i in range(1, steps + 1):
                        yy = y0 + (y - y0) * i / steps
                        if phone:
                            cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": self.x, "y": yy}]})
                        else:
                            pg.mouse.move(self.x, yy)
                        pg.wait_for_timeout(gap)
                    self.y = y

                def up(self):
                    if phone:
                        cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
                    else:
                        pg.mouse.up()
            return Finger()

        PIT = "() => { const p = document.querySelector('.zr-pit'); if (!p) return null; const b = p.getBoundingClientRect(); return { snap: p.dataset.snap, dragging: p.hasAttribute('data-dragging'), top: b.top, height: b.height, bottom: b.bottom, left: b.left, width: b.width }; }"

        def pit_at(pg, snap, height_px, what):
            until(pg, "(() => { const p = document.querySelector('.zr-pit'); return !!p && p.dataset.snap === '%s' && !p.hasAttribute('data-dragging'); })()" % snap, 3000)
            settle_motion(pg)
            got = pg.evaluate(PIT)
            assert abs(got["height"] - height_px) <= 2, "%s: expected a pit %dpx tall, got %s" % (what, height_px, got)
            assert abs(got["bottom"] - pg.evaluate("innerHeight")) <= 1, "%s: the pit sits on the bottom edge: %s" % (what, got)
            return got

        def pit_gone(pg, what):
            pg.wait_for_selector(".zr-pit", state="detached", timeout=3000)
            assert pg.evaluate("document.documentElement.style.getPropertyValue('--zr-pit-h')") == "", what

        def centre(loc):
            b = loc.bounding_box()
            return b["x"] + b["width"] / 2, b["y"] + b["height"] / 2

        for width, height in ((390, 844), (1280, 800)):
            phone = width < 600
            pit_door = door(12)
            ctx = browser.new_context(viewport={"width": width, "height": height}, is_mobile=phone, has_touch=phone)
            pg = ctx.new_page()
            pg.errors = []
            pg.on("pageerror", lambda e: pg.errors.append(str(e)))
            pg.on("console", lambda m: pg.errors.append(m.text) if m.type == "error" else None)
            cdp = ctx.new_cdp_session(pg)
            attend(pg, pit_door, MAIN)
            f = finger(pg, cdp, phone)
            grip = pg.locator(".zr-composer .zr-grip")
            assert grip.is_visible() and pg.locator(".zr-pit").count() == 0
            gb, cb = grip.bounding_box(), pg.locator(".zr-composer").bounding_box()
            assert abs((gb["y"] + gb["height"] / 2) - cb["y"]) <= 4, "the grip sits on the composer's top edge: %s %s" % (gb, cb)
            half, full = round(height / 2), height

            gx, gy = centre(grip)
            f.down(gx, gy)
            f.move(height * 0.5)
            assert pg.evaluate(PIT)["dragging"], "the pit follows the finger"
            mid = pg.evaluate(PIT)
            assert abs(mid["top"] - height * 0.5) <= 2, "the pit's top edge is under the finger: %s" % mid
            pg.wait_for_timeout(160)
            f.up()
            pit_at(pg, "half", half, "dragged from the composer edge to the middle")
            assert pg.locator(".zr-pit").get_attribute("role") == "dialog"
            assert pg.locator("#app [style]").count() == 0, "dragging writes no style attribute under the CSP"
            snap(pg, "pit-half-%d" % width)
            sans_free(pg, "the pit at %d" % width)
            if phone:
                assert pg.locator(".zr-pit-scrim").count() == 1 and pg.locator(".zr-pit").get_attribute("aria-modal") == "true"
                assert pg.locator(".zr-pit[data-docked]").count() == 0
            else:
                assert pg.locator(".zr-pit-scrim").count() == 0, "the docked drawer has no scrim"
                box = pg.locator(".zr-pit").bounding_box()
                assert box["width"] <= 736 + 1 and abs(box["x"] + box["width"] / 2 - width / 2) <= 1, "docked to the column: %s" % box
                assert pg.locator(".zr-pit[data-docked]").count() == 1

            hx, hy = centre(pg.locator(".zr-pit-handle"))
            f.down(hx, hy)
            f.move(height * 0.2)
            pg.wait_for_timeout(160)
            f.up()
            pit_at(pg, "half", half, "released above half but short of the top 15 percent, it stays half")

            hx, hy = centre(pg.locator(".zr-pit-handle"))
            f.down(hx, hy)
            f.move(height * 0.1)
            pg.wait_for_timeout(160)
            f.up()
            pit_at(pg, "full", full, "past the top 15 percent it snaps full")
            snap(pg, "pit-full-%d" % width)

            hx, hy = centre(pg.locator(".zr-pit-handle"))
            f.down(hx, hy)
            f.move(height * 0.55)
            pg.wait_for_timeout(160)
            f.up()
            pit_at(pg, "half", half, "dragged down from full to just past half, it settles half")

            hx, hy = centre(pg.locator(".zr-pit-handle"))
            f.down(hx, hy)
            f.move(height * 0.95)
            pg.wait_for_timeout(160)
            f.up()
            pit_gone(pg, "dragged down past the bottom quarter, it closes")

            gx, gy = centre(grip)
            f.down(gx, gy)
            f.move(gy - 150, steps=5, gap=10)
            f.up()
            pit_at(pg, "half", half, "a flick up from the composer edge lands on half")
            hx, hy = centre(pg.locator(".zr-pit-handle"))
            f.down(hx, hy)
            f.move(hy - 60, steps=4, gap=10)
            f.up()
            pit_at(pg, "full", full, "a flick up from half lands on full")
            hx, hy = centre(pg.locator(".zr-pit-handle"))
            f.down(hx, hy)
            f.move(hy + 120, steps=4, gap=10)
            f.up()
            pit_at(pg, "half", half, "a flick down from full lands on half")
            hx, hy = centre(pg.locator(".zr-pit-handle"))
            f.down(hx, hy)
            f.move(hy + 120, steps=4, gap=10)
            f.up()
            pit_gone(pg, "a flick down from half closes")

            grip.focus()
            pg.keyboard.press("Enter")
            pit_at(pg, "half", half, "Enter on the grip opens half")
            assert pg.evaluate("!!document.activeElement.closest('.zr-pit')"), "focus moves into the pit"
            pg.locator(".zr-pit-handle").focus()
            pg.keyboard.press("ArrowUp")
            pit_at(pg, "full", full, "ArrowUp on the handle goes full")
            pg.keyboard.press("ArrowDown")
            pit_at(pg, "half", half, "ArrowDown on the handle goes back to half")
            pg.keyboard.press("Escape")
            pit_gone(pg, "Escape closes")
            assert pg.evaluate("document.activeElement.className") == "zr-grip", "focus returns to the grip"
            grip.click()
            pit_at(pg, "half", half, "a tap on the grip opens half")
            if phone:
                pg.locator(".zr-pit-scrim").click(position={"x": 10, "y": 10})
            else:
                pg.locator(".zr-pit-head button", has_text="Close").click()
            pit_gone(pg, "scrim or Close closes")
            assert not pg.errors, pg.errors
            ctx.close()

        ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, reduced_motion="reduce")
        pg = ctx.new_page()
        pg.errors = []
        pg.on("pageerror", lambda e: pg.errors.append(str(e)))
        cdp = ctx.new_cdp_session(pg)
        attend(pg, door(12), MAIN)
        f = finger(pg, cdp, True)
        gx, gy = centre(pg.locator(".zr-composer .zr-grip"))
        f.down(gx, gy)
        f.move(300)
        pg.wait_for_timeout(160)
        f.up()
        pit_at(pg, "half", 422, "reduced motion still drags")
        assert pg.evaluate("parseFloat(getComputedStyle(document.querySelector('.zr-pit')).transitionDuration) * 1000") <= 1
        pg.keyboard.press("Escape")
        pg.wait_for_selector(".zr-pit", state="detached", timeout=1000)
        assert not pg.errors, pg.errors
        ctx.close()

        MOTION = """() => {
          const over = [];
          for (const n of document.querySelectorAll('.zr-composer, .zr-composer *, .fw-top *, .fw-main button')) {
            const cs = getComputedStyle(n);
            const ms = (v) => v.split(',').map(x => x.trim()).map(x => x.endsWith('ms') ? parseFloat(x) : parseFloat(x) * 1000);
            if (cs.animationName !== 'none' && Math.max(...ms(cs.animationDuration)) > 1) over.push(n.className + ' animation ' + cs.animationName + ' ' + cs.animationDuration);
            if (Math.max(...ms(cs.transitionDuration)) > 1) over.push(n.className + ' transition ' + cs.transitionDuration);
            if (cs.animationName !== 'none' && cs.animationIterationCount === 'infinite') over.push(n.className + ' loops');
          }
          const running = document.getAnimations().filter(a => a.playState === 'running' && a.effect && a.effect.getTiming().duration > 1);
          return over.concat(running.map(a => 'running ' + (a.animationName || a.transitionProperty)));
        }"""

        ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, reduced_motion="reduce")
        pg = ctx.new_page()
        pg.errors = []
        pg.on("pageerror", lambda e: pg.errors.append(str(e)))
        attend(pg, door(150), MAIN)
        assert press_ms(pg) <= 1, "reduced motion sets the press release to 1ms: %s" % press_ms(pg)
        send(pg, "please run the build")
        pg.wait_for_selector(".zr-strip[data-kind='running']", timeout=15000)
        pg.wait_for_timeout(300)
        assert pg.locator(".zr-glyph i").first.evaluate("n => getComputedStyle(n).animationName") == "none", "the glyph is still under reduced motion"
        assert pg.evaluate(MOTION) == [], pg.evaluate(MOTION)
        pg.locator(".fw-stop-clear").click()
        pg.wait_for_selector(".zr-strip", state="detached", timeout=5000)
        ctx.close()

        pg = fresh()
        attend(pg, door(150), MAIN)
        assert press_ms(pg) == 320, "the press releases on the pop token: %s" % press_ms(pg)
        assert pg.locator(".nodi-turn[data-fresh]").count() == 0, "history does not animate in"
        send(pg, "please run the build")
        pg.wait_for_selector(".zr-strip[data-kind='running']", timeout=15000)
        assert pg.locator(".nodi-turn[data-turn='27'][data-fresh]").count() == 1, "the new turn is the one that arrives with motion"
        assert pg.locator(".zr-glyph i").first.evaluate("n => getComputedStyle(n).animationName") == "zr-glyph"
        assert pg.evaluate("[...document.querySelectorAll('.zr-glyph i')].every(n => getComputedStyle(n).animationTimingFunction.startsWith('steps'))"), "the glyph steps, it does not glide"
        pg.locator(".fw-stop-clear").click()
        pg.wait_for_selector(".zr-strip", state="detached", timeout=5000)
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
