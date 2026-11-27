import json
import re
import time
import os
import subprocess
import sys
import urllib.request

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from figchat_kit import HANG_MS, assert_centred, draft, until, voice_on

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


def open_pit(pg):
    if not pg.locator(".zr-pit[role=dialog]").count():
        pg.locator(".zr-pit-knob").focus()
        pg.keyboard.press("Enter")
    pg.wait_for_selector(".zr-pit[data-snap='half']")


def open_tree(pg):
    open_pit(pg)
    pg.locator(".zr-pit-row[data-action='tree']").click()
    pg.wait_for_selector(".zr-pit .zr-tree-row")


def close_pit(pg):
    pg.keyboard.press("Escape")
    pg.wait_for_selector(".zr-pit[role=dialog]", state="detached")


def hands_pressed(pg):
    open_pit(pg)
    got = pg.locator(".fw-hands").get_attribute("aria-pressed")
    close_pit(pg)
    return got


def toggle_hands(pg):
    open_pit(pg)
    pg.locator(".fw-hands").click()
    close_pit(pg)


def voice_pressed(pg):
    open_pit(pg)
    got = pg.locator(".fw-voice").get_attribute("aria-pressed")
    close_pit(pg)
    return got


def toggle_voice(pg):
    open_pit(pg)
    pg.locator(".fw-voice").click()
    close_pit(pg)


SANS = """() => {
  const house = new Set(['Source Serif 4','Jacquard 24','VT323','Nerd Icons']);
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
    def __init__(self, bundle, step, *flags):
        self.proc = subprocess.Popen(["node", os.path.join(root, "test", "figchat-server.js"), bundle, str(step), *flags], stdout=subprocess.PIPE, text=True)
        self.port = int(self.proc.stdout.readline())
        self.base = "http://127.0.0.1:%d" % self.port
        self.url = self.base + "/chat/"

    def state(self):
        return json.load(urllib.request.urlopen(self.base + "/__state"))

    def drop(self):
        urllib.request.urlopen(self.base + "/__drop").read()

    def shut(self, on=True):
        urllib.request.urlopen(self.base + "/__shut?on=" + ("1" if on else "0")).read()

    def stop(self):
        self.proc.terminate()
        self.proc.wait()


doors = []


def door(step, *flags):
    d = Door(bundle, step, *flags)
    doors.append(d)
    return d


fast = door(12)

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox", "--disable-audio-output", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"])
        open_context = browser.new_context

        def hang_bounded_context(**options):
            ctx = open_context(**options)
            ctx.set_default_timeout(HANG_MS)
            return ctx

        browser.new_context = hang_bounded_context

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
            until(pg, "document.querySelector('.fw') && document.querySelector('.fw').dataset.link === 'live'")

        def held(pg):
            return pg.evaluate("Number(document.querySelector('.nodi-turns').dataset.held)")

        def turns_shown(pg):
            return pg.evaluate("[...document.querySelectorAll('.nodi-turn')].map(n => Number(n.dataset.turn))")

        for width, height in ((390, 844), (1280, 800)):
            pg = fresh(width, height)
            pg.goto(fast.url + "#/")
            pg.wait_for_selector(".zr-pit-knob")
            assert pg.title() == "figaro web"
            until(pg, "document.fonts.check('26px \"Jacquard 24\"')")
            assert pg.evaluate("document.querySelectorAll('script:not([src]), style, [style]').length") == 0, "no inline script or style under the CSP"
            open_tree(pg)
            assert pg.locator(".zr-tree-row").count() >= 5, "the topology is one tree"
            assert pg.locator(".zr-tree th, .zr-tree-toggle").count() == 0, "the pager's tree has no header and no arrow"
            texts = pg.locator(".zr-tree-row").all_text_contents()
            assert re.search(r"\(\d+\)", texts[0]) and "arias (" in texts[1], "root then arias, each with its count: %s" % texts[:2]
            assert any(re.search(r"\(\d+\)  \".*\"", x) for x in texts), "aria rows read handle (turns)  mantra: %s" % texts
            assert "1" in pg.evaluate("[...document.querySelectorAll('.zr-tree-row')].map(a => a.dataset.depth)"), "children nest under their parent"
            role_row = [x for x in texts if x.startswith("@frontend")]
            assert role_row and "\u2192" in role_row[0], "a role row reads @name with its holder: %s" % texts
            snap(pg, "roles-%d" % width)
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
            snap(pg, "attend-light-" + tag)

            before = held(pg)
            for _ in range(240):
                if pg.locator(".nodi-turn[data-turn='4']").count():
                    break
                pg.evaluate("document.querySelector('[data-zr-scroll]').scrollTop = 0")
                pg.wait_for_timeout(120)
            assert pg.locator(".nodi-turn[data-turn='4']").count() == 1, "scrolling up pages older turns in: %s" % turns_shown(pg)
            got = turns_shown(pg)
            assert held(pg) - before >= 10, "read back ten turns or more: %d -> %d" % (before, held(pg))
            assert got == sorted(got) and len(set(got)) == len(got), "older pages land in order without repeats: %s" % got
            def hydrated(n):
                pg.evaluate("location.hash = '#/gluck/%s:%d'" % (MAIN, n))
                until(pg, "!!document.querySelector(\".nodi-turn[data-turn='%d'] .nodi-turn-body\")" % n)

            hydrated(6)
            assert pg.locator(".nodi-unknown").count() == 1, pg.locator(".nodi-unknown").count()
            assert "Unknown node: sparkle" in pg.locator(".nodi-unknown").inner_text()
            hydrated(9)
            assert pg.locator(".nodi-said[data-from='aria'] .nodi-who").first.inner_text() == "Il Zanni"
            assert pg.locator(".nodi-said[data-from='caller'] .nodi-who").first.inner_text() == "the King"
            assert pg.locator(".nodi-said[data-from='you']").count() > 3
            hydrated(5)
            assert pg.locator(".nodi-steering .nodi-who").first.inner_text() == "Il Zanni"
            hydrated(7)
            tool = pg.locator(".nodi-turn[data-turn='7'] .nodi-tool")
            assert tool.evaluate("n => n.open") is True, "tool blocks are open by default"
            until(pg, "document.querySelector(\".nodi-turn[data-turn='7'] .nodi-tool-args\").innerText.includes('go test')", 5000)
            tool.locator(".nodi-tool-out").wait_for(state="visible")
            assert "clipped" in tool.locator(".nodi-clipped").inner_text(), "a clipped result says so"
            sans_free(pg, "history at %d" % width)
            no_sideways(pg, width, "history")
            assert not pg.errors, pg.errors
            pg.close()

        pg = fresh()
        attend(pg, fast, MAIN)
        for _ in range(500):
            pg.evaluate("document.querySelector('[data-zr-scroll]').scrollTop = 0")
            if pg.evaluate("!!document.querySelector('.nodi-turn') && Number(document.querySelector('.nodi-turn').dataset.turn) < 20"):
                break
            pg.wait_for_timeout(120)
        assert pg.evaluate("!!document.querySelector('.nodi-turn') && Number(document.querySelector('.nodi-turn').dataset.turn) < 20"), "scrolling to the top pages older turns in"
        pg.wait_for_timeout(400)
        anchor = pg.evaluate("document.querySelector('[data-zr-scroll]').scrollTop")
        assert anchor > 0, "paging in older turns keeps the reader where they were, not at the top: %s" % anchor
        pg.close()

        pg = fresh()
        attend(pg, fast, MAIN)
        pg.context.new_cdp_session(pg).send("Emulation.setCPUThrottlingRate", {"rate": 4})
        pg.evaluate("(() => { const s = document.querySelector('[data-zr-scroll]'); s.addEventListener('scroll', () => { s.scrollTop = 0; }); s.scrollTop = 0; })()")
        until(pg, "!!document.querySelector(\".nodi-turn[data-turn='4']\")")
        pg.close()

        deep = fresh()
        attend(deep, fast, MAIN, 12)
        deep.wait_for_selector(".nodi-turn[data-turn='12']")
        until(deep, "() => { const r = document.querySelector(\"[data-turn='12']\").getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight; }")
        assert deep.locator(".nodi-said[data-from='you'] .nodi-who").count() >= 1
        assert "You at the terminal" in deep.locator(".nodi-turn[data-turn='12']").inner_text(), "a terminal caller keeps its name"
        deep.close()

        for width, height in ((390, 844), (1280, 800)):
            tag = "%d" % width
            pg = fresh(width, height)
            attend(pg, fast, MAIN)
            box = pg.locator(".zr-input")
            box.click()
            pg.keyboard.type(":")
            until(pg, "document.querySelector('.zr-prompt') && document.querySelector('.zr-command').getAttribute('aria-pressed') === 'true'", 3000)
            assert box.input_value() == "", "the colon enters command mode and is not part of the line"
            assert pg.locator(".zr-attach").count() == 0 and pg.locator(".fw-mic").count() == 0, "command mode shows the line, not attach or the mic"
            until(pg, "document.querySelectorAll('.zr-chip').length > 3", 3000)
            snap(pg, "command-verbs-" + tag)
            pg.keyboard.type("kill ")
            until(pg, "!!document.querySelector('.zr-hint[data-refused]')", 3000)
            assert "delegated connection refuses" in pg.locator(".zr-hint[data-refused]").inner_text(), "a refused verb says why while it is typed"
            got = pg.evaluate("(() => { const c = document.querySelector('.zr-composer').getBoundingClientRect(); return { height: c.height, top: c.top }; })()")
            assert got["height"] <= 200, "the hints keep the composer short: %s" % got
            no_sideways(pg, width, "command mode")
            snap(pg, "command-refused-" + tag)
            pg.keyboard.press("Enter")
            pg.wait_for_timeout(300)
            assert pg.locator(".zr-command").get_attribute("aria-pressed") == "true", "a refused verb stays in command mode"
            pg.keyboard.press("Escape")
            until(pg, "!document.querySelector('.zr-prompt')", 3000)
            assert pg.locator(".zr-attach").count() == 1, "Escape brings the composer back"

            box.click()
            pg.keyboard.type(":fork :12")
            pg.keyboard.press("Enter")
            until(pg, "/^#\\/[^/]+\\/[0-9a-f]{32}$/.test(location.hash) && !location.hash.includes('%s')" % MAIN, 8000)
            pg.wait_for_selector(".nodi-turn[data-turn='11']")
            assert pg.locator(".zr-command").get_attribute("aria-pressed") == "false", "a run leaves command mode"
            assert pg.locator(".zr-input").input_value() == "", "the command line is not left in the composer"
            assert [m for m in pg.errors if "fork" in m.lower()] == [], pg.errors

            pg.locator(".zr-input").click()
            pg.keyboard.type(":ls")
            pg.keyboard.press("Enter")
            pg.wait_for_selector(".zr-pit[data-snap='half']")
            assert "Tree" in pg.locator(".zr-pit").inner_text(), "ls opens the tree"
            sans_free(pg, "command mode at %d" % width)
            assert not pg.errors, pg.errors
            pg.close()

        LAYOUT_PROPS = {"width", "height", "min-width", "max-width", "min-height", "max-height", "top", "left", "right", "bottom", "margin", "padding", "grid-template-columns", "flex-basis", "inset"}
        ROW = """() => { const r = (s) => { const n = document.querySelector(s); if (!n) return null; const b = n.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
          return { bar: r('.zr-composer'), row: r('.zr-compose-row'), input: r('.zr-input'), attach: r('.zr-attach'), pair: r('.zr-pill-pair'), stack: document.querySelector('.zr-compose-row').hasAttribute('data-stack') }; }"""
        MOVING = """() => document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('.zr-compose-row') && a.playState === 'running').map(a => ({ on: a.effect.target.className.split(' ')[0], props: [...new Set(a.effect.getKeyframes().flatMap(k => Object.keys(k)).filter(k => !['offset', 'easing', 'composite', 'computedOffset'].includes(k)))] }))"""
        WORDS = "the quick brown fox jumps over the lazy dog " * 4

        for width, height in ((390, 844), (1280, 800)):
            pg = fresh(width, height)
            attend(pg, door(12), MAIN)
            one = pg.evaluate(ROW)
            assert not one["stack"], "the composer starts as one row: %s" % one
            assert one["attach"]["r"] <= one["input"]["x"] + 1 and one["input"]["r"] <= one["pair"]["x"] + 1, "attach, input, then the pair on one row at %d: %s" % (width, one)
            assert abs(one["attach"]["b"] - one["input"]["b"]) <= 1 and abs(one["pair"]["b"] - one["input"]["b"]) <= 1, "the three share a baseline at %d: %s" % (width, one)
            pg.evaluate("(() => { const t = document.querySelector('.zr-input'); t.focus(); window.__node = t; })()")
            pg.keyboard.insert_text("fits on a line")
            pg.wait_for_timeout(120)
            assert not pg.evaluate(ROW)["stack"], "a draft that fits stays on the row"
            pg.keyboard.insert_text(" " + WORDS)
            pg.wait_for_timeout(30)
            moving = pg.evaluate(MOVING)
            assert [m for m in moving if m["on"] == "zr-input"], "the input glides when the row stacks at %d: %s" % (width, moving)
            for m in moving:
                assert set(m["props"]) <= {"transform", "translate", "scale", "opacity"}, "the glide uses transform and opacity only, never a layout property: %s" % m
                assert not (set(m["props"]) & LAYOUT_PROPS), m
            settle_motion(pg)
            many = pg.evaluate(ROW)
            assert many["stack"], "a draft that outgrows the row stacks: %s" % many
            assert many["input"]["w"] >= many["row"]["w"] - 2, "the input is the row's full width at %d: %s" % (width, many)
            assert many["attach"]["y"] >= many["input"]["b"] - 1 and many["pair"]["y"] >= many["input"]["b"] - 1, "the pills are under the input at %d: %s" % (width, many)
            assert abs(many["attach"]["x"] - many["input"]["x"]) <= 2 and abs(many["pair"]["r"] - many["input"]["r"]) <= 2, "attach left, pair right under the input: %s" % many
            assert pg.evaluate("document.activeElement === window.__node"), "the same editable node keeps focus through the stack"
            pg.keyboard.insert_text(" more")
            pg.wait_for_timeout(120)
            assert pg.evaluate(ROW)["stack"], "a stacked row stays stacked while there is text, even if it would fit again"
            pg.locator(".zr-input").fill("")
            pg.wait_for_timeout(30)
            back = [m for m in pg.evaluate(MOVING) if m["on"] == "zr-input"]
            assert back and set(back[0]["props"]) <= {"transform", "translate", "scale", "opacity"}, "the row glides back when the draft goes: %s" % back
            settle_motion(pg)
            after = pg.evaluate(ROW)
            assert not after["stack"] and after["input"]["w"] < one["input"]["w"] + 2 and abs(after["input"]["w"] - one["input"]["w"]) <= 2, "an empty draft puts the row back as it was: %s" % after
            assert pg.evaluate("document.activeElement === window.__node"), "and focus is still in the same node"
            assert not pg.errors, pg.errors
            pg.close()

            ctx = browser.new_context(viewport={"width": width, "height": height}, is_mobile=width < 600, has_touch=width < 600, reduced_motion="reduce")
            pg = ctx.new_page()
            pg.errors = []
            pg.on("pageerror", lambda e: pg.errors.append(str(e)))
            attend(pg, door(12), MAIN)
            pg.locator(".zr-input").click()
            pg.keyboard.insert_text(WORDS)
            pg.wait_for_timeout(30)
            assert pg.evaluate("document.querySelector('.zr-compose-row').hasAttribute('data-stack')"), "reduced motion still stacks"
            assert not pg.evaluate(MOVING), "reduced motion snaps: nothing glides"
            assert not pg.errors, pg.errors
            ctx.close()

        for width, height in ((390, 844), (1280, 800)):
            pg = fresh(width, height)
            attend(pg, fast, LANE, 2)
            pg.wait_for_selector(".nodi-turn[data-turn='2'] .nodi-turn-delta")
            assert pg.locator(".nodi-turn-delta").count() == 1, "only the turn whose form changed wears the delta mark"
            assert pg.locator(".nodi-deltas").count() == 0, "the table starts shut"
            pg.locator(".nodi-turn-delta").click()
            pg.wait_for_selector(".nodi-deltas .nodi-delta")
            texts = pg.locator(".nodi-deltas .nodi-delta").all_inner_texts()
            assert len(texts) == 7, "bound form first, the others by id, a deleted form one banner: %s" % texts
            assert texts[0].replace("\n", " ").split()[:2] == ["\u0394", "credo"], texts
            assert "\u2205" in texts[3] and "\u2205" in pg.locator(".nodi-delta-row").nth(3).locator(".nodi-delta-to").inner_text(), "a removed key ends in the absent mark: %s" % texts
            assert texts[5].startswith("\u2298"), "a deleted form is a banner row: %s" % texts
            no_sideways(pg, width, "the delta table")
            wide = pg.evaluate("[...document.querySelectorAll('.nodi-delta-row')].filter(r => r.scrollWidth > r.clientWidth + 1).length")
            assert wide == 0, "no delta row is wider than its box: %d" % wide
            mantra = pg.locator(".nodi-delta-row", has_text="mantra")
            got = mantra.evaluate("r => { const f = r.querySelector('.nodi-delta-from'), t = r.querySelector('.nodi-delta-to'); const p = document.createElement('span'); p.style.width = '6ch'; p.style.display = 'inline-block'; r.appendChild(p); const floor = p.getBoundingClientRect().width; p.remove(); return { fromFits: f.scrollWidth <= f.clientWidth, from: f.clientWidth, to: t.clientWidth, row: r.clientWidth, floor: floor }; }")
            assert got["to"] >= got["floor"] - 1 and got["from"] >= got["floor"] - 1, "each side keeps its floor: %s" % got
            if width < 600:
                assert not got["fromFits"], "at phone width a long value is elided, not wrapped: %s" % got
                assert mantra.bounding_box()["height"] >= 40, "a touch row is a touch target"
            keyw = pg.evaluate("Math.max(...[...document.querySelectorAll('.nodi-delta-key')].map(k => k.getBoundingClientRect().width))")
            assert keyw <= 28 * 14, "the key column stops at 28 characters: %s" % keyw
            mantra.click()
            pg.wait_for_selector(".nodi-delta-side")
            assert pg.locator(".nodi-delta-side[data-side='+']").inner_text().startswith("+ " + "n" * 40), "a row opens to the whole new value"
            no_sideways(pg, width, "an open delta row")
            snap(pg, "deltas-%d" % width)
            pg.locator(".nodi-turn-delta").click()
            assert pg.locator(".nodi-deltas").count() == 0, "the mark shuts it"
            row = pg.locator(".nodi-turn[data-turn='2'] .nodi-turn-head")
            assert row.count() == 1 and row.inner_text().startswith("Turn 2"), "a turn is headed by one plain row"
            assert row.evaluate("r => getComputedStyle(r).position") == "static", "the turn row does not stick"
            snap(pg, "turn-row-%d" % width)
            assert not pg.errors, pg.errors
            pg.close()

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
            draft(pg, text)
            pg.wait_for_timeout(450)
            pg.locator(".zr-send").click()

        def running(pg):
            return pg.evaluate("document.querySelector('.fw').hasAttribute('data-running')")

        for width, height, scheme in ((390, 844, "light"), (390, 844, "dark"), (1280, 800, "light"), (1280, 800, "dark")):
            pg = fresh(width, height, scheme)
            attend(pg, door(45), MAIN)
            idle = pg.locator(".zr-composer").bounding_box()
            assert idle["height"] <= 64, "an idle composer is one row, at most 64px tall: %s" % idle
            marks = pg.evaluate("[...document.querySelectorAll('.zr-composer .zr-pill-glyph')].map(n => n.textContent)")
            assert len(marks) >= 3 and not [m for m in marks if re.search("[\U0001F000-\U0001FFFF\uFE0E\uFE0F]", m)], "the compose bar draws no emoji: %s" % marks
            pg.locator(".zr-input").fill("\n".join("line %d of a long note" % i for i in range(14)))
            pg.wait_for_timeout(200)
            grown = pg.locator(".zr-input").bounding_box()
            assert grown["height"] > 140, "the input grows with its text past four lines: %s" % grown
            assert grown["height"] <= height * 0.32, "the input leaves the transcript room: %s" % grown
            pg.locator(".zr-input").fill("")
            pg.wait_for_timeout(100)
            settle_motion(pg)
            assert pg.locator(".zr-composer").bounding_box()["height"] <= 64, "the composer settles back to one row when the text goes"
            sendp, field, attach, command = (pg.locator(s).bounding_box() for s in (".zr-send", ".zr-input", ".zr-attach", ".zr-command"))
            assert pg.locator(".zr-pill:disabled").count() == 0, "no pill is drawn disabled"
            assert abs(attach["y"] + attach["height"] - (field["y"] + field["height"])) <= 1 and attach["x"] + attach["width"] <= field["x"] + 1, "attach sits left of the input on its row: %s %s" % (attach, field)
            assert abs(command["y"] + command["height"] - (field["y"] + field["height"])) <= 1 and field["x"] + field["width"] <= command["x"] + 1 and sendp["x"] >= command["x"] + command["width"] - 2, "command and send sit right of the input on its row, send last: %s" % [command, sendp]
            for b in (attach, command, sendp):
                assert 30 <= b["height"] <= 40 and b["width"] <= 64, "a small pill: %s" % b
            assert [pg.locator(s).inner_text() for s in (".zr-command", ".zr-send")] == ["∴", "✎"], "pager glyphs on the right pills"
            assert pg.locator(".zr-attach").is_enabled() and pg.locator(".zr-command").is_enabled(), "attach is the file picker and command the toggle"
            assert pg.locator(".zr-command").get_attribute("aria-pressed") == "false"
            for sel, what in ((".zr-send", "send"), (".zr-attach", "attach"), (".zr-command", "command")):
                assert_centred(pg.locator(sel), "the %s pill's glyph at %d %s" % (what, width, scheme), blank_ok=(what == "attach"))
            assert pg.locator(".zr-send").get_attribute("aria-label") == "Send"
            send(pg, "please run the tests")
            pg.wait_for_selector(".nodi-turn[data-turn='27'] .nodi-tool[data-status='running']")
            thinking = pg.locator(".nodi-turn[data-turn='27'] .nodi-thinking")
            assert thinking.evaluate("n => n.open") is True, "thinking is open while it streams"
            assert pg.locator(".nodi-turn[data-turn='27'][data-state='open']").count() == 1
            assert pg.locator(".zr-strip").count() == 0, "no strip above the input"
            line = pg.locator(".fw-status-line")
            assert line.is_visible() and line.inner_text().strip(), "the status bar says a turn is running"
            assert pg.locator(".zr-input").get_attribute("placeholder") == "Steer figaro"
            assert pg.locator(".zr-send").get_attribute("aria-label") == "Steer" and pg.locator(".zr-send").inner_text() == "↳", "the send pill steers with the steering glyph"
            box = pg.locator(".zr-composer").bounding_box()
            assert box["height"] <= 120, "a running composer is at most 120px tall: %s" % box
            lbox = line.bounding_box()
            assert lbox["height"] <= 28, "the working line is one line high: %s" % lbox
            stopb = pg.locator(".fw-status-stop").bounding_box()
            assert stopb["x"] + stopb["width"] <= width and lbox["x"] + lbox["width"] <= stopb["x"] + 1, "Stop sits at the right of the line: %s %s" % (lbox, stopb)
            assert box["x"] >= 0 and box["x"] + box["width"] <= width, "the composer stays inside the screen: %s" % box
            row = pg.locator(".zr-compose-row").bounding_box()
            measure = 46 * 16 if width < 900 else pg.locator(".fw-pane").bounding_box()["width"]
            assert row["width"] <= measure, "the input row sits at the transcript measure: %s" % row
            for _ in range(60):
                pg.evaluate("(() => { const s = document.querySelector('[data-zr-scroll]'); s.scrollTop = s.scrollHeight; })()")
                pg.wait_for_timeout(50)
                last = pg.evaluate("(() => { const n = [...document.querySelectorAll('.nodi-turn-body > *')].pop(); return n.getBoundingClientRect().bottom; })()")
                top = pg.locator(".zr-composer").bounding_box()["y"]
                if last <= top + 1:
                    break
            assert last <= top + 1, "scrolled to the bottom, the last node ends above the composer: %s vs %s" % (last, top)
            no_sideways(pg, width, "running turn")
            snap(pg, "running-%s-%d" % (scheme, width))
            pg.wait_for_selector(".nodi-turn[data-turn='27'] .nodi-tool[data-status='ok']")
            pg.wait_for_selector(".nodi-turn[data-turn='27']:not([data-state='open'])")
            until(pg, "!document.querySelector('.fw-status-stop')")
            assert thinking.evaluate("n => n.open") is True, "thinking is still open once the turn settles"
            until(pg, "document.querySelector(\".nodi-turn[data-turn='27'] .nodi-thought\").innerText.includes('answer plainly')", 5000)
            thinking.locator("summary").click()
            assert thinking.evaluate("n => n.open") is False, "a fold stays collapsible"
            kinds = pg.evaluate("[...document.querySelectorAll('.nodi-turn[data-turn=\"27\"] .nodi-turn-body > *')].map(n => n.className.split(' ')[0]).filter(c => c !== 'fw-inline' && c !== 'fw-output-play')")
            assert kinds == ["nodi-input", "nodi-thinking", "nodi-prose", "nodi-tool", "nodi-prose"], kinds
            assert "please run the tests" in pg.locator(".nodi-turn[data-turn='27'] .nodi-input").inner_text()
            assert pg.locator(".zr-input").input_value() == ""
            assert pg.locator(".nodi-metrics").inner_text().startswith("ctx"), "metrics sit quietly above the transcript"
            idle = pg.locator(".zr-composer").bounding_box()
            assert idle["height"] <= 104, "the composer settles back to its idle height: %s" % idle
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
        until(pg, "document.querySelector('.fw').hasAttribute('data-running')")
        pg.wait_for_selector(".nodi-turn[data-turn='27'] .nodi-tool")
        drop_door.drop()
        until(pg, "document.querySelector('.fw').dataset.link === 'offline'")
        until(pg, "document.querySelector('.fw').dataset.link === 'live'")
        until(pg, "!document.querySelector('.fw').hasAttribute('data-running')")
        for want in ("27", "28"):
            if pg.locator(".nodi-turn[data-turn='%s']" % want).count():
                prose = pg.locator(".nodi-turn[data-turn='%s'] .nodi-prose" % want).count()
                assert prose <= 2, "no node drawn twice after the reconnect: %d" % prose
        last = turns_shown(pg)[-1]
        body = pg.evaluate("[...document.querySelectorAll('.nodi-turn[data-turn=\"%d\"] .nodi-turn-body > *')].map(n => n.className.split(' ')[0]).filter(c => c !== 'fw-inline' && c !== 'fw-output-play')" % last)
        assert body == ["nodi-input", "nodi-thinking", "nodi-prose", "nodi-tool", "nodi-prose"], body
        assert pg.locator(".nodi-turn[data-turn='%d'] .nodi-tool[data-status='ok']" % last).count() == 1
        assert not [e for e in pg.errors if "WebSocket" not in e and "websocket" not in e and "ERR_" not in e], pg.errors
        pg.close()

        for width, height in ((390, 844), (1280, 800)):
            pg = fresh(width, height)
            attend(pg, door(12), MAIN)
            pg.wait_for_selector(".nodi-turn-tools .fw-fork-here")
            small = pg.evaluate("""[...document.querySelectorAll('.nodi-turn-tools button, .fw-inline-btn, .fw-output-btn')].map(b => { const r = b.getBoundingClientRect(); return [b.className, Math.round(r.width), Math.round(r.height)]; }).filter(x => x[2] < 44 || x[1] < 44)""")
            assert small == [], "every icon under a message is a 44 px target: %s" % small
            plays = pg.evaluate("[...document.querySelectorAll('.fw-play')].map(b => [b.textContent, getComputedStyle(b).borderTopWidth])")
            assert plays and all(t == "\uf028" and w == "0px" for t, w in plays), "play is the speaker glyph with no rectangle: %s" % plays
            snap(pg, "thumbs-%d" % width)
            pg.close()

        for width, height in ((390, 844), (1280, 800)):
            pg = fresh(width, height)
            shut_door = door(12)
            shut_door.shut()
            pg.goto(shut_door.url + "#/gluck/" + MAIN)
            until(pg, "document.querySelector('.fw') && document.querySelector('.fw').dataset.link === 'signedout'")
            pg.wait_for_timeout(2000)
            dialed = shut_door.state()["upgrades"]
            assert dialed >= 5, "the shell dials at least five fresh sockets before it gives up: %d" % dialed
            assert pg.locator(".fw-signedout .fw-signedout-line").inner_text() == "Signed out: sign in again"
            assert pg.locator(".fw-signedout button", has_text="Reload").count() == 1
            assert pg.locator(".fw-signedout button", has_text="Retry").count() == 1
            assert pg.locator(".zr-composer").count() == 0, "no composer to type into while signed out"
            no_sideways(pg, width, "the signed-out line")
            snap(pg, "signedout-%d" % width)
            pg.wait_for_timeout(6000)
            assert shut_door.state()["upgrades"] == dialed, "the shell stops dialing once signed out"
            shut_door.shut(False)
            pg.locator(".fw-signedout button", has_text="Retry").click()
            until(pg, "document.querySelector('.fw').dataset.link === 'live'")
            assert pg.locator(".fw-signedout").count() == 0
            assert not [e for e in pg.errors if "WebSocket" not in e and "websocket" not in e and "ERR_" not in e], pg.errors
            pg.close()

        pg = fresh()
        attend(pg, door(12), MAIN)
        send(pg, EVIL)
        pg.wait_for_selector(".nodi-turn[data-turn='27'] .nodi-input")
        pg.wait_for_selector(".nodi-turn[data-turn='27']:not([data-state='open'])")
        assert hostile_findings(pg) == [], hostile_findings(pg)
        assert EVIL in pg.locator(".nodi-turn[data-turn='27'] .nodi-input").inner_text()
        assert not pg.errors, pg.errors
        pg.close()

        pg = fresh()
        slow = door(150)
        attend(pg, slow, MAIN)
        send(pg, "please run the build")
        pg.wait_for_selector(".nodi-turn[data-turn='27'] .nodi-tool")
        pg.locator(".fw-status-stop").click()
        pg.wait_for_selector(".nodi-turn[data-turn='27'] .nodi-end")
        assert "interrupted" in pg.locator(".nodi-turn[data-turn='27'] .nodi-end").inner_text()
        until(pg, "!document.querySelector('.fw').hasAttribute('data-running')")
        assert slow.state()["interrupts"] == ["keep"], slow.state()
        send(pg, "second run the tests")
        pg.wait_for_selector(".nodi-turn[data-turn='28'] .nodi-thinking")
        until(pg, "document.querySelector('.fw').hasAttribute('data-running')")
        pg.locator(".fw-status-stop").click()
        until(pg, "!document.querySelector('.fw').hasAttribute('data-running')")
        assert slow.state()["interrupts"] == ["keep", "keep"], slow.state()
        pg.close()

        for width, height in ((390, 844), (1280, 800), (1920, 1080)):
            pg = fresh(width, height)
            attend(pg, door(12, "--history", "300", "--page", "20000"), MAIN)
            root_js = "document.querySelector('[data-zr-scroll]')"
            landed = "new Promise((r) => requestAnimationFrame(() => setTimeout(() => { const s = %s; r(Math.round((s.scrollHeight - s.clientHeight - s.scrollTop) * 100) / 100); }, 0)))" % root_js

            def latest_lands(what):
                try:
                    pg.wait_for_selector(".zr-latest", timeout=20000)
                except Exception:
                    print("LATEST-DIAG", width, what, pg.evaluate("""() => { const s = document.querySelector('[data-zr-scroll]'); const pit = document.querySelector('.zr-pit'); const l = document.querySelector('.zr-latest');
                      return { gap: Math.round(s.scrollHeight - s.clientHeight - s.scrollTop), top: s.scrollTop, h: s.scrollHeight, ch: s.clientHeight, cw: s.clientWidth,
                        pit: pit && [...pit.attributes].map((a) => a.name + '=' + a.value).join(' '), latest: !!l, latestDisplay: l && getComputedStyle(l).display,
                        held: document.querySelector('.nodi-turns') && document.querySelector('.nodi-turns').dataset.held, swooping: !!document.querySelector('[data-swooping]') }; }"""))
                    raise
                pg.locator(".zr-latest").click()
                swoop = pg.evaluate("(() => { const n = document.querySelector('.nodi-turns'); const a = n.getAnimations(); return { marked: n.hasAttribute('data-swooping'), frames: a.length ? a[0].effect.getKeyframes().map((k) => k.transform) : [], ms: a.length ? a[0].effect.getTiming().duration : 0, props: a.length ? Object.keys(a[0].effect.getKeyframes()[0]).filter((k) => !['offset', 'computedOffset', 'easing', 'composite'].includes(k)).sort() : [] }; })()")
                assert swoop["marked"] and len(swoop["frames"]) == 2 and swoop["frames"][1] == "translateY(0px)" and swoop["frames"][0].startswith("translateY(-"), "%s at %d: the content swoops down into place: %s" % (what, width, swoop)
                assert swoop["props"] == ["opacity", "transform"] and 350 <= swoop["ms"] <= 450, "%s at %d: transform and opacity, about 400ms: %s" % (what, width, swoop)
                try:
                    until(pg, landed + ".then((gap) => gap <= 1)", timeout=15000)
                except AssertionError:
                    pass
                got = pg.evaluate(landed)
                assert got <= 1, "%s at %d: Latest stops %s px short of the bottom" % (what, width, got)
                until(pg, "!document.querySelector('.nodi-turns').hasAttribute('data-swooping') && document.querySelector('.nodi-turns').getAnimations().length === 0", timeout=3000)
                got = pg.evaluate(landed)
                assert got <= 1, "%s at %d: Latest is %s px short of the bottom once the swoop ends" % (what, width, got)

            pg.evaluate(root_js + ".scrollTop = 0")
            pg.wait_for_timeout(400)
            latest_lands("from far up")
            for _ in range(10):
                pg.evaluate(root_js + ".scrollTop = 0")
                pg.wait_for_timeout(250)
            assert held(pg) > 60, held(pg)
            latest_lands("after the window loaded more rows")
            send(pg, "keep going")
            pg.wait_for_timeout(500)
            pg.evaluate(root_js + ".scrollTop = 0")
            pg.wait_for_timeout(300)
            latest_lands("mid-stream")
            pg.close()

        pg = fresh(1280, 800)
        attend(pg, door(150), MAIN)
        away = "(() => { const r = document.querySelector('[data-zr-scroll]'); return Math.round(r.scrollHeight - r.clientHeight - r.scrollTop); })()"
        pg.mouse.move(640, 300)
        for step, how in enumerate(("wheel", "key")):
            until(pg, away + " <= 2")
            for _ in range(3):
                if how == "wheel":
                    pg.mouse.wheel(0, -40)
                else:
                    pg.locator(".fw-h1").focus()
                    pg.keyboard.press("ArrowUp")
                pg.wait_for_timeout(150)
            left = pg.evaluate(away)
            assert 20 <= left <= 140, "small upward scrolls inside the last stretch move the view: %s" % left
            pg.set_viewport_size({"width": 1280, "height": 760 - step * 100})
            pg.wait_for_timeout(500)
            assert pg.evaluate(away) >= left - 2, "%s up by a little released the follow, a resize left the reader where they were: %s -> %s" % (how, left, pg.evaluate(away))
            pg.evaluate("document.querySelector('[data-zr-scroll]').scrollTop += 1e6")
            until(pg, away + " <= 2")
            pg.set_viewport_size({"width": 1280, "height": 700 - step * 100})
            pg.wait_for_timeout(400)
            assert pg.evaluate(away) <= 2, "scrolling back to the bottom follows again: %s" % pg.evaluate(away)
        send(pg, "start a long run please")
        pg.wait_for_selector(".nodi-turn[data-turn='27'] .nodi-tool[data-status='running']")
        until(pg, away + " <= 2")
        pg.mouse.move(640, 200)
        for _ in range(2):
            pg.mouse.wheel(0, -40)
            pg.wait_for_timeout(150)
        left = pg.evaluate(away)
        assert left >= 20, left
        pg.wait_for_timeout(1500)
        assert pg.evaluate(away) >= left - 2, "while a turn streams the view stays where the reader left it: %s -> %s" % (left, pg.evaluate(away))
        pg.close()

        pg = fresh(390, 844)
        attend(pg, door(150), MAIN)
        send(pg, "start a long run please")
        pg.wait_for_selector(".nodi-turn[data-turn='27'] .nodi-tool[data-status='running'] summary")
        tail = "(() => { const r = document.querySelector('[data-zr-scroll]'); return Math.round(r.scrollHeight - r.clientHeight - r.scrollTop); })()"
        until(pg, tail + " <= 2")
        for target in (".nodi-turn[data-turn='27'] .nodi-input", ".nodi-turn[data-turn='27'] .nodi-tool summary"):
            box = pg.locator(target).first.bounding_box()
            pg.touchscreen.tap(box["x"] + 20, box["y"] + box["height"] / 2)
            pg.wait_for_timeout(300)
            assert pg.evaluate(tail) <= 2, "a tap on %s mid-stream moved the view: %s" % (target, pg.evaluate(tail))
        pg.evaluate("(() => { const li = document.createElement('li'); li.style.height = '500px'; document.querySelector('.nodi-turns').appendChild(li); })()")
        pg.wait_for_timeout(800)
        assert pg.evaluate(tail) <= 2, "a tap on a fold mid-stream does not stop the follow: %s" % pg.evaluate(tail)
        pg.close()

        pg = fresh()
        attend(pg, door(150), MAIN)
        send(pg, "start a long run please")
        pg.wait_for_selector(".nodi-turn[data-turn='27'] .nodi-tool[data-status='running']")
        send(pg, "also mind the dark theme")
        pg.wait_for_selector(".nodi-turn[data-turn='27'] .nodi-steering")
        assert "also mind the dark theme" in pg.locator(".nodi-turn[data-turn='27'] .nodi-steering").inner_text()
        assert pg.locator(".nodi-turn[data-turn='27'] .nodi-steering .nodi-who").inner_text() == "You"
        pg.close()

        pg = fresh()
        attend(pg, door(12), MAIN)
        pg.locator(".fw-fork").click()
        until(pg, "location.hash.startsWith('#/gluck/') && !location.hash.includes('%s')" % MAIN)
        until(pg, "document.querySelector('.fw').dataset.link === 'live' && document.querySelectorAll('.nodi-turn').length >= 1")
        assert pg.locator(".nodi-turn").count() >= 1, "the alternative opens with the history it was cut from"
        pg.wait_for_selector(".fw-forkmark")
        assert pg.locator(".fw-forkmark").inner_text().startswith("\u2442 Fork of ")
        until(pg, "!document.documentElement.dataset.vt")
        assert not pg.errors, pg.errors
        pg.close()

        pg = fresh()
        draft_door = door(12)
        attend(pg, draft_door, MAIN)
        pg.locator(".zr-input").fill("half a thought")
        pg.wait_for_timeout(600)
        pg.locator(".fw-back").click()
        open_tree(pg)
        pg.locator(".zr-tree-row[data-id='%s']" % ("c0ffee04" * 4)).click()
        until(pg, "document.querySelector('.fw').dataset.link === 'live'")
        assert pg.locator(".zr-input").input_value() == "", "another aria has its own draft"
        pg.goto("about:blank")
        pg.goto(draft_door.url + "#/gluck/" + MAIN)
        until(pg, "document.querySelector('.zr-input')")
        assert pg.locator(".zr-input").input_value() == "half a thought", "the draft survives a reload"
        pg.close()

        pg = fresh()
        door_v = door(12)
        attend(pg, door_v, MAIN)
        assert voice_pressed(pg) == "false", "voice starts off"
        assert pg.locator(".fw-mic").count() == 0, "with voice off there is no record button, only the field"
        field = pg.locator(".zr-input").bounding_box()
        open_pit(pg)
        pg.locator(".fw-voice").click()
        close_pit(pg)
        settle_motion(pg)
        assert voice_pressed(pg) == "true"
        assert pg.locator(".fw[data-voice]").count() == 1
        record = pg.locator(".zr-compose-row > .fw-mic").bounding_box()
        assert not pg.locator(".zr-input").is_visible(), "voice mode puts the record button in the field's place"
        rowbox = pg.locator(".zr-compose-row").bounding_box()
        pills = pg.locator(".zr-send").bounding_box()
        assert abs(record["x"] - rowbox["x"]) <= 1 and abs(record["width"] - rowbox["width"]) <= 2 and abs(record["height"] - field["height"]) <= 2, "the record button takes the row's full width, as a stacked input would: %s %s" % (record, rowbox)
        assert pills["y"] >= record["y"] + record["height"] - 1, "the pills sit under the record button: %s %s" % (record, pills)
        assert pg.locator(".fw-mic .fw-mic-glyph").inner_text() != "", "the record button wears a glyph"
        send(pg, "just a [plain] hello")
        pg.wait_for_selector(".nodi-turn[data-turn='27'] .voce[data-for='27']")
        assert pg.locator(".nodi-turn[data-turn='27'] .nodi-prose .voce").count() == 1, "one player per turn, inside a prose node"
        assert pg.locator(".nodi-turn[data-turn='27'] .voce").count() == 1
        until(pg, "document.querySelector('.voce').dataset.state !== 'none'", 10000)
        until(pg, "['idle','loading','playing','paused'].includes(document.querySelector('.voce').dataset.state)", 15000)
        sans_free(pg, "voice player")
        assert door_v.state()["audio"] >= 1, "the gateway audio socket was opened by the voice toggle"
        pg.wait_for_selector(".nodi-turn[data-turn='27']:not([data-state='open'])")
        pg.locator(".nodi-turn[data-turn='26'] .fw-output-play [data-action='play']").click()
        pg.wait_for_selector(".nodi-turn[data-turn='26'] .voce[data-for='26']")
        until(pg, "['loading','playing','idle'].includes(document.querySelector(\".nodi-turn[data-turn='26'] .voce\").dataset.state)", 10000)
        assert pg.evaluate("window.localStorage.length + window.sessionStorage.length") == 0 or not pg.evaluate("Object.keys(window.localStorage).concat(Object.keys(window.sessionStorage)).some(k => /voice|hands/i.test(k))"), "voice and hands-free are never stored"
        pg.close()

        pg = fresh()
        pg.goto("about:blank")
        door_h = door(12)
        attend(pg, door_h, MAIN)
        toggle_hands(pg)
        assert hands_pressed(pg) == "true"
        assert pg.locator(".fw-inline").count() == 0 and pg.locator(".fw-play-big").count() > 0, "hands-free keeps the large Play and drops the small buttons"
        assert voice_pressed(pg) == "true", "hands-free turns the voice on"
        pg.locator(".fw-mic").click()
        until(pg, "document.querySelector('.fw').dataset.mic === 'recording'", 10000)
        send(pg, "just a [plain] hello")
        until(pg, "document.querySelector('.fw').dataset.audio === 'recording-with-pending'", 15000)
        pg.wait_for_selector(".nodi-turn[data-turn='27']:not([data-state='open'])")
        assert pg.locator(".nodi-turn[data-turn='27'] .voce").count() == 0, "a reply arriving while the user records makes no sound and shows no player yet"
        pg.locator(".fw-mic").click()
        pg.wait_for_selector(".nodi-turn[data-turn='27'] .voce[data-for='27']")
        until(pg, "document.querySelector('.fw').dataset.audio !== 'recording-with-pending' && document.querySelector('.fw').dataset.audio !== 'recording'", 10000)
        until(pg, "['live','draining','idle','playing'].includes(document.querySelector('.voce').dataset.state)", 15000)
        toggle_hands(pg)
        assert hands_pressed(pg) == "false"
        pg.goto("about:blank")
        attend(pg, door_h, MAIN)
        assert hands_pressed(pg) == "false" and voice_pressed(pg) == "false", "a reload starts with hands-free and voice off"
        pg.close()

        mic_door = door(12)
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        pg = ctx.new_page()
        pg.errors = []
        pg.on("pageerror", lambda e: pg.errors.append(str(e)))
        attend(pg, mic_door, MAIN)
        pg.locator(".zr-input").fill("typed first")
        voice_on(pg)
        assert pg.locator(".fw-mic").is_enabled()
        assert pg.locator(".fw-mic-label").inner_text() == "typed first", "the record button shows the draft it will add to"
        pg.locator(".fw-mic").tap()
        until(pg, "document.querySelector('.fw').dataset.mic === 'recording'", 10000)
        assert pg.locator(".fw-mic-meter").count() == 1, "the level meter is there the moment the mic is live"
        for _ in range(600):
            if mic_door.state()["stream"]:
                break
            pg.wait_for_timeout(50)
        run = mic_door.state()["stream"][0]
        assert run["aria"] == "gluck/" + MAIN and re.fullmatch(r"[a-z]{2,3}(-[A-Z]{2})?", run["lang"]), run
        until(pg, "document.querySelector('.zr-input').value.includes('what is')", 10000)
        assert pg.evaluate("document.querySelector('.fw').dataset.mic") == "recording", "words arrive in the input before he stops"
        assert pg.locator(".zr-input").input_value().startswith("typed first what is"), pg.locator(".zr-input").input_value()
        seen_level = False
        for _ in range(360):
            if pg.evaluate("document.documentElement.style.getPropertyValue('--fw-mic-level') !== ''"):
                seen_level = True
                break
            pg.wait_for_timeout(50)
        assert seen_level, "the meter follows the microphone"
        for _ in range(600):
            if len(mic_door.state()["stream"][0]["frames"]) >= 14:
                break
            pg.wait_for_timeout(50)
        pg.locator(".fw-mic").tap()
        until(pg, "document.querySelector('.zr-input').value.includes('crossing count please')", 10000)
        until(pg, "document.querySelector('.fw').dataset.mic === 'idle'", 5000)
        assert pg.locator(".zr-input").input_value() == "typed first what is the crossing count please", pg.locator(".zr-input").input_value()
        run = mic_door.state()["stream"][0]
        assert run["ended"] and not run["cancelled"], run
        assert set(run["frames"]) == {1280}, "40 ms frames of 16 kHz s16le: %s" % set(run["frames"])
        assert mic_door.state()["stt"] == [], "nothing is posted for transcription any more"
        stream_sessions = [g for g in mic_door.state()["sessions"] if g["kind"] == "stt-ws"]
        assert len(stream_sessions) == 1 and re.fullmatch(r"[A-Za-z0-9_-]{16}", stream_sessions[0]["query"]), stream_sessions
        assert pg.evaluate("document.documentElement.style.getPropertyValue('--fw-mic-level')") == "", "the meter is cleared"
        assert mic_door.state()["sent"] == [], "the transcript is not sent until the user sends it"
        assert pg.locator(".fw-mic-label").inner_text() == "typed first what is the crossing count please", "the record button shows the transcript"
        draft(pg, "edited words")
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
        assert voice_pressed(pg) == "false", "voice is off while Play asks the gateway to speak"
        pg.locator(".nodi-turn[data-turn='5'] .fw-output-play [data-action='play']").click()
        for _ in range(600):
            if say_door.state()["says"] == [5]:
                break
            pg.wait_for_timeout(100)
        assert say_door.state()["says"] == [5], "a turn whose stored audio expired is asked of the gateway: %s" % say_door.state()["says"]
        until(pg, "(() => { const v = document.querySelector(\".nodi-turn[data-turn='5'] .voce\"); return !!v && ['live','draining','idle','playing'].includes(v.dataset.state); })()", 10000)
        assert pg.locator(".voce[data-state='expired']").count() == 0
        assert say_door.state()["audio"] >= 1, "the gateway socket opened for the ask"
        pg.locator(".nodi-turn[data-turn='6'] .fw-output-play [data-action='play']").click()
        for _ in range(600):
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
            inline_door = door(12)
            phone = width < 600
            ctx = browser.new_context(viewport={"width": width, "height": height}, is_mobile=phone, has_touch=phone)
            pg = ctx.new_page()
            pg.errors = []
            pg.on("pageerror", lambda e: pg.errors.append(str(e)))
            pg.on("console", lambda m: pg.errors.append(m.text) if m.type == "error" else None)
            attend(pg, inline_door, MAIN)
            pg.locator(".zr-input").fill("typed")
            mine = pg.locator(".nodi-turn[data-turn='26'] .fw-inline[data-kind='input']")
            mine.scroll_into_view_if_needed()
            assert mine.locator(".fw-inline-btn").evaluate_all("bs => bs.map(b => b.dataset.action)") == ["play", "retranscribe"]
            assert mine.locator(".fw-inline-btn").all_inner_texts() == ["\uf028", "↩"], "the buttons wear their own glyphs, and ✎ stays Send"
            said_box = pg.locator(".nodi-turn[data-turn='26'] .nodi-said").first.bounding_box()
            bar_box = mine.bounding_box()
            assert bar_box["y"] >= said_box["y"] + said_box["height"] - 1 and bar_box["y"] - (said_box["y"] + said_box["height"]) < 40, "the buttons sit right under the message: %s %s" % (said_box, bar_box)
            for b in mine.locator(".fw-inline-btn").all():
                box = b.bounding_box()
                assert box["height"] >= 44 and box["width"] >= 44, "thumb size: %s" % box
                assert_centred(b, "a message button's glyph at %d" % width)
                assert b.locator(".zr-ink").evaluate("n => parseFloat(getComputedStyle(n).fontSize)") >= 24, "a visibly larger glyph"
            assert pg.locator(".zr-scrim, .zr-sheet").count() == 0
            snap(pg, "inline-%d" % width)
            sans_free(pg, "the inline buttons at %d" % width)
            pg.locator(".nodi-turn[data-turn='26'] .nodi-said").first.click()
            assert pg.locator(".zr-scrim, .zr-sheet").count() == 0, "tapping a message opens nothing"
            mine.locator("[data-action='play']").click()
            pg.wait_for_selector(".fw-inline-player .voce")
            until(pg, "['loading','playing','idle','expired','error'].includes(document.querySelector('.fw-inline-player .voce').dataset.state)", 10000)
            mine.locator("[data-action='retranscribe']").click()
            pg.wait_for_selector(".fw-inline-heard")
            assert "re-heard words" in pg.locator(".fw-inline-heard").inner_text()
            assert inline_door.state()["retranscribed"] == ["gluck/" + MAIN + ":26/in"], inline_door.state()["retranscribed"]
            assert pg.locator(".zr-scrim, .zr-sheet").count() == 0, "no shaded sheet for re-transcribe"
            pg.locator(".fw-inline-heard [data-action='use']").click()
            assert pg.locator(".zr-input").input_value() == "typed re-heard words"
            assert pg.locator(".fw-inline[data-kind='prose']").count() == 0, "a reply has no row of its own for play"
            pg.locator(".nodi-turn[data-turn='26'] .fw-output-play [data-action='play']").click()
            pg.wait_for_selector(".nodi-turn[data-turn='26'] .voce[data-for='26']")
            assert pg.locator(".fw-play-big").count() == 0
            assert not pg.errors, pg.errors
            ctx.close()

        def finger(pg, cdp, phone):
            class Finger:
                clock = 0.0

                def stamp(self, advance=0.0):
                    Finger.clock = max(Finger.clock, time.time()) + advance
                    return Finger.clock

                def down(self, x, y):
                    self.x, self.y = x, y
                    if phone:
                        cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y}], "timestamp": self.stamp()})
                    else:
                        pg.mouse.move(x, y)
                        pg.mouse.down()

                def move(self, y, steps=8, gap=30):
                    y0 = self.y
                    for i in range(1, steps + 1):
                        yy = y0 + (y - y0) * i / steps
                        at = self.stamp(gap / 1000)
                        if phone:
                            cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": self.x, "y": yy}], "timestamp": at})
                        else:
                            cdp.send("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": self.x, "y": yy, "button": "left", "buttons": 1, "timestamp": at})
                    self.y = y
                    pg.evaluate("() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))")

                def hold(self, ms=160):
                    self.stamp(ms / 1000)
                    pg.wait_for_timeout(ms)

                def up(self):
                    at = self.stamp(0.001)
                    if phone:
                        cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": [], "timestamp": at})
                    else:
                        cdp.send("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": self.x, "y": self.y, "button": "left", "buttons": 0, "clickCount": 1, "timestamp": at})
            return Finger()

        PIT = "() => { const p = document.querySelector('.zr-pit'); const b = p.getBoundingClientRect(); return { snap: p.dataset.snap, dragging: p.hasAttribute('data-dragging'), dialog: p.getAttribute('role') === 'dialog', top: b.top, bottom: b.bottom, left: b.left, width: b.width }; }"

        def pit_at(pg, snap, top_px, what):
            until(pg, "(() => { const p = document.querySelector('.zr-pit'); return p.dataset.snap === '%s' && !p.hasAttribute('data-dragging'); })()" % snap, 3000)
            settle_motion(pg)
            got = pg.evaluate(PIT)
            assert abs(got["top"] - top_px) <= 2, "%s: expected the drawer's top edge at %dpx, got %s" % (what, top_px, got)
            assert got["dialog"], "%s: the open drawer is a dialog" % what
            return got

        def pit_gone(pg, what):
            pg.wait_for_selector(".zr-pit[role=dialog]", state="detached")
            settle_motion(pg)
            got = pg.evaluate(PIT)
            assert got["snap"] == "closed" and abs(got["bottom"] - pg.evaluate("innerHeight")) <= 1, "%s: the drawer rests on the bottom edge: %s" % (what, got)

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
            knob = pg.locator(".zr-pit-knob")
            assert knob.is_visible() and pg.locator(".zr-pit[role=dialog]").count() == 0
            assert pg.locator(".zr-pit .zr-pit-head .zr-composer").count() == 1, "the composer is the drawer's head"
            kb, db, fb = knob.bounding_box(), pg.evaluate(PIT), pg.locator(".zr-composer .zr-input").bounding_box()
            assert kb["y"] + kb["height"] <= fb["y"], "the tab stays off the field: %s %s" % (kb, fb)
            bar = pg.locator(".zr-pit-knob .zr-pit-knob-bar").bounding_box()
            assert abs((bar["y"] + bar["height"] / 2) - db["top"]) <= 2, "the tab's bar sits on the drawer's top border: %s %s" % (bar, db)
            half = round(height / 2)

            fx, fy = (fb["x"] + fb["width"] * 0.8, fb["y"] + fb["height"] / 2) if phone else centre(knob)
            f.down(fx, fy)
            f.move(height * 0.5)
            mid = pg.evaluate(PIT)
            assert mid["dragging"], "the drawer follows the finger at %d" % width
            assert abs(mid["top"] - (db["top"] + height * 0.5 - fy)) <= 2, "the drawer moves one to one with the finger: %s" % mid
            f.hold()
            f.up()
            pit_at(pg, "half", half, "dragged from the input bar to the middle")
            assert pg.locator("#app [style]").count() == 0, "a drag leaves no style attribute behind under the CSP"
            snap(pg, "pit-half-%d" % width)
            sans_free(pg, "the pit at %d" % width)
            if phone:
                assert pg.locator(".zr-pit-scrim").count() == 1 and pg.locator(".zr-pit").get_attribute("aria-modal") == "true"
                assert pg.locator(".zr-pit[data-docked]").count() == 0
            else:
                assert pg.locator(".zr-pit-scrim").count() == 0, "the docked drawer has no scrim"
                box = pg.locator(".zr-pit").bounding_box()
                pane = pg.locator(".fw-pane").bounding_box()
                assert abs(box["x"] - pane["x"]) <= 1 and abs(box["x"] + box["width"] - (pane["x"] + pane["width"])) <= 1, "docked across the transcript pane: %s vs %s" % (box, pane)
                assert pg.locator(".zr-pit[data-docked]").count() == 1

            def grab():
                b = pg.locator(".zr-composer .zr-input" if phone else ".zr-pit-knob").bounding_box()
                top = max(b["y"], 0)
                y = (top + b["y"] + b["height"]) / 2
                f.down(b["x"] + b["width"] * (0.8 if phone else 0.5), y)
                return y

            y = grab()
            f.move(y - height * 0.2)
            f.hold()
            f.up()
            pit_at(pg, "half", half, "a slow release nearer half than full stays half")

            y = grab()
            f.move(y - height * 0.4)
            f.hold()
            f.up()
            pit_at(pg, "full", 0, "a slow release near the top goes full")
            snap(pg, "pit-full-%d" % width)

            y = grab()
            f.move(y + height * 0.55)
            f.hold()
            f.up()
            pit_at(pg, "half", half, "dragged down from full to just past half, it settles half")

            y = grab()
            f.move(y + height * 0.45)
            f.hold()
            f.up()
            pit_gone(pg, "dragged down near the bottom, it closes")

            y = grab()
            f.move(y - 100, steps=5, gap=16)
            f.up()
            pit_at(pg, "half", half, "a flick up from the input bar lands on half")
            y = grab()
            f.move(y - 100, steps=5, gap=16)
            f.up()
            pit_at(pg, "full", 0, "a flick up from half lands on full")
            y = grab()
            f.move(y + 100, steps=5, gap=16)
            f.up()
            pit_at(pg, "half", half, "a flick down from full lands on half")
            y = grab()
            f.move(y + 100, steps=5, gap=16)
            f.up()
            pit_gone(pg, "a flick down from half closes")

            knob.focus()
            pg.keyboard.press("Enter")
            pit_at(pg, "half", half, "Enter on the tab opens half")
            assert pg.evaluate("!!document.activeElement.closest('.zr-pit-body')"), "focus moves into the pit"
            knob.focus()
            pg.keyboard.press("ArrowUp")
            pit_at(pg, "full", 0, "ArrowUp on the tab goes full")
            pg.keyboard.press("ArrowDown")
            pit_at(pg, "half", half, "ArrowDown on the tab goes back to half")
            pg.keyboard.press("Escape")
            pit_gone(pg, "Escape closes")
            assert pg.evaluate("document.activeElement.className") == "zr-pit-knob", "focus returns to the tab"
            assert pg.locator(".zr-pit button", has_text="Close").count() == 0, "there is no close button"
            knob.click()
            pit_at(pg, "half", half, "a tap on the tab opens half")
            if phone:
                pg.locator(".zr-pit-scrim").click(position={"x": 10, "y": 10})
            else:
                knob.click()
            pit_gone(pg, "the scrim or the tab closes")
            assert not pg.errors, pg.errors
            ctx.close()

        for width, height in ((390, 844), (1280, 800)):
            phone = width < 600
            ctx = browser.new_context(viewport={"width": width, "height": height}, is_mobile=phone, has_touch=phone)
            pg = ctx.new_page()
            pg.errors = []
            pg.on("pageerror", lambda e: pg.errors.append(str(e)))
            pg.goto(fast.url + "#/")
            pg.wait_for_selector(".zr-pit-knob")
            assert pg.locator(".fw-top, .fw-mark, .fw-title").count() == 0, "the header is gone"
            assert pg.locator(".fw-head").count() == 0, "no logo on the list"
            assert pg.locator(".fw-status").is_visible(), "the slim status bar shows at every width"
            attend(pg, fast, MAIN)
            assert pg.locator(".fw-head").count() == 0, "no logo while attending"
            assert pg.locator(".fw-top-new, .fw-bar").count() == 0
            if True:
                bar = pg.locator(".fw-status")
                until(pg, "document.querySelector('.fw-status-mantra') && document.querySelector('.fw-status-mantra').textContent.length > 0", 8000)
                box = bar.bounding_box()
                assert box["y"] == 0 and box["height"] <= 32, "slim bar at the top: %s" % box
                assert pg.locator(".fw-status-glyph").inner_text() == "✓", "an idle live aria wears the pager's done glyph"
                assert pg.locator(".fw-status-handle").inner_text() == "zanni", "the bar names the handle, not a short id"
                until(pg, "/\\d+(\\.\\d)?k?\\/[\\d.]+[km]? \\d+\\.\\d%/.test(document.querySelector('.fw-status-ctx') ? document.querySelector('.fw-status-ctx').textContent : '')", 8000)
                pg.evaluate("document.querySelector('[data-zr-scroll]').scrollTop = 400")
                pg.wait_for_timeout(100)
                assert abs(bar.bounding_box()["y"]) <= 1, "the status bar stays while the transcript scrolls"
                top = pg.locator(".fw-status").evaluate("n => getComputedStyle(n).position")
                assert top == "relative", "the bar is outside the scroller, not stuck to the page"
            open_pit(pg)
            assert pg.locator("[data-action='new']").is_visible() and pg.locator(".fw-voice").is_visible(), "every removed control is one tap from the pit"
            pg.locator("[data-action='state']").click()
            until(pg, "document.querySelector('.fw-pit-fact[data-key=\"system.thinking_effort\"] dd') && document.querySelector('.fw-pit-fact[data-key=\"system.thinking_effort\"] dd').textContent === 'high'", 8000)
            until(pg, "document.querySelector('.zr-pit .zr-tree-row')", 8000)
            assert pg.evaluate("document.activeElement && document.activeElement.classList.contains('zr-tree')"), "opening the State pit focuses its tree"
            facts = pg.locator(".fw-pit-fact").all_inner_texts()
            joined = " ".join(facts)
            assert "Live" in joined and MAIN in joined and "Zanni" in joined, facts
            pg.locator(".fw-pit-back").click()
            assert pg.locator(".fw-head").count() == 0, "no logo below full screen"
            pg.locator(".zr-pit-knob").focus()
            pg.keyboard.press("ArrowUp")
            pit_at(pg, "full", 0, "full screen pit")
            assert pg.locator(".zr-pit .fw-head").count() == 1, "the logo appears only in the full-screen pit"
            assert pg.locator(".fw-pit-title").inner_text().strip() != ""
            snap(pg, "header-drop-full-%d" % width)
            pg.keyboard.press("ArrowDown")
            pit_at(pg, "half", round(height / 2), "back to half")
            pg.locator("[data-action='new']").click()
            pg.wait_for_selector(".zr-pit[role=dialog]", state="detached")
            pg.wait_for_selector(".fw-new-form")
            snap(pg, "header-drop-new-%d" % width)
            assert not pg.errors, pg.errors
            ctx.close()

        for width, height in ((390, 844), (1280, 800)):
            phone = width < 600
            ctl_door = door(12)
            ctx = browser.new_context(viewport={"width": width, "height": height}, is_mobile=phone, has_touch=phone)
            pg = ctx.new_page()
            pg.errors = []
            pg.on("pageerror", lambda e: pg.errors.append(str(e)))
            pg.on("console", lambda m: pg.errors.append(m.text) if m.type == "error" else None)
            attend(pg, ctl_door, MAIN)
            open_pit(pg)
            first = pg.locator(".zr-pit-row").evaluate_all("rows => rows.map(r => r.dataset.action)")
            assert first == ["new", "tail-fork", "tree", "recent", "asks", "queue", "voice", "hands-free", "state", "fork-at", "outfits"], first
            glyph = lambda a: pg.locator(".zr-pit-row[data-action='%s'] .zr-pit-row-glyph" % a).inner_text()
            assert [glyph("state"), glyph("fork-at")] == ["웃", "⑂"], "each detail row wears its pager glyph"
            assert pg.locator(".fw-controls .zr-pit-row").evaluate_all("rows => rows.map(r => r.querySelector('.zr-pit-row-label').textContent)") == ["New", "Fork", "Tree", "Recent", "Asks", "Queue", "Voice", "Hands-free"], "the common controls are tiles"
            pg.locator("[data-action='tree']").click()
            until(pg, "document.querySelectorAll('.zr-pit .zr-tree-row').length >= 5", 8000)
            assert pg.evaluate("document.activeElement && document.activeElement.classList.contains('zr-tree')"), "opening the Tree pit focuses the tree"
            before = pg.evaluate("document.querySelector('.zr-pit [data-cursor=\"true\"]').dataset.id")
            pg.keyboard.press("k")
            assert pg.evaluate("document.querySelector('.zr-pit [data-cursor=\"true\"]').dataset.id") != before, "j and k work with no click first"
            pg.keyboard.press("j")
            assert pg.evaluate("document.querySelector('.zr-pit [data-cursor=\"true\"]').dataset.id") == before
            assert pg.locator(".zr-pit .zr-tree-row[data-id='%s']" % LANE).count() == 1, "the attended row is open"
            assert pg.locator(".zr-pit .zr-tree-row[data-id='%s']" % ("c0ffee05" * 4)).count() == 0, "a branch off the chain stays closed"
            depths = pg.evaluate("[...document.querySelectorAll('.zr-pit .zr-tree-row')].map(r => r.dataset.depth)")
            assert "0" in depths and "1" in depths, "the tree nests: %s" % depths
            assert pg.locator(".zr-pit .zr-tree-row[data-id='%s']" % MAIN).get_attribute("aria-selected") == "true", "the attended aria is marked"
            assert pg.locator(".zr-pit .zr-tree-row[data-id='%s']" % MAIN).get_attribute("aria-expanded") == "true" and pg.locator(".zr-pit .zr-tree-row[data-id='%s'] .zr-tree-disclosure" % MAIN).count() == 1, "an open row has a disclosure caret in the DOM"
            assert pg.locator(".zr-pit .zr-tree-row[data-id='%s'] .zr-tree-here" % MAIN).text_content().strip() == "●", "the attended row wears the pager's here mark"
            assert not any(c in pg.locator(".zr-pit .zr-tree").inner_text() for c in "│├└─"), "no guide characters, the tree is rendered"
            pg.locator(".zr-pit .zr-tree-row[data-id='%s']" % LANE).click()
            pg.wait_for_selector(".zr-pit[role=dialog]", state="detached")
            until(pg, "location.hash.includes('%s')" % LANE, 5000)
            until(pg, "document.querySelector('.fw').dataset.link === 'live'", 8000)
            open_pit(pg)
            first = pg.locator(".zr-pit-row").evaluate_all("rows => rows.map(r => r.dataset.action)")
            assert first[0] == "tree", "the row used last comes first: %s" % first
            pg.locator("[data-action='recent']").click()
            until(pg, "document.querySelectorAll('.zr-pit-row[data-id]').length >= 5", 8000)
            pg.locator(".fw-pit-back").click()
            pg.locator("[data-action='outfits']").click()
            until(pg, "document.querySelectorAll('.zr-pit-row[data-action=\"outfit\"]').length === 3", 8000)
            assert pg.locator(".zr-pit-row[data-action='outfit'][data-id='sonn5-kic'] .zr-pit-row-meta").inner_text() == "default"
            pg.locator(".zr-pit-row[data-action='outfit'][data-id='opus5-ant']").click()
            pg.wait_for_selector(".fw-new-form")
            assert pg.locator(".fw-new-form input").input_value() == "opus5-ant", "an outfit from the list is chosen for the new figaro"
            pg.keyboard.press("Escape")
            pg.wait_for_selector(".fw-new-form", state="detached")
            pg.wait_for_selector(".zr-pit[role=dialog]", state="detached")
            open_pit(pg)
            close_pit(pg)
            pg.reload()
            until(pg, "document.querySelector('.fw').dataset.link === 'live'", 15000)
            open_pit(pg)
            order = pg.locator(".zr-pit-row").evaluate_all("rows => rows.map(r => r.dataset.action)")
            tiles = pg.locator(".fw-controls .zr-pit-row").evaluate_all("rows => rows.map(r => r.dataset.action)")
            assert tiles[:2] == ["recent", "tree"] and order[len(tiles)] == "outfits", "last-used order survives a reload, tiles and detail rows each: %s" % order
            close_pit(pg)

            attend(pg, ctl_door, MAIN)
            open_pit(pg)
            pg.locator("[data-action='fork-at']").click()
            pg.locator(".fw-forkat-form input").fill("20")
            pg.locator(".fw-forkat-form textarea").fill("what if we waited")
            pg.locator(".fw-forkat-form button[type=submit]").click()
            pg.wait_for_selector(".zr-pit[role=dialog]", state="detached")
            until(pg, "/^#\\/gluck\\/[0-9a-f]{32}$/.test(location.hash) && !location.hash.includes('%s')" % MAIN, 8000)
            until(pg, "document.querySelector('.fw').dataset.link === 'live'", 8000)
            assert pg.locator(".fw-forkmark").inner_text().startswith("\u2442 Fork of "), "the sub-bar says this is a fork and of what"
            assert pg.locator(".fw-status[data-fork]").count() == 1, "the status bar is marked as a fork's"
            assert pg.locator(".nodi-turn[data-fresh]").count() == 0, "history does not animate in on a fork"
            until(pg, "document.querySelector('.nodi-turn[data-turn=\"20\"] .nodi-turn-fork') !== null", 8000)
            assert pg.locator(".nodi-turn-fork").count() == 1, "the fork's first own turn alone wears the mark"
            assert pg.locator(".nodi-turn[data-turn='20'] .nodi-turn-fork").inner_text().startswith("\u2442 "), pg.locator(".nodi-turn-fork").inner_text()
            sent = ctl_door.state()["sent"]
            assert any(s["text"] == "what if we waited" and s["id"] != MAIN for s in sent), sent
            turns_now = turns_shown(pg)
            assert turns_now and max(turns_now) == 20, "the fork keeps the turns before 20 and its own prompt: %s" % turns_now
            snap(pg, "fork-%d" % width)

            attend(pg, ctl_door, MAIN)
            open_pit(pg)
            pg.locator("[data-action='tail-fork']").click()
            pg.wait_for_selector(".zr-pit[role=dialog]", state="detached")
            until(pg, "!location.hash.includes('%s')" % MAIN, 8000)
            until(pg, "document.querySelector('.fw').dataset.link === 'live'", 8000)
            assert pg.locator(".nodi-turn-fork").count() == 0, "a tail fork has no own turn yet, so no turn wears the mark"
            assert pg.locator(".fw-forkmark").count() == 1, "but it still says it is a fork"
            assert not pg.errors, pg.errors
            ctx.close()

        ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, reduced_motion="reduce")
        pg = ctx.new_page()
        pg.errors = []
        pg.on("pageerror", lambda e: pg.errors.append(str(e)))
        cdp = ctx.new_cdp_session(pg)
        attend(pg, door(12), MAIN)
        f = finger(pg, cdp, True)
        gx, gy = centre(pg.locator(".zr-composer .zr-input"))
        f.down(gx, gy)
        f.move(gy - 380)
        f.hold()
        f.up()
        pit_at(pg, "half", 422, "reduced motion still drags")
        assert pg.evaluate("parseFloat(getComputedStyle(document.querySelector('.zr-pit')).transitionDuration) * 1000") <= 1
        pg.keyboard.press("Escape")
        pg.wait_for_selector(".zr-pit[role=dialog]", state="detached")
        assert not pg.errors, pg.errors
        ctx.close()

        sess_door = door(12)
        pg = fresh()
        attend(pg, sess_door, MAIN)
        pg.locator(".zr-input").fill("typed")
        mine = pg.locator(".nodi-turn[data-turn='26'] .fw-inline[data-kind='input']")
        mine.scroll_into_view_if_needed()
        mine.locator("[data-action='play']").click()
        pg.wait_for_selector(".fw-inline-player .voce")
        until(pg, "['playing','idle','expired','error'].includes(document.querySelector('.fw-inline-player .voce').dataset.state)", 10000)
        mine.locator("[data-action='retranscribe']").click()
        pg.wait_for_selector(".fw-inline-heard")
        toggle_voice(pg)
        for _ in range(600):
            if any(g["kind"] == "audio-ws" for g in sess_door.state()["sessions"]):
                break
            pg.wait_for_timeout(50)
        got = sess_door.state()["sessions"]
        kinds = {g["kind"] for g in got}
        assert {"gateway-ws", "audio-ws", "stt-key", "audio-key"} <= kinds, kinds
        ids = {g["header"] or g["query"] for g in got}
        assert len(ids) == 1 and len(next(iter(ids))) == 16, "one id for the whole page load: %s" % got
        assert re.fullmatch(r"[A-Za-z0-9_-]{16}", next(iter(ids))), ids
        for g in got:
            if g["kind"] in ("stt", "stt-key", "audio-key-status"):
                assert g["header"], "fetches carry the header: %s" % g
            if g["kind"] in ("gateway-ws", "audio-ws", "audio-key"):
                assert g["query"], "upgrades and the audio element carry the query: %s" % g
        sid = next(iter(ids))
        stt_trace = next(g["traceparent"] for g in got if g["kind"] == "stt-key")
        assert re.fullmatch(r"00-[0-9a-f]{32}-[0-9a-f]{16}-01", stt_trace), "the stt fetch carries traceparent: %s" % got
        pg.locator(".zr-send").click()
        for _ in range(600):
            if sess_door.state()["quas"]:
                break
            pg.wait_for_timeout(50)
        qua_trace = sess_door.state()["quas"][0]
        assert re.fullmatch(r"00-[0-9a-f]{32}-[0-9a-f]{16}-01", qua_trace), "figaro.qua carries traceparent: %s" % sess_door.state()["quas"]
        spans = []
        for _ in range(600):
            pg.evaluate("window.dispatchEvent(new Event('pagehide'))")
            pg.wait_for_timeout(50)
            posted = [p for p in sess_door.state()["otel"] if p["path"] == "/otel/v1/traces" and p["body"]]
            spans = [s for p in posted for r in p["body"]["resourceSpans"] for sc in r["scopeSpans"] for s in sc["spans"]]
            if {"send", "dictate"} <= {s["name"] for s in spans}:
                break
        by = {s["name"]: s for s in spans}
        assert {"send", "dictate"} <= set(by), "pagehide flushes one root span per user action: %s" % sorted(by)
        for s in spans:
            attrs = {a["key"]: a["value"].get("stringValue") for a in s["attributes"]}
            assert attrs["figchat.session"] == sid, "every span carries the page session: %s" % s
            assert "parentSpanId" not in s, "a user action is a root span"
        assert "00-%s-%s-01" % (by["send"]["traceId"], by["send"]["spanId"]) == qua_trace, "the send span is the trace figaro.qua carried"
        assert "00-%s-%s-01" % (by["dictate"]["traceId"], by["dictate"]["spanId"]) == stt_trace, "the dictate span is the trace the stt fetch carried"
        assert {p["header"] for p in sess_door.state()["otel"] if p["header"]} <= {sid}
        assert not pg.errors, pg.errors
        pg.reload()
        until(pg, "document.querySelector('.fw') && document.querySelector('.fw').dataset.link === 'live'")
        later = {g["header"] or g["query"] for g in sess_door.state()["sessions"]}
        assert len(later) == 2 and sid in later, "a reload mints a new id: %s" % later
        pg.close()

        for width, height in ((390, 844), (1280, 800)):
            phone = width < 600
            md_door = door(60)
            pg = fresh(width, height)
            attend(pg, md_door, MAIN)
            send(pg, "show me [md] [plain]")
            pg.wait_for_selector(".nodi-turn[data-turn='27'] .nodi-prose")
            pg.wait_for_selector(".nodi-turn[data-turn='27'] .nodi-h")
            pg.evaluate("document.querySelector(\".nodi-turn[data-turn='27'] .nodi-h\").__kept = 'heading'")
            seen_partial = False
            for _ in range(400):
                got = pg.evaluate("""() => { const t = document.querySelector(".nodi-turn[data-turn='27'] .nodi-table"); return t ? t.querySelectorAll('tbody tr').length : -1; }""")
                if 0 <= got < 3:
                    seen_partial = True
                if got == 3:
                    break
                pg.wait_for_timeout(25)
            assert seen_partial, "the table fills in row by row while the reply streams"
            pg.wait_for_selector(".nodi-turn[data-turn='27']:not([data-state='open'])")
            kinds = pg.evaluate("[...document.querySelectorAll(\".nodi-turn[data-turn='27'] .nodi-text > *\")].map(n => n.className.split(' ')[0])")
            assert kinds == ["nodi-h", "nodi-p", "nodi-list", "nodi-pre", "nodi-table-wrap", "nodi-p"], kinds
            assert pg.evaluate("document.querySelector(\".nodi-turn[data-turn='27'] .nodi-h\").__kept") == "heading", "a settled block keeps its element while later blocks stream"
            assert pg.locator(".nodi-turn[data-turn='27'] .nodi-table th").all_inner_texts() == ["file", "lines", "note"]
            assert pg.locator(".nodi-turn[data-turn='27'] .nodi-table tbody tr").count() == 3
            assert pg.locator(".nodi-turn[data-turn='27'] .nodi-table td").nth(1).evaluate("n => getComputedStyle(n).textAlign") == "right"
            no_sideways(pg, width, "a streamed table")
            sans_free(pg, "the streamed reply at %d" % width)
            snap(pg, "stream-md-%d" % width)
            streamed = pg.locator(".nodi-turn[data-turn='27'] .nodi-text").inner_html()
            pg.goto("about:blank")
            attend(pg, md_door, MAIN, 27)
            pg.wait_for_selector(".nodi-turn[data-turn='27'] .nodi-table")
            assert pg.locator(".nodi-turn[data-turn='27'] .nodi-text").inner_html() == streamed, "history draws what the stream drew"
            assert not pg.errors, pg.errors
            pg.close()

        MOTION = """() => {
          const over = [];
          for (const n of document.querySelectorAll('.zr-composer, .zr-composer *, .fw-status *, .fw-main button')) {
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
        pg.wait_for_selector(".fw-status[data-state='running'] .fw-status-line")
        pg.wait_for_timeout(300)
        assert pg.evaluate(MOTION) == [], pg.evaluate(MOTION)
        pg.locator(".fw-status-stop").click()
        pg.wait_for_selector(".fw-status-stop", state="detached")
        ctx.close()

        pg = fresh()
        attend(pg, door(150), MAIN)
        assert press_ms(pg) == 320, "the press releases on the pop token: %s" % press_ms(pg)
        assert pg.locator(".nodi-turn[data-fresh]").count() == 0, "history does not animate in"
        send(pg, "please run the build")
        pg.wait_for_selector(".fw-status[data-state='running'] .fw-status-line")
        assert pg.locator(".nodi-turn[data-turn='27'][data-fresh]").count() == 1, "the new turn is the one that arrives with motion"
        pg.locator(".fw-status-stop").click()
        pg.wait_for_selector(".fw-status-stop", state="detached")
        pg.close()

        refused = fresh()
        refused.goto(fast.url + "#/gluck/" + "f" * 32)
        until(refused, "document.querySelector('.fw').dataset.link === 'gone'")
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
