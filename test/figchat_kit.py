import json
import os
import struct
import subprocess
import time
import urllib.request
import zlib

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAIN = "c0ffee01" * 4

FAKE_VISUAL_VIEWPORT = """
(() => {
  const target = new EventTarget();
  const state = { kb: 0, top: 0, scale: 1, auto: null };
  const vv = {
    get width() { return innerWidth; },
    get height() { return state.scale === 1 ? innerHeight - state.kb : innerHeight / state.scale; },
    get offsetTop() { return state.top; },
    offsetLeft: 0, pageLeft: 0,
    get pageTop() { return state.top + scrollY; },
    get scale() { return state.scale; },
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
  };
  Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
  const emit = () => { target.dispatchEvent(new Event('resize')); target.dispatchEvent(new Event('scroll')); };
  const typable = (n) => n && n.matches && n.matches('textarea, input, select');
  window.__kb = {
    state,
    open(kb, top) { state.kb = kb; state.top = top || 0; emit(); },
    close() { state.kb = 0; state.top = 0; emit(); },
    quiet(kb, top) { state.kb = kb; state.top = top || 0; },
    pinch(scale) { state.scale = scale; emit(); },
    follow(kb, top) { state.auto = { kb, top: top || 0 }; },
  };
  document.addEventListener('focusin', (e) => { if (state.auto && typable(e.target)) setTimeout(() => window.__kb.open(state.auto.kb, state.auto.top), 30); });
  document.addEventListener('focusout', () => { if (state.auto) setTimeout(() => { if (!typable(document.activeElement)) window.__kb.close(); }, 30); });
})();
"""


HANG_MS = int(os.environ.get("FIGCHAT_HANG_MS", "120000"))


def png_mean(png):
    assert png[:8] == b"\x89PNG\r\n\x1a\n"
    pos, idat = 8, b""
    while pos < len(png):
        size, kind = struct.unpack(">I4s", png[pos : pos + 8])
        body = png[pos + 8 : pos + 8 + size]
        pos += 12 + size
        if kind == b"IHDR":
            w, h, _, ctype = struct.unpack(">IIBB", body[:10])
        elif kind == b"IDAT":
            idat += body
    raw = zlib.decompress(idat)
    bpp = {2: 3, 6: 4}[ctype]
    stride = w * bpp
    prev = bytearray(stride)
    total = [0, 0, 0]
    at = 0
    for _ in range(h):
        f = raw[at]
        line = bytearray(raw[at + 1 : at + 1 + stride])
        at += 1 + stride
        for k in range(stride):
            a = line[k - bpp] if k >= bpp else 0
            b = prev[k]
            c = prev[k - bpp] if k >= bpp else 0
            if f == 1:
                line[k] = (line[k] + a) & 255
            elif f == 2:
                line[k] = (line[k] + b) & 255
            elif f == 3:
                line[k] = (line[k] + ((a + b) >> 1)) & 255
            elif f == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[k] = (line[k] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        for px in range(w):
            for ch in range(3):
                total[ch] += line[px * bpp + ch]
        prev = line
    return [t / (w * h) for t in total]


def shade(pg, x, y, size=6):
    return png_mean(pg.screenshot(clip={"x": x, "y": y, "width": size, "height": size}))


def rgb(css):
    return [float(v) for v in css[css.index("(") + 1 : css.index(")")].replace("/", ",").split(",")[:3]]


def until(pg, js, timeout=HANG_MS):
    end = time.time() + timeout / 1000.0
    last = None
    while time.time() < end:
        last = pg.evaluate(js)
        if last:
            return last
        pg.wait_for_timeout(50)
    raise AssertionError("timed out waiting for: %s (last %r)" % (js, last))


DRAFT = """(t) => {
  const el = document.querySelector('.zr-input');
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, t);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}"""


def draft(pg, text):
    box = pg.locator(".zr-input")
    if box.is_visible():
        box.fill(text)
    else:
        pg.evaluate(DRAFT, text)


def voice_on(pg):
    pg.locator(".zr-pit-knob").focus()
    pg.keyboard.press("Enter")
    pg.wait_for_selector(".zr-pit[role=dialog] .fw-voice")
    if pg.locator(".fw-voice").get_attribute("aria-pressed") != "true":
        pg.locator(".fw-voice").click()
    pg.keyboard.press("Escape")
    pg.wait_for_selector(".zr-pit[role=dialog]", state="detached")
    pg.wait_for_selector(".zr-compose-row > .fw-mic")


def keystrokes(pg, count, gap=25):
    marks = []
    for i in range(count):
        t0 = time.perf_counter()
        pg.keyboard.type("abcdefghij"[i % 10])
        pg.evaluate("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(0))))")
        marks.append((time.perf_counter() - t0) * 1000)
        pg.wait_for_timeout(gap)
    return marks


def quantile(xs, q):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(q * len(xs)))]


class Door:
    def __init__(self, bundle, step, fixture=None, orders=None, preload=None, **bench):
        env = dict(os.environ)
        if fixture:
            env["FIGCHAT_FIXTURE"] = fixture
        if orders:
            env["FIGCHAT_ORDERS"] = orders
        flags = [x for k, v in bench.items() for x in ("--" + k, str(v))]
        node = ["node", "-r", preload] if preload else ["node"]
        self.proc = subprocess.Popen(node + [os.path.join(root, "test", "figchat-server.js"), bundle, str(step)] + flags, stdout=subprocess.PIPE, text=True, env=env)
        self.port = int(self.proc.stdout.readline())
        self.base = "http://127.0.0.1:%d" % self.port
        self.url = self.base + "/chat/"

    def state(self):
        return json.load(urllib.request.urlopen(self.base + "/__state"))

    def get(self, path):
        return json.load(urllib.request.urlopen(self.base + path))

    def set_orders(self, root):
        req = urllib.request.Request(self.base + "/__orders", data=json.dumps(root).encode(), method="POST")
        urllib.request.urlopen(req).read()

    def stop(self):
        self.proc.terminate()
        self.proc.wait()


def _png_rows(data):
    import struct
    import zlib

    assert data[:8] == b"\x89PNG\r\n\x1a\n", "not a png"
    pos, chunks, head = 8, [], None
    while pos < len(data):
        n, kind = struct.unpack(">I4s", data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + n]
        if kind == b"IHDR":
            head = struct.unpack(">IIBBBBB", body)
        elif kind == b"IDAT":
            chunks.append(body)
        pos += 12 + n
    w, h, depth, color, _, _, interlace = head
    assert depth == 8 and interlace == 0 and color in (2, 6), head
    bpp = 4 if color == 6 else 3
    raw = zlib.decompress(b"".join(chunks))
    stride = w * bpp
    rows, prev = [], bytearray(stride)
    for y in range(h):
        f = raw[y * (stride + 1)]
        cur = bytearray(raw[y * (stride + 1) + 1:(y + 1) * (stride + 1)])
        for i in range(stride):
            a = cur[i - bpp] if i >= bpp else 0
            b = prev[i]
            c = prev[i - bpp] if i >= bpp else 0
            if f == 1:
                cur[i] = (cur[i] + a) & 255
            elif f == 2:
                cur[i] = (cur[i] + b) & 255
            elif f == 3:
                cur[i] = (cur[i] + ((a + b) >> 1)) & 255
            elif f == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
                cur[i] = (cur[i] + pr) & 255
        rows.append(cur)
        prev = cur
    return w, h, bpp, rows


def ink_offset(png, inset=7, threshold=90):
    w, h, bpp, rows = _png_rows(png)
    x0, y0, x1, y1 = inset, inset, w - inset, h - inset
    px = lambda x, y: rows[y][x * bpp:x * bpp + 3]
    corners = [px(x0, y0), px(x1 - 1, y0), px(x0, y1 - 1), px(x1 - 1, y1 - 1)]
    bg = [sorted(c[i] for c in corners)[1] for i in range(3)]
    xs, ys = [], []
    for y in range(y0, y1):
        for x in range(x0, x1):
            p = px(x, y)
            if sum(abs(p[i] - bg[i]) for i in range(3)) > threshold:
                xs.append(x)
                ys.append(y)
    if not xs:
        return None
    return ((min(xs) + max(xs) + 1) / 2 - w / 2, (min(ys) + max(ys) + 1) / 2 - h / 2, max(xs) - min(xs) + 1, max(ys) - min(ys) + 1)


def assert_centred(loc, what, tol=1.0, blank_ok=False):
    got = ink_offset(loc.screenshot(scale="css", caret="initial", animations="allow"))
    if got is None and blank_ok:
        return
    assert got is not None, "%s draws no glyph" % what
    assert abs(got[0]) <= tol and abs(got[1]) <= tol, "%s: the glyph's ink centre is %.1f,%.1f px off the centre (ink %dx%d)" % (what, got[0], got[1], got[2], got[3])

