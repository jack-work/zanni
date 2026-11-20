import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request

from playwright.sync_api import expect, sync_playwright

example = os.path.abspath(sys.argv[1])
root = os.path.dirname(os.path.dirname(example))
page_url = "file://" + example

EVIL = '<img src=x onerror="window.__pwned=1">'
NO_MSE = "for (const k of ['MediaSource', 'ManagedMediaSource', 'WebKitMediaSource', 'SourceBuffer', 'ManagedSourceBuffer']) { try { delete window[k]; } catch (e) {} Object.defineProperty(window, k, { get() { window.__mse = k; return undefined; }, configurable: true }); }"
LISTEN = """() => {
  const e = voce.engine(window);
  const an = e.ctx.createAnalyser();
  e.out.connect(an);
  const buf = new Float32Array(an.fftSize);
  window.__peak = 0;
  setInterval(() => { an.getFloatTimeDomainData(buf); for (const v of buf) window.__peak = Math.max(window.__peak, Math.abs(v)); }, 25);
}"""


def contrast(a, b):
    def lin(c):
        c /= 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    def lum(rgb):
        return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2])

    la, lb = sorted([lum(a), lum(b)], reverse=True)
    return (la + 0.05) / (lb + 0.05)


def hostile_findings(page):
    return page.evaluate("""() => {
      const found = [];
      if (window.__pwned) found.push('script ran');
      const host = document.querySelector('#app');
      for (const n of host.querySelectorAll('script, img:not(.figchat-head), iframe, object, embed, svg, style, link')) found.push('element ' + n.tagName);
      for (const n of host.querySelectorAll('*')) for (const a of n.attributes) if (/^on/i.test(a.name) || a.name === 'style') found.push('attribute ' + a.name);
      if (document.body.innerText.includes('\\u202e') || document.body.innerText.includes('\\u200b')) found.push('control char lives in the text');
      return found;
    }""")


def no_sideways(pg, width, what):
    got = pg.evaluate("[document.documentElement.scrollWidth, document.body.scrollWidth]")
    assert max(got) <= width, "%s scrolls sideways at %d: %s" % (what, width, got)


def go(pg, suffix, base=None):
    pg.goto("about:blank")
    pg.goto((base or page_url) + suffix)


def state_of(pg, mid):
    return pg.evaluate("id => chat.player(id) && chat.player(id).state()", mid)


def wait_state(pg, mid, want, timeout=15000):
    pg.wait_for_function("([id, want]) => chat.player(id) && chat.player(id).state() === want", arg=[mid, want], timeout=timeout)


def voce_of(pg, mid):
    return pg.locator('.figchat-msg[data-id="%s"] .voce' % mid)


with sync_playwright() as p:
    browser = p.chromium.launch(args=["--no-sandbox", "--disable-audio-output", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"])

    def fresh(scheme="light", width=390, height=844, init=None):
        phone = width < 600
        ctx = browser.new_context(viewport={"width": width, "height": height}, color_scheme=scheme, is_mobile=phone, has_touch=phone)
        if init:
            ctx.add_init_script(init)
        pg = ctx.new_page()
        pg.errors = []
        pg.on("pageerror", lambda e: pg.errors.append(str(e)))
        pg.on("console", lambda m: pg.errors.append(m.text) if m.type == "error" else None)
        return pg

    page = fresh()
    go(page, "")
    page.wait_for_selector(".figchat-thread")
    titles = page.locator(".figchat-thread-title").all_text_contents()
    assert titles == ["Razors and schedules", "A long thread", "Untitled thread"], titles
    assert page.locator(".figchat-pane").is_hidden() and page.locator(".figchat-composer").is_hidden(), "a phone shows the list alone"
    assert page.locator(".figchat-thread").first.bounding_box()["height"] >= 44
    assert page.locator(".figchat-new").bounding_box()["height"] >= 44 and page.locator(".figchat-voice").bounding_box()["height"] >= 44
    no_sideways(page, 390, "thread list")

    page.locator(".figchat-thread", has_text="Razors").tap()
    page.wait_for_selector(".figchat-msg")
    page.wait_for_function("chat.state().link === 'live'")
    assert page.evaluate("location.hash") == "#/t/c0ffee01"
    assert page.locator(".figchat-side").is_hidden()
    assert page.locator(".figchat-h1").text_content() == "Razors and schedules"
    assert page.locator(".figchat-msg").evaluate_all("ns => ns.map(n => n.dataset.role)") == ["user", "assistant", "user", "assistant"]
    assert "Three shaves before noon, then the Count at one.\nShall I read you the list?" == page.locator('.figchat-msg[data-id="2"] .figchat-text').text_content()
    assert page.locator('.figchat-msg[data-id="2"] .figchat-tool').inner_text().split() == ["calendar.today", "done"]
    assert page.locator(".voce").count() == 3 and page.locator('.figchat-msg[data-id="1"] .voce').count() == 0, "a player only where a message has audio"
    for sel in (".voce-play", ".voce-seek", ".figchat-send", ".figchat-input", ".figchat-back"):
        box = page.locator(sel).first.bounding_box()
        assert box["height"] >= 44, sel + " is a 44 px target"
    assert page.locator(".voce-play").first.bounding_box()["width"] >= 44
    assert page.locator(".figchat-input").evaluate("e => parseFloat(getComputedStyle(e).fontSize)") >= 16, "no zoom on focus in iOS"
    foot = page.locator(".figchat-composer").bounding_box()
    assert abs(foot["y"] + foot["height"] - 844) < 2, "the composer sits at the bottom edge"
    no_sideways(page, 390, "thread")

    reply = voce_of(page, 2)
    assert reply.get_attribute("data-state") == "idle" and reply.locator(".voce-total").text_content() == "--:--"
    assert page.evaluate("voce.engine(window).ctx") is None, "no AudioContext before a gesture"
    reply.locator(".voce-play").tap()
    wait_state(page, 2, "playing")
    assert page.evaluate("voce.engine(window).ctx.state") in ("running", "suspended"), "the play tap creates and resumes the context"
    assert reply.locator(".voce-play").get_attribute("aria-label") == "Pause"
    page.wait_for_function("chat.player(2).position() > 0.25")
    assert reply.locator(".voce-total").text_content() == "0:03", "total comes from the stored copy"
    reply.locator(".voce-play").tap()
    wait_state(page, 2, "paused")
    held = page.evaluate("chat.player(2).position()")
    page.wait_for_timeout(250)
    assert page.evaluate("chat.player(2).position()") == held, "pause holds the position"
    track = reply.locator(".voce-seek").bounding_box()
    page.touchscreen.tap(track["x"] + track["width"] * 0.5, track["y"] + track["height"] / 2)
    page.wait_for_function("Math.abs(chat.player(2).position() - 1.6) < 0.2")
    assert reply.locator(".voce-elapsed").text_content() == "0:01", "the scrubber moves the stored copy to the middle"
    assert abs(reply.locator(".voce-fill").evaluate("e => e.value") - 500) < 60
    reply.locator(".voce-seek").focus()
    page.keyboard.press("Home")
    page.wait_for_function("chat.player(2).position() < 0.05", timeout=3000)
    assert reply.locator(".voce-elapsed").text_content() == "0:00", "the scrubber answers the keyboard"
    reply.locator(".voce-play").tap()
    wait_state(page, 2, "playing")

    clip = voce_of(page, 3)
    clip.locator(".voce-play").tap()
    wait_state(page, 3, "playing")
    assert state_of(page, 2) == "paused", "one voice at a time: starting a second player pauses the first"
    wait_state(page, 3, "idle", timeout=8000)
    assert clip.locator(".voce-elapsed").text_content() == "0:00" and clip.locator(".voce-play").get_attribute("aria-label") == "Play"

    gone = voce_of(page, 4)
    gone.locator(".voce-play").tap()
    wait_state(page, 4, "expired")
    assert gone.locator(".voce-note").text_content() == "audio expired"
    assert gone.locator(".voce-play").is_disabled()
    assert page.locator('.figchat-msg[data-id="4"] .figchat-text').text_content() == "Noted. Thursday at ten for Rosina.", "the text stays when the audio is gone"
    assert all(e.startswith("Failed to load resource") for e in page.errors) and len(page.errors) <= 1, page.errors
    page.close()

    live = fresh(init=NO_MSE)
    go(live, "#/t/c0ffee01")
    live.wait_for_function("chat.state().link === 'live'")
    assert live.evaluate("(() => { const t = typeof MediaSource; window.__mse = undefined; return t; })()") == "undefined", "the page has no MediaSource, as on an iPhone"
    assert live.locator(".figchat-voice").text_content() == "Voice off" and live.locator(".figchat-voice").get_attribute("aria-pressed") == "false"
    live.locator(".figchat-voice").tap()
    assert live.locator(".figchat-voice").text_content() == "Voice on" and live.locator(".figchat-voice").get_attribute("aria-pressed") == "true"
    live.wait_for_function("voce.engine(window).running()")
    assert live.evaluate("mock.state.received") == [{"type": "voice", "on": True}]
    live.evaluate(LISTEN)
    live.locator(".figchat-input").fill("Echo this " + EVIL)
    began = time.time()
    live.locator(".figchat-send").tap()
    wait_state(live, 6, "live")
    assert voce_of(live, 6).locator(".voce-play").get_attribute("aria-label") == "Stop"
    assert voce_of(live, 6).locator(".voce-note").text_content() == "speaking"
    assert live.locator('.figchat-msg[data-id="6"]').get_attribute("data-streaming") == "", "audio starts while the text is still streaming"
    live.wait_for_function("window.__peak > 0.1", timeout=8000)
    live.wait_for_function("!document.querySelector('.figchat-msg[data-streaming]')")
    assert state_of(live, 6) in ("live", "draining"), "the text ends first and the queue plays on"
    wait_state(live, 6, "idle")
    took = time.time() - began
    stats = live.evaluate("chat.player(6).stats()")
    assert stats["samples"] == 57600 and stats["chunks"] == 29, stats
    assert took > 2.3, "2.4 s of PCM took %.2f s: it was played, not dropped" % took
    assert live.evaluate("window.__peak") > 0.2, "the chirp reached the WebAudio output"
    assert live.evaluate("window.__mse") is None, "nothing even asked for MediaSource"
    assert live.locator('.figchat-msg[data-id="5"] .figchat-text').text_content() == "Echo this " + EVIL
    assert EVIL in live.locator('.figchat-msg[data-id="6"] .figchat-text').text_content(), "markup in a delta is text"
    assert hostile_findings(live) == [], hostile_findings(live)
    assert live.locator('.figchat-msg[data-id="6"] .figchat-tool').inner_text().split() == ["bash", "done"]
    assert live.evaluate("mock.state.posts") == [{"thread": "c0ffee01", "body": {"text": "Echo this " + EVIL}}]
    assert live.locator(".figchat-input").input_value() == ""
    spoken = voce_of(live, 6)
    assert spoken.locator(".voce-total").text_content() == "0:02" and spoken.locator(".voce-play").get_attribute("aria-label") == "Play"
    spoken.locator(".voce-play").tap()
    wait_state(live, 6, "playing")
    track = spoken.locator(".voce-seek").bounding_box()
    live.touchscreen.tap(track["x"] + track["width"] * 0.75, track["y"] + track["height"] / 2)
    live.wait_for_function("Math.abs(chat.player(6).position() - 1.8) < 0.25")
    wait_state(live, 6, "idle", timeout=6000)
    no_sideways(live, 390, "thread after a spoken reply")

    live.evaluate("mock.state.oddFrameAt = 3")
    live.locator(".figchat-input").fill("again")
    live.locator(".figchat-send").tap()
    wait_state(live, 8, "muted")
    assert live.evaluate("chat.player(8).stats().chunks") == 3, "an odd frame stops the live stream where it stands"
    wait_state(live, 8, "idle")
    assert voce_of(live, 8).locator(".voce-play").is_enabled(), "the stored copy is still offered"
    live.evaluate("mock.state.oddFrameAt = -1")

    live.evaluate("mock.state.speechFails = true")
    live.locator(".figchat-input").fill("once more")
    live.locator(".figchat-send").tap()
    wait_state(live, 10, "lost")
    assert voce_of(live, 10).locator(".voce-note").text_content() == "audio unavailable" and voce_of(live, 10).locator(".voce-play").is_disabled()
    assert live.locator('.figchat-msg[data-id="10"] .figchat-fault').text_content() == "Speech failed: synthesis stopped"
    assert live.locator('.figchat-msg[data-id="10"] .figchat-text').text_content().startswith("You said: once more.")
    live.evaluate("mock.state.speechFails = false")

    live.locator(".figchat-voice").tap()
    assert live.evaluate("mock.state.received.at(-1)") == {"type": "voice", "on": False}
    live.locator(".figchat-input").fill("quietly")
    live.locator(".figchat-send").tap()
    live.wait_for_selector('.figchat-msg[data-id="12"]:not([data-streaming])')
    live.wait_for_function("document.querySelector('.figchat-msg[data-id=\"12\"] .figchat-text').textContent.endsWith('sharp.')")
    assert voce_of(live, 12).count() == 0, "voice off: text only"

    live.locator(".figchat-voice").tap()
    live.locator(".figchat-input").fill("drop me")
    live.locator(".figchat-send").tap()
    wait_state(live, 14, "live")
    live.evaluate("mock.drop()")
    live.wait_for_function("chat.state().link === 'offline'")
    assert live.locator(".figchat-link").text_content() == "Offline" and live.locator(".figchat-send").is_disabled()
    live.wait_for_function("chat.state().link === 'live'", timeout=8000)
    assert live.evaluate("mock.state.received.at(-1)") == {"type": "voice", "on": True}, "the voice wish is sent again on the new socket"
    live.wait_for_function("document.querySelector('.figchat-msg[data-id=\"14\"] .figchat-text').textContent.endsWith('sharp.')", timeout=10000)
    live.wait_for_function("chat.player(14).audioId() !== ''", timeout=10000)
    wait_state(live, 14, "idle")
    assert voce_of(live, 14).locator(".voce-play").is_enabled(), "after a dropped socket the reply is fetched whole, with its stored audio"
    assert live.locator(".figchat-msg").count() == 14

    live.locator(".figchat-input").fill("hush")
    live.locator(".figchat-send").tap()
    wait_state(live, 16, "live")
    live.locator(".figchat-voice").tap()
    assert state_of(live, 16) == "idle" and voce_of(live, 16).locator(".voce-play").is_disabled(), "voice off silences the reply at once and leaves no player waiting for an audio.end that will not come"
    live.wait_for_function("document.querySelector('.figchat-msg[data-id=\"16\"] .figchat-text').textContent.endsWith('sharp.')")
    assert not live.errors, live.errors
    live.close()

    more = fresh()
    go(more, "#/t/c0ffee02")
    more.wait_for_function("document.querySelectorAll('.figchat-msg').length === 50")
    assert more.evaluate("window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2"), "a thread opens at its newest message"
    more.evaluate("window.scrollTo(0, 0)")
    top_id = more.locator(".figchat-msg").first.get_attribute("data-id")
    assert top_id == "71"
    more.locator(".figchat-older").tap()
    more.wait_for_function("document.querySelectorAll('.figchat-msg').length === 100")
    y = more.locator('.figchat-msg[data-id="71"]').bounding_box()["y"]
    assert 0 <= y < 844, "the message that was on screen stays on screen when older ones load: %s" % y
    more.locator(".figchat-older").tap()
    more.wait_for_function("document.querySelectorAll('.figchat-msg').length === 120")
    assert more.locator(".figchat-older").is_hidden()
    assert more.locator(".figchat-msg").evaluate_all("ns => ns.map(n => Number(n.dataset.id))") == list(range(1, 121)), "pages join in id order"
    go(more, "#/t/nope")
    more.wait_for_selector("text=This thread is gone.")
    more.close()

    h = fresh()
    go(h, "?set=hostile")
    h.wait_for_selector(".figchat-thread")
    assert hostile_findings(h) == [], hostile_findings(h)
    assert EVIL in h.locator(".figchat-threads").inner_text() and "U+202E" in h.locator(".figchat-threads").inner_text()
    no_sideways(h, 390, "hostile list")
    h.locator(".figchat-thread").first.tap()
    h.wait_for_selector(".figchat-msg")
    h.wait_for_function("chat.state().link === 'live'")
    text = h.locator(".figchat-main").inner_text()
    assert EVIL in text and "<script>window.__pwned=2</script>" in text, "stored markup is shown as text"
    assert "U+202E" in text and "U+200B" in text and "U+0000" in text, "control characters are named, not obeyed"
    assert EVIL in h.locator(".figchat-tool").first.inner_text()
    h.locator(".figchat-input").fill(EVIL)
    h.locator(".figchat-send").tap()
    h.wait_for_selector('.figchat-msg[data-id="4"]:not([data-streaming])')
    h.wait_for_function("document.querySelector('.figchat-msg[data-id=\"4\"] .figchat-text').textContent.endsWith('sharp.')")
    assert hostile_findings(h) == [], hostile_findings(h)
    for width in (320, 390):
        h.set_viewport_size({"width": width, "height": 700})
        no_sideways(h, width, "hostile thread with a 6000 character word")
    h.evaluate("mock.state.status = 502")
    h.locator(".figchat-input").fill("lost")
    h.locator(".figchat-send").tap()
    h.wait_for_function("document.querySelector('.figchat-sendnote').textContent.startsWith('Not sent')")
    assert h.locator(".figchat-input").input_value() == "lost", "a message that was not sent stays in the composer"
    assert not h.errors, h.errors
    h.close()

    tmp = tempfile.mkdtemp(prefix="figchat-sabotage-")
    try:
        shutil.copytree(os.path.join(root, "assets"), os.path.join(tmp, "assets"))
        shutil.copytree(os.path.join(root, "examples"), os.path.join(tmp, "examples"))
        target = os.path.join(tmp, "assets/figchat/figchat.js")
        src = open(target).read()
        needle = "else if (n.lastChild && n.lastChild.nodeType === 3) n.lastChild.appendData(p.plain);\n        else n.appendChild(doc.createTextNode(p.plain));"
        assert src.count(needle) == 1, "the one text sink is still where the sabotage expects it"
        open(target, "w").write(src.replace(needle, "else n.insertAdjacentHTML('beforeend', p.plain);"))
        s = fresh()
        s.goto("file://" + os.path.join(tmp, "examples/figchat.html") + "#/t/c0ffee03")
        s.wait_for_function("chat.state().link === 'live'")
        assert hostile_findings(s) == []
        s.locator(".figchat-input").fill(EVIL)
        s.locator(".figchat-send").tap()
        s.wait_for_selector('.figchat-msg[data-id="2"]:not([data-streaming])')
        s.wait_for_timeout(300)
        assert "script ran" in hostile_findings(s), "negative control: with the text sink swapped for HTML the streamed delta must fire"
        s.close()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    wide = fresh(width=1280, height=800)
    go(wide, "")
    wide.wait_for_selector(".figchat-thread")
    assert wide.locator(".figchat-side").is_visible() and wide.locator(".figchat-pane").is_visible(), "a desk shows list and thread side by side"
    no_sideways(wide, 1280, "desk list")
    wide.locator(".figchat-new").click()
    wide.wait_for_function("location.hash === '#/new' && document.activeElement.className === 'figchat-input'")
    wide.locator(".figchat-input").fill("A fresh thread about wigs\nsecond line")
    wide.locator(".figchat-input").press("Enter")
    wide.wait_for_function("location.hash.startsWith('#/t/feed')")
    wide.wait_for_selector('.figchat-msg[data-id="2"]:not([data-streaming])')
    wide.wait_for_function("document.querySelector('.figchat-msg[data-id=\"2\"] .figchat-text').textContent.endsWith('sharp.')")
    assert wide.locator('.figchat-msg[data-id="1"] .figchat-text').text_content() == "A fresh thread about wigs\nsecond line"
    assert wide.locator(".figchat-h1").text_content() == "A fresh thread about wigs"
    current = wide.locator('.figchat-thread[aria-current="page"] .figchat-thread-title')
    assert current.count() == 1 and current.text_content() == "A fresh thread about wigs"
    assert wide.locator(".figchat-thread-title").first.text_content() == "A fresh thread about wigs", "the newest thread leads the list"
    assert wide.evaluate("mock.state.posts.length") == 1
    wide.locator(".figchat-input").fill("line one")
    wide.locator(".figchat-input").press("Shift+Enter")
    wide.locator(".figchat-input").type("line two")
    assert wide.locator(".figchat-input").input_value() == "line one\nline two" and wide.evaluate("mock.state.posts.length") == 1, "Shift+Enter is a newline, not a send"
    wide.locator(".figchat-input").fill("")
    side, pane = wide.locator(".figchat-side").bounding_box(), wide.locator(".figchat-main").bounding_box()
    assert side["x"] + side["width"] <= pane["x"] + 1, "the panes do not overlap"
    no_sideways(wide, 1280, "desk thread")
    wide.locator(".figchat-thread", has_text="Razors").click()
    wide.wait_for_function("document.querySelectorAll('.figchat-msg').length === 4")
    wide.evaluate("document.querySelector('.voce').classList.add('voce-big')")
    assert wide.locator(".voce-big .voce-play").bounding_box()["height"] >= 64, "the voice-ergonomics size class"
    assert not wide.errors, wide.errors
    wide.close()

    mic = fresh()
    go(mic, "#/t/c0ffee01")
    mic.wait_for_function("chat.state().link === 'live'")
    rec = mic.locator(".figchat-mic")
    box = rec.bounding_box()
    assert box["height"] >= 56 and box["width"] >= 56, "the mic is a large target: %s" % box
    assert rec.text_content() == "Record" and mic.evaluate("chat.state().mic") == "idle"
    assert mic.locator(".figchat-turn").is_hidden() and mic.locator(".figchat-clip").is_hidden()
    rec.tap()
    mic.wait_for_function("chat.state().mic === 'recording'")
    assert rec.get_attribute("aria-pressed") == "true"
    mic.wait_for_function("document.querySelector('.figchat-mic').textContent === 'Stop 0:01'", timeout=4000)
    no_sideways(mic, 390, "composer while recording")
    rec.tap()
    mic.wait_for_function("chat.state().clip !== null")
    clips = mic.evaluate("mock.state.clips")
    assert len(clips) == 1 and clips[0]["type"].startswith("audio/webm") and clips[0]["size"] > 200, "a real MediaRecorder clip went up: %s" % clips
    assert mic.locator(".figchat-input").input_value() == "A mock transcript.", "the transcript lands in the composer, not in the thread"
    assert mic.evaluate("mock.state.posts") == []
    assert mic.locator(".figchat-clip-text").text_content() == "Recording attached, 0:01"
    assert rec.text_content() == "Record" and mic.evaluate("chat.state().mic") == "idle"
    mic.locator(".figchat-input").fill("A mock transcript, edited.")
    mic.locator(".figchat-send").tap()
    mic.wait_for_selector('.figchat-msg[data-id="6"]:not([data-streaming])')
    assert mic.evaluate("mock.state.posts") == [{"thread": "c0ffee01", "body": {"text": "A mock transcript, edited.", "clip_id": "clip1"}}]
    assert voce_of(mic, 5).count() == 1, "the sent recording has a player"
    assert mic.locator(".figchat-clip").is_hidden() and mic.evaluate("chat.state().clip") is None and mic.locator(".figchat-input").input_value() == ""
    assert mic.locator(".figchat-msg").count() == 6, "message.added and the POST answer are one bubble"

    mic.evaluate("mock.state.status = 502")
    rec.tap()
    mic.wait_for_function("chat.state().mic === 'recording'")
    mic.wait_for_timeout(300)
    rec.tap()
    mic.wait_for_function("document.querySelector('.figchat-micnote').textContent === 'Not transcribed: mock failure'")
    assert mic.evaluate("chat.state().mic") == "idle" and mic.evaluate("chat.state().clip") is None, "a refused clip shows the server's words and leaves the mic ready"
    mic.evaluate("mock.state.status = 0")

    mic.locator(".figchat-input").fill("markdown please")
    mic.locator(".figchat-send").tap()
    mic.wait_for_selector('.figchat-msg[data-id="8"] h3')
    mic.evaluate("document.querySelector('.figchat-msg[data-id=\"8\"] h3').kept = true")
    assert mic.locator(".figchat-turn").is_visible(), "while a reply streams the composer says a message will steer it"
    mic.wait_for_selector('.figchat-msg[data-id="8"]:not([data-streaming])')
    md = mic.locator('.figchat-msg[data-id="8"] .figchat-text')
    assert md.locator("h3").text_content() == "The list" and md.locator("h3").evaluate("e => e.kept") is True, "a finished block is not rebuilt by later deltas"
    assert md.locator("strong").text_content() == "two of them sharp" and md.locator("strong code").text_content() == "sharp"
    assert md.locator("ol > li").all_text_contents() == ["the razor", "the strop"] and md.locator("em").text_content() == "strop"
    assert md.locator("pre > code").text_content() == "ls -la <b>"
    assert md.locator("a").count() == 1 and md.locator("a").get_attribute("href") == "https://example.org/a?b=1" and "noopener" in md.locator("a").get_attribute("rel")
    assert "[this](javascript:alert(1))" in md.text_content(), "a link outside http, https and mailto stays as typed"
    assert hostile_findings(mic) == [], hostile_findings(mic)
    assert mic.locator(".figchat-turn").is_hidden()
    no_sideways(mic, 390, "thread with markdown")

    mic.evaluate("mock.state.step = 120")
    mic.evaluate("mock.handle('POST', '/chat/api/threads/c0ffee01/messages', JSON.stringify({ text: 'from another tab' }))")
    mic.wait_for_selector('.figchat-msg[data-id="9"]')
    assert mic.locator('.figchat-msg[data-id="9"] .figchat-text').text_content() == "from another tab" and mic.locator('.figchat-msg[data-id="9"]').get_attribute("data-role") == "user"
    mic.wait_for_function("document.querySelector('.figchat-msg[data-id=\"10\"] .figchat-text')?.textContent.length > 20")
    mic.evaluate("location.hash = '#/t/c0ffee03'")
    mic.wait_for_function("chat.state().thread === 'c0ffee03' && chat.state().link === 'live'")
    mic.evaluate("location.hash = '#/t/c0ffee01'")
    mic.wait_for_selector('.figchat-msg[data-id="10"][data-streaming]')
    assert mic.locator(".figchat-turn").is_visible(), "a turn already running shows as running when the thread is opened"
    mic.wait_for_selector('.figchat-msg[data-id="10"]:not([data-streaming])', timeout=10000)
    mic.wait_for_function("document.querySelector('.figchat-msg[data-id=\"10\"] .figchat-text').textContent.startsWith('You said: from another tab. I checked')")
    assert mic.locator('.figchat-msg[data-id="10"] .figchat-text').text_content().endswith("sharp."), "a reply joined halfway is whole once it ends"

    mic.locator(".figchat-input").fill("too long")
    mic.locator(".figchat-send").tap()
    mic.wait_for_function("document.querySelector('.figchat-msg[data-id=\"12\"] .figchat-text')?.textContent.length > 8")
    mic.locator(".figchat-stop").tap()
    mic.wait_for_selector('.figchat-msg[data-id="12"]:not([data-streaming])')
    assert mic.evaluate("mock.state.received.at(-1)") == {"type": "cancel"}
    assert not mic.locator('.figchat-msg[data-id="12"] .figchat-text').text_content().endswith("sharp.") and mic.locator(".figchat-turn").is_hidden(), "Stop reply cancels the turn"
    assert not mic.errors, mic.errors
    mic.close()

    deny = fresh(init="navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'))")
    go(deny, "#/new")
    deny.locator(".figchat-mic").tap()
    deny.wait_for_function("document.querySelector('.figchat-micnote').textContent.startsWith('Microphone blocked.')")
    assert deny.locator(".figchat-mic").is_enabled() and deny.evaluate("chat.state().mic") == "idle"
    deny.close()
    bare = fresh(init="Object.defineProperty(window, 'MediaRecorder', { value: undefined })")
    go(bare, "#/new")
    assert bare.locator(".figchat-micnote").text_content() == "This browser cannot record audio." and bare.locator(".figchat-mic").is_disabled()
    bare.locator(".figchat-input").fill("typing still works")
    bare.locator(".figchat-send").tap()
    bare.wait_for_function("location.hash.startsWith('#/t/feed')")
    bare.close()

    for scheme in ("light", "dark"):
        c = fresh(scheme)
        go(c, "#/t/c0ffee01")
        c.wait_for_function("chat.state().link === 'live'")
        rgb = lambda s: [int(float(x)) for x in re.findall(r"[\d.]+", s)[:3]]
        color = lambda sel, prop="color": rgb(c.evaluate("([s, p]) => { const k = document.createElement('canvas').getContext('2d'); k.fillStyle = getComputedStyle(document.querySelector(s))[p]; k.fillRect(0, 0, 1, 1); return 'rgb(' + Array.from(k.getImageData(0, 0, 1, 1).data.slice(0, 3)).join(',') + ')'; }", [sel, prop]))
        ground = color(".figchat-top", "backgroundColor")
        for role in ("assistant", "user"):
            bubble = color('.figchat-msg[data-role="%s"] .figchat-bubble' % role, "backgroundColor")
            for sel in (".figchat-text", ".voce-time", ".voce-elapsed"):
                ratio = contrast(color('.figchat-msg[data-role="%s"] %s' % (role, sel)), bubble)
                assert ratio >= 4.5, "%s %s %s contrast %.2f" % (scheme, role, sel, ratio)
        assert contrast(color(".figchat-tool-state"), color('.figchat-msg[data-role="assistant"] .figchat-bubble', "backgroundColor")) >= 4.5, scheme + " tool state"
        assert contrast(color(".figchat-meta"), ground) >= 4.5, scheme + " meta"
        assert contrast(color(".figchat-link"), ground) >= 4.5, scheme + " link"
        for sel in (".figchat-send", ".voce-play"):
            assert contrast(color(sel), color(sel, "backgroundColor")) >= 4.5, scheme + " " + sel
        assert contrast(color(".figchat-voice"), ground) >= 4.5, scheme + " voice toggle"
        c.close()

    bundle = tempfile.mkdtemp(prefix="figchat-bundle-")
    server = None
    try:
        subprocess.run(["node", os.path.join(root, "bin/figchat-bundle"), bundle], check=True, capture_output=True)
        server = subprocess.Popen(["node", os.path.join(root, "test/figchat-server.js"), bundle], stdout=subprocess.PIPE, text=True)
        port = int(server.stdout.readline())
        origin = "http://127.0.0.1:%d" % port
        csp = fresh(init=NO_MSE + "; document.addEventListener('securitypolicyviolation', e => (window.__csp = window.__csp || []).push(e.violatedDirective + ' ' + e.blockedURI))")
        violations = []
        csp.on("console", lambda m: violations.append(m.text) if "Content Security Policy" in m.text or "Refused to" in m.text else None)
        csp.goto(origin + "/chat/")
        csp.wait_for_selector(".figchat-thread")
        for face in ("Inter", "EB Garamond", "VT323", "Jacquard 24"):
            csp.evaluate("f => document.fonts.load('16px \"' + f + '\"')", face)
            assert csp.evaluate("f => document.fonts.check('16px \"' + f + '\"')", face), face + " loads from the bundle under font-src self"
        assert csp.locator(".figchat-head").evaluate("e => e.naturalWidth") > 0, "the mark loads under img-src self"
        csp.locator(".figchat-thread", has_text="Razors").tap()
        csp.wait_for_selector('#app[data-link="live"]')
        csp.locator(".figchat-voice").tap()
        csp.locator(".figchat-input").fill("over the wire")
        csp.locator(".figchat-send").tap()
        spoken = voce_of(csp, 6)
        csp.wait_for_selector('.figchat-msg[data-id="6"] .voce[data-state="live"]')
        csp.wait_for_selector('.figchat-msg[data-id="6"] .voce[data-state="idle"]', timeout=15000)
        assert csp.locator('.figchat-msg[data-id="6"] .figchat-text').text_content().endswith("sharp."), "deltas arrive over the real socket"
        assert spoken.locator(".voce-total").text_content() == "0:02", "PCM frames arrive over the real socket"
        spoken.locator(".voce-play").tap()
        csp.wait_for_selector('.figchat-msg[data-id="6"] .voce[data-state="playing"]')
        track = spoken.locator(".voce-seek").bounding_box()
        csp.touchscreen.tap(track["x"] + track["width"] * 0.5, track["y"] + track["height"] / 2)
        expect(spoken.locator(".voce-elapsed")).to_have_text("0:01")
        csp.wait_for_selector('.figchat-msg[data-id="6"] .voce[data-state="idle"]', timeout=8000)
        gone = voce_of(csp, 4)
        gone.locator(".voce-play").tap()
        csp.wait_for_selector('.figchat-msg[data-id="4"] .voce[data-state="expired"]')
        csp.locator(".figchat-mic").tap()
        csp.wait_for_selector('#app[data-mic="recording"]')
        csp.wait_for_timeout(400)
        csp.locator(".figchat-mic").tap()
        expect(csp.locator(".figchat-input")).to_have_value("A mock transcript.")
        seen = json.loads(urllib.request.urlopen(origin + "/__state").read())
        assert len(seen["clips"]) == 1 and seen["clips"][0]["type"].startswith("audio/webm") and seen["clips"][0]["size"] > 200, "the recording is POSTed as recorded: %s" % seen["clips"]
        assert seen["posts"] == [{"thread": "c0ffee01", "body": {"text": "over the wire"}}], seen["posts"]
        assert seen["received"] == [{"type": "voice", "on": True}], seen["received"]
        assert seen["upgrades"] == 1 and any(r.startswith("bytes=") for r in seen["ranges"]), seen
        assert "bytes=0-0" in seen["ranges"], "expiry is told from a one byte probe"
        assert csp.evaluate("window.__csp || []") == [] and not violations, (csp.evaluate("window.__csp"), violations)
        assert csp.evaluate("window.__mse") is None
        assert not csp.errors or all("404" in e for e in csp.errors), csp.errors
        csp.close()
    finally:
        if server:
            server.terminate()
        shutil.rmtree(bundle, ignore_errors=True)

    browser.close()

print("figchat: list, thread, replay scrubber, live PCM without MediaSource, hostile text, reconnect, paging, both widths, contrast, sabotage and the bundle under CSP pass")
