import json
import os
import subprocess
import time
import urllib.request

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


def until(pg, js, timeout=10000):
    end = time.time() + timeout / 1000.0
    last = None
    while time.time() < end:
        last = pg.evaluate(js)
        if last:
            return last
        pg.wait_for_timeout(50)
    raise AssertionError("timed out waiting for: %s (last %r)" % (js, last))


class Door:
    def __init__(self, bundle, step, **bench):
        flags = [x for k, v in bench.items() for x in ("--" + k, str(v))]
        self.proc = subprocess.Popen(["node", os.path.join(root, "test", "figchat-server.js"), bundle, str(step)] + flags, stdout=subprocess.PIPE, text=True)
        self.port = int(self.proc.stdout.readline())
        self.base = "http://127.0.0.1:%d" % self.port
        self.url = self.base + "/chat/"

    def state(self):
        return json.load(urllib.request.urlopen(self.base + "/__state"))

    def stop(self):
        self.proc.terminate()
        self.proc.wait()
