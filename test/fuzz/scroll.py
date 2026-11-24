#!/usr/bin/env python3
"""The standing scroll check: every release, before it ships.

  python test/fuzz/scroll.py BUNDLE [--door mock|real] [--widths 390,844,1280,1920] [--out DIR] [--known scroll-known.json]
      real needs QX_DOOR (ws+unix door url), QX_KEY (key file path) and QX_SCRATCH (the aria to scroll) and FIGFUZZ_GATEWAY.

Drives a long transcript by wheel, by small smooth steps (Vimium's k and j are 60 px), by keys, and by the Latest pill,
sampling every animation frame, and checks: no frame jumps (a turn on screen moves by anything but the scroll), no blank
viewport, auto-follow releases on a scroll up and re-engages near the bottom (and agrees with the pill), Latest lands on the
bottom and stays there while a reply streams, older turns page in without losing position, the status bar and sticky
bars never overlap, nothing overflows sideways. Each result is PASS, FAIL, XFAIL (known open bug, scroll-known.json) or XPASS.
Exit 1 on any FAIL, or an XPASS (the known file is stale). Screenshots go to OUT/<profile>/.
"""
import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.sync_api import sync_playwright
from stack import MAIN, Stack

SAMPLER = """
(() => {
  window.__sm = { on: false, rows: [] };
  const loop = () => {
    if (window.__sm.on) {
      const sc = document.querySelector('[data-zr-scroll]');
      if (sc) {
        const r = sc.getBoundingClientRect();
        const mid = r.top + r.height / 2;
        let id = null, top = 0, seen = 0;
        for (const t of document.querySelectorAll('.nodi-turn')) {
          const b = t.getBoundingClientRect();
          if (b.bottom > r.top && b.top < r.bottom) seen++;
          if (id === null && b.top <= mid && b.bottom >= mid) { id = t.dataset.turn; top = b.top - r.top; }
        }
        window.__sm.rows.push([performance.now(), sc.scrollTop, sc.scrollHeight, id, top, seen]);
      }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
})();
"""

SIZES = {"390": (390, 844), "844": (844, 390), "1280": (1280, 800), "1920": (1920, 1080)}
HISTORY = ("--history", 600, "--page", 24000, "--fps", 25, "--bytes", 12000, "--chunk", 40)


class Probe:
    def __init__(self, page, outdir, label):
        self.page = page
        self.outdir = outdir
        self.label = label
        self.results = []
        self.shots = []
        os.makedirs(outdir, exist_ok=True)

    def record(self, cid, ok, detail=""):
        self.results.append({"id": cid, "ok": bool(ok), "detail": detail})
        print("  %-4s %s %s" % ("ok" if ok else "FAIL", cid, detail), flush=True)

    def shot(self, name):
        path = os.path.join(self.outdir, "%s.png" % name)
        self.page.screenshot(path=path)
        self.shots.append(path)
        return path

    def js(self, expr, arg=None):
        return self.page.evaluate(expr, arg) if arg is not None else self.page.evaluate(expr)

    def scroller(self):
        return self.js("(() => { const s = document.querySelector('[data-zr-scroll]'); return s ? { top: s.scrollTop, h: s.scrollHeight, c: s.clientHeight } : null; })()")

    def dist(self):
        s = self.scroller()
        return s["h"] - s["c"] - s["top"]

    def pill(self):
        return self.js("!!document.querySelector('.zr-latest')")

    def running(self):
        return self.js("(() => { const i = document.querySelector('.zr-input'); return !!i && i.placeholder === 'Steer figaro'; })()")

    def start(self):
        self.js("window.__sm.rows.length = 0; window.__sm.on = true")

    def stop(self):
        self.js("window.__sm.on = false")
        return self.js("window.__sm.rows")

    def wheel(self, dy, gap=0.03):
        box = self.js("(() => { const r = document.querySelector('[data-zr-scroll]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()")
        self.page.mouse.move(box[0], box[1])
        before = self.scroller()["top"]
        self.page.mouse.wheel(0, dy)
        time.sleep(gap)
        if self.scroller()["top"] == before and abs(dy) > 0:
            self.js("(dy) => document.querySelector('[data-zr-scroll]').scrollBy(0, dy)", dy)
            self.emulated = True

    def step(self, dy, smooth=True):
        self.js("(a) => document.querySelector('[data-zr-scroll]').scrollBy({ top: a[0], behavior: a[1] ? 'smooth' : 'instant' })", [dy, smooth])

    def to_bottom(self):
        self.js("(() => { const s = document.querySelector('[data-zr-scroll]'); s.scrollTop = s.scrollHeight; })()")
        time.sleep(0.6)

    def send(self, text):
        self.page.locator(".zr-input").click()
        self.page.keyboard.insert_text(text)
        time.sleep(0.2)
        btn = self.page.locator("button.zr-send, button[aria-label='Send']").first
        if self.page.viewport_size["width"] < 700 and btn.count():
            btn.click()
        else:
            self.page.keyboard.press("Enter")

    def wait_running(self, want, timeout=20):
        end = time.time() + timeout
        while time.time() < end:
            if self.running() == want:
                return True
            time.sleep(0.1)
        return False


def reversals(rows, direction, tol=3):
    found = []
    for a, b in zip(rows, rows[1:]):
        if a[3] is not None and a[3] == b[3]:
            dtop = b[4] - a[4]
            wrong = dtop < -tol if direction == "up" else dtop > tol
            if wrong:
                found.append({"turn": a[3], "moved": round(dtop, 1), "scrollTop": [round(a[1]), round(b[1])], "scrollHeight": [a[2], b[2]]})
    return found


def drift(p):
    p.start()
    time.sleep(0.9)
    rows = p.stop()
    found = []
    for a, b in zip(rows, rows[1:]):
        if a[3] is not None and a[3] == b[3] and abs(b[4] - a[4]) > 1.5:
            found.append({"turn": a[3], "moved": round(b[4] - a[4], 1), "scrollHeight": [a[2], b[2]]})
    return found


def blanks(rows):
    return sum(1 for r in rows if r[5] == 0)


def layout(p):
    return p.js("""() => {
      const box = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height }; };
      const vis = (e) => e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0;
      const status = document.querySelector('.fw-status');
      const sc = document.querySelector('[data-zr-scroll]');
      const bars = [...document.querySelectorAll('.zr-sticky-bar')].filter((b) => { const r = b.getBoundingClientRect(); const s = sc.getBoundingClientRect(); return r.bottom > s.top && r.top < s.bottom; });
      const composer = document.querySelector('.zr-composer, .fw-composer, .zr-input');
      return { vw: innerWidth, vh: innerHeight, sw: document.documentElement.scrollWidth, bodyW: document.body.scrollWidth, scW: sc.scrollWidth, scC: sc.clientWidth,
               status: vis(status) ? box(status) : null, scroller: box(sc), bars: bars.map(box), pinned: bars.filter((b) => b.closest('.zr-sticky') && b.closest('.zr-sticky').hasAttribute('data-pinned')).map(box),
               composer: box(composer) };
    }""")


def check_layout(p, tag):
    L = layout(p)
    p.record("layout.no-sideways-overflow." + tag, L["sw"] <= L["vw"] + 1 and L["scW"] <= L["scC"] + 1, "doc %s of %s, scroller %s of %s" % (L["sw"], L["vw"], L["scW"], L["scC"]))
    if L["status"]:
        ok = L["status"]["top"] >= -1 and L["status"]["bottom"] <= L["vh"] + 1
        p.record("layout.status-bar-in-view." + tag, ok, "top %.0f bottom %.0f" % (L["status"]["top"], L["status"]["bottom"]))
        over = [b for b in L["pinned"] if b["top"] < L["status"]["bottom"] - 2 and b["bottom"] > L["status"]["top"] + 2]
        p.record("layout.pinned-bar-clear-of-status." + tag, not over, "%d overlapping" % len(over))
    if L["pinned"]:
        s = L["scroller"]
        off = [b for b in L["pinned"] if abs(b["top"] - s["top"]) > 10]
        p.record("layout.pinned-bar-at-scroller-top." + tag, not off, "%s" % [round(b["top"] - s["top"]) for b in off][:3])
    if L["composer"]:
        p.record("layout.composer-in-view." + tag, L["composer"]["bottom"] <= L["vh"] + 1 and L["composer"]["top"] >= 0, "bottom %.0f of %d" % (L["composer"]["bottom"], L["vh"]))


def scenario(p, streaming, static=True, engine="chromium", dynamics_on=True):
    page = p.page
    if not static:
        if streaming:
            streaming(p)
        return
    p.to_bottom()
    p.shot("01-bottom")
    check_layout(p, "bottom")
    p.record("follow.pill-hidden-at-bottom", not p.pill())

    p.start()
    for _ in range(25):
        p.wheel(-700)
    time.sleep(0.8)
    rows = p.stop()
    j = reversals(rows, "up")
    p.record("wheel.up.no-reversals", not j, "%d frames moved against the wheel %s" % (len(j), j[:2]))
    j = drift(p)
    p.record("wheel.up.no-drift-after-stop", not j, "%d frames moved with no input %s" % (len(j), j[:2]))
    p.record("wheel.up.no-blank-frames", blanks(rows) == 0, "%d blank frames" % blanks(rows))
    p.record("follow.pill-shown-when-away", p.pill())
    p.shot("02-wheeled-up")
    check_layout(p, "mid")

    p.start()
    for _ in range(25):
        p.wheel(700)
    time.sleep(0.8)
    rows = p.stop()
    j = reversals(rows, "down")
    p.record("wheel.down.no-reversals", not j, "%d frames moved against the wheel %s" % (len(j), j[:2]))
    j = drift(p)
    p.record("wheel.down.no-drift-after-stop", not j, "%d frames moved with no input %s" % (len(j), j[:2]))
    p.record("wheel.down.no-blank-frames", blanks(rows) == 0, "%d blank frames" % blanks(rows))

    p.to_bottom()
    p.start()
    for _ in range(140):
        p.wheel(-1400, gap=0.025)
    time.sleep(1.5)
    rows = p.stop()
    top = p.scroller()["top"]
    j = reversals(rows, "up")
    p.record("older.paging.no-reversals", not j, "%d frames moved against the wheel %s" % (len(j), j[:2]))
    j = drift(p)
    p.record("older.paging.no-drift-after-stop", not j, "%d frames moved with no input %s" % (len(j), j[:2]))
    p.record("older.paging.no-blank-frames", blanks(rows) == 0, "%d blank frames" % blanks(rows))
    heights = sorted({r[2] for r in rows})
    p.record("older.paging.history-grew", len(heights) > 2, "%d distinct heights" % len(heights))
    p.shot("03-far-up")
    check_layout(p, "far-up")

    p.start()
    for _ in range(140):
        p.wheel(1400, gap=0.025)
    time.sleep(1.5)
    rows = p.stop()
    j = reversals(rows, "down")
    p.record("window.down-through-gaps.no-reversals", not j, "%d frames moved against the wheel %s" % (len(j), j[:2]))
    j = drift(p)
    p.record("window.down-through-gaps.no-drift-after-stop", not j, "%d frames moved with no input %s" % (len(j), j[:2]))
    p.record("window.down-through-gaps.no-blank-frames", blanks(rows) == 0, "%d blank frames" % blanks(rows))

    p.to_bottom()
    for _ in range(40):
        p.wheel(-1400, gap=0.02)
    time.sleep(1)
    p.js("document.querySelector('[data-zr-scroll]').scrollTop = 0")
    time.sleep(1.5)
    far = p.scroller()
    p.record("jump.far-up-is-far", far["h"] - far["c"] - far["top"] > 3000, "%.0f px above the bottom" % (far["h"] - far["c"] - far["top"]))
    pill = page.locator(".zr-latest")
    if pill.count():
        pill.first.click()
        time.sleep(2.0)
        d = p.dist()
        p.record("jump.latest-lands-on-bottom", d <= 3, "%.0f px short" % d)
        time.sleep(1.5)
        d2 = p.dist()
        p.record("jump.latest-stays-on-bottom", d2 <= 3, "%.0f px short after settling" % d2)
        p.record("jump.pill-gone-after", not p.pill())
    else:
        p.record("jump.latest-lands-on-bottom", False, "no Latest pill from far up")
    p.shot("04-after-latest")

    p.to_bottom()
    p.start()
    for _ in range(12):
        p.step(-60)
        time.sleep(0.12)
    time.sleep(0.8)
    rows = p.stop()
    j = reversals(rows, "up")
    p.record("steps.k-60-no-reversals", not j, "%d %s" % (len(j), j[:2]))
    p.start()
    for _ in range(12):
        p.step(60)
        time.sleep(0.12)
    time.sleep(0.8)
    rows = p.stop()
    j = reversals(rows, "down")
    p.record("steps.j-60-no-reversals", not j, "%d %s" % (len(j), j[:2]))

    for key, label in (("PageUp", "pageup"), ("Home", "home"), ("End", "end"), ("ArrowUp", "arrowup")):
        p.to_bottom()
        p.js("document.querySelector('[data-zr-scroll]').focus({ preventScroll: true })")
        before = p.scroller()["top"]
        page.keyboard.press(key)
        time.sleep(0.9)
        after = p.scroller()["top"]
        if key == "End":
            p.record("keys.end-stays-at-bottom", p.dist() <= 3, "%.0f short" % p.dist())
        else:
            p.record("keys.%s-scrolls-up" % label, after < before - 20, "%.0f to %.0f" % (before, after))

    if streaming:
        streaming(p)


def stream_checks(p):
    page = p.page
    prompt = "scroll check: write twenty short numbered lines about harbours"

    p.to_bottom()
    p.send(prompt)
    p.record("stream.started", p.wait_running(True))
    p.start()
    time.sleep(2.5)
    rows = p.stop()
    d = [r[2] - 0 for r in rows]
    stuck = p.dist()
    far = sum(1 for r in rows if r[2] > 0 and (r[2] - (p.scroller()["c"]) - r[1]) > 12)
    p.record("stream.follows-at-bottom", far <= max(2, len(rows) // 10), "%d of %d frames more than 12 px off the bottom" % (far, len(rows)))
    p.record("stream.no-pill-while-following", not p.pill())
    p.wait_running(False, 90)
    time.sleep(1)

    p.to_bottom()
    p.send(prompt + " again")
    p.wait_running(True)
    time.sleep(0.8)
    for _ in range(6):
        p.wheel(-500)
    time.sleep(0.5)
    base = p.scroller()["top"]
    p.start()
    time.sleep(2.5)
    rows = p.stop()
    p.record("release.scroll-up-pill-shown", p.pill())
    moved = max([r[1] for r in rows] or [base]) - base
    p.record("release.stream-does-not-yank", moved <= 3, "scrollTop rose %.0f px while away" % moved)
    p.shot("05-released-while-streaming")
    p.wait_running(False, 90)
    time.sleep(1)

    p.to_bottom()
    p.send(prompt + " third")
    p.wait_running(True)
    time.sleep(0.6)
    p.step(-60, smooth=True)
    time.sleep(0.4)
    time.sleep(2.0)
    left = p.dist()
    p.record("release.small-step-up-sticks", left > 30, "60 px above the bottom, then the stream left it %.0f px from the bottom" % left)
    p.wait_running(False, 90)
    time.sleep(1)

    p.to_bottom()
    p.send(prompt + " fourth")
    p.wait_running(True)
    time.sleep(0.6)
    for _ in range(6):
        p.wheel(-500)
    time.sleep(0.4)
    p.js("(() => { const s = document.querySelector('[data-zr-scroll]'); s.scrollTop = s.scrollHeight - s.clientHeight - 125; })()")
    time.sleep(0.3)
    pill = p.pill()
    before = p.dist()
    time.sleep(2.0)
    after = p.dist()
    pulled = pill and after < before - 20
    p.record("follow.pill-and-follow-agree", not pulled, "pill %s at 125 px from the bottom, stream then moved the view %.0f px" % ("shown" if pill else "hidden", before - after))
    p.js("(() => { const s = document.querySelector('[data-zr-scroll]'); s.scrollTop = s.scrollHeight - s.clientHeight - 20; })()")
    time.sleep(2.0)
    p.record("follow.re-engages-near-bottom", p.dist() <= 12, "%.0f px short" % p.dist())
    p.wheel(-900)
    time.sleep(0.4)
    pl = page.locator(".zr-latest")
    if pl.count():
        pl.first.click()
        time.sleep(1.5)
        d = p.dist()
        p.record("jump.latest-while-streaming-lands", d <= 40, "%.0f px short" % d)
        time.sleep(2.0)
        d = p.dist()
        p.record("jump.latest-while-streaming-keeps-following", d <= 40 or not p.running(), "%.0f px short" % d)
    p.wait_running(False, 90)


def anchor(p):
    return p.js("""(() => {
      const sc = document.querySelector('[data-zr-scroll]');
      const r = sc.getBoundingClientRect();
      const mid = r.top + r.height / 2;
      for (const t of document.querySelectorAll('.nodi-turn')) {
        const b = t.getBoundingClientRect();
        if (b.top <= mid && b.bottom >= mid) return { id: t.dataset.turn, off: (mid - b.top) / b.height, top: b.top - r.top };
      }
      return null;
    })()""")


def touch_fling(p, dy, speed):
    cdp = p.page.context.new_cdp_session(p.page)
    box = p.js("(() => { const r = document.querySelector('[data-zr-scroll]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()")
    cdp.send("Input.synthesizeScrollGesture", {"x": box[0], "y": box[1], "yDistance": -dy, "speed": speed, "gestureSourceType": "touch"})
    cdp.detach()


def dynamics(p, engine):
    page = p.page
    w, h = page.viewport_size["width"], page.viewport_size["height"]
    if engine == "chromium":
        p.to_bottom()
        p.start()
        touch_fling(p, 2400, 2500)
        time.sleep(1.5)
        rows = p.stop()
        p.record("touch.fling-up.no-reversals", not reversals(rows, "up"), "%s" % reversals(rows, "up")[:2])
        p.record("touch.fling-up.no-blank-frames", blanks(rows) == 0, "%d blank frames" % blanks(rows))
        p.record("touch.fling-up.moved", rows and rows[-1][1] < rows[0][1] - 200, "%s to %s" % (rows[0][1] if rows else None, rows[-1][1] if rows else None))
        j = drift(p)
        p.record("touch.fling-up.no-drift-after-settle", not j, "%d frames %s" % (len(j), j[:2]))
        p.start()
        touch_fling(p, -2400, 2500)
        time.sleep(1.5)
        rows = p.stop()
        p.record("touch.fling-down.no-reversals", not reversals(rows, "down"), "%s" % reversals(rows, "down")[:2])
        p.record("touch.fling-down.no-blank-frames", blanks(rows) == 0, "%d blank frames" % blanks(rows))

    p.to_bottom()
    for _ in range(6):
        p.wheel(-700)
    time.sleep(0.8)
    a0 = anchor(p)
    page.set_viewport_size({"width": h, "height": w})
    time.sleep(1.2)
    a1 = anchor(p)
    p.shot("10-rotated")
    p.record("rotate.mid-scroll-keeps-turn", a0 and a1 and a0["id"] == a1["id"], "%s to %s" % (a0, a1))
    p.record("rotate.mid-scroll-not-blank", p.js("document.querySelectorAll('.nodi-turn').length") > 0)
    page.set_viewport_size({"width": w, "height": h})
    time.sleep(1.2)
    a2 = anchor(p)
    p.record("rotate.back-keeps-turn", a0 and a2 and a0["id"] == a2["id"], "%s to %s" % (a0, a2))
    check_layout(p, "after-rotate")

    p.to_bottom()
    page.set_viewport_size({"width": h, "height": w})
    time.sleep(1.2)
    d = p.dist()
    p.record("rotate.at-bottom-stays-at-bottom", d <= 3, "%.0f short" % d)
    page.set_viewport_size({"width": w, "height": h})
    time.sleep(1.2)
    d = p.dist()
    p.record("rotate.back-at-bottom-stays-at-bottom", d <= 3, "%.0f short" % d)

    p.start()
    for step in range(8):
        p.wheel(-500)
        page.set_viewport_size({"width": w, "height": h - 20 * (step + 1)})
    time.sleep(1.0)
    rows = p.stop()
    p.record("resize.shrinking-while-wheeling-not-blank", blanks(rows) == 0 and p.js("document.querySelectorAll('.nodi-turn').length") > 0)
    page.set_viewport_size({"width": w, "height": h})
    time.sleep(0.8)

    p.to_bottom()
    for _ in range(6):
        p.wheel(-700)
    time.sleep(0.8)
    before = p.scroller()["top"]
    page.locator(".zr-input").click()
    page.keyboard.insert_text("focus check")
    time.sleep(0.6)
    after = p.scroller()["top"]
    p.record("focus.typing-in-composer-keeps-position", abs(after - before) <= 3, "%.0f to %.0f" % (before, after))
    page.keyboard.press("Control+a")
    page.keyboard.press("Delete")
    if p.pill():
        pill = page.locator(".zr-latest").first
        pill.focus()
        page.keyboard.press("Enter")
        time.sleep(2.0)
        p.record("focus.latest-by-keyboard-lands-on-bottom", p.dist() <= 3, "%.0f short" % p.dist())
    else:
        p.record("focus.latest-by-keyboard-lands-on-bottom", False, "no Latest pill after scrolling up")
    p.js("(() => { const s = document.querySelector('[data-zr-scroll]'); s.scrollTop = Math.max(0, s.scrollHeight - 4000); s.focus({ preventScroll: true }); })()")
    time.sleep(0.8)
    before = p.scroller()["top"]
    page.keyboard.press("Space")
    time.sleep(0.9)
    after = p.scroller()["top"]
    p.record("focus.space-scrolls-down", after > before + 20, "%.0f to %.0f" % (before, after))
    p.shot("11-after-focus")


FAKE_VV = """
(() => {
  const t = new EventTarget();
  const vv = { height: 844, offsetTop: 0, scale: 1, addEventListener: (k, f) => t.addEventListener(k, f), removeEventListener: (k, f) => t.removeEventListener(k, f) };
  Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
  window.__vv = (h, top) => { vv.height = h; vv.offsetTop = top; t.dispatchEvent(new Event('resize')); t.dispatchEvent(new Event('scroll')); };
})();
"""


def composer_focus(pw, engine, st, aria, outdir):
    browser = getattr(pw, engine).launch()
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
    ctx.add_init_script(FAKE_VV)
    page = ctx.new_page()
    page.goto(st.url + "#/gluck/" + aria)
    page.wait_for_selector(".zr-input", timeout=20000)
    time.sleep(2.5)
    p = Probe(page, outdir, "%s-390-focus" % engine)
    focused = lambda: page.evaluate("!!document.activeElement && document.activeElement.classList.contains('zr-input')")
    box = page.locator(".zr-input").bounding_box()
    page.touchscreen.tap(box["x"] + 40, box["y"] + box["height"] / 2)
    page.evaluate("window.__vv(544, 0)")
    time.sleep(0.6)
    p.record("composer.tap-focuses", focused())
    page.keyboard.insert_text("focus check")
    send = page.locator("button.zr-send").first.bounding_box()
    page.touchscreen.tap(send["x"] + send["width"] / 2, send["y"] + send["height"] / 2)
    started = p.wait_running(True)
    p.record("composer.stream-started", started)
    p.record("composer.focus-kept-on-send-tap", focused())
    typed = "abcdefghijklmnopqrstuvwxyz0123456789"
    lost = None
    for i, ch in enumerate(typed):
        if not focused() and lost is None:
            lost = i
        page.keyboard.press(ch)
        time.sleep(0.12)
    time.sleep(0.4)
    got = page.evaluate("document.querySelector('.zr-input').value")
    p.record("composer.typing-while-streaming-lands-every-char", got == typed, "%r" % got)
    p.record("composer.focus-kept-through-stream", lost is None and focused(), "first lost at char %s" % lost)
    page.evaluate("window.__vv(544, 300)")
    time.sleep(0.8)
    p.record("composer.focus-kept-when-keyboard-viewport-pans", focused(), "keyboard still up, visual viewport top moved 300 px")
    p.shot("focus-after-pan")
    p.wait_running(False, 90)
    page.evaluate("window.__vv(844, 0)")
    page.keyboard.press("Escape")
    page.evaluate("document.activeElement && document.activeElement.blur()")
    time.sleep(0.8)
    grip = page.locator(".zr-grip").bounding_box()
    page.touchscreen.tap(grip["x"] + grip["width"] / 2, grip["y"] + grip["height"] / 2)
    time.sleep(0.8)
    p.record("pit.touch-tap-on-grip-opens", page.evaluate("document.querySelector('.zr-grip').dataset.snap") != "closed", "tap on the grip bar: pit opens on pointerup, the click that follows lands on the new scrim and closes it")
    ctx.close()
    browser.close()
    return {"results": p.results, "shots": p.shots}


def known_of(path):
    try:
        return json.load(open(path))
    except OSError:
        return {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("bundle")
    ap.add_argument("--door", default="mock")
    ap.add_argument("--widths", default="390,844,1280,1920")
    ap.add_argument("--out", default="scroll-out")
    ap.add_argument("--known", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "scroll-known.json"))
    ap.add_argument("--stream-only", action="store_true", help="skip the static scroll checks, run only the streaming ones")
    ap.add_argument("--no-focus", action="store_true")
    ap.add_argument("--no-dynamics", action="store_true")
    ap.add_argument("--no-stream", action="store_true")
    ap.add_argument("--webkit", action="store_true", help="also run 390 and 844 in WebKit with the iPhone profile")
    a = ap.parse_args()
    real = a.door == "real"
    if real:
        st = Stack(a.bundle, gateway=os.environ["FIGFUZZ_GATEWAY"], speech=True, door_url=os.environ["QX_DOOR"], token_file=os.environ["QX_KEY"])
        aria = os.environ["QX_SCRATCH"]
    else:
        st = Stack(a.bundle, step=15, door_flags=HISTORY)
        aria = MAIN
    runs = []
    for w in a.widths.split(","):
        runs.append(("chromium", w))
    if a.webkit:
        runs += [("webkit", "390"), ("webkit", "844")]
    results = {}
    try:
        with sync_playwright() as pw:
            for engine, w in runs:
                label = "%s-%s" % (engine, w)
                print(label, flush=True)
                width, height = SIZES[w]
                opts = dict(viewport={"width": width, "height": height})
                if w in ("390", "844"):
                    opts.update(is_mobile=True, has_touch=True, device_scale_factor=2)
                browser = getattr(pw, engine).launch()
                ctx = browser.new_context(**opts)
                ctx.add_init_script(SAMPLER)
                page = ctx.new_page()
                errors = []
                page.on("pageerror", lambda e: errors.append(str(e)))
                page.goto(st.url + "#/gluck/" + aria)
                page.wait_for_selector(".zr-input", timeout=20000)
                time.sleep(2.5)
                p = Probe(page, os.path.join(a.out, label), label)
                scenario(p, None if a.no_stream else stream_checks, static=not a.stream_only, engine=engine, dynamics_on=not a.no_dynamics)
                p.record("page.no-uncaught-errors", not errors, "%s" % errors[:2])
                results[label] = {"results": p.results, "shots": p.shots, "emulated_wheel": getattr(p, "emulated", False)}
                ctx.close()
                browser.close()
                if not a.no_focus and w == "390":
                    label = "%s-390-focus" % engine
                    print(label, flush=True)
                    results[label] = composer_focus(pw, engine, st, aria, os.path.join(a.out, label))
    finally:
        st.stop()
    known = known_of(a.known)
    fails, xfails, xpass = [], [], []
    for label, r in results.items():
        for x in r["results"]:
            base = x["id"].split(".")[0] + "." + x["id"].split(".")[1] if "." in x["id"] else x["id"]
            slug = known.get(x["id"]) or known.get(base) or known.get(x["id"].rsplit(".", 1)[0])
            x["label"] = label
            if x["ok"] and slug:
                xpass.append((label, x["id"], slug))
            elif not x["ok"] and slug:
                xfails.append((label, x["id"], slug))
            elif not x["ok"]:
                fails.append((label, x["id"], x["detail"]))
    os.makedirs(a.out, exist_ok=True)
    json.dump({"door": a.door, "results": results, "fail": fails, "xfail": xfails, "xpass": xpass}, open(os.path.join(a.out, "report.json"), "w"), indent=1)
    for f in fails:
        print("FAIL", *f)
    for f in xfails:
        print("XFAIL", *f)
    for f in xpass:
        print("XPASS", *f)
    print("scroll check: %s (%d fail, %d known, %d now passing)" % ("FAIL" if fails or xpass else "PASS", len(fails), len(xfails), len(xpass)))
    sys.exit(1 if fails or xpass else 0)


if __name__ == "__main__":
    main()
