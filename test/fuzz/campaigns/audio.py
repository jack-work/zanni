import os
import time

from campaigns.network import Network
from engine import STRICT, Failure, clip

INSTRUMENT = r"""
(() => {
  const A = window.__au = { sockets: [], frames: [], starts: [], overlaps: [], streams: [], stt: [], gum: 0, errors: [], chunks: {}, played: [], startBy: {} };
  let seq = 0, pendingMeta = null;
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
          if (f && f.type === 'audio.chunk') pendingMeta = f;
          if (f && f.type === 'audio.start') A.startBy[sid + ':' + f.turn] = { chars: f.chars, node: f.node };
          if (f && typeof f.type === 'string') A.frames.push({ t: wall(), sid, type: f.type, turn: f.turn, key: f.key, node: f.node, offset: f.offset, bytes: f.bytes, why: f.why });
        } else {
          A.frames.push({ t: wall(), sid, type: 'binary', bytes: e.data.byteLength !== undefined ? e.data.byteLength : e.data.size });
          if (pendingMeta && e.data instanceof ArrayBuffer && e.data.byteLength >= 4 && e.data.byteLength % 2 === 0) {
            const id = seq++;
            const v = new Int16Array(e.data);
            v[0] = (id % 1000) + 1;
            v[1] = Math.floor(id / 1000) + 1;
            const sb = A.startBy[sid + ':' + pendingMeta.turn];
            A.chunks[id] = { id, t: wall(), e: Date.now(), sid, turn: pendingMeta.turn, node: pendingMeta.node, chars: pendingMeta.chars, startChars: sb ? sb.chars : -1, offset: pendingMeta.offset, bytes: pendingMeta.bytes };
          }
          pendingMeta = null;
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
    const rec = { t: wall(), e: Date.now(), at, end: at + dur, dur, stopped: false, stopAt: null };
    const clash = sources.filter((s) => !s.stopped && s.end > ctx.currentTime + 0.02 && s.end > at + 0.08 && s.at < at + dur - 0.08);
    if (clash.length) A.overlaps.push({ t: rec.t, at, dur, other: clash.length });
    sources.push(rec);
    if (sources.length > 4000) sources.splice(0, 2000);
    A.starts.push(rec.t);
    this.__rec = rec;
    if (this.buffer && this.buffer.length >= 2) {
      const ch = this.buffer.getChannelData(0);
      const a = Math.round(ch[0] * 32768), b = Math.round(ch[1] * 32768);
      if (a >= 1 && b >= 1) {
        rec.id = (a - 1) + 1000 * (b - 1);
        rec.ctxNow = ctx.currentTime;
        A.played.push(rec);
      }
    }
    this.addEventListener('ended', () => { rec.stopped = true; rec.ended = true; });
    return start.apply(this, arguments);
  };
  AudioBufferSourceNode.prototype.stop = function () {
    if (this.__rec) { this.__rec.stopped = true; if (this.__rec.stopAt === null) this.__rec.stopAt = this.context.currentTime; }
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
GAP_S = 0.15


class PageState:
    def __init__(self, page):
        self.page = page
        self.voice = False
        self.on_at = None
        self.off_at = None
        self.bad_mic_since = None
        self.stops = []

    def mark_stop(self):
        try:
            self.stops.append(self.page.evaluate("window.__au ? window.__au.wall() : 0"))
        except Exception:
            pass


def playback_failure(f, st, final=False):
    chunks = {int(k): v for k, v in f["chunks"].items()}
    live = [p for p in f["played"] if p["id"] in chunks and not (p["stopAt"] is not None and p["stopAt"] <= p["at"])]
    live.sort(key=lambda p: p["at"])
    seen = {}
    prev = None
    heard = {}
    for p in live:
        c = chunks[p["id"]]
        start = (c["sid"], c["startChars"])
        key = (c["turn"], c["node"], c["startChars"], c["offset"])
        done = p["stopAt"] is None or p["stopAt"] >= p["at"] + p["dur"] - 0.02
        if key in seen and p["stopAt"] is None:
            o = seen[key]
            return Failure("chunk-played-twice", "turn %s node %s offset %s of the start at chars %s was scheduled to play twice (page socket %s at %s ms, then socket %s at %s ms, %d ms apart)" % (key + (o[0]["sid"], o[0]["t"], c["sid"], c["t"], c["t"] - o[0]["t"])))
        if p["stopAt"] is None:
            seen[key] = (c, p)
        for (turn, node), per in heard.items():
            if turn != c["turn"] or node != c["node"]:
                continue
            others = [v for st, v in per.items() if st != start]
            if others and c["startChars"] >= 0 and per.get(start) is None and c["startChars"] < max(others):
                return Failure("chunk-played-twice", "turn %s node %s: a start at chars %s after another socket already played up to chars %s (page socket %s at %s ms)" % (c["turn"], c["node"], c["startChars"], max(others), c["sid"], c["t"]))
        if done:
            per = heard.setdefault((c["turn"], c["node"]), {})
            per[start] = max(per.get(start, 0), c["chars"] or 0)
        if prev:
            pp, pc = prev
            if c["turn"] < pc["turn"] or (c["turn"] == pc["turn"] and (c["sid"], c["startChars"]) == (pc["sid"], pc["startChars"]) and c["offset"] < pc["offset"]) or (c["turn"] == pc["turn"] and (c["sid"], c["startChars"]) != (pc["sid"], pc["startChars"]) and (c["node"], c["chars"]) < (pc["node"], pc["chars"])):
                return Failure("chunk-order", "turn %s node %s chars %s offset %s plays after turn %s node %s chars %s offset %s" % (c["turn"], c["node"], c["chars"], c["offset"], pc["turn"], pc["node"], pc["chars"], pc["offset"]))
            gap = p["at"] - (pp["at"] + pp["dur"])
            if pc["turn"] == c["turn"] and (pc["sid"], pc["startChars"]) == (c["sid"], c["startChars"]) and gap > GAP_S:
                prev_end_wall = pp["t"] + (pp["at"] + pp["dur"] - pp["ctxNow"]) * 1000
                if c["t"] <= prev_end_wall - 40:
                    return Failure("chunk-gap", "a %d ms silence inside turn %s before offset %s although the chunk was on the page %d ms earlier" % (gap * 1000, c["turn"], c["offset"], prev_end_wall - c["t"]))
        prev = (p, c)
    if not final:
        return None
    started = {}
    ended = set()
    for fr in f["frames"]:
        if fr["type"] == "audio.start":
            started.setdefault(fr["turn"], fr["t"])
        elif fr["type"] == "audio.end":
            ended.add(fr["turn"])
        elif fr["type"] == "audio.cancel":
            ended.discard(fr["turn"])
    got = {p["id"]: p for p in f["played"]}
    for turn in sorted(ended):
        t0 = started.get(turn)
        if t0 is None or any(s >= t0 - 50 for s in st.stops):
            continue
        mine = sorted((c for c in chunks.values() if c["turn"] == turn), key=lambda c: c["offset"])
        lost = []
        for c in mine:
            p = got.get(c["id"])
            if p is None or (p["stopAt"] is not None and p["stopAt"] < p["at"] + p["dur"] - 0.02):
                lost.append(c)
        if lost:
            return Failure("audio-cut-off", "turn %s ended with %d of %d chunks never played to their end (first at offset %s)" % (turn, len(lost), len(mine), lost[0]["offset"]))
    return None


def facts(page):
    return page.evaluate("""() => {
      const A = window.__au;
      if (!A) return null;
      const mic = document.querySelector('.fw-mic');
      const live = [...document.querySelectorAll('[data-state]')].filter((e) => /^(live|draining)$/.test(e.dataset.state)).length;
      return { now: A.wall(), ctx: (A.played.length && A.played[A.played.length - 1].ctxNow) || 0, chunks: A.chunks, played: A.played.map((p) => ({ id: p.id, t: p.t, e: p.e, at: p.at, dur: p.dur, stopAt: p.stopAt, ended: !!p.ended, ctxNow: p.ctxNow })), frames: A.frames, sockets: A.sockets, starts: A.starts, overlaps: A.overlaps, tracks: A.liveTracks(),
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
    leak_wait = 12
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
        if page.locator(".zr-pit[role=dialog]").count() == 0:
            page.locator(".zr-pit-knob").first.click(timeout=1500)
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
            if not self.ps(run, page).voice:
                self.ps(run, page).mark_stop()
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
            if k == "send":
                self.ps(run, page).mark_stop()
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
            st.stops = []
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
        self.ps(run, page).mark_stop()
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
            bad = playback_failure(f, st)
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
        drawn = {t["no"]: t for t in run.dom_turns() if t["no"] is not None}
        for t in run.stack.turns():
            d = drawn.get(t["id"])
            if d is None or not t["sealed"]:
                continue
            wp = sum(1 for n in t["nodes"] if n["type"] == "prose")
            wt = sum(1 for n in t["nodes"] if n["type"] == "thinking")
            if d["prose"] != wp or d["thinking"] != wt:
                raise Failure("turn-nodes", "turn %d draws %d prose and %d thinking, the door has %d and %d" % (t["id"], d["prose"], d["thinking"], wp, wt))
        for st in run.state["ps"]:
            if st.page.is_closed():
                continue
            st.page.wait_for_timeout(1500)
            f = facts(st.page)
            if not f:
                continue
            end = time.time() + 30
            while True:
                bad = playback_failure(f, st, final=True)
                if not bad or time.time() > end:
                    break
                st.page.wait_for_timeout(500)
                f = facts(st.page)
            if bad:
                raise bad
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
        end = time.time() + self.leak_wait
        while time.time() < end:
            state = run.stack.speech_call()
            if all(c["closed"] for c in state["calls"]) and all(s["closed"] for s in state["streams"]):
                break
            time.sleep(0.4)
        state = run.stack.speech_call()
        open_calls = [c for c in state["calls"] if not c["closed"]]
        if open_calls:
            raise Failure("speech-leak", "%d speech calls still open %d s after every turn sealed (%s)" % (len(open_calls), self.leak_wait, clip(open_calls[0]["url"], 90)))
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
