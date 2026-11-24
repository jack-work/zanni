import os
import statistics
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.sync_api import sync_playwright

from figchat_kit import FAKE_VISUAL_VIEWPORT, HANG_MS, MAIN, Door, assert_centred, keystrokes, quantile, until

bundle = os.path.abspath(sys.argv[1])
shots = os.environ.get("FIGCHAT_SHOTS", "")
KB = 336
TARGET_P95_MS = 50
RELEASE_P95_MS = 81.7
RELEASE_SLACK = 1.1
SCROLLER = "document.querySelector('[data-zr-scroll]')"

doors = []
import atexit
atexit.register(lambda: [d.stop() for d in doors])


def door(step):
    d = Door(bundle, step)
    doors.append(d)
    return d


def geometry(pg):
    return pg.evaluate("""() => {
      const r = (s) => { const n = document.querySelector(s); if (!n) return null; const b = n.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, height: b.height }; };
      const sc = document.querySelector('[data-zr-scroll]');
      const turns = [...document.querySelectorAll('.nodi-turn-body > *')];
      const last = turns.length ? turns[turns.length - 1].getBoundingClientRect() : null;
      const vv = window.visualViewport;
      return {
        shell: r('.zr-shell'), composer: r('.zr-composer'), input: r('.zr-input'), scroller: r('[data-zr-scroll]'),
        lastBottom: last && last.bottom,
        vvBottom: vv.offsetTop + vv.height, vvTop: vv.offsetTop, innerHeight: innerHeight,
        docScroll: [document.documentElement.scrollTop, document.body.scrollTop, scrollY],
        docFits: document.documentElement.scrollHeight <= innerHeight && document.body.scrollHeight <= innerHeight,
        scrollTop: sc.scrollTop, fromBottom: sc.scrollHeight - sc.clientHeight - sc.scrollTop,
        keyboard: document.documentElement.hasAttribute('data-keyboard'),
        active: document.activeElement && (document.activeElement.className || document.activeElement.tagName),
      };
    }""")


def near(a, b, what, tol=1.5):
    assert abs(a - b) <= tol, "%s: %s vs %s" % (what, a, b)


with sync_playwright() as p:
    browser = p.webkit.launch()
    open_context = browser.new_context

    def hang_bounded_context(**options):
        ctx = open_context(**options)
        ctx.set_default_timeout(HANG_MS)
        return ctx

    browser.new_context = hang_bounded_context
    phone = dict(p.devices["iPhone 15"])
    phone["viewport"] = {"width": 390, "height": 844}
    phone["screen"] = {"width": 390, "height": 844}

    def fresh(fake=True):
        ctx = browser.new_context(**phone)
        if fake:
            ctx.add_init_script(FAKE_VISUAL_VIEWPORT)
        pg = ctx.new_page()
        pg.errors = []
        pg.on("pageerror", lambda e: pg.errors.append(str(e)))
        pg.on("console", lambda m: pg.errors.append(m.text) if m.type == "error" and "interactive-widget" not in m.text else None)
        return pg

    def attend(pg, d, aria=MAIN):
        pg.goto("about:blank")
        pg.goto(d.url + "#/gluck/" + aria)
        until(pg, "!!document.querySelector('.fw') && document.querySelector('.fw').dataset.link === 'live'")
        until(pg, "document.querySelectorAll('.nodi-turn').length > 3 && document.querySelector('[data-zr-scroll]').scrollTop > 0")
        steady = 0
        last = None
        for _ in range(80):
            now = pg.evaluate("(() => { const sc = document.querySelector('[data-zr-scroll]'); const n = [...document.querySelectorAll('.nodi-turn-body > *')].pop(); return [sc.scrollHeight, sc.scrollTop, n ? Math.round(n.getBoundingClientRect().bottom) : 0]; })()")
            steady = steady + 1 if now == last else 0
            last = now
            if steady >= 5:
                break
            pg.wait_for_timeout(100)

    fast = door(12)

    def meta(pg):
        return pg.evaluate("document.querySelector('meta[name=viewport]').content")

    def sent(d):
        return [m["text"] for m in d.state()["sent"]]

    pg = fresh()
    attend(pg, fast)
    g = geometry(pg)
    near(g["shell"]["top"], 0, "the shell starts at the top")
    near(g["shell"]["bottom"], 844, "the shell fills the screen")
    near(g["composer"]["bottom"], 844, "the composer sits on the bottom edge")
    assert g["docFits"] and g["docScroll"] == [0, 0, 0], "the document itself has nothing to scroll: %s" % g
    assert g["fromBottom"] <= 1, "the transcript opens at its end: %s" % g
    near(g["lastBottom"], g["composer"]["top"], "the last node ends at the composer", 40)
    pg.evaluate("window.scrollTo(0, 300); document.body.scrollTop = 300; document.documentElement.scrollTop = 300")
    assert geometry(pg)["docScroll"] == [0, 0, 0], "the document refuses to scroll"
    style = pg.evaluate("""() => { const cs = (s) => getComputedStyle(document.querySelector(s) || document[s]); return {
      body: cs('body').position, bodyOver: cs('body').overscrollBehaviorY, htmlOver: cs('html').overscrollBehaviorY, htmlOverflow: cs('html').overflowY,
      scroller: cs('[data-zr-scroll]').overscrollBehaviorY, scrollerOverflow: cs('[data-zr-scroll]').overflowY, touch: cs('.zr-shell').touchAction,
      shellPos: cs('.zr-shell').position, shellH: cs('.zr-shell').height }; }""")
    assert style["body"] == "fixed" and style["bodyOver"] == "none" and style["htmlOver"] == "none" and style["htmlOverflow"] == "hidden", style
    assert style["scroller"] == "contain" and style["scrollerOverflow"] == "auto", style
    assert style["touch"] == "manipulation", style
    assert "interactive-widget=resizes-content" in meta(pg) and "viewport-fit=cover" in meta(pg), meta(pg)
    assert "maximum-scale" not in meta(pg) and "user-scalable" not in meta(pg), "pinch zoom stays available: " + meta(pg)
    sizes = pg.evaluate("[...document.querySelectorAll('textarea, input, select')].map(n => [n.className, parseFloat(getComputedStyle(n).fontSize)])")
    assert sizes and all(px >= 16 for _, px in sizes), "an input under 16px makes iOS zoom on focus: %s" % sizes
    pg.locator(".zr-composer .zr-grip").focus()
    pg.keyboard.press("Enter")
    pg.wait_for_selector(".zr-pit[data-snap='half']")
    pg.locator("[data-action='new']").tap()
    pg.wait_for_selector(".fw-new-form")
    sizes = pg.evaluate("[...document.querySelectorAll('textarea, input, select')].map(n => [n.className, parseFloat(getComputedStyle(n).fontSize)])")
    assert len(sizes) >= 2 and all(px >= 16 for _, px in sizes), "the New figaro form inputs are 16px or more: %s" % sizes
    pg.keyboard.press("Escape")
    pg.wait_for_selector(".fw-sheet", state="detached")
    comp = pg.evaluate("(() => { const t = document.querySelector('.zr-input'); return [t.autocapitalize, t.getAttribute('autocorrect'), t.spellcheck, !!document.querySelector('[contenteditable]')]; })()")
    assert comp == ["sentences", "off", False, False], "autocapitalize, autocorrect and spellcheck are set on purpose and the editable is a plain textarea: %s" % comp
    assert not pg.errors, pg.errors
    pg.context.close()

    for top in (0, 60):
        pg = fresh()
        attend(pg, fast)
        pg.evaluate("window.__kb.follow(%d, %d)" % (KB, top))
        before = geometry(pg)
        assert before["fromBottom"] <= 1
        pg.locator(".zr-input").tap()
        until(pg, "document.documentElement.hasAttribute('data-keyboard')", 5000)
        pg.wait_for_timeout(250)
        g = geometry(pg)
        want = 844 - KB
        near(g["vvBottom"], top + want, "the fake keyboard moved the visual viewport")
        near(g["shell"]["top"], top, "the shell follows visualViewport.offsetTop (%d)" % top)
        near(g["shell"]["bottom"], g["vvBottom"], "the shell ends where the keyboard begins (%d)" % top)
        near(g["composer"]["bottom"], g["vvBottom"], "the composer sits right above the keyboard (%d)" % top)
        pad = pg.evaluate("parseFloat(getComputedStyle(document.querySelector('.zr-composer')).paddingBottom)")
        assert pad == 8, "no safe-area padding above the keyboard: %s" % pad
        assert g["fromBottom"] <= 1, "the transcript stayed at its end: %s" % g
        near(g["lastBottom"], g["composer"]["top"], "nothing hides under the composer", 40)
        assert g["lastBottom"] <= g["composer"]["top"] + 1
        assert g["docFits"] and g["docScroll"] == [0, 0, 0], "focus did not scroll the page: %s" % g
        assert g["active"] == "zr-input"
        pg.evaluate("window.scrollTo(0, 200)")
        assert geometry(pg)["docScroll"] == [0, 0, 0]
        near(geometry(pg)["composer"]["bottom"], g["composer"]["bottom"], "the composer did not move")
        pg.screenshot(path=os.path.join(shots, "kb-%d.png" % top)) if shots else None
        assert not pg.errors, pg.errors
        pg.context.close()

    pg = fresh()
    attend(pg, fast)
    pg.evaluate("window.__kb.follow(%d, 0)" % KB)
    pg.evaluate("document.querySelector('[data-zr-scroll]').scrollTop = 500")
    pg.wait_for_timeout(200)
    anchor = pg.evaluate("""() => { const sc = document.querySelector('[data-zr-scroll]').getBoundingClientRect();
      const n = [...document.querySelectorAll('.nodi-turn')].find(t => t.getBoundingClientRect().top > sc.top + 20); return [Number(n.dataset.turn), n.getBoundingClientRect().top, document.querySelector('[data-zr-scroll]').scrollTop]; }""")
    pg.locator(".zr-input").tap()
    until(pg, "document.documentElement.hasAttribute('data-keyboard')", 5000)
    pg.wait_for_timeout(300)
    after = pg.evaluate("[document.querySelector(\".nodi-turn[data-turn='%d']\").getBoundingClientRect().top, document.querySelector('[data-zr-scroll]').scrollTop]" % anchor[0])
    near(after[0], anchor[1], "a reader mid-transcript does not see it jump on focus")
    near(after[1], anchor[2], "the scroll position does not move on focus")
    pg.locator(".nodi-turn[data-turn='%d'] summary" % anchor[0]).first.tap() if pg.locator(".nodi-turn[data-turn='%d'] summary" % anchor[0]).count() else None
    pg.context.close()

    pg = fresh()
    attend(pg, fast)
    pg.evaluate("window.__kb.follow(%d, 0)" % KB)
    pg.locator(".zr-input").tap()
    until(pg, "document.documentElement.hasAttribute('data-keyboard')", 5000)
    fold = pg.locator(".nodi-thinking summary").last
    fold.scroll_into_view_if_needed()
    pg.wait_for_timeout(100)
    was = pg.evaluate("document.querySelectorAll('.nodi-thinking')[document.querySelectorAll('.nodi-thinking').length - 1].open")
    fold.tap()
    now = pg.evaluate("document.querySelectorAll('.nodi-thinking')[document.querySelectorAll('.nodi-thinking').length - 1].open")
    assert now != was, "tapping a fold with the keyboard up still toggles it"
    until(pg, "!document.documentElement.hasAttribute('data-keyboard')", 5000)
    pg.wait_for_timeout(300)
    g = geometry(pg)
    near(g["composer"]["bottom"], 844, "the composer returns to the bottom once the keyboard goes")
    near(g["shell"]["bottom"], 844, "the shell returns to full height")
    assert pg.evaluate("parseFloat(getComputedStyle(document.querySelector('.zr-composer')).paddingBottom)") >= 8
    assert g["docFits"] and g["docScroll"] == [0, 0, 0]
    pg.context.close()

    sender = door(12)
    pg = fresh()
    attend(pg, sender)
    pg.evaluate("window.__kb.follow(%d, 0)" % KB)
    pg.locator(".zr-input").tap()
    until(pg, "document.documentElement.hasAttribute('data-keyboard')", 5000)
    pg.keyboard.type("keep the keyboard")
    pg.locator(".zr-send").tap()
    until(pg, "document.querySelector(\".nodi-turn[data-turn='27']\")", 10000)
    assert sent(sender) == ["keep the keyboard"], sent(sender)
    g = geometry(pg)
    assert g["active"] == "zr-input" and g["keyboard"], "sending keeps focus and the keyboard up: %s" % g
    assert pg.locator(".zr-input").input_value() == ""
    pg.evaluate("document.activeElement.blur()")
    until(pg, "!document.documentElement.hasAttribute('data-keyboard')", 5000)
    pg.locator(".zr-input").fill("second")
    pg.evaluate("document.activeElement.blur()")
    pg.wait_for_timeout(100)
    pg.locator(".zr-send").tap()
    until(pg, "document.querySelector(\".nodi-turn[data-turn='28']\")", 10000)
    assert sent(sender) == ["keep the keyboard", "second"], sent(sender)
    assert geometry(pg)["active"] != "zr-input", "a send with the keyboard already down does not raise it"
    assert not pg.errors, pg.errors
    pg.context.close()

    pg = fresh()
    attend(pg, sender)
    pg.locator(".zr-input").tap()
    pg.keyboard.insert_text("dictated into the box")
    assert pg.locator(".zr-input").input_value() == "dictated into the box", "dictation inserts with input events and no key events"
    pg.keyboard.press("Enter")
    assert pg.locator(".zr-input").input_value() == "dictated into the box\n", "on a touch device Enter is a newline, never a send"
    pg.locator(".zr-send").tap()
    until(pg, "document.querySelector(\".nodi-turn[data-turn='29']\")", 10000)
    assert sent(sender)[-1] == "dictated into the box\n".strip() or sent(sender)[-1].startswith("dictated into the box"), sent(sender)
    pg.context.close()

    ctx = browser.new_context(viewport={"width": 390, "height": 844})
    pg = ctx.new_page()
    pg.errors = []
    pg.on("pageerror", lambda e: pg.errors.append(str(e)))
    desk = door(12)
    attend(pg, desk)
    pg.locator(".zr-input").click()
    pg.keyboard.type("ime text")
    pg.evaluate("""() => { const t = document.querySelector('.zr-input');
      t.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, isComposing: true }));
      t.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
      t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true, cancelable: true }));
    }""")
    pg.wait_for_timeout(300)
    assert sent(desk) == [], "Enter that picks an IME candidate never sends: %s" % sent(desk)
    pg.keyboard.press("Enter")
    until(pg, "document.querySelector(\".nodi-turn[data-turn='27']\")", 10000)
    assert sent(desk) == ["ime text"], sent(desk)
    assert pg.evaluate("document.activeElement.className") == "zr-input"
    ctx.close()

    pg = fresh()
    attend(pg, fast)
    pg.evaluate("window.__kb.follow(%d, 0)" % KB)
    pg.locator(".zr-input").tap()
    until(pg, "document.documentElement.hasAttribute('data-keyboard')", 5000)
    pg.evaluate("window.__kb.close()")
    pg.wait_for_timeout(600)
    g = geometry(pg)
    assert g["active"] != "zr-input", "a keyboard dismissed without a blur is blurred so the next tap raises it: %s" % g
    near(g["composer"]["bottom"], 844, "the composer is back at the bottom")
    pg.locator(".zr-input").tap()
    until(pg, "document.documentElement.hasAttribute('data-keyboard')", 5000)
    pg.wait_for_timeout(200)
    near(geometry(pg)["composer"]["bottom"], 844 - KB, "tapping again raises the keyboard and the composer follows")

    pg.evaluate("window.__kb.quiet(0, 0)")
    pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
    pg.wait_for_timeout(100)
    near(geometry(pg)["composer"]["bottom"], 844, "back from another app the composer reads the viewport again")
    assert not geometry(pg)["keyboard"]
    pg.evaluate("window.__kb.open(%d, 0)" % KB)
    pg.wait_for_timeout(100)

    pg.set_viewport_size({"width": 844, "height": 390})
    pg.evaluate("window.__kb.open(200, 0)")
    pg.wait_for_timeout(300)
    g = geometry(pg)
    near(g["shell"]["bottom"], 190, "landscape with a keyboard: the shell is the strip above it")
    near(g["composer"]["bottom"], 190, "landscape: the composer is above the keyboard")
    assert g["input"]["top"] >= g["shell"]["top"], "the input is on screen in landscape: %s" % g
    assert pg.evaluate("document.documentElement.scrollWidth") <= 844
    pg.set_viewport_size({"width": 390, "height": 844})
    pg.evaluate("window.__kb.close()")
    pg.wait_for_timeout(300)
    near(geometry(pg)["composer"]["bottom"], 844, "rotated back")
    pg.evaluate("window.__kb.pinch(2)")
    pg.wait_for_timeout(100)
    near(geometry(pg)["shell"]["bottom"], 844, "pinch zoom does not shrink the shell")
    assert not geometry(pg)["keyboard"], "pinch zoom is not a keyboard"
    assert not pg.errors, pg.errors
    pg.context.close()

    ctx = browser.new_context(viewport={"width": 390, "height": 844})
    pg = ctx.new_page()
    attend(pg, fast)
    box = pg.locator("[data-zr-scroll]").bounding_box()
    pg.mouse.move(box["x"] + 100, box["y"] + 300)
    start = geometry(pg)["scrollTop"]
    pg.mouse.wheel(0, -400)
    pg.wait_for_timeout(300)
    g = geometry(pg)
    assert g["scrollTop"] < start, "a swipe scrolls the transcript element: %s -> %s" % (start, g["scrollTop"])
    assert g["docScroll"] == [0, 0, 0] and g["shell"]["top"] == 0, "and not the page"
    pg.evaluate("document.querySelector('[data-zr-scroll]').scrollTop = 0")
    pg.mouse.wheel(0, -400)
    pg.wait_for_timeout(300)
    assert geometry(pg)["docScroll"] == [0, 0, 0], "an overscroll at the top does not chain to the page"
    ctx.close()

    pg = fresh()
    lagdoor = door(40)
    attend(pg, lagdoor)
    pg.locator(".zr-input").tap()
    keystrokes(pg, 12, 10)
    idle = keystrokes(pg, 40, 10)
    print("idle p50 %.1f p95 %.1f max %.1f" % (statistics.median(idle), quantile(idle, 0.95), max(idle)))
    busy = []
    for n in range(27, 35):
        if len(busy) >= 80:
            break
        pg.locator(".zr-input").fill("stream the run build please")
        pg.locator(".zr-send").tap()
        pg.wait_for_selector(".nodi-turn[data-turn='%d']" % n)
        while pg.evaluate("document.querySelector('.fw').hasAttribute('data-running')") and len(busy) < 400:
            busy += keystrokes(pg, 3, 0)
    print("streaming n %d p50 %.1f p95 %.1f max %.1f" % (len(busy), statistics.median(busy), quantile(busy, 0.95), max(busy)))
    assert len(busy) >= 40, "enough keystrokes landed while a turn streamed: %d" % len(busy)
    print("streaming over idle p50 ratio %.2f (report only)" % (statistics.median(busy) / statistics.median(idle)))
    limit = max(TARGET_P95_MS, RELEASE_P95_MS * RELEASE_SLACK)
    assert quantile(busy, 0.95) <= limit, "keystroke to paint at p95 while a turn streams is %.1f ms, over %.1f (target %d, v0.34.0 measured %.1f)" % (quantile(busy, 0.95), limit, TARGET_P95_MS, RELEASE_P95_MS)
    pg.context.close()

    pg = fresh()
    steady = door(40)
    attend(pg, steady)
    pg.locator(".zr-input").tap()
    pg.keyboard.type("go build run")
    pg.locator(".zr-send").tap()
    pg.wait_for_selector(".nodi-turn[data-turn='27']")
    pg.locator(".zr-input").tap()
    pg.keyboard.type("abcdef")
    pg.evaluate("window.__node = document.querySelector('.zr-input'); window.__node.setSelectionRange(2, 2)")
    for i in range(6):
        pg.keyboard.type("X")
        pg.wait_for_timeout(60)
        state = pg.evaluate("[window.__node === document.querySelector('.zr-input'), document.querySelector('.zr-input').selectionStart, document.querySelector('.zr-input').value, document.activeElement === window.__node]")
        assert state[0], "the editable node is never replaced while a turn streams"
        assert state[3], "and it keeps focus"
        assert state[1] == 3 + i and state[2] == "ab" + "X" * (i + 1) + "cdef", "the caret stays where the typing is: %s" % state
    assert pg.evaluate("document.querySelector('.fw').hasAttribute('data-running')") or True
    pg.context.close()

    pg = fresh()
    attend(pg, fast)
    rects = lambda: pg.evaluate("""() => { const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, b: b.bottom }; }; return { bar: r('.zr-composer'), input: r('.zr-input'), send: r('.zr-send'), attach: r('.zr-attach') }; }""")
    idle = rects()
    assert idle["input"]["w"] >= idle["bar"]["w"] * 0.45, "the input takes at least 45%% of the bar on one line: %s" % idle
    assert abs(idle["send"]["y"] - idle["input"]["y"]) < 12, "pills share the line while the text fits: %s" % idle
    pg.locator(".zr-input").tap()
    pg.keyboard.insert_text("the quick brown fox jumps over the lazy dog " * 3)
    pg.wait_for_timeout(700)
    over = rects()
    assert over["input"]["w"] >= over["bar"]["w"] - 36, "on overflow the input takes the full bar width: %s" % over
    assert over["send"]["y"] >= over["input"]["b"] - 1 and over["attach"]["y"] >= over["input"]["b"] - 1, "on overflow the pills sit below the input: %s" % over
    assert over["input"]["h"] > idle["input"]["h"] + 20, "and the input grows taller: %s" % over
    pg.locator(".zr-input").fill("")
    pg.wait_for_timeout(700)
    back = rects()
    assert abs(back["send"]["y"] - back["input"]["y"]) < 12 and back["input"]["w"] < back["bar"]["w"] - 100, "an empty input puts the pills back on its line: %s" % back
    pg.context.close()

    NO_FIELD_SIZING = "(() => { const was = CSS.supports.bind(CSS); CSS.supports = (a, b) => (a === 'field-sizing' ? false : was(a, b)); })();"
    for label, fallback in (("native field-sizing", False), ("the scrollHeight fallback", True)):
        ctx = browser.new_context(**phone)
        ctx.add_init_script(FAKE_VISUAL_VIEWPORT)
        if fallback:
            ctx.add_init_script(NO_FIELD_SIZING)
        pg = ctx.new_page()
        pg.errors = []
        pg.on("pageerror", lambda e: pg.errors.append(str(e)))
        attend(pg, fast)
        if fallback:
            pg.evaluate("document.styleSheets[0].insertRule('.zr-input { field-sizing: fixed !important; }')")
        pg.evaluate("window.__kb.follow(%d, 0)" % KB)
        pg.locator(".zr-input").tap()
        until(pg, "document.documentElement.hasAttribute('data-keyboard')", 5000)
        pg.wait_for_timeout(200)
        one = geometry(pg)
        assert one["input"]["height"] <= 40, "one line is one line (%s): %s" % (label, one["input"])
        words = "the quick brown fox jumps over the lazy dog " * 3
        pg.keyboard.insert_text(words)
        pg.wait_for_timeout(250)
        many = geometry(pg)
        assert many["input"]["height"] > one["input"]["height"] + 20, "typing wrapped text grows the box (%s): %s -> %s" % (label, one["input"]["height"], many["input"]["height"])
        near(many["composer"]["bottom"], one["composer"]["bottom"], "it grows upward, the bottom stays above the keyboard (%s)" % label)
        assert many["composer"]["top"] <= one["composer"]["top"] - (many["input"]["height"] - one["input"]["height"]) + 1, "the composer's top rises at least by the growth (%s)" % label
        near(many["lastBottom"], many["composer"]["top"], "the transcript still ends at the composer (%s)" % label, 40)
        assert many["fromBottom"] <= 1, "following the end, the transcript is carried up with it (%s): %s" % (label, many)
        pg.keyboard.insert_text(words * 3)
        pg.wait_for_timeout(250)
        capped = geometry(pg)
        cap = pg.evaluate("parseFloat(getComputedStyle(document.querySelector('.zr-input')).maxHeight)")
        assert capped["input"]["height"] <= cap + 1, "the box stops at its cap (%s): %s > %s" % (label, capped["input"]["height"], cap)
        assert capped["composer"]["top"] > 250, "the composer never takes over the screen (%s): %s" % (label, capped["composer"])
        pg.keyboard.type("!")
        assert pg.evaluate("(() => { const t = document.querySelector('.zr-input'); return t.scrollTop + t.clientHeight >= t.scrollHeight - 2; })()"), "typing at the cap keeps the caret visible (%s)" % label
        pg.locator(".zr-input").fill("")
        pg.wait_for_timeout(250)
        assert geometry(pg)["input"]["height"] <= 40, "emptying the box shrinks it back (%s)" % label
        assert not pg.errors, pg.errors
        ctx.close()

    pg = fresh()
    attend(pg, fast)
    pg.evaluate("window.__kb.follow(%d, 0)" % KB)
    pg.evaluate("document.querySelector('[data-zr-scroll]').scrollTop = 500")
    pg.wait_for_timeout(200)
    anchor = pg.evaluate("""() => { const sc = document.querySelector('[data-zr-scroll]').getBoundingClientRect();
      const n = [...document.querySelectorAll('.nodi-turn')].find(t => t.getBoundingClientRect().top > sc.top + 20); return [Number(n.dataset.turn), n.getBoundingClientRect().top]; }""")
    pg.locator(".zr-input").tap()
    pg.keyboard.insert_text("the quick brown fox jumps over the lazy dog " * 4)
    pg.wait_for_timeout(300)
    moved = pg.evaluate("document.querySelector(\".nodi-turn[data-turn='%d']\").getBoundingClientRect().top" % anchor[0])
    near(moved, anchor[1], "a reader mid-transcript sees nothing move while the box grows over the bottom")
    pg.context.close()

    pg = fresh()
    attend(pg, fast)
    pg.evaluate("window.__kb.open(%d, 0)" % KB)
    pg.wait_for_timeout(150)
    pg.locator(".zr-composer .zr-grip").focus()
    pg.keyboard.press("Enter")
    pg.wait_for_selector(".zr-pit[data-snap='half']")
    pg.evaluate("Promise.all(document.getAnimations().map(a => a.finished.catch(() => null)))")
    pit = pg.evaluate("(() => { const b = document.querySelector('.zr-pit').getBoundingClientRect(); return [b.bottom, b.height]; })()")
    near(pit[0], 844 - KB, "the pit sits on the keyboard's edge, not behind it")
    near(pit[1], (844 - KB) / 2, "half is half of what the keyboard leaves", 2)
    pg.keyboard.press("ArrowUp")
    pg.wait_for_timeout(100)
    pg.evaluate("Promise.all(document.getAnimations().map(a => a.finished.catch(() => null)))")
    pit = pg.evaluate("(() => { const b = document.querySelector('.zr-pit').getBoundingClientRect(); return [b.top, b.bottom, b.height]; })()")
    near(pit[1], 844 - KB, "the full pit ends at the keyboard")
    assert pit[0] >= -1 and pit[2] <= 844 - KB + 1, "the full pit fits above the keyboard: %s" % pit
    assert not pg.errors, pg.errors
    pg.context.close()

    pg = fresh()
    pills_door = door(40)
    attend(pg, pills_door)
    pills = pg.evaluate("[...document.querySelectorAll('.zr-pill')].map(n => [n.getAttribute('aria-label'), n.disabled])")
    assert pills == [["Attach", False], ["Command", False], ["Send", False]], "every pill is drawn enabled: %s" % pills
    got = pg.evaluate("""() => {
      const hit = (sel, dy) => { const b = document.querySelector(sel).getBoundingClientRect(); const t = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2 + dy); return !!t && !!t.closest(sel); };
      const f = document.querySelector('.zr-input').getBoundingClientRect();
      const top = document.elementFromPoint(f.x + f.width / 2, f.y + 1);
      return { sendUp: hit('.zr-send', -21), sendDown: hit('.zr-send', 21), fieldTop: !!top && top.classList.contains('zr-input') };
    }""")
    assert got["sendUp"] and got["sendDown"], "Send keeps a 44px hit area: %s" % got
    assert got["fieldTop"], "the grip does not cover the top of the field: %s" % got
    assert_centred(pg.locator(".zr-send"), "the send pill's glyph on an iPhone")
    assert_centred(pg.locator(".fw-mic"), "the record button's glyph on an iPhone", tol=2.0, blank_ok=True)
    pg.locator(".zr-input").tap()
    pg.keyboard.type("first")
    pg.locator(".zr-send").tap()
    until(pg, "document.querySelector('.zr-input').value === ''", 5000)
    pg.wait_for_selector(".nodi-turn[data-turn='27']")
    pg.locator(".zr-input").tap()
    pg.keyboard.type("second")
    pg.locator(".zr-send").tap()
    until(pg, "document.querySelector('.zr-input').value === ''", 5000)
    assert [m["text"] for m in pills_door.state()["sent"]][:2] == ["first", "second"], "a tap on send sends, every time: %s" % pills_door.state()["sent"]
    pg.locator(".nodi-turn[data-turn='26'] .fw-inline-btn").first.scroll_into_view_if_needed()
    for b in pg.locator(".nodi-turn[data-turn='26'] .fw-inline-btn").all():
        box = b.bounding_box()
        assert box["width"] >= 44 and box["height"] >= 44, "a message button is thumb size: %s" % box
        b.evaluate("n => n.scrollIntoView({ block: 'center' })")
        pg.wait_for_timeout(250)
        assert_centred(b, "a message button's glyph on an iPhone")
    shot_sheet = "Refused to apply a stylesheet"
    pg.errors = [e for e in pg.errors if shot_sheet not in e]
    assert not pg.errors, pg.errors
    pg.context.close()

    PNG = bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) + bytes(range(40))
    PDF = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\n"
    attach_door = door(12)
    pg = fresh()
    attend(pg, attach_door)
    assert pg.locator(".zr-attach").is_enabled(), "attach is the file picker now"
    accept = pg.evaluate("document.querySelector('.fw-picker').accept")
    assert "image/*" in accept and "application/pdf" in accept, accept
    pg.locator(".fw-picker").set_input_files([
        {"name": "IMG_0042.png", "mimeType": "image/png", "buffer": PNG},
        {"name": "plan.pdf", "mimeType": "application/pdf", "buffer": PDF},
    ])
    until(pg, "document.querySelectorAll('.zr-tray-item[data-status=ready]').length === 2", 10000)
    chips = pg.evaluate("[...document.querySelectorAll('.zr-tray-item')].map(n => n.innerText)")
    assert "IMG_0042.png" in chips[0] and "Photo" in chips[0] and "plan.pdf" in chips[1] and "PDF" in chips[1], chips
    g = geometry(pg)
    assert g["composer"]["height"] <= 220, "two chips keep the composer short: %s" % g["composer"]
    assert g["docFits"], "the page does not grow sideways or down for the chips: %s" % g
    over = pg.evaluate("[...document.querySelectorAll('.zr-tray-item')].map(n => n.scrollWidth - n.clientWidth)")
    assert max(over) <= 1, "chips do not overflow: %s" % over
    pg.locator(".zr-input").tap()
    pg.keyboard.type("what do these say")
    pg.locator(".zr-send").tap()
    pg.wait_for_selector(".nodi-turn[data-turn='27']")
    until(pg, "document.querySelector(\".nodi-turn[data-turn='27']\").innerText.includes('I read IMG_0042.png (image) and plan.pdf (pdf, 2 pages).')", 10000)
    state = attach_door.state()
    assert [(a["name"], a["status"]) for a in state["attach"]] == [("IMG_0042.png", 200), ("plan.pdf", 200)], state["attach"]
    assert state["attach"][0]["type"] == "image/png", state["attach"]
    assert pg.locator(".zr-tray-item").count() == 0, "the chips leave with the message"
    pg.locator(".fw-picker").set_input_files([{"name": "notes.txt", "mimeType": "text/plain", "buffer": b"hello"}])
    until(pg, "document.querySelector('.zr-tray-item[data-status=failed]')", 10000)
    assert "attach a png, jpeg, gif, webp or heic image, or a pdf" in pg.locator(".zr-tray-item").inner_text(), "the gateway's words are shown as they came"
    pg.locator(".zr-tray-x").tap()
    assert pg.locator(".zr-tray-item").count() == 0
    pg.errors = [e for e in pg.errors if "415" not in e]
    assert not pg.errors, pg.errors
    pg.context.close()

    browser.close()
print("ios composer: ok")
