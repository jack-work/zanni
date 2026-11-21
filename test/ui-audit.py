"""Screenshot every figaro web view and state, with measurements, for the UI audit.

usage: nix develop .#ui-audit -c python3 test/ui-audit.py BUNDLE OUTDIR [chromium|webkit]

Writes OUTDIR/<view>-<state>-<width>.png and OUTDIR/metrics.json. Not a test:
it asserts nothing about taste, it only fails when a state cannot be reached.
"""
import json
import os
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(root, "test"))
from figchat_kit import FAKE_VISUAL_VIEWPORT, until  # noqa: E402

bundle = os.path.abspath(sys.argv[1])
out = os.path.abspath(sys.argv[2])
engine = sys.argv[3] if len(sys.argv) > 3 else "chromium"
only = set(os.environ.get("UI_AUDIT_ONLY", "").split(",")) - {""}
os.makedirs(out, exist_ok=True)

MAIN = "c0ffee01" * 4
LANE = "c0ffee02" * 4
SIZES = ((390, 844), (1280, 800))

MEASURE = r"""(sels) => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const cx2 = cv.getContext('2d', { willReadFrequently: true });
  const parse = (c) => { cx2.clearRect(0, 0, 1, 1); cx2.fillStyle = '#000'; cx2.fillStyle = c; cx2.fillRect(0, 0, 1, 1); const d = cx2.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const tc = document.createElement('canvas').getContext('2d');
  const ink = (n, cs) => { const t = (n.innerText || '').trim().split('\n')[0]; if (!t) return null; tc.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily; const m = tc.measureText(t); return { w: Math.round(m.actualBoundingBoxLeft + m.actualBoundingBoxRight), h: Math.round(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) }; };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const over = (top, under) => { const a = top[3]; return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat([1]); };
  const bgOf = (n) => {
    const stack = [];
    for (let e = n; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c[3] > 0) stack.push(c); if (c[3] >= 1) break; }
    let col = [255, 255, 255, 1];
    for (let i = stack.length - 1; i >= 0; i--) col = over(stack[i], col);
    return col;
  };
  const opacityOf = (n) => { let o = 1; for (let e = n; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const hit = (n, b) => {
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    const mine = (x, y) => { const t = document.elementFromPoint(x, y); return !!t && (t === n || n.contains(t)); };
    if (!mine(cx, cy)) return null;
    const reach = (dx, dy) => { let d = 0; while (d < 80 && mine(cx + dx * (d + 1), cy + dy * (d + 1))) d++; return d; };
    return { w: reach(-1, 0) + reach(1, 0) + 1, h: reach(0, -1) + reach(0, 1) + 1 };
  };
  const res = {};
  for (const [name, sel] of Object.entries(sels)) {
    const all = [...document.querySelectorAll(sel)].filter((n) => { const b = n.getBoundingClientRect(); return b.width > 0 && b.height > 0; });
    const onScreen = all.filter((n) => { const b = n.getBoundingClientRect(); return b.bottom > 0 && b.top < innerHeight && b.right > 0 && b.left < innerWidth; });
    const nodes = onScreen.length ? onScreen : all;
    res[name] = nodes.slice(0, 3).map((n) => {
      const b = n.getBoundingClientRect(), cs = getComputedStyle(n), bg = bgOf(n);
      const fg = over(parse(cs.color), bg), op = opacityOf(n);
      const seen = over(fg.slice(0, 3).concat([op]), bg);
      const g = document.createRange(); g.selectNodeContents(n); const gr = g.getBoundingClientRect();
      return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height),
        box: { w: Math.round(gr.width), h: Math.round(gr.height) }, ink: ink(n, cs),
        font: cs.fontSize + " " + cs.fontFamily.split(",")[0], weight: cs.fontWeight, line: cs.lineHeight,
        opacity: Math.round(op * 100) / 100, contrast: Math.round(ratio(seen, bg) * 100) / 100,
        pad: cs.padding, margin: cs.margin, gap: cs.gap, hit: hit(n, b), text: (n.innerText || n.value || "").slice(0, 40) };
    });
  }
  return res;
}"""

SELS = {
    "inline-btn": ".fw-inline-btn",
    "inline-bar": ".fw-inline-bar",
    "fork-here": ".fw-fork-here",
    "play-big": ".fw-play-big",
    "turn-head": ".nodi-turn-head",
    "turn-no": ".nodi-turn-no",
    "when": ".nodi-when",
    "who": ".nodi-who",
    "input": ".nodi-input",
    "prose-p": ".nodi-prose .nodi-p",
    "code": ".nodi-pre",
    "inline-code": ".nodi-code",
    "quote": ".nodi-quote",
    "tool-summary": ".nodi-tool > summary",
    "tool-status": ".nodi-tool-status",
    "tool-out": ".nodi-tool-out",
    "thinking-summary": ".nodi-thinking > summary",
    "thought": ".nodi-thought",
    "metrics": ".nodi-metrics",
    "composer": ".zr-composer",
    "textarea": ".zr-input",
    "send": ".zr-send",
    "mic": ".fw-mic",
    "grip": ".zr-composer .zr-grip",
    "strip": ".zr-strip",
    "stop": ".fw-stop",
    "latest": ".zr-latest",
    "status": ".fw-status",
    "status-glyph": ".fw-status-glyph",
    "status-handle": ".fw-status-handle",
    "status-mantra": ".fw-status-mantra",
    "status-ctx": ".fw-status-ctx",
    "status-pit": ".fw-status-pit",
    "back": ".fw-back",
    "tree-row": ".zr-tree-row",
    "pit-row": ".zr-pit-row",
    "pit-row-glyph": ".zr-pit-row-glyph",
    "pit-row-meta": ".zr-pit-row-meta",
    "pit-handle": ".zr-pit-handle",
    "pit-title": ".zr-pit-title",
    "pit-close": ".zr-pit-bar .zr-btn",
    "pit-fact-dt": ".fw-pit-fact dt",
    "pit-fact-dd": ".fw-pit-fact dd",
    "note": ".fw-note",
    "fork-banner": ".fw-fork-banner",
    "new-form-input": ".fw-new-form input, .fw-new-form textarea",
    "new-form-btn": ".fw-new-form button",
}

shots = []
metrics = {}


def want(name):
    return not only or any(name.startswith(o) for o in only)


class Door:
    def __init__(self, step):
        self.proc = subprocess.Popen(["node", os.path.join(root, "test", "ui-audit-door.js"), bundle, str(step)], stdout=subprocess.PIPE, text=True)
        self.port = int(self.proc.stdout.readline())
        self.base = "http://127.0.0.1:%d" % self.port
        self.url = self.base + "/chat/"

    def drop(self):
        import urllib.request
        urllib.request.urlopen(self.base + "/__drop").read()

    def stop(self):
        self.proc.terminate()
        self.proc.wait()


doors = []


def door(step=12):
    d = Door(step)
    doors.append(d)
    return d


def settle(pg):
    pg.evaluate("Promise.all(document.getAnimations().map(a => a.finished.catch(() => null)))")
    pg.wait_for_timeout(120)


def shoot(pg, name, width, full=False):
    file = "%s-%d.png" % (name, width)
    settle(pg)
    pg.screenshot(path=os.path.join(out, file), full_page=full)
    metrics[file] = pg.evaluate(MEASURE, SELS)
    shots.append(file)
    print(file, flush=True)


def attend(pg, d, aria, turn=None):
    pg.goto("about:blank")
    pg.goto(d.url + "#/gluck/" + aria + (":%d" % turn if turn else ""))
    until(pg, "document.querySelector('.fw') && document.querySelector('.fw').dataset.link === 'live'", timeout=15000)
    until(pg, "document.fonts.status === 'loaded'")
    pg.wait_for_timeout(300)


def to_bottom(pg):
    pg.evaluate("(() => { const s = document.querySelector('[data-zr-scroll]'); s.scrollTop = s.scrollHeight; })()")
    pg.wait_for_timeout(250)


def scroll_to(pg, sel):
    pg.evaluate("(s) => { const n = document.querySelector(s); n.scrollIntoView({block: 'start'}); const sc = document.querySelector('[data-zr-scroll]'); sc.scrollTop -= 60; }", sel)
    pg.wait_for_timeout(250)


def open_pit(pg):
    if not pg.locator(".zr-pit").count():
        pg.locator(".zr-composer .zr-grip").focus()
        pg.keyboard.press("Enter")
    pg.wait_for_selector(".zr-pit[data-snap='half']")


def send(pg, text):
    pg.locator(".zr-input").fill(text)
    pg.locator(".zr-send").click()


with sync_playwright() as p:
    kind = getattr(p, engine)
    args = ["--no-sandbox", "--disable-audio-output", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] if engine == "chromium" else []
    browser = kind.launch(args=args)

    def fresh(width, height, scheme="light", kb=False):
        phone = width < 600
        opts = dict(viewport={"width": width, "height": height}, color_scheme=scheme, has_touch=phone, device_scale_factor=3 if phone else 1, reduced_motion="reduce")
        if engine != "firefox":
            opts["is_mobile"] = phone
        ctx = browser.new_context(**opts)
        if engine == "chromium":
            ctx.grant_permissions(["microphone"])
        if kb:
            ctx.add_init_script(FAKE_VISUAL_VIEWPORT)
        pg = ctx.new_page()
        return pg

    fast = door(12)
    for width, height in SIZES:
        tag = width

        if want("list"):
            pg = fresh(width, height)
            pg.goto(fast.url)
            pg.wait_for_selector(".zr-tree-row")
            until(pg, "document.fonts.status === 'loaded'")
            shoot(pg, "list-tree", tag)
            pg.context.close()

        if want("empty"):
            pg = fresh(width, height)
            pg.goto(fast.url + "#/gluck/" + "f" * 32)
            until(pg, "document.querySelector('.fw') && document.querySelector('.fw').dataset.link === 'gone'", 10000)
            shoot(pg, "empty-no-such-aria", tag)
            pg.goto("about:blank")
            pg.goto(fast.url + "#/nowhere/" + MAIN)
            pg.wait_for_selector(".fw-main")
            pg.wait_for_timeout(500)
            shoot(pg, "empty-no-such-store", tag)
            pg.context.close()

        if want("transcript"):
            for scheme in ("light", "dark"):
                pg = fresh(width, height, scheme)
                attend(pg, fast, MAIN)
                to_bottom(pg)
                shoot(pg, "transcript-long-tail-%s" % scheme, tag)
                pg.context.close()
            pg = fresh(width, height)
            attend(pg, fast, LANE)
            pg.wait_for_selector(".nodi-turn[data-turn='5']")
            to_bottom(pg)
            shoot(pg, "transcript-short-tail", tag)
            scroll_to(pg, ".nodi-turn[data-turn='5']")
            shoot(pg, "transcript-table-error-quote", tag)
            pg.evaluate("document.querySelector('.nodi-turn:last-child .nodi-thinking > summary')?.click()")
            pg.context.close()

            pg = fresh(width, height)
            attend(pg, fast, MAIN, 7)
            pg.wait_for_selector(".nodi-turn[data-turn='7'] .nodi-tool-out")
            scroll_to(pg, ".nodi-turn[data-turn='7']")
            shoot(pg, "transcript-tool-open-code", tag)
            pg.evaluate("document.querySelectorAll(\".nodi-turn[data-turn='7'] details\").forEach(d => d.open = false)")
            pg.wait_for_timeout(200)
            shoot(pg, "transcript-tool-closed", tag)
            pg.context.close()

            pg = fresh(width, height)
            attend(pg, fast, MAIN, 9)
            pg.wait_for_selector(".nodi-turn[data-turn='9'] .nodi-said")
            scroll_to(pg, ".nodi-turn[data-turn='9']")
            shoot(pg, "transcript-quotes-callers", tag)
            pg.context.close()

            pg = fresh(width, height)
            attend(pg, fast, MAIN, 10)
            pg.wait_for_selector(".nodi-turn[data-turn='10']")
            scroll_to(pg, ".nodi-turn[data-turn='10']")
            shoot(pg, "transcript-tool-error", tag)
            pg.context.close()

            pg = fresh(width, height)
            attend(pg, fast, MAIN, 12)
            pg.wait_for_selector(".nodi-turn[data-turn='12'] .nodi-steering")
            scroll_to(pg, ".nodi-turn[data-turn='12'] .nodi-steering")
            shoot(pg, "transcript-steering", tag)
            pg.context.close()

            pg = fresh(width, height)
            attend(pg, fast, MAIN, 6)
            pg.wait_for_selector(".nodi-turn[data-turn='6'] .nodi-thinking")
            scroll_to(pg, ".nodi-turn[data-turn='6']")
            shoot(pg, "transcript-thinking-unknown", tag)
            pg.context.close()

        if want("actions"):
            pg = fresh(width, height)
            attend(pg, fast, MAIN)
            to_bottom(pg)
            last = ".nodi-turn:last-child"
            box = pg.locator(last + " .fw-inline").last.bounding_box()
            first = pg.locator(last + " .fw-inline").first.bounding_box()
            if box:
                top = max(0, first["y"] - 120)
                clip = {"x": 0, "y": top, "width": width, "height": min(height - top, box["y"] + box["height"] - top + 60)}
                file = "actions-message-icons-%d.png" % tag
                settle(pg)
                pg.screenshot(path=os.path.join(out, file), clip=clip)
                metrics[file] = pg.evaluate(MEASURE, SELS)
                shots.append(file)
                print(file, flush=True)
            if width >= 900:
                pg.locator(".nodi-turn[data-turn='25']").hover()
            shoot(pg, "actions-turn-bar", tag)
            pg.locator(".fw-inline-btn[data-action='retranscribe']").last.click()
            pg.wait_for_selector(".fw-inline-heard, .fw-inline-note", timeout=8000)
            pg.wait_for_timeout(600)
            shoot(pg, "actions-retranscribed", tag)
            open_pit(pg)
            pg.locator(".fw-voice").click()
            pg.keyboard.press("Escape")
            pg.wait_for_selector(".zr-pit", state="detached")
            pg.wait_for_selector(".fw-hands", timeout=5000)
            pg.locator(".fw-hands").click()
            pg.wait_for_selector(".fw-play-big")
            to_bottom(pg)
            shoot(pg, "actions-hands-free", tag)
            pg.context.close()

        if want("streaming"):
            slow = door(400)
            pg = fresh(width, height)
            attend(pg, slow, MAIN)
            send(pg, "please run the tests")
            pg.wait_for_selector(".nodi-turn[data-turn='27'] .nodi-thinking", timeout=10000)
            pg.wait_for_timeout(1500)
            to_bottom(pg)
            shoot(pg, "streaming-thinking", tag)
            pg.wait_for_selector(".nodi-turn[data-turn='27'] .nodi-tool[data-status='running']", timeout=20000)
            to_bottom(pg)
            shoot(pg, "streaming-tool-running", tag)
            pg.evaluate("document.querySelector('[data-zr-scroll]').scrollTop -= 900")
            pg.wait_for_selector(".zr-latest", timeout=20000)
            shoot(pg, "streaming-latest-pill", tag)
            pg.wait_for_selector(".nodi-turn[data-turn='27']:not([data-state='open'])", timeout=30000)
            to_bottom(pg)
            shoot(pg, "streaming-settled", tag)
            send(pg, "[error] please")
            pg.wait_for_selector(".fw-note, .nodi-error", timeout=15000)
            pg.wait_for_timeout(400)
            to_bottom(pg)
            shoot(pg, "toast-turn-refused", tag)
            pg.context.close()

        if want("toast"):
            d = door(12)
            pg = fresh(width, height)
            attend(pg, d, MAIN)
            d.drop()
            pg.wait_for_timeout(150)
            shoot(pg, "toast-link-dropped", tag)
            until(pg, "document.querySelector('.fw').dataset.link === 'live'", 15000)
            pg.context.close()

        if want("composer"):
            pg = fresh(width, height, kb=(width < 600))
            attend(pg, fast, MAIN)
            to_bottom(pg)
            shoot(pg, "composer-idle", tag)
            pg.locator(".zr-input").focus()
            if width < 600:
                pg.evaluate("window.__kb.open(336)")
            pg.wait_for_timeout(300)
            shoot(pg, "composer-focused" + ("-keyboard" if width < 600 else ""), tag)
            pg.locator(".zr-input").fill("A longer draft that runs over several lines so the composer has to grow.\nSecond line.\nThird line.\nFourth line, which should start to scroll.")
            pg.wait_for_timeout(300)
            shoot(pg, "composer-multiline", tag)
            pg.locator(".zr-input").fill("")
            if width < 600:
                pg.evaluate("window.__kb.close()")
            pg.locator(".zr-input").blur()
            if engine == "chromium":
                pg.locator(".fw-mic").click()
                pg.wait_for_selector(".fw-mic-meter", timeout=8000)
                pg.wait_for_timeout(900)
                shoot(pg, "composer-voice-recording", tag)
                pg.locator(".fw-mic").click()
                pg.wait_for_timeout(800)
                shoot(pg, "composer-voice-done", tag)
            pg.context.close()

        if want("pit"):
            pg = fresh(width, height)
            attend(pg, fast, MAIN)
            to_bottom(pg)
            open_pit(pg)
            pg.wait_for_timeout(400)
            shoot(pg, "pit-control-half", tag)
            pg.locator(".zr-pit-handle").focus()
            pg.keyboard.press("ArrowUp")
            until(pg, "document.querySelector('.zr-pit').dataset.snap === 'full'", 3000)
            shoot(pg, "pit-control-full", tag)
            pg.keyboard.press("ArrowDown")
            until(pg, "document.querySelector('.zr-pit').dataset.snap === 'half'", 3000)
            for view, ready in (("state", ".fw-pit-fact[data-key='system.thinking_effort'] dd"), ("tree", ".zr-pit .zr-tree-row"), ("recent", ".zr-pit-row[data-id]"), ("outfits", ".zr-pit-row[data-action='outfit']"), ("fork-at", ".fw-forkat-form")):
                pg.locator("[data-action='%s']" % view).click()
                pg.wait_for_selector(ready, timeout=8000)
                pg.wait_for_timeout(400)
                shoot(pg, "pit-%s-half" % view, tag)
                if view in ("tree", "state"):
                    pg.locator(".zr-pit-handle").focus()
                    pg.keyboard.press("ArrowUp")
                    until(pg, "document.querySelector('.zr-pit').dataset.snap === 'full'", 3000)
                    shoot(pg, "pit-%s-full" % view, tag)
                    pg.keyboard.press("ArrowDown")
                    until(pg, "document.querySelector('.zr-pit').dataset.snap === 'half'", 3000)
                pg.locator(".fw-pit-back").click()
            pg.locator("[data-action='new']").click()
            pg.wait_for_selector(".fw-new-form")
            pg.wait_for_timeout(400)
            shoot(pg, "sheet-new-figaro", tag)
            pg.keyboard.press("Escape")
            pg.wait_for_selector(".fw-new-form", state="detached")
            open_pit(pg)
            pg.locator("[data-action='tail-fork']").click()
            until(pg, "!location.hash.includes('%s')" % MAIN, 8000)
            until(pg, "document.querySelector('.fw').dataset.link === 'live'", 8000)
            pg.wait_for_timeout(500)
            shoot(pg, "transcript-fork-banner", tag)
            pg.context.close()

    for d in doors:
        d.stop()
    browser.close()

path = os.path.join(out, "metrics.json")
if only and os.path.exists(path):
    metrics = dict(json.load(open(path)), **metrics)
with open(path, "w") as f:
    json.dump(metrics, f, indent=1, sort_keys=True)
print("%d shots in %s" % (len(shots), out))
