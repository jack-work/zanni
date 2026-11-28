import os
import struct
import sys
import zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.sync_api import sync_playwright

from figchat_kit import HANG_MS, MAIN, Door, until

bundle = os.path.abspath(sys.argv[1])
shots = os.environ.get("DRAWER_FLASH_SHOTS", "")

doors = []
import atexit
atexit.register(lambda: [d.stop() for d in doors])

DRAG = """async ({ x, y, dy, steps, gap }) => {
  const pit = document.querySelector('.zr-pit');
  const scrim = document.querySelector('.zr-pit-scrim');
  const rows = [];
  let phase = 'down';
  const rest = pit.getBoundingClientRect().top;
  const sample = (tag) => rows.push({
    tag, phase,
    opacity: parseFloat(getComputedStyle(scrim).opacity),
    top: pit.getBoundingClientRect().top - rest,
    same: scrim === document.querySelector('.zr-pit-scrim'),
    dragging: pit.hasAttribute('data-dragging'),
  });
  const init = (type, cy) => ({ pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: cy, bubbles: true, cancelable: true, composed: true });
  const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let loop = 0;
  const tick = () => { sample('raf'); loop = requestAnimationFrame(tick); };
  tick();
  document.elementFromPoint(x, y).dispatchEvent(new PointerEvent('pointerdown', init('pointerdown', y)));
  sample('down');
  phase = 'drag';
  for (let i = 1; i <= steps; i++) {
    await wait(gap);
    window.dispatchEvent(new PointerEvent('pointermove', init('pointermove', y + (dy * i) / steps)));
    sample('move' + i);
    await frames();
  }
  window.dispatchEvent(new PointerEvent('pointerup', init('pointerup', y + dy)));
  phase = 'settle';
  sample('up');
  await wait(900);
  cancelAnimationFrame(loop);
  const view = window.visualViewport ? window.visualViewport.height : innerHeight;
  return { rows, reach: view / 2 - pit.offsetHeight, snap: pit.dataset.snap };
}"""

FIXED = """() => [...document.querySelectorAll('body *')].filter((n) => getComputedStyle(n).position === 'fixed').map((n) => {
  const cs = getComputedStyle(n);
  return { cls: n.className, bg: cs.backgroundColor, filter: cs.backdropFilter || cs.webkitBackdropFilter || 'none' };
})"""

GROUND = "() => { const cs = getComputedStyle(document.querySelector('.fw-status')); return cs.backgroundColor; }"


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


def shade(pg):
    return png_mean(pg.screenshot(clip={"x": 0, "y": 0, "width": 8, "height": 8}))


def steady(pg):
    until(pg, "!!document.querySelector('.fw') && document.querySelector('.fw').dataset.link === 'live'")
    until(pg, "document.querySelectorAll('.nodi-turn').length > 3 && document.querySelector('[data-zr-scroll]').scrollTop > 0")
    pg.wait_for_selector(".zr-pit .zr-pit-head .zr-input")
    pg.wait_for_timeout(500)
    pg.evaluate("Promise.all(document.getAnimations().map(a => a.finished.catch(() => null)))")


def grab(pg):
    b = pg.locator(".zr-pit-head .zr-input").bounding_box()
    return b["x"] + b["width"] * 0.8, b["y"] + b["height"] / 2


def pointer(pg, kind, x, y):
    pg.evaluate(
        """([kind, x, y]) => {
          const init = { pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, buttons: kind === 'pointerup' ? 0 : 1, clientX: x, clientY: y, bubbles: true, cancelable: true, composed: true };
          (kind === 'pointerdown' ? document.elementFromPoint(x, y) : window).dispatchEvent(new PointerEvent(kind, init));
          return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        }""",
        [kind, x, y],
    )


def settle(pg):
    pg.wait_for_timeout(120)
    pg.evaluate("Promise.all(document.getAnimations().map(a => a.finished.catch(() => null)))")
    until(pg, "!document.querySelector('.zr-pit').hasAttribute('data-dragging')")


def check_veil(pg, engine):
    assert pg.locator(".zr-pit-scrim").count() == 1, "%s: the veil is there before the first move, so the first move has something to write to" % engine
    rest = pg.evaluate("""() => { const s = document.querySelector('.zr-pit-scrim'); const cs = getComputedStyle(s); const veil = getComputedStyle(s, '::before');
      return { opacity: cs.opacity, events: cs.pointerEvents, bg: cs.backgroundColor, veil: veil.backgroundColor }; }""")
    assert rest["opacity"] == "0" and rest["events"] == "none", "%s: the shut drawer's veil is invisible and lets taps through: %s" % (engine, rest)
    assert rest["bg"] in ("rgba(0, 0, 0, 0)", "transparent"), "%s: the fixed scrim carries no colour of its own, Safari 26 tints its toolbars from that: %s" % (engine, rest)
    assert rest["veil"] not in ("rgba(0, 0, 0, 0)", "transparent"), "%s: the veil is painted on the pseudo-element: %s" % (engine, rest)
    tinting = [f for f in pg.evaluate(FIXED) if f["bg"] not in ("rgba(0, 0, 0, 0)", "transparent") or f["filter"] != "none"]
    assert not tinting, "%s: no fixed element carries a background or backdrop filter: %s" % (engine, tinting)


def check_follows(pg, engine, label, dy, open_after, from_snap="closed"):
    x, y = grab(pg)
    out = pg.evaluate(DRAG, {"x": x, "y": y, "dy": dy, "steps": 14, "gap": 34})
    rows = out["rows"]
    assert all(r["same"] for r in rows), "%s %s: the veil is the same element all through the gesture" % (engine, label)
    drags = [r for r in rows if r["phase"] == "drag" and r["tag"].startswith("move")]
    first = drags[0]
    base = 0 if from_snap == "closed" else out["reach"]
    if from_snap == "closed":
        assert first["opacity"] < 0.2, "%s %s: the first move shows no more than a breath of veil, got %s" % (engine, label, first)
    for r in rows:
        if r["phase"] == "drag" and r["dragging"] and out["reach"] > 0:
            want = max(0.0, min(1.0, (base - r["top"]) / out["reach"]))
            assert abs(r["opacity"] - want) <= 0.1, "%s %s: the veil follows the drawer: %s wants %.2f" % (engine, label, r, want)
    before = [r for r in rows if r["tag"] == "up"][0]
    after = [r for r in rows if r["phase"] == "settle" and r["tag"] == "raf"]
    assert after, "%s %s: frames after release" % (engine, label)
    assert abs(after[0]["opacity"] - drags[-1]["opacity"]) <= 0.2, "%s %s: release does not jump the veil: %s then %s" % (engine, label, drags[-1], after[0])
    target = 1 if open_after else 0
    assert (out["snap"] != "closed") == open_after, "%s %s: the drawer settles %s, got %s" % (engine, label, "open" if open_after else "shut", out["snap"])
    series = [drags[-1]["opacity"]] + [r["opacity"] for r in after]
    step = 1 if target == 1 else -1
    assert all((b - a) * step >= -0.02 for a, b in zip(series, series[1:])), "%s %s: the veil settles one way: %s" % (engine, label, [round(v, 2) for v in series])
    assert abs(series[-1] - target) <= 0.01, "%s %s: the veil rests at %s, got %s" % (engine, label, target, series[-1])
    return out


def check_pixels(pg, engine):
    x, y = grab(pg)
    quiet = shade(pg)
    pointer(pg, "pointerdown", x, y)
    pointer(pg, "pointermove", x, y - 12)
    start = shade(pg)
    pointer(pg, "pointermove", x, y - 24)
    held = shade(pg)
    pointer(pg, "pointerup", x, y - 24)
    after = shade(pg)
    settle(pg)
    shut = shade(pg)
    worst = max(max(abs(a - b) for a, b in zip(quiet, s)) for s in (start, held, after, shut))
    assert worst <= 8, "%s: the screen does not flash on a short pull that falls back: rest %s, first move %s, held %s, after release %s, settled %s" % (engine, quiet, start, held, after, shut)
    assert pg.evaluate("document.querySelector('.zr-pit').dataset.snap") == "closed", "a 24 px pull falls back"
    if shots:
        pg.screenshot(path=os.path.join(shots, "drawer-flash-%s-rest.png" % engine))


def run_engine(engine, browser, context_args):
    d = Door(bundle, 12)
    doors.append(d)
    ctx = browser.new_context(**context_args)
    ctx.set_default_timeout(HANG_MS)
    pg = ctx.new_page()
    pg.errors = []
    pg.on("pageerror", lambda e: pg.errors.append(str(e)))
    pg.on("console", lambda m: pg.errors.append(m.text) if m.type == "error" and "interactive-widget" not in m.text else None)
    pg.goto(d.url + "#/gluck/" + MAIN)
    steady(pg)
    check_veil(pg, engine)
    check_pixels(pg, engine)
    out = check_follows(pg, engine, "pull up", -260, True)
    assert out["snap"] == "half", "%s: a 260 px pull rests at half: %s" % (engine, out["snap"])
    check_veil_open = pg.evaluate("getComputedStyle(document.querySelector('.zr-pit-scrim')).pointerEvents")
    assert check_veil_open == "auto", "%s: the open drawer's veil takes the tap that closes it" % engine
    check_follows(pg, engine, "push down", 320, False, "half")
    assert pg.evaluate("document.querySelectorAll('.zr-pit-scrim').length") == 1
    left = pg.evaluate("[...document.querySelectorAll('#app [style]')].filter((n) => n.getAttribute('style') !== '').map((n) => n.className + ' => ' + n.getAttribute('style'))")
    assert not left, "%s: a drag leaves no inline style behind under the CSP: %s" % (engine, left)
    pg.errors = [e for e in pg.errors if "Refused to apply a stylesheet" not in e and "The object can not be found here" not in e and "No active pointer with the given id" not in e]
    assert not pg.errors, pg.errors
    return ctx, pg, d


with sync_playwright() as p:
    webkit = p.webkit.launch()
    phone = dict(p.devices["iPhone 15"])
    phone["viewport"] = {"width": 390, "height": 844}
    phone["screen"] = {"width": 390, "height": 844}
    ctx, pg, d = run_engine("webkit", webkit, phone)
    ctx.close()
    webkit.close()

    chromium = p.chromium.launch()
    ctx, pg, d = run_engine("chromium", chromium, {"viewport": {"width": 390, "height": 844}, "device_scale_factor": 3, "is_mobile": True, "has_touch": True})

    cdp = ctx.new_cdp_session(pg)
    pg.reload()
    steady(pg)
    x, y = grab(pg)
    events = []
    done = []
    cdp.on("Tracing.dataCollected", lambda e: events.extend(e["value"]))
    cdp.on("Tracing.tracingComplete", lambda e: done.append(1))
    mark = lambda name: pg.evaluate("n => performance.mark(n)", name)
    frames = "() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))"

    def traced(moves, forced=False):
        del events[:]
        del done[:]
        cdp.send("Tracing.start", {"categories": "devtools.timeline,disabled-by-default-devtools.timeline,blink.user_timing", "transferMode": "ReportEvents"})
        cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y}]})
        for i in range(1, 4):
            cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x, "y": y - i * 10}]})
            pg.evaluate(frames)
        pg.wait_for_timeout(250)
        mark("m-first")
        for i in range(1, moves + 1):
            if forced:
                pg.evaluate("n => { document.querySelector('.fw-status').style.background = n % 2 ? '#123' : '#321'; }", i)
            cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x, "y": y - 30 - i * 9}]})
            pg.evaluate(frames)
        mark("m-last")
        cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        cdp.send("Tracing.end")
        until(pg, "true", 100)
        for _ in range(100):
            if done:
                break
            pg.wait_for_timeout(50)
        marks = {e["name"]: e["ts"] for e in events if e.get("name") in ("m-first", "m-last")}
        inside = [e for e in events if marks["m-first"] <= e.get("ts", 0) < marks["m-last"]]
        pg.evaluate("document.querySelector('.fw-status').style.background = ''")
        pg.keyboard.press("Escape")
        settle(pg)
        return {
            "paints": [e["args"]["data"]["nodeName"] for e in inside if e["name"] == "Paint"],
            "layouts": sum(1 for e in inside if e["name"] == "Layout"),
            "restyles": [e.get("args", {}).get("elementCount", 0) for e in inside if e["name"] in ("UpdateLayoutTree", "RecalculateStyles")],
        }

    moves = 24
    probe = traced(moves)
    print("drawer drag probe", {"moves": moves, "paints": len(probe["paints"]), "layouts": probe["layouts"], "restyles": len(probe["restyles"]), "widest": max(probe["restyles"] or [0])})
    assert probe["paints"] == [], "no paint per move, the drawer moves on the compositor: %s" % probe["paints"][:6]
    assert probe["layouts"] == 0, "no layout per move: %d" % probe["layouts"]
    assert max(probe["restyles"] or [0]) <= 4, "no restyle per move reaches past the drawer and its veil: %s" % probe["restyles"]
    assert len(probe["restyles"]) <= moves * 2, "at most a restyle or two per move: %d" % len(probe["restyles"])

    control = traced(moves, forced=True)
    assert len(control["paints"]) >= moves // 2, "the probe sees a repaint when the page is made to repaint each move: %s" % control["paints"]

    assert not pg.errors, pg.errors
    ctx.close()
    chromium.close()
print("drawer flash: ok")
