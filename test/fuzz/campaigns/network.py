import time

from engine import STRICT, Campaign, Failure, clip, norm

BENIGN = ("WebSocket", "net::ERR", "Failed to load resource", "ERR_INTERNET_DISCONNECTED", "ERR_CONNECTION")
PROMPTS = ["[plain]", "[tool]", "[long]", "[md]", "[plain] short"]


class Network(Campaign):
    name = "network"
    needs_gateway = True
    tracks_composer = False
    strict_sends = False
    profiles = ("desktop", "phone")

    def expected_error(self, text):
        return any(b in text for b in BENIGN)

    def start(self, run):
        run.state.update(sends=[], retained=[], offline=False)

    def gen(self, rng, i):
        r = rng.random()
        if r < 0.22:
            return {"k": "send", "n": i, "kind": rng.choice(PROMPTS)}
        if r < 0.32:
            return {"k": "wait", "ms": rng.choice([100, 300, 800, 2000])}
        if r < 0.40:
            return {"k": "fault", "op": {"op": "page.drop", "method": "figaro.aria", "count": rng.randint(1, 6)}}
        if r < 0.48:
            return {"k": "fault", "op": {"op": "page.delay", "method": "figaro.aria", "ms": rng.choice([100, 500, 1500]), "count": rng.randint(1, 8)}}
        if r < 0.54:
            return {"k": "fault", "op": {"op": "door.drop", "method": "figaro.aria", "count": rng.randint(1, 4)}}
        if r < 0.60:
            return {"k": "fault", "op": {"op": "door.delay", "ms": rng.choice([200, 800]), "count": rng.randint(1, 6)}}
        if r < 0.68:
            return {"k": "fault", "op": {"op": "door.lapse", "notice": rng.random() < 0.5}}
        if r < 0.72:
            return {"k": "fault", "op": {"op": "door.bearer", "ms": rng.choice([1500, 3000])}}
        if r < 0.76:
            return {"k": "fault", "op": {"op": "door.stall", "ms": rng.choice([500, 2000]), "count": 1}}
        if r < 0.86:
            return {"k": "storm", "n": rng.randint(2, 8), "gap": rng.choice([0, 30, 150, 400]), "code": rng.choice([1011, 1006, 1001])}
        if r < 0.91:
            return {"k": "offline", "ms": rng.choice([300, 1500, 4000])}
        if r < 0.94:
            return {"k": "reload"}
        if r < 0.97:
            return {"k": "fault", "op": {"op": "clear"}}
        return {"k": "interrupt"}

    def apply(self, run, a):
        k = a["k"]
        page = run.page
        if k == "send":
            text = "net%d %s" % (a["n"], a["kind"])
            have = run.composer_text() or ""
            if have:
                run.state["retained"].append(have)
            if page.locator(".zr-input").count():
                page.locator(".zr-input").fill(text)
                try:
                    if run.profile == "desktop":
                        page.keyboard.press("Enter")
                    else:
                        page.locator(".zr-send").click(timeout=1500)
                    run.state["sends"].append(text)
                except Exception:
                    page.locator(".zr-input").fill("")
            page.wait_for_timeout(120)
        elif k == "wait":
            page.wait_for_timeout(a["ms"])
        elif k == "fault":
            if a["op"]["op"] == "door.lapse":
                if "lapse-no-notice" not in STRICT and a["op"].get("notice") is False:
                    return
            run.stack.fault(a["op"])
        elif k == "storm":
            for _ in range(a["n"]):
                run.stack.fault({"op": "page.close", "code": a["code"]})
                page.wait_for_timeout(a["gap"])
        elif k == "offline":
            run.ctx.set_offline(True)
            page.wait_for_timeout(a["ms"])
            run.ctx.set_offline(False)
        elif k == "reload":
            page.reload()
            page.wait_for_selector(".zr-input", timeout=20000)
        elif k == "interrupt":
            pass
        else:
            raise ValueError(k)

    def window(self, run):
        return run.stack.turns()

    def recovered(self, run):
        truth = run.stack.turns()
        if not truth:
            return True
        drawn = {t["no"] for t in run.dom_turns(peek=True)}
        want = [t["id"] for t in truth if t["id"] > run.base]
        if all(i in drawn for i in want):
            return True
        older = run.page.locator(".fw-older")
        if min(drawn, default=0) > min(want) and older.count():
            try:
                older.first.click(timeout=1000)
            except Exception:
                pass
        return False

    def before_quiescent(self, run):
        run.stack.fault({"op": "clear"})
        run.stack.fault({"op": "door.bearer", "ms": None})
        run.ctx.set_offline(False)
        end = time.time() + 30
        while time.time() < end and not self.recovered(run):
            run.page.wait_for_timeout(250)

    def extra_quiescent(self, run):
        sent = [s["text"] for s in run.stack.state()["sent"]]
        here = run.composer_text() or ""
        for text in run.state["sends"]:
            n = sent.count(text)
            if n > 1:
                raise Failure("doubled-send", "%s reached the door %d times" % (clip(text), n))
            if n == 0 and text != here and text not in run.state["retained"]:
                raise Failure("lost-send", "%s was sent from the page and never reached the door, and is not in the composer" % clip(text))
        truth = run.stack.turns()
        drawn = {t["no"]: t for t in run.dom_turns() if t["no"] is not None}
        for t in [t for t in truth if t["id"] > run.base]:
            d = drawn.get(t["id"])
            if d is None:
                raise Failure("lost-turn", "turn %d (%s) is on the door and not on the page" % (t["id"], clip(t["inquiry"], 40)))
            if d["said"] is not None and norm(d["said"]) != norm(t["inquiry"]):
                raise Failure("inquiry-text", "turn %d reads %s, the door has %s" % (t["id"], clip(d["said"], 60), clip(t["inquiry"], 60)))
            wp = sum(1 for n in t["nodes"] if n["type"] == "prose")
            wt = sum(1 for n in t["nodes"] if n["type"] == "thinking")
            if t["sealed"] and (d["prose"] != wp or d["thinking"] != wt):
                raise Failure("turn-nodes", "turn %d draws %d prose and %d thinking, the door has %d and %d" % (t["id"], d["prose"], d["thinking"], wp, wt))
