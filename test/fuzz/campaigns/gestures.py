from engine import Campaign, Failure

TARGETS = ["grip", "send", "input", "scroll", "turn-head", "fold", "pit-handle", "pit-close", "scrim", "older", "status"]
SELECTORS = {
    "grip": ".zr-grip",
    "send": ".zr-send",
    "input": ".zr-input",
    "scroll": ".fw-scroll",
    "turn-head": ".nodi-turn-head",
    "fold": ".zr-fold > summary, .nodi-sum",
    "pit-handle": ".zr-pit-handle",
    "pit-close": ".zr-pit-bar button",
    "scrim": ".zr-pit-scrim",
    "older": ".fw-older",
    "status": ".fw-status",
}


class Gestures(Campaign):
    name = "gestures"

    def start(self, run):
        run.cdp = run.ctx.new_cdp_session(run.page)

    def gen(self, rng, i):
        r = rng.random()
        if r < 0.20:
            return {"k": "tap", "t": rng.choice(TARGETS) if rng.random() < 0.7 else None, "x": round(rng.random(), 3), "y": round(rng.random(), 3)}
        if r < 0.27:
            return {"k": "dbltap", "t": rng.choice(TARGETS), "x": round(rng.random(), 3), "y": round(rng.random(), 3)}
        if r < 0.33:
            return {"k": "longpress", "t": rng.choice(TARGETS), "ms": rng.choice([300, 600, 900])}
        if r < 0.52:
            return {"k": "swipe", "t": rng.choice(TARGETS), "dx": rng.choice([0, 0, 0, -120, 120]), "dy": rng.choice([-400, -240, -80, -20, 20, 80, 240, 400]), "ms": rng.choice([30, 120, 400]), "steps": rng.choice([3, 8, 20]), "release": rng.choice(["up", "up", "up", "cancel"])}
        if r < 0.64:
            return {"k": "fling", "t": "scroll", "dy": rng.choice([-1500, -600, 600, 1500, 4000]), "speed": rng.choice([400, 1200, 3000])}
        if r < 0.80:
            return {"k": "pit", "how": rng.choice(["grip-tap", "grip-key", "drag-up", "drag-down", "escape", "scrim", "close", "handle-up", "handle-down", "snap-full"])}
        if r < 0.88:
            return {"k": "send", "text": rng.choice(["hi [plain]", "run the tests", "[long] go", "x"])}
        if r < 0.94:
            return {"k": "key", "key": rng.choice(["Tab", "Shift+Tab", "Escape", "Enter", "ArrowUp", "ArrowDown", "PageUp", "End"])}
        return {"k": "wait", "ms": rng.choice([20, 100, 300, 700])}

    def box(self, run, a):
        vp = run.page.viewport_size
        t = a.get("t")
        if t:
            loc = run.page.locator(SELECTORS[t])
            n = loc.count()
            if n:
                loc = loc.nth(0 if a.get("x", 0) < 0.5 else n - 1)
                b = loc.bounding_box()
                if b and b["width"] > 0 and b["height"] > 0:
                    x = b["x"] + b["width"] * min(max(a.get("x", 0.5), 0.05), 0.95)
                    y = b["y"] + b["height"] * min(max(a.get("y", 0.5), 0.05), 0.95)
                    return min(max(x, 1), vp["width"] - 1), min(max(y, 1), vp["height"] - 1)
        return a.get("x", 0.5) * vp["width"], a.get("y", 0.5) * vp["height"]

    def touch(self, run, kind, points):
        run.cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": [{"x": x, "y": y, "id": 1} for x, y in points]})

    def apply(self, run, a):
        k = a["k"]
        page = run.page
        phone = run.profile == "phone"
        if k in ("tap", "dbltap"):
            x, y = self.box(run, a)
            for _ in range(2 if k == "dbltap" else 1):
                if phone:
                    page.touchscreen.tap(x, y)
                else:
                    page.mouse.click(x, y)
                page.wait_for_timeout(60)
        elif k == "longpress":
            x, y = self.box(run, a)
            if phone:
                self.touch(run, "touchStart", [(x, y)])
                page.wait_for_timeout(a["ms"])
                self.touch(run, "touchEnd", [])
            else:
                page.mouse.move(x, y)
                page.mouse.down()
                page.wait_for_timeout(a["ms"])
                page.mouse.up()
        elif k == "swipe":
            self.swipe(run, a)
        elif k == "fling":
            x, y = self.box(run, {"t": "scroll", "x": 0.5, "y": 0.5})
            run.cdp.send("Input.synthesizeScrollGesture", {"x": x, "y": y, "yDistance": -a["dy"], "speed": a["speed"], "gestureSourceType": "touch" if phone else "mouse"})
        elif k == "pit":
            self.pit(run, a["how"])
        elif k == "send":
            page.locator(".zr-input").fill(a["text"])
            run.typed = ""
            try:
                page.locator(".zr-send").click(timeout=1500)
            except Exception:
                page.locator(".zr-input").fill("")
            page.wait_for_timeout(100)
        elif k == "key":
            page.keyboard.press(a["key"])
        elif k == "wait":
            page.wait_for_timeout(a["ms"])
        else:
            raise ValueError(k)
        page.wait_for_timeout(40)

    def swipe(self, run, a):
        page = run.page
        x, y = self.box(run, a)
        vp = page.viewport_size
        x2 = min(max(x + a["dx"], 1), vp["width"] - 1)
        y2 = min(max(y + a["dy"], 1), vp["height"] - 1)
        n = a["steps"]
        gap = max(a["ms"] // n, 1)
        if run.profile == "phone":
            self.touch(run, "touchStart", [(x, y)])
            for i in range(1, n + 1):
                self.touch(run, "touchMove", [(x + (x2 - x) * i / n, y + (y2 - y) * i / n)])
                page.wait_for_timeout(gap)
            self.touch(run, "touchEnd" if a["release"] == "up" else "touchCancel", [])
        else:
            page.mouse.move(x, y)
            page.mouse.down()
            for i in range(1, n + 1):
                page.mouse.move(x + (x2 - x) * i / n, y + (y2 - y) * i / n)
                page.wait_for_timeout(gap)
            page.mouse.up()

    def pit(self, run, how):
        page = run.page
        if how == "grip-tap":
            loc = page.locator(".zr-grip")
            if loc.count():
                b = loc.first.bounding_box()
                if b:
                    x, y = b["x"] + b["width"] / 2, b["y"] + b["height"] / 2
                    if run.profile == "phone":
                        page.touchscreen.tap(x, y)
                    else:
                        page.mouse.click(x, y)
        elif how == "grip-key":
            if page.locator(".zr-grip").count():
                page.locator(".zr-grip").first.focus()
                page.keyboard.press("Enter")
        elif how in ("drag-up", "drag-down"):
            b = page.locator(".zr-pit-handle, .zr-grip").first.bounding_box() if page.locator(".zr-pit-handle, .zr-grip").count() else None
            if b:
                dy = -300 if how == "drag-up" else 300
                self.swipe(run, {"t": None, "x": (b["x"] + b["width"] / 2) / page.viewport_size["width"], "y": (b["y"] + b["height"] / 2) / page.viewport_size["height"], "dx": 0, "dy": dy, "ms": 200, "steps": 8, "release": "up"})
        elif how == "escape":
            page.keyboard.press("Escape")
        elif how == "scrim":
            loc = page.locator(".zr-pit-scrim")
            if loc.count():
                b = loc.first.bounding_box()
                if b:
                    page.mouse.click(b["x"] + 5, b["y"] + 5)
        elif how == "close":
            loc = page.locator(".zr-pit-bar button")
            if loc.count():
                loc.last.click(timeout=2000)
        elif how in ("handle-up", "handle-down"):
            loc = page.locator(".zr-pit-handle")
            if loc.count():
                loc.first.focus()
                page.keyboard.press("ArrowUp" if how == "handle-up" else "ArrowDown")
        elif how == "snap-full":
            if page.locator(".zr-grip").count():
                page.locator(".zr-grip").first.focus()
                page.keyboard.press("ArrowUp")
                page.keyboard.press("ArrowUp")
        page.wait_for_timeout(350)

    def extra_always(self, run):
        p = run.pit_facts()
        if p["dragging"]:
            run.page.wait_for_timeout(400)
            if run.pit_facts()["dragging"]:
                raise Failure("stuck-pit", "the pit still reads dragging with every pointer up")
        if p["open"] and p["grip"] is not None and p["grip"] != p["snap"]:
            raise Failure("pit-grip-mismatch", "grip says %s, the pit says %s" % (p["grip"], p["snap"]))
        sc = run.page.evaluate("(() => { const s = document.querySelector('.fw-scroll'); return s ? [s.scrollTop, s.scrollHeight, s.clientHeight] : null; })()")
        if sc and not (sc[0] == sc[0] and -1 <= sc[0] <= sc[1]):
            raise Failure("scroll-range", "scrollTop %s of %s" % (sc[0], sc[1]))

    def extra_quiescent(self, run):
        run.page.keyboard.press("Escape")
        run.page.wait_for_timeout(700)
        if run.pit_facts()["open"] and run.profile == "phone":
            for sel in (".zr-pit-bar button", ".zr-pit-scrim"):
                if run.page.locator(sel).count():
                    if sel.endswith("button"):
                        run.page.locator(sel).last.click(timeout=2000)
                    else:
                        b = run.page.locator(sel).first.bounding_box()
                        run.page.mouse.click(b["x"] + 5, b["y"] + 5)
                    break
            run.page.wait_for_timeout(700)
            if run.pit_facts()["open"]:
                raise Failure("stuck-pit", "the pit stays open after Escape, its close button and its scrim")
