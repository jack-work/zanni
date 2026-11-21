import os
import time

from campaigns.network import Network
from engine import STRICT, Failure, clip

INSTRUMENT = r"""
(() => {
  const A = window.__au = { sockets: [], frames: [], starts: [], overlaps: [], streams: [], stt: [], gum: 0, errors: [] };
  const wall = () => Math.round(performance.now());
  const NativeWS = window.WebSocket;
  let ids = 0;
  window.WebSocket = new Proxy(NativeWS, {
    construct(T, args) {
      const ws = new T(...args);
      const url = String(args[0]);
      const kind = /\/audio\//.test(url) && !/\/audio\/key\//.test(url) ? 'audio' : /\/stt\/stream/.test(url) ? 'stt' : null;
      if (!kind) return ws;
      const sid = ++ids;
      const rec = { sid, kind, url, opened: wall(), closed: null, code: null };
      A.sockets.push(rec);
      ws.addEventListener('close', (e) => { rec.closed = wall(); rec.code = e.code; });
      ws.addEventListener('message', (e) => {
        if (kind !== 'audio') return;
        if (typeof e.data === 'string') {
          let f = null;
          try { f = JSON.parse(e.data); } catch (x) { return; }
          if (f && typeof f.type === 'string') A.frames.push({ t: wall(), sid, type: f.type, turn: f.turn, key: f.key, node: f.node, offset: f.offset, bytes: f.bytes, why: f.why });
        } else {
          A.frames.push({ t: wall(), sid, type: 'binary', bytes: e.data.byteLength !== undefined ? e.data.byteLength : e.data.size });
        }
      });
      return ws;
    },
  });
  const sources = [];
  const start = AudioBufferSourceNode.prototype.start;
  const stop = AudioBufferSourceNode.prototype.stop;
  AudioBufferSourceNode.prototype.start = function (when) {
    const ctx = this.context;
    const dur = this.buffer ? this.buffer.duration : 0;
    const at = Math.max(when || 0, ctx.currentTime);
    const rec = { t: wall(), at, end: at + dur, stopped: false };
    const clash = sources.filter((s) => !s.stopped && s.end > ctx.currentTime + 0.02 && s.end > at + 0.08 && s.at < at + dur - 0.08);
    if (clash.length) A.overlaps.push({ t: rec.t, at, dur, other: clash.length });
    sources.push(rec);
    if (sources.length > 4000) sources.splice(0, 2000);
    A.starts.push(rec.t);
    this.__rec = rec;
    this.addEventListener('ended', () => { rec.stopped = true; });
    return start.apply(this, arguments);
  };
  AudioBufferSourceNode.prototype.stop = function () {
    if (this.__rec) this.__rec.stopped = true;
    return stop.apply(this, arguments);
  };
  const md = navigator.mediaDevices;
  if (md && md.getUserMedia) {
    const gum = md.getUserMedia.bind(md);
    md.getUserMedia = async function () {
      const s = await gum.apply(null, arguments);
      A.gum++;
      A.streams.push(s);
      return s;
    };
  }
  A.liveTracks = () => A.streams.reduce((n, s) => n + s.getTracks().filter((t) => t.readyState === 'live').length, 0);
  A.wall = wall;
})();
"""

PROMPTS = ["[plain]", "[tool]", "[long]", "[md]", "[long] again"]
KEY = "key="


class PageState:
    def __init__(self, page):
        self.page = page
        self.voice = False
        self.on_at = None
        self.off_at = None
        self.bad_mic_since = None


def facts(page):
    return page.evaluate("""() => {
      const A = window.__au;
      if (!A) return null;
      const mic = document.querySelector('.fw-mic');
      const live = [...document.querySelectorAll('[data-state]')].filter((e) => /^(live|draining)$/.test(e.dataset.state)).length;
      return { now: A.wall(), frames: A.frames, sockets: A.sockets, starts: A.starts, overlaps: A.overlaps, tracks: A.liveTracks(),
               mic: mic ? { label: mic.getAttribute('aria-label'), disabled: mic.disabled, pressed: mic.getAttribute('aria-pressed') } : null,
               level: document.documentElement.style.getPropertyValue('--fw-mic-level'), live };
    }""")


def wire_failure(frames):
    per = {}
    pending = {}
    for f in frames:
        sid = f["sid"]
        t = f["type"]
        if t == "binary":
            want = pending.pop(sid, None)
            if want is not None and want["bytes"] != f["bytes"]:
                return Failure("audio-chunk-bytes", "chunk of turn %s says %s bytes, the binary frame holds %s" % (want["turn"], want["bytes"], f["bytes"]))
            continue
        k = (sid, f.get("key") or "turn%s" % f.get("turn"))
        s = per.get(k)
        if t == "audio.start":
            if s is not None and s["open"]:
                return Failure("audio-double-start", "audio.start for %s twice on one socket with no end or cancel between" % f.get("key"))
            if s is not None:
                return Failure("audio-replayed", "audio.start for %s after it ended on the same socket" % f.get("key"))
            per[k] = {"open": True, "offset": 0, "turn": f.get("turn")}
        elif t == "audio.chunk":
            s = per.get((sid, "turn%s" % f.get("turn"))) or next((v for kk, v in per.items() if kk[0] == sid and v["turn"] == f.get("turn")), None)
            if s is None:
                return Failure("audio-order", "audio.chunk for turn %s before any audio.start" % f.get("turn"))
            if not s["open"]:
                return Failure("audio-after-end", "audio.chunk for turn %s after its end or cancel" % f.get("turn"))
            if f.get("offset") != s["offset"]:
                return Failure("audio-offset", "chunk of turn %s at offset %s, %s bytes so far" % (f.get("turn"), f.get("offset"), s["offset"]))
            s["offset"] += f.get("bytes") or 0
            pending[sid] = f
        elif t in ("audio.end", "audio.cancel"):
            s = per.get(k)
            if s is not None:
                s["open"] = False
    return None


class Audio(Network):
    name = "audio"
    needs_speech = True
    init_script = INSTRUMENT
    profiles = ("desktop", "phone")

    def expected_error(self, text):
        return super().expected_error(text) or "getUserMedia" in text or "audio" in text.lower() and "failed" in text.lower()

    def start(self, run):
        super().start(run)
        run.state["ps"] = [PageState(run.page)]
        run.state["tracked"] = []
        self.moved_to = None

    def ps(self, run, page):
        for p in run.state["ps"]:
            if p.page is page:
                return p
        return None

    def gen(self, rng, i):
        r = rng.random()
        if r < 0.20:
            return {"k": "send", "n": i, "kind": rng.choice(PROMPTS)}
        if r < 0.32:
            return {"k": "voice", "to": rng.choice(["on", "on", "off", "toggle"])}
        if r < 0.44:
            return {"k": "mic"}
        if r < 0.54:
            return {"k": "wait", "ms": rng.choice([100, 300, 800, 2000])}
        if r < 0.60:
            return {"k": "fault", "op": {"op": "speech.stall", "ms": rng.choice([300, 1200, 3000]), "count": rng.randint(1, 3)}}
        if r < 0.65:
            return {"k": "fault", "op": {"op": "speech.fail", "count": rng.randint(1, 3)}}
        if r < 0.70:
            return {"k": "fault", "op": {"op": "door.bearer", "ms": rng.choice([1500, 3000])}}
        if r < 0.74:
            return {"k": "fault", "op": {"op": "door.lapse", "notice": True, "audio": rng.choice([True, None])}}
        if r < 0.80:
            return {"k": "fault", "op": {"op": "page.close", "code": rng.choice([1011, 1006, 1001]), "audio": rng.choice([True, True, None])}}
        if r < 0.84:
            return {"k": "speech", "pcmPerText": rng.choice([0, 480, 9600, 96000])}
        if r < 0.89:
            return {"k": "page2", "to": rng.choice(["open", "open", "close", "voice", "mic"])}
        if r < 0.93:
            return {"k": "bounce"}
        if r < 0.95:
            return {"k": "reload"}
        if r < 0.97:
            return {"k": "navigate"}
        return {"k": "fault", "op": {"op": "clear"}}

    def open_pit(self, page):
        if page.locator(".zr-pit").count() == 0:
            page.locator(".zr-grip").first.click(timeout=1500)
            page.wait_for_selector(".fw-voice", timeout=2000)

    def set_voice(self, run, page, to):
        st = self.ps(run, page)
        if st is None or page.is_closed():
            return
        try:
            self.open_pit(page)
            row = page.locator(".fw-voice").first
            now = row.get_attribute("aria-pressed") == "true"
            want = (not now) if to == "toggle" else to == "on"
            if want != now:
                row.click(timeout=1500)
            after = row.get_attribute("aria-pressed") == "true"
            stamp = page.evaluate("window.__au ? window.__au.wall() : 0")
            if after != st.voice:
                if after:
                    st.on_at = stamp
                else:
                    st.off_at = stamp
            st.voice = after
            page.keyboard.press("Escape")
        except Exception:
            try:
                page.keyboard.press("Escape")
            except Exception:
                pass

    def mic_toggle(self, page):
        loc = page.locator(".fw-mic")
        if loc.count() and loc.first.is_enabled():
            try:
                loc.first.click(timeout=1500)
            except Exception:
                pass

    def apply(self, run, a):
        k = a["k"]
        page = run.page
        if k == "voice":
            self.set_voice(run, page, a["to"])
            page.wait_for_timeout(150)
        elif k == "mic":
            self.mic_toggle(page)
            page.wait_for_timeout(250)
        elif k == "speech":
            run.stack.speech_call("/set", {"pcmPerText": a["pcmPerText"]})
        elif k == "page2":
            self.page2(run, a["to"])
        elif k == "bounce":
            self.bounce(run)
        elif k == "navigate":
            self.navigate(run)
        else:
            if k == "reload":
                self.fresh(run, page)
            super().apply(run, a)
            if k == "reload":
                self.fresh(run, page)

    def fresh(self, run, page):
        st = self.ps(run, page)
        if st:
            st.voice = False
            st.on_at = st.off_at = None
            st.bad_mic_since = None

    def bounce(self, run):
        page = run.page
        url = page.url
        page.goto("about:blank")
        page.wait_for_timeout(200)
        page.goto(url)
        page.wait_for_selector(".zr-input", timeout=20000)
        self.fresh(run, page)

    def navigate(self, run):
        from stack import MAIN
        other = run.stack.state()["ids"]["lane"]
        page = run.page
        page.evaluate("(h) => { location.hash = h }", "#/gluck/" + other)
        page.wait_for_timeout(600)
        page.evaluate("(h) => { location.hash = h }", "#/gluck/" + MAIN)
        page.wait_for_timeout(300)

    def page2(self, run, to):
        from stack import MAIN
        pages = run.state["ps"]
        if to == "open":
            if len(pages) > 1:
                return
            p = run.ctx.new_page()
            p.on("console", lambda m: run.console.append(m.text) if m.type == "error" else None)
            p.on("pageerror", lambda e: run.console.append("pageerror: %s" % e))
            p.goto(run.stack.url + "#/gluck/" + MAIN)
            p.wait_for_selector(".zr-input", timeout=20000)
            pages.append(PageState(p))
            return
        if len(pages) < 2:
            return
        st = pages[1]
        if to == "close":
            self.keep_facts(run, st)
            st.page.close()
            pages.pop(1)
        elif to == "voice":
            self.set_voice(run, st.page, "on")
        elif to == "mic":
            self.mic_toggle(st.page)

    def keep_facts(self, run, st):
        try:
            f = facts(st.page)
        except Exception:
            return
        if f:
            bad = wire_failure(f["frames"])
            if bad:
                raise bad

    def extra_always(self, run):
        for st in run.state["ps"]:
            if st.page.is_closed():
                continue
            f = facts(st.page)
            if not f:
                continue
            bad = wire_failure(f["frames"])
            if bad:
                raise bad
            if f["overlaps"]:
                raise Failure("double-playback", "%d audio chunks scheduled over audio still playing" % len(f["overlaps"]))
            if st.off_at is not None and not st.voice and (st.on_at is None or st.off_at >= st.on_at):
                late = [t for t in f["starts"] if t > st.off_at + 500]
                if late:
                    raise Failure("audio-after-stop", "voice was turned off %d ms ago and %d chunks started playing since" % (f["now"] - st.off_at, len(late)))
            mic = f["mic"]
            if mic and mic["label"] == "Record" and f["tracks"] > 0:
                st.bad_mic_since = st.bad_mic_since or time.time()
                if time.time() - st.bad_mic_since > 4:
                    raise Failure("mic-leak", "the mic button reads Record while %d capture tracks stay live" % f["tracks"])
            else:
                st.bad_mic_since = None

    def before_quiescent(self, run):
        super().before_quiescent(run)
        run.stack.speech_call("/set", {"pcmPerText": 480})
        for st in run.state["ps"]:
            if st.page.is_closed():
                continue
            end = time.time() + 14
            while time.time() < end:
                label = st.page.evaluate("document.querySelector('.fw-mic') ? document.querySelector('.fw-mic').getAttribute('aria-label') : null")
                if label is None or label == "Record":
                    break
                if label.startswith("Stop"):
                    self.mic_toggle(st.page)
                st.page.wait_for_timeout(300)

    def extra_quiescent(self, run):
        super().extra_quiescent(run)
        for st in run.state["ps"]:
            if st.page.is_closed():
                continue
            st.page.wait_for_timeout(1500)
            f = facts(st.page)
            if not f:
                continue
            if os.environ.get("FIGFUZZ_VERBOSE"):
                kinds = {}
                for fr in f["frames"]:
                    kinds[fr["type"]] = kinds.get(fr["type"], 0) + 1
                print("  audio page: frames %s, %d chunks played, %d gum, speech %s" % (kinds, len(f["starts"]), 0, run.stack.speech_call()["calls"][:3]))
            if f["mic"] and f["mic"]["label"] not in ("Record",):
                raise Failure("mic-stuck", "the mic button still reads %s after every recording was stopped" % clip(f["mic"]["label"]))
            if f["tracks"]:
                raise Failure("mic-leak", "%d capture tracks still live with the mic idle" % f["tracks"])
            if f["level"].strip():
                raise Failure("mic-stuck", "--fw-mic-level is still %s with the mic idle" % clip(f["level"]))
        end = time.time() + 12
        while time.time() < end:
            state = run.stack.speech_call()
            if all(c["closed"] for c in state["calls"]) and all(s["closed"] for s in state["streams"]):
                break
            time.sleep(0.4)
        state = run.stack.speech_call()
        open_calls = [c for c in state["calls"] if not c["closed"]]
        if open_calls:
            raise Failure("speech-leak", "%d speech calls still open 12 s after every turn sealed (%s)" % (len(open_calls), clip(open_calls[0]["url"], 90)))
        open_streams = [s for s in state["streams"] if not s["closed"]]
        if open_streams:
            raise Failure("stt-leak", "%d speech-to-text streams still open with the mic idle" % len(open_streams))
        seen = {}
        for c in state["calls"]:
            q = c["url"].split("key=", 1)[-1].split("&", 1)[0]
            seen[q] = seen.get(q, 0) + 1
        dup = [k for k, n in seen.items() if n > 1 and "/out" in k]
        if dup and len(run.state["ps"]) == 1 and not getattr(run, "reloaded", False):
            raise Failure("double-speech", "the gateway opened %d speech calls for %s" % (seen[dup[0]], clip(dup[0])))
