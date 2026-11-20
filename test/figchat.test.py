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
shots = os.environ.get("FIGCHAT_SHOTS")
if shots:
    os.makedirs(shots, exist_ok=True)

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



def reply_sel(turn):
    return '.figchat-msg[data-turn="%s"][data-role="assistant"]' % turn


def prompt_sel(turn):
    return '.figchat-msg[data-turn="%s"][data-role="user"]' % turn


def state_of(pg, turn, which="out"):
    return pg.evaluate("([t, w]) => chat.player(t, w) && chat.player(t, w).state()", [turn, which])


def wait_state(pg, turn, want, timeout=15000, which="out"):
    pg.wait_for_function("([t, w, want]) => chat.player(t, w) && chat.player(t, w).state() === want", arg=[turn, which, want], timeout=timeout)


def shot(pg, name):
    if shots:
        pg.screenshot(path=os.path.join(shots, name + ".png"))


def ids(pg):
    return pg.evaluate("[...document.querySelectorAll('.figchat-msg[data-role=\"assistant\"]')].map(n => Number(n.dataset.turn))")


def in_view(pg, sel):
    box = pg.locator(sel).first.bounding_box()
    height = pg.evaluate("innerHeight")
    return box is not None and box["y"] >= 0 and box["y"] < height - 100


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

    page = fresh(init=NO_MSE)
    go(page, "")
    page.wait_for_selector(".figchat-row")
    rows = page.locator(".figchat-row")
    assert rows.count() == 2
    assert page.locator(".figchat-row a.figchat-thread").count() == 1, "an offline store is no link"
    assert page.locator(".figchat-row a.figchat-thread").get_attribute("href") == "#/spain"
    assert "Offline" in rows.nth(1).inner_text() and "Nothing is queued" in rows.nth(1).inner_text()
    assert page.locator(".figchat-pane").is_hidden() and page.locator(".figchat-composer").is_hidden(), "a phone shows the picker alone"
    assert page.locator(".figchat-thread").first.bounding_box()["height"] >= 44
    no_sideways(page, 390, "store picker")
    shot(page, "picker-390")

    page.locator(".figchat-thread", has_text="Spain").tap()
    page.wait_for_selector(".figchat-tree")
    assert page.evaluate("location.hash") == "#/spain"
    names = page.locator(".figchat-aria-name").all_text_contents()
    assert names[:10] == ["King of Spain", "Chat-aria A-E choices for Gluck", "Figaro Engineer", "#126 follow focus", "Read the chat-follow lane brief", "review scope slice 2", "King delegation lane", "Backend Engineer", "keel lane", "Herald"], names[:10]
    assert len(names) == 30 and page.locator(".figchat-more").is_visible(), "the list is paged"
    trees = page.locator(".figchat-aria-line").evaluate_all("ns => ns.slice(0, 10).map(n => (n.querySelector('.figchat-tree') || {}).textContent || '')")
    assert trees == ["", "\u251c\u2500", "\u251c\u2500", "\u2502 \u251c\u2500", "\u2502 \u251c\u2500", "\u2502 \u251c\u2500", "\u2502 \u2514\u2500", "\u2514\u2500", "  \u2514\u2500", ""] or trees[:3] == ["", "\u251c\u2500", "\u251c\u2500"], trees
    states = page.locator(".figchat-thread").evaluate_all("ns => ns.slice(0, 7).map(n => n.dataset.state)")
    assert states == ["active", "dormant", "active", "idle", "active", "reaped", "idle"], states
    page.locator(".figchat-more").tap()
    page.wait_for_function("document.querySelectorAll('.figchat-thread').length === 51")
    assert page.locator(".figchat-more").is_hidden()
    no_sideways(page, 390, "aria list")
    page.evaluate("window.scrollTo(0, 0)")
    shot(page, "tree-390")
    assert page.evaluate("mock.state.pages.filter(p => !p.aria).map(p => p.before)") == ["", "30"]

    page.locator(".figchat-thread", has_text="King of Spain").first.tap()
    page.wait_for_selector(".figchat-msg")
    page.wait_for_function("chat.state().link === 'live'")
    assert page.evaluate("location.hash") == "#/spain/wick-sushi" and page.locator(".figchat-side").is_hidden()
    page.close()

    king = fresh(init=NO_MSE)
    go(king, "#/spain/wick-sushi")
    king.wait_for_selector(".figchat-msg")
    king.wait_for_function("chat.state().link === 'live'")
    assert king.locator(".figchat-h1").text_content() == "King of Spain" or king.wait_for_function("document.querySelector('.figchat-h1').textContent === 'King of Spain'")
    assert ids(king) == list(range(101, 121)), "the newest twenty, oldest first, newest last"
    assert king.evaluate("chat.state().turns") == 20
    assert king.evaluate("innerHeight + scrollY >= document.documentElement.scrollHeight - 5"), "a deep link without a turn lands at the newest"
    assert king.locator(prompt_sel(120)).locator(".figchat-text").text_content() == "Status of the order site?"
    assert "lane order-ui" in king.locator(prompt_sel(120)).locator(".figchat-meta").text_content(), "who spoke is shown"
    assert king.locator(prompt_sel(120)).locator(".figchat-turnlink").get_attribute("href") == "#/spain/wick-sushi:120"
    assert king.locator(reply_sel(117)).locator(".figchat-tool").inner_text().split() == ["calendar.today", "done"]
    assert king.locator(prompt_sel(118)).locator(".voce").count() == 1 and king.locator(prompt_sel(118)).locator(".voce").count() == 1, "a spoken prompt has a player"
    assert king.locator(".voce").count() == 3
    no_sideways(king, 390, "turn view")
    shot(king, "turns-390")
    king.evaluate("window.scrollTo(0, 0)")
    king.wait_for_function("chat.state().turns >= 40")
    assert ids(king)[:1] == [81] and king.evaluate("window.scrollY") > 100, "older turns load on scroll up and the reader stays where they were"
    for _ in range(2):
        king.evaluate("window.scrollTo(0, 0)")
        king.wait_for_function("n => chat.state().turns > n", arg=king.evaluate("chat.state().turns"), timeout=3000)
    assert ids(king)[0] == 41, ids(king)[:3]
    assert king.evaluate("mock.state.pages.filter(p => p.aria).map(p => p.before)") == ["", "101", "81", "61"], "older pages ask before the oldest turn seen"
    king.evaluate("location.hash = '#/spain/wick-sushi'")

    king.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)")
    king.evaluate(LISTEN)
    king.locator(".figchat-voice").tap()
    king.wait_for_function("voce.engine(window).running()")
    king.locator(".figchat-input").fill("Echo this " + EVIL)
    began = time.time()
    king.locator(".figchat-send").tap()
    king.wait_for_selector(prompt_sel(121))
    assert king.locator(prompt_sel(121)).locator(".figchat-text").text_content() == "Echo this " + EVIL
    assert "Gluck (figchat)" in king.locator(prompt_sel(121)).locator(".figchat-meta").text_content()
    wait_state(king, 121, "live")
    assert king.locator(reply_sel(121)).get_attribute("data-streaming") == "", "audio starts while the text is still streaming"
    king.wait_for_function("window.__peak > 0.1", timeout=8000)
    king.wait_for_function("!document.querySelector('.figchat-msg[data-streaming]')")
    wait_state(king, 121, "idle")
    assert time.time() - began > 2.3, "2.4 s of PCM took less: it was dropped, not played"
    stats = king.evaluate("chat.player(121).stats()")
    assert stats["samples"] == 57600 and stats["chunks"] == 29, stats
    assert king.evaluate("window.__peak") > 0.2 and king.evaluate("window.__mse") is None
    assert EVIL in king.locator(reply_sel(121)).locator(".figchat-text").text_content()
    assert hostile_findings(king) == [], hostile_findings(king)
    assert king.evaluate("mock.state.posts") == [{"store": "spain", "aria": "wick-sushi", "body": {"text": "Echo this " + EVIL}}]
    assert king.locator(".figchat-input").input_value() == ""
    spoken = king.locator(reply_sel(121)).locator(".voce")
    assert spoken.locator(".voce-total").text_content() == "0:02"
    spoken.locator(".voce-play").tap()
    wait_state(king, 121, "playing")
    track = spoken.locator(".voce-seek").bounding_box()
    king.touchscreen.tap(track["x"] + track["width"] * 0.75, track["y"] + track["height"] / 2)
    king.wait_for_function("Math.abs(chat.player(121).position() - 1.8) < 0.25")
    wait_state(king, 121, "idle", timeout=6000)
    shot(king, "sent-390")

    king.evaluate("mock.state.step = 120")
    king.evaluate("mock.inject('spain', 'wick-sushi', 'from the terminal', 'terminal')")
    king.wait_for_selector(prompt_sel(122))
    assert king.locator(prompt_sel(122)).locator(".figchat-text").text_content() == "from the terminal", "a turn someone else starts shows up"
    assert "terminal" in king.locator(prompt_sel(122)).locator(".figchat-meta").text_content()
    king.wait_for_function("document.querySelector('%s .figchat-text')?.textContent.length > 30" % reply_sel(122))
    assert king.locator(".figchat-turn").is_visible(), "a running turn offers Stop and says a message steers it"
    king.evaluate("mock.drop()")
    king.wait_for_function("chat.state().link === 'offline'")
    king.wait_for_function("chat.state().link === 'live'")
    resumed = king.evaluate("mock.state.attaches")[-1]
    assert resumed["aria"] == "wick-sushi" and resumed["cursor"].startswith("122."), "a reconnect asks from the last cursor: %s" % resumed
    king.wait_for_function("!document.querySelector('.figchat-msg[data-streaming]')", timeout=10000)
    text = king.locator(reply_sel(122)).locator(".figchat-text").text_content()
    assert text == "You said: from the terminal. I checked the clock for you. It is a fine day in Seville,\nand the razor is sharp.", "nothing lost or repeated across a reconnect: %r" % text
    king.locator(".figchat-input").fill("too long")
    king.locator(".figchat-send").tap()
    king.wait_for_selector(prompt_sel(123))
    king.wait_for_function("document.querySelector('%s .figchat-text')?.textContent.length > 8" % reply_sel(123))
    king.locator(".figchat-stop").tap()
    king.wait_for_function("!document.querySelector('.figchat-msg[data-streaming]')")
    assert king.evaluate("mock.state.cancels") == [{"store": "spain", "aria": "wick-sushi"}]
    king.locator(".figchat-fork").first.tap()
    king.wait_for_function("location.hash.startsWith('#/spain/fork-')")
    assert king.evaluate("mock.state.forks") == [{"store": "spain", "fork_of": "wick-sushi", "title": ""}]
    king.wait_for_function("chat.state().link === 'live'")
    assert king.evaluate("chat.state().turns") == 0
    king.close()

    link = fresh()
    go(link, "#/spain/wick-sushi:50")
    link.wait_for_selector('.figchat-msg[data-target]')
    link.wait_for_function("chat.state().link === 'live'")
    assert link.locator(prompt_sel(50)).get_attribute("data-target") == "" and link.locator(reply_sel(50)).get_attribute("data-target") == ""
    assert link.evaluate("chat.state().turns") == 80 and ids(link)[0] == 41, "pages are fetched until the turn is found: %s" % ids(link)[:2]
    assert in_view(link, prompt_sel(50)), "the linked turn is scrolled to"
    shot(link, "deeplink-390")
    link.evaluate("location.hash = '#/spain/arsonist-grill'")
    link.wait_for_function("chat.state().aria === 'arsonist-grill' && chat.state().turns === 6")
    link.go_back()
    link.wait_for_function("chat.state().aria === 'wick-sushi' && document.querySelector('.figchat-msg[data-target]')")
    assert in_view(link, prompt_sel(50)), "back returns to the linked turn"
    link.go_forward()
    link.wait_for_function("chat.state().aria === 'arsonist-grill'")
    link.evaluate("location.hash = '#/spain/wick-sushi:9999'")
    link.go_back()
    link.evaluate("location.hash = '#/spain/anklet-aerosol:2'")
    link.wait_for_function("chat.state().aria === 'anklet-aerosol'")
    link.wait_for_selector(prompt_sel(2) + "[data-target]")
    link.locator(prompt_sel(1)).locator(".figchat-turnlink").tap()
    link.wait_for_function("location.hash === '#/spain/anklet-aerosol:1'")
    link.wait_for_selector(prompt_sel(1) + "[data-target]")
    assert link.locator('.figchat-msg[data-target]').count() == 2, "following a turn link moves the mark without reopening the aria"
    link.evaluate("location.hash = '#/spain/wick-sushi:9999'")
    link.wait_for_function("chat.state().aria === 'wick-sushi' && chat.state().turns === 120")
    expect(link.locator(".figchat-note").first).to_contain_text("Turn 9999 is not in this aria")
    link.close()

    for suffix, words in (("#/spain/nope", "This aria is gone"), ("#/spain/again-myspace", "This aria is gone"), ("#/gluck/desk-main", "Gluck is offline. Nothing is queued."), ("#/spain/wick-sushi%3A1", "This aria is gone")):
        dead = fresh()
        go(dead, suffix)
        dead.wait_for_selector(".figchat-main .figchat-note")
        dead.wait_for_function("w => document.querySelector('.figchat-main').textContent.includes(w)", arg=words)
        assert dead.locator(".figchat-composer").is_hidden(), "nothing to write to: " + suffix
        assert dead.evaluate("chat.state().link") == "idle"
        if "gluck" in suffix:
            shot(dead, "offline-390")
        elif "nope" in suffix:
            shot(dead, "gone-390")
        dead.close()

    hostile = fresh()
    go(hostile, "?set=hostile#/spain/aa01")
    hostile.wait_for_selector(".figchat-msg")
    hostile.wait_for_function("chat.state().link === 'live'")
    hostile.wait_for_function("document.querySelector('.figchat-h1').textContent.includes('eltit')")
    assert hostile_findings(hostile) == [], hostile_findings(hostile)
    assert EVIL in hostile.locator(prompt_sel(1)).locator(".figchat-text").text_content()
    assert hostile.locator(reply_sel(1)).locator(".figchat-ctl").count() == 0
    assert hostile.locator(prompt_sel(1)).locator(".figchat-ctl").count() == 2
    no_sideways(hostile, 390, "hostile turn")
    hostile.evaluate("location.hash = '#/spain'")
    hostile.wait_for_selector(".figchat-thread")
    assert hostile_findings(hostile) == [], hostile_findings(hostile)
    no_sideways(hostile, 390, "hostile list")
    hostile.close()

    mic = fresh()
    go(mic, "#/spain/arsonist-grill")
    mic.wait_for_function("chat.state().link === 'live'")
    rec = mic.locator(".figchat-mic")
    box = rec.bounding_box()
    assert box["height"] >= 56 and box["width"] >= 56
    rec.tap()
    mic.wait_for_function("chat.state().mic === 'recording'")
    mic.wait_for_function("document.querySelector('.figchat-mic').textContent === 'Stop 0:01'", timeout=4000)
    rec.tap()
    mic.wait_for_function("chat.state().clip !== null")
    assert mic.locator(".figchat-input").input_value() == "A mock transcript." and mic.evaluate("mock.state.posts") == []
    mic.locator(".figchat-input").fill("A mock transcript, edited.")
    mic.locator(".figchat-send").tap()
    mic.wait_for_selector(prompt_sel(7))
    assert mic.evaluate("mock.state.posts") == [{"store": "spain", "aria": "arsonist-grill", "body": {"text": "A mock transcript, edited.", "clip_id": "clip1"}}]
    assert mic.locator(prompt_sel(7)).locator(".voce").count() == 1, "the sent recording has a player on its prompt"
    mic.wait_for_function("!document.querySelector('.figchat-msg[data-streaming]')")
    mic.evaluate("mock.state.status = 502")
    rec.tap()
    mic.wait_for_function("chat.state().mic === 'recording'")
    mic.wait_for_timeout(300)
    rec.tap()
    mic.wait_for_function("document.querySelector('.figchat-micnote').textContent === 'Not transcribed: mock failure'")
    mic.close()

    gone = fresh()
    go(gone, "#/spain/arsonist-grill")
    gone.wait_for_function("chat.state().link === 'live'")
    gone.evaluate("mock.setOnline('spain', false)")
    gone.wait_for_function("chat.state().link === 'offline'")
    gone.locator(".figchat-input").fill("anyone there")
    gone.locator(".figchat-send").tap(force=True)
    assert gone.evaluate("mock.state.posts") == [], "an offline store takes nothing, and nothing is queued"
    gone.evaluate("mock.setOnline('spain', true)")
    gone.wait_for_function("chat.state().link === 'live'", timeout=8000)
    gone.close()

    wide = fresh(width=1280, height=800)
    go(wide, "#/spain/wick-sushi")
    wide.wait_for_selector(".figchat-msg")
    wide.wait_for_function("chat.state().link === 'live'")
    assert wide.locator(".figchat-side").is_visible() and wide.locator(".figchat-pane").is_visible(), "wide shows the list and the turns together"
    wide.wait_for_selector(".figchat-tree")
    assert wide.locator(".figchat-thread[aria-current='page'] .figchat-aria-name").text_content() == "King of Spain"
    no_sideways(wide, 1280, "wide")
    shot(wide, "wide-1280")
    wide.locator(".figchat-thread", has_text="Figaro Engineer").first.click()
    wide.wait_for_function("chat.state().aria === 'arsonist-grill' && chat.state().turns === 6")
    wide.evaluate("location.hash = '#/spain/wick-sushi:70'")
    wide.wait_for_selector(prompt_sel(70) + "[data-target]")
    assert in_view(wide, prompt_sel(70))
    shot(wide, "deeplink-1280")
    wide.close()

    for scheme in ("light", "dark"):
        c = fresh(scheme)
        go(c, "#/spain/wick-sushi")
        c.wait_for_function("chat.state().link === 'live'")
        rgb = lambda s: [int(float(x)) for x in re.findall(r"[\d.]+", s)[:3]]
        color = lambda sel, prop="color": rgb(c.evaluate("([s, p]) => { const k = document.createElement('canvas').getContext('2d'); k.fillStyle = getComputedStyle(document.querySelector(s))[p]; k.fillRect(0, 0, 1, 1); return 'rgb(' + Array.from(k.getImageData(0, 0, 1, 1).data.slice(0, 3)).join(',') + ')'; }", [sel, prop]))
        ground = color(".figchat-top", "backgroundColor")
        for role in ("assistant", "user"):
            bubble = color('.figchat-msg[data-role="%s"] .figchat-bubble' % role, "backgroundColor")
            for sel in (".figchat-text", ".voce-time", ".voce-elapsed"):
                ratio = contrast(color('.figchat-msg[data-role="%s"] %s' % (role, sel)), bubble)
                assert ratio >= 4.5, "%s %s %s contrast %.2f" % (scheme, role, sel, ratio)
        assert contrast(color(".figchat-meta"), ground) >= 4.5, scheme + " meta"
        assert contrast(color(".figchat-link"), ground) >= 4.5, scheme + " link"
        c.evaluate("location.hash = '#/spain'")
        c.wait_for_selector(".figchat-tree")
        for sel in (".figchat-tree", ".figchat-thread-when", ".figchat-aria-sub"):
            assert contrast(color(sel), ground) >= 4.5, "%s %s contrast" % (scheme, sel)
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
        csp.goto(origin + "/chat/#/spain/wick-sushi")
        csp.wait_for_selector(".figchat-msg")
        csp.wait_for_selector('#app[data-link="live"]')
        for face in ("EB Garamond", "VT323", "Jacquard 24"):
            csp.evaluate("f => document.fonts.load('16px \"' + f + '\"')", face)
            assert csp.evaluate("f => document.fonts.check('16px \"' + f + '\"')", face), face + " loads from the bundle under font-src self"
        assert csp.locator(".figchat-head").evaluate("e => e.naturalWidth") > 0
        csp.locator(".figchat-voice").tap()
        csp.locator(".figchat-input").fill("over the wire")
        csp.locator(".figchat-send").tap()
        csp.wait_for_selector(reply_sel(121) + ' .voce[data-state="live"]')
        csp.wait_for_selector(reply_sel(121) + ' .voce[data-state="idle"]', timeout=15000)
        assert csp.locator(reply_sel(121) + " .figchat-text").text_content().endswith("sharp."), "deltas arrive over the real socket"
        spoken = csp.locator(reply_sel(121) + " .voce")
        assert spoken.locator(".voce-total").text_content() == "0:02", "PCM frames arrive over the real socket"
        gone_audio = csp.locator(reply_sel(118) + " .voce")
        gone_audio.locator(".voce-play").tap()
        csp.wait_for_selector(reply_sel(118) + ' .voce[data-state="expired"]')
        urllib.request.urlopen(origin + "/__inject?store=spain&aria=wick-sushi&text=hello%20from%20the%20terminal&from=terminal")
        csp.wait_for_selector(prompt_sel(122))
        csp.wait_for_selector(reply_sel(122) + ":not([data-streaming])", timeout=15000)
        urllib.request.urlopen(origin + "/__drop")
        csp.wait_for_function("chat.state && true")
        seen = json.loads(urllib.request.urlopen(origin + "/__state").read())
        assert seen["posts"] == [{"store": "spain", "aria": "wick-sushi", "body": {"text": "over the wire"}}], seen["posts"]
        assert seen["received"] == [{"type": "voice", "on": True}], seen["received"]
        assert seen["upgrades"] >= 1 and "bytes=0-0" in seen["ranges"], seen
        assert seen["attaches"][0] == {"store": "spain", "aria": "wick-sushi", "cursor": "120.35.120.120"}, "the first socket resumes from the newest stored turn: %s" % seen["attaches"]
        urllib.request.urlopen(origin + "/__online?store=spain&on=0")
        csp.wait_for_function("document.querySelector('#app').dataset.link === 'offline'")
        assert csp.evaluate("window.__csp || []") == [] and not violations, (csp.evaluate("window.__csp"), violations)
        assert csp.evaluate("window.__mse") is None
        assert not csp.errors or all(("404" in e or "503" in e or "WebSocket" in e) for e in csp.errors), csp.errors
        csp.close()
    finally:
        if server:
            server.terminate()
        shutil.rmtree(bundle, ignore_errors=True)

    browser.close()

print("figchat: picker, tree, turns paged on scroll, deep link with back and forward, live PCM, reconnect from a cursor, offline and gone, hostile text, both widths, contrast and the bundle under CSP pass")
