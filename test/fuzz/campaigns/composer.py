from engine import Campaign, Failure, clip

ASCII = ["hello", "x", " ", "the crossing count", "a b  c", "tab\tbed", "<b>not markup</b>", "&amp; \"quotes\" 'single'", "```code```", "# heading", "[tool]", "0123456789"]
EMOJI = ["\U0001F600", "\U0001F468\u200d\U0001F469\u200d\U0001F467\u200d\U0001F466", "\U0001F3F3\ufe0f\u200d\U0001F308", "\U0001F44D\U0001F3FD", "\U0001F1EB\U0001F1F7", "1\ufe0f\u20e3", "\u2764\ufe0f", "\U0001F9D1\u200d\U0001F4BB"]
RTL = ["\u05e9\u05dc\u05d5\u05dd \u05e2\u05d5\u05dc\u05dd", "\u0645\u0631\u062d\u0628\u0627 \u0628\u0627\u0644\u0639\u0627\u0644\u0645", "abc \u05d0\u05d1\u05d2 123 \u05d3\u05d4", "\u202eevil\u202c", "\u200fmark\u200e", "\u2067isolate\u2069 end", "\u0627\u0644\u0639\u0631\u0628\u064a\u0629 and English mixed"]
CJK = ["\u65e5\u672c\u8a9e\u306e\u30c6\u30b9\u30c8", "\ud55c\uad6d\uc5b4", "\u4e2d\u6587\u8f93\u5165"]
IME = [
    (["\u306b", "\u306b\u307b", "\u306b\u307b\u3093"], "\u65e5\u672c"),
    (["n", "ni", "\u3053", "\u3053\u3093"], "\u3053\u3093\u306b\u3061\u306f"),
    (["\u3042"], "\u3042"),
    (["\u4e2d", "\u4e2d\u6587"], "\u4e2d\u6587"),
    (["\u1112", "\ud55c", "\ud55c\uae00"], "\ud55c\uae00"),
]
PASTES = [
    {"text": "pasted line one\npasted line two"},
    {"text": "tabs\tand\r\nwindows newlines\r\n"},
    {"rep": ["0123456789abcdef", 6400]},
    {"rep": ["\u00e9\U0001F600 ", 6000]},
    {"text": "\U0001F468\u200d\U0001F469\u200d\U0001F467\u200d\U0001F466" * 40},
    {"rep": ["line of a long paste\n", 2000]},
]


def expand(spec):
    return spec["text"] if "text" in spec else spec["rep"][0] * spec["rep"][1]


class Composer(Campaign):
    name = "composer"
    profiles = ("phone", "desktop")

    def gen(self, rng, i):
        r = rng.random()
        pick = lambda pool: rng.choice(pool)
        if r < 0.22:
            return {"k": "type", "text": pick(ASCII) + (pick(ASCII) if rng.random() < 0.3 else "")}
        if r < 0.32:
            return {"k": "emoji", "text": "".join(pick(EMOJI) for _ in range(rng.randint(1, 3)))}
        if r < 0.45:
            steps, commit = pick(IME)
            return {"k": "ime", "steps": steps, "commit": None if rng.random() < 0.2 else commit}
        if r < 0.57:
            spec = pick(PASTES)
            if "rep" in spec and spec["rep"][1] * len(spec["rep"][0]) > 50000 and rng.random() < 0.5:
                spec = {"text": "short paste"}
            return {"k": "paste", **spec}
        if r < 0.67:
            return {"k": "rtl", "text": pick(RTL)}
        if r < 0.72:
            return {"k": "type", "text": pick(CJK)}
        if r < 0.80:
            return {"k": "backspace", "n": rng.randint(1, 3)}
        if r < 0.85:
            return {"k": "clear"}
        if r < 0.92:
            return {"k": "send"}
        if r < 0.96:
            return {"k": rng.choice(["blur", "focus"])}
        return {"k": "wait", "ms": rng.choice([50, 200, 600])}

    def start(self, run):
        run.cdp = run.ctx.new_cdp_session(run.page)

    def focus(self, run):
        run.input.focus()

    def apply(self, run, a):
        k = a["k"]
        page = run.page
        if k == "type":
            self.focus(run)
            page.keyboard.type(a["text"])
            run.typed += a["text"]
        elif k in ("emoji", "rtl"):
            self.focus(run)
            page.keyboard.insert_text(a["text"])
            run.typed += a["text"]
        elif k == "ime":
            self.focus(run)
            for s in a["steps"]:
                run.cdp.send("Input.imeSetComposition", {"text": s, "selectionStart": len(s), "selectionEnd": len(s)})
                page.wait_for_timeout(10)
            if a["commit"] is None:
                run.cdp.send("Input.imeSetComposition", {"text": "", "selectionStart": 0, "selectionEnd": 0})
            else:
                run.cdp.send("Input.insertText", {"text": a["commit"]})
                run.typed += a["commit"]
        elif k == "paste":
            text = expand(a)
            self.focus(run)
            if len((run.typed + text).encode()) > (110000 if (run.typed + text).isascii() else 60000):
                page.keyboard.press("Control+A")
                page.keyboard.press("Delete")
                run.typed = ""
            page.evaluate("(t) => navigator.clipboard.writeText(t)", text)
            page.keyboard.press("Control+V")
            run.typed += text.replace("\r\n", "\n")
        elif k == "backspace":
            self.focus(run)
            for _ in range(a["n"]):
                if run.typed and ord(run.typed[-1]) < 128 and run.typed[-1] != "\n":
                    page.keyboard.press("Backspace")
                    run.typed = run.typed[:-1]
        elif k == "clear":
            self.focus(run)
            page.keyboard.press("Control+A")
            page.keyboard.press("Delete")
            run.typed = ""
        elif k == "send":
            self.send(run)
        elif k == "blur":
            page.evaluate("document.activeElement && document.activeElement.blur()")
        elif k == "focus":
            self.focus(run)
        elif k == "wait":
            page.wait_for_timeout(a["ms"])
        else:
            raise ValueError(k)

    def send(self, run):
        before = len(run.stack.state()["sent"])
        want = run.typed.strip()
        if run.profile == "desktop":
            self.focus(run)
            run.page.keyboard.press("Enter")
        else:
            run.page.locator(".zr-send").click(timeout=3000)
        if not want:
            run.page.wait_for_timeout(100)
            return
        end = 40
        while end:
            sent = run.stack.state()["sent"]
            if len(sent) > before:
                break
            run.page.wait_for_timeout(50)
            end -= 1
        sent = run.stack.state()["sent"]
        if len(sent) <= before:
            raise Failure("send-lost", "sent %s and the door never saw it" % clip(run.typed))
        got = sent[-1]["text"]
        if got != run.typed and got != want:
            raise Failure("sent-text", "typed %s, the door got %s" % (clip(run.typed), clip(got)))
        run.typed = ""
        run.page.wait_for_timeout(50)
