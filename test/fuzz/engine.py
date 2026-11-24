import json
import os
import random
import re
import sys
import time
import traceback

from playwright.sync_api import sync_playwright

from stack import MAIN, Stack

HERE = os.path.dirname(os.path.abspath(__file__))
REGRESS = os.path.join(HERE, "regress")

PROFILES = {
    "phone": dict(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True),
    "desktop": dict(viewport={"width": 1280, "height": 800}),
}

INIT = """
(() => {
  window.__fz = { errors: [], rejections: [] };
  window.addEventListener('error', (e) => window.__fz.errors.push('error: ' + e.message));
  window.addEventListener('unhandledrejection', (e) => window.__fz.rejections.push(String(e.reason && e.reason.stack || e.reason)));
})();
"""


class Failure(Exception):
    def __init__(self, invariant, message, step=None):
        super().__init__("%s: %s" % (invariant, message))
        self.invariant = invariant
        self.message = message
        self.step = step


class Run:
    """One page against one stack. Campaigns drive it; the engine checks it after every step."""

    def __init__(self, browser, bundle, campaign, profile, gateway=None):
        self.campaign = campaign
        self.profile = profile
        self.stack = Stack(bundle, step=campaign.step, gateway=gateway if campaign.needs_gateway else None, speech=campaign.needs_speech, door_flags=campaign.door_flags)
        opts = dict(PROFILES[profile])
        if profile == "phone":
            opts["reduced_motion"] = "no-preference"
        self.ctx = browser.new_context(**opts)
        try:
            self.ctx.grant_permissions(["clipboard-read", "clipboard-write"])
        except Exception:
            pass
        self.ctx.add_init_script(INIT)
        if campaign.init_script:
            self.ctx.add_init_script(campaign.init_script)
        self.page = self.ctx.new_page()
        self.console = []
        self.page.on("console", lambda m: self.console.append(m.text) if m.type == "error" else None)
        self.page.on("pageerror", lambda e: self.console.append("pageerror: %s" % e))
        self.cdp = None
        self.typed = ""
        self.sent = []
        self.state = {}
        self.page.goto(self.stack.url + "#/gluck/" + MAIN)
        self.page.wait_for_selector(".zr-input", timeout=15000)
        self.base = len(self.stack.turns())
        campaign.start(self)

    @property
    def input(self):
        return self.page.locator(".zr-input")

    def stop(self):
        try:
            self.ctx.close()
        finally:
            self.stack.stop()

    def new_errors(self):
        found = list(self.console)
        found += self.page.evaluate("window.__fz.errors.concat(window.__fz.rejections)")
        return [e for e in found if not self.campaign.expected_error(e)]

    def composer_text(self):
        return self.page.evaluate("document.querySelector('.zr-input') ? document.querySelector('.zr-input').value : null")

    def dom_turns(self, peek=False):
        return self.page.evaluate("""async ([peek, floor]) => {
          const seen = new Map();
          const grab = () => {
            for (const t of document.querySelectorAll('.nodi-turn')) {
              const n = Number(t.dataset.turn);
              if (seen.has(n)) continue;
              const said = t.querySelector('.nodi-said-text');
              seen.set(n, { no: n, said: said ? said.textContent : null,
                            prose: t.querySelectorAll('.nodi-prose').length, thinking: t.querySelectorAll('.nodi-thinking').length });
            }
          };
          const sc = document.querySelector('[data-zr-scroll]');
          grab();
          const reach = () => Math.ceil(sc.scrollHeight / (sc.clientHeight * 0.8)) + 20;
          for (let step = 0; !peek && sc && step < reach() && Math.min(...seen.keys()) > floor; step++) {
            const before = sc.scrollTop;
            sc.scrollTop = before - sc.clientHeight * 0.8;
            await new Promise((r) => setTimeout(r, 300));
            grab();
            if (sc.scrollTop === before) break;
          }
          if (!peek && sc) sc.scrollTop = sc.scrollHeight;
          return [...seen.values()];
        }""", [peek, self.base])

    def pit_facts(self):
        return self.page.evaluate("""() => {
          const pit = document.querySelector('.zr-pit');
          const grip = document.querySelector('.zr-grip');
          return { open: !!pit, snap: pit ? pit.dataset.snap : null, dragging: !!(pit && pit.hasAttribute('data-dragging')),
                   grip: grip ? grip.dataset.snap : null, h: document.documentElement.style.getPropertyValue('--zr-pit-h'),
                   scrim: !!document.querySelector('.zr-pit-scrim') };
        }""")

    def focus_facts(self):
        return self.page.evaluate("""() => {
          const a = document.activeElement;
          return { tag: a ? a.tagName : null, connected: !!(a && a.isConnected), inApp: !!(a && a.closest && a.closest('#app')), cls: a && typeof a.className === 'string' ? a.className : '' };
        }""")

    def aria(self):
        h = self.page.evaluate("location.hash")
        m = re.match(r"#/[^/]+/([0-9a-f]{32})", h)
        return m.group(1) if m else MAIN

    def navigated(self):
        self.moved = getattr(self, "moved", False) or self.aria() != MAIN
        return self.moved

    def settle(self, timeout=90.0):
        end = time.time() + timeout
        while time.time() < end:
            turns = self.stack.turns(self.aria())
            if all(t["sealed"] for t in turns):
                self.page.wait_for_timeout(250)
                if all(t["sealed"] for t in self.stack.turns(self.aria())):
                    return
            self.page.wait_for_timeout(100)
        raise Failure("settle", "the door still had an open turn after %ds" % timeout)


CONTROL = [(0x0, 0x8), (0xb, 0x1f), (0x7f, 0x9f), (0xad, 0xad), (0x61c, 0x61c), (0x180e, 0x180e), (0x200b, 0x200f), (0x2028, 0x202e), (0x2060, 0x206f), (0xfeff, 0xfeff), (0xfff9, 0xfffb)]
STRICT = set()


def shown(text):
    out = []
    for ch in text:
        c = ord(ch)
        if any(lo <= c <= hi for lo, hi in CONTROL) and c not in (0x200c, 0x200d):
            out.append("U+%04X" % c)
        else:
            out.append(ch)
    return "".join(out)


def norm(s):
    return re.sub(r"\s+", " ", s or "").strip()


def check_always(run):
    if run.stack.gateway is not None and run.stack.gateway.poll() is not None:
        tail = run.stack.gateway_log_text().strip().splitlines()
        raise Failure("gateway-died", "figaro-gateway exited %s: %s" % (run.stack.gateway.returncode, " | ".join(l.strip() for l in tail[-9:-3] if l.strip())[:300]))
    errs = run.new_errors()
    if errs:
        raise Failure("console-error", "; ".join(e[:300] for e in errs[:3]))
    app = run.page.evaluate("document.querySelector('#app') ? document.querySelector('#app').children.length : -1")
    if app < 1:
        raise Failure("blank-page", "#app has no children")
    f = run.focus_facts()
    if not f["connected"] or (f["tag"] not in ("BODY", "HTML") and not f["inApp"]):
        raise Failure("focus", "focus sits on %r (connected=%s, in app=%s)" % (f["tag"], f["connected"], f["inApp"]))
    p = run.pit_facts()
    if not p["open"] and p["h"].strip() not in ("", "0px", "0"):
        raise Failure("stuck-pit", "the pit is closed but --zr-pit-h is still %r" % p["h"])
    if p["open"] and p["snap"] not in ("half", "full", "closed"):
        raise Failure("stuck-pit", "pit snap %r" % p["snap"])
    if p["scrim"] and not p["open"]:
        raise Failure("stuck-pit", "a scrim without a pit")
    run.navigated()
    if run.campaign.extra_always:
        run.campaign.extra_always(run)
    turns = run.dom_turns(peek=True)
    nos = [t["no"] for t in turns if t["no"] is not None]
    if len(nos) != len(set(nos)):
        dup = sorted(n for n in set(nos) if nos.count(n) > 1)
        raise Failure("doubled-turn", "turn numbers drawn twice: %s" % dup)
    if nos != sorted(nos):
        raise Failure("turn-order", "turns drawn out of order: %s" % nos[-8:])
    truth = {t["id"]: t for t in run.stack.turns(run.aria())}
    ghost = [n for n in nos if n not in truth]
    if ghost:
        raise Failure("phantom-turn", "turns the door never had: %s" % ghost)


def check_quiescent(run):
    if hasattr(run.campaign, "before_quiescent"):
        run.campaign.before_quiescent(run)
    run.settle()
    run.page.wait_for_timeout(300)
    check_always(run)
    got = run.composer_text()
    if run.campaign.tracks_composer and got != run.typed:
        raise Failure("composer-text", "composer holds %s, typed %s" % (clip(got), clip(run.typed)))
    if not run.campaign.strict_sends:
        run.campaign.extra_quiescent(run)
        return
    truth = run.stack.turns(run.aria())
    drawn = {t["no"]: t for t in run.dom_turns() if t["no"] is not None}
    sent = run.stack.state()["sent"]
    mine = [t for t in truth if t["id"] > run.base]
    have = sorted([norm(t["inquiry"]) for t in mine] + [norm(n["markdown"]) for t in mine for n in t["nodes"] if n["type"] == "steering"])
    want = sorted(norm(x["text"]) for x in sent)
    if not run.navigated() and have != want:
        raise Failure("door-order", "the door holds %d prompts as turns or steering, the page sent %d" % (len(have), len(want)))
    for t in [] if run.navigated() else mine:
        d = drawn.get(t["id"])
        if d is None:
            raise Failure("lost-turn", "turn %d (%s) is on the door and not on the page" % (t["id"], clip(t["inquiry"], 40)))
        if d["said"] is not None and norm(d["said"]) != norm(shown(t["inquiry"])):
            raise Failure("inquiry-text", "turn %d reads %s, the door has %s" % (t["id"], clip(d["said"], 60), clip(t["inquiry"], 60)))
        want_prose = sum(1 for n in t["nodes"] if n["type"] == "prose")
        want_think = sum(1 for n in t["nodes"] if n["type"] == "thinking")
        if d["prose"] != want_prose or d["thinking"] != want_think:
            raise Failure("turn-nodes", "turn %d draws %d prose and %d thinking, the door has %d and %d" % (t["id"], d["prose"], d["thinking"], want_prose, want_think))
    if run.campaign.extra_quiescent:
        run.campaign.extra_quiescent(run)


def clip(s, n=80):
    s = "" if s is None else str(s)
    return json.dumps(s if len(s) <= n else s[:n] + "...(%d chars)" % len(s), ensure_ascii=False)


class Campaign:
    name = ""
    step = 15
    profiles = ("phone", "desktop")
    needs_gateway = False
    needs_speech = False
    door_flags = ()
    init_script = None
    extra_quiescent = None
    extra_always = None
    tracks_composer = True
    strict_sends = True

    def start(self, run):
        pass

    def expected_error(self, text):
        return False

    def gen(self, rng, i):
        raise NotImplementedError

    def apply(self, run, action):
        raise NotImplementedError


def plan(campaign, seed, steps):
    rng = random.Random(seed)
    profile = rng.choice(campaign.profiles)
    return {"campaign": campaign.name, "seed": seed, "profile": profile, "actions": [campaign.gen(rng, i) for i in range(steps)]}


def execute(browser, bundle, campaign, profile, actions, gateway=None, check_every=1, strict=()):
    STRICT.clear()
    STRICT.update(strict)
    run = Run(browser, bundle, campaign, profile, gateway)
    step = -1
    try:
        for step, a in enumerate(actions):
            run.apply_count = step
            campaign.apply(run, a)
            if check_every and (step % check_every == 0):
                check_always(run)
        step = len(actions)
        check_quiescent(run)
        return None
    except Failure as f:
        f.step = f.step if f.step is not None else step
        return f
    except Exception as e:
        f = Failure("action-threw", "%s at step %d (%s): %s" % (type(e).__name__, step, json.dumps(actions[step]) if 0 <= step < len(actions) else "-", str(e).splitlines()[0][:200] if str(e) else ""))
        f.step = step
        return f
    finally:
        run.stop()


def shrink(browser, bundle, campaign, profile, actions, invariant, gateway, budget_s=240, log=print, strict=()):
    end = time.time() + budget_s
    runs = [0]

    def fails(candidate):
        if time.time() > end or not candidate:
            return False
        runs[0] += 1
        f = execute(browser, bundle, campaign, profile, candidate, gateway, strict=strict)
        return f is not None and f.invariant == invariant

    cur = list(actions)
    n = 2
    while len(cur) >= 2 and time.time() < end:
        size = max(1, len(cur) // n)
        chunks = [cur[i:i + size] for i in range(0, len(cur), size)]
        reduced = False
        for i in range(len(chunks)):
            comp = [a for j, c in enumerate(chunks) if j != i for a in c]
            if comp and fails(comp):
                cur = comp
                n = max(n - 1, 2)
                reduced = True
                break
        if not reduced:
            if n >= len(cur):
                break
            n = min(len(cur), n * 2)
    log("  shrunk %d -> %d actions in %d replays" % (len(actions), len(cur), runs[0]))
    return cur


def save_regression(directory, campaign, seed, profile, invariant, message, actions, owner="unassigned", status="open", strict=()):
    os.makedirs(directory, exist_ok=True)
    path = os.path.join(directory, "%s-%s-%s.json" % (campaign.name, invariant, seed))
    with open(path, "w") as fh:
        json.dump({"campaign": campaign.name, "seed": seed, "profile": profile, "invariant": invariant, "message": message, "owner": owner, "status": status, "strict": sorted(strict), "actions": actions}, fh, indent=1, ensure_ascii=False)
        fh.write("\n")
    return path
