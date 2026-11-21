import json
import os
import random
import statistics

from engine import Campaign, Failure, clip
from stack import MAIN

HERE = os.path.dirname(os.path.abspath(__file__))
BUDGETS = os.path.join(HERE, "..", "..", "..", "bench", "budgets.json")

RECORD = """
(() => {
  window.__sc = { frames: [], on: false };
  let last = 0;
  const tick = (t) => { if (window.__sc.on && last) window.__sc.frames.push(t - last); last = window.__sc.on ? t : 0; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
})();
"""

WAIT_ATTACH = """(aria) => new Promise((done) => {
  const t0 = performance.now();
  location.hash = '#/gluck/' + aria;
  const look = () => {
    if (document.querySelector('.zr-input') && document.querySelectorAll('.nodi-turn').length > %d) requestAnimationFrame(() => { const ch = new MessageChannel(); ch.port1.onmessage = () => done(performance.now() - t0); ch.port2.postMessage(0); });
    else if (performance.now() - t0 > 20000) done(-1);
    else requestAnimationFrame(look);
  };
  look();
})"""


def limit(name):
    b = json.load(open(BUDGETS))["metrics"][name]
    return b["budget"] * (1 + b.get("margin", 0.5)) + b.get("slack", 0)


def p50(xs):
    return statistics.median(xs) if xs else None


def p95(xs):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(len(xs) * 0.95))] if xs else None


class Scale(Campaign):
    name = "scale"
    step = 40
    profiles = ("phone",)
    tracks_composer = False
    strict_sends = False
    door_flags = ("--history", 10000, "--page", 24000, "--figaros", 2000, "--fps", 100, "--bytes", 8000, "--chunk", 40)
    init_script = RECORD

    def start(self, run):
        run.state.update(sends=[], retained=[], attach_main=[], attach_other=[], list_ms=[], pit_ms=[], frames=[], crowd=[])
        run.state["crowd"] = [("%x" % (0xfa000000 + c)) * 4 for c in range(0, 2000, 37)]

    def gen(self, rng, i):
        r = rng.random()
        if r < 0.18:
            return {"k": "attach", "to": "main"}
        if r < 0.36:
            return {"k": "attach", "to": "crowd", "n": rng.randrange(0, 54)}
        if r < 0.50:
            return {"k": "list"}
        if r < 0.64:
            return {"k": "pit", "hold": rng.choice([0, 100, 400])}
        if r < 0.76:
            return {"k": "send", "n": i}
        if r < 0.90:
            return {"k": "fling", "dy": rng.choice([-1200, -3000, 1200]), "n": rng.choice([8, 20, 40])}
        return {"k": "wait", "ms": rng.choice([100, 400, 1500])}

    def apply(self, run, a):
        k = a["k"]
        page = run.page
        st = run.state
        if k == "attach":
            if a["to"] == "main":
                if run.aria() == MAIN:
                    page.evaluate("() => { location.hash = '#/' }")
                    page.wait_for_selector("[data-testid=topology-row]", timeout=20000)
                ms = page.evaluate(WAIT_ATTACH % 3, MAIN)
                if ms < 0:
                    raise Failure("attach-stuck", "the 10000 turn figaro painted no turns in 20 s")
                st["attach_main"].append(ms)
            else:
                target = st["crowd"][a["n"] % len(st["crowd"])]
                ms = page.evaluate(WAIT_ATTACH % 0, target)
                if ms < 0:
                    raise Failure("attach-stuck", "figaro %s painted no composer in 20 s" % target[:8])
                st["attach_other"].append(ms)
            run.moved = True
        elif k == "list":
            t0 = page.evaluate("performance.now()")
            page.evaluate("() => { location.hash = '#/' }")
            page.wait_for_selector("[data-testid=topology-row]", timeout=20000)
            st["list_ms"].append(page.evaluate("performance.now()") - t0)
        elif k == "pit":
            grip = page.locator(".zr-grip")
            if grip.count():
                t0 = page.evaluate("performance.now()")
                try:
                    grip.first.click(timeout=1500)
                    page.wait_for_selector(".zr-pit", timeout=3000)
                    st["pit_ms"].append(page.evaluate("performance.now()") - t0)
                    page.wait_for_timeout(a["hold"])
                    page.keyboard.press("Escape")
                except Exception:
                    page.keyboard.press("Escape")
        elif k == "send":
            if page.locator(".zr-input").count():
                text = "sc%d [plain]" % a["n"]
                page.locator(".zr-input").fill(text)
                try:
                    page.locator(".zr-send").click(timeout=1500)
                    st["sends"].append(text)
                except Exception:
                    page.locator(".zr-input").fill("")
            page.wait_for_timeout(150)
        elif k == "fling":
            box = page.locator("[data-testid=transcript-scroller]")
            if box.count():
                b = box.first.bounding_box()
                if b:
                    page.evaluate("window.__sc.frames = []; window.__sc.on = true")
                    page.mouse.move(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2)
                    for _ in range(a["n"]):
                        page.mouse.wheel(0, a["dy"])
                        page.wait_for_timeout(16)
                    page.wait_for_timeout(200)
                    st["frames"] += page.evaluate("window.__sc.on = false, window.__sc.frames.splice(0)")
        elif k == "wait":
            page.wait_for_timeout(a["ms"])
        else:
            raise ValueError(k)

    def extra_quiescent(self, run):
        st = run.state
        sent = [s["text"] for s in run.stack.state()["sent"]]
        for text in st["sends"]:
            if sent.count(text) > 1:
                raise Failure("doubled-send", "%s reached the door %d times" % (clip(text), sent.count(text)))
        nums = {
            "attach_main_ms_p50": p50(st["attach_main"]), "attach_main_n": len(st["attach_main"]),
            "attach_other_ms_p50": p50(st["attach_other"]), "list_2000_ms_p50": p50(st["list_ms"]),
            "pit_open_ms_p50": p50(st["pit_ms"]), "fling_frame_ms_p95": p95(st["frames"]), "fling_frames": len(st["frames"]),
        }
        out = os.environ.get("FIGFUZZ_NUMBERS")
        line = json.dumps({k: (round(v, 1) if isinstance(v, float) else v) for k, v in nums.items()})
        print("  scale numbers: " + line, flush=True)
        if out:
            with open(out, "a") as fh:
                fh.write(line + "\n")
        if len(st["attach_main"]) >= 3 and nums["attach_main_ms_p50"] > limit("attach.1.first_frame.p50"):
            raise Failure("budget-attach", "attach.1.first_frame.p50 is %.0f ms over %d turns, limit %.0f" % (nums["attach_main_ms_p50"], 10000, limit("attach.1.first_frame.p50")))
        if len(st["frames"]) >= 60 and nums["fling_frame_ms_p95"] > limit("scroll.frame_ms.p95"):
            raise Failure("budget-scroll", "scroll.frame_ms.p95 is %.1f ms with 10000 turns, limit %.1f" % (nums["fling_frame_ms_p95"], limit("scroll.frame_ms.p95")))
