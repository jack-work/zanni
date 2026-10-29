"""filo in a real browser. The keymap and the one-seek-per-gesture rule, the
chrome's life (shown on pause, the bottom bar only while playing, gone on
idle, on the pointer leaving and on focus leaving), the fill following a drag,
the menu (speed, quality, sleep, chapters), help, fullscreen, thumbnails,
the audio card, touch, and detach putting the media element back."""
import os
import sys

from playwright.sync_api import sync_playwright

PAGE = "file://" + os.path.abspath(sys.argv[1])
MEDIA = "document.getElementById('media')"
ROOT = "document.querySelector('.filo')"


def now(pg):
    return pg.evaluate(f"{MEDIA}.currentTime")


def seeks(pg):
    return pg.evaluate("seeks.length")


def has(pg, cls):
    return pg.evaluate(f"{ROOT}.classList.contains('{cls}')")


def opacity(pg, sel):
    return float(pg.evaluate(f"getComputedStyle(document.querySelector('{sel}')).opacity"))


def events(pg, name):
    return pg.evaluate(f"events.filter(e => e[0] === '{name}').map(e => e[1])")


def wave_shown(pg, height, what):
    pg.wait_for_timeout(250)
    got = pg.evaluate("""() => { const c = document.querySelector('.filo-wave-lit'), w = document.querySelector('.filo-wave');
      const g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data; let ink = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i]) ink++;
      const b = w.getBoundingClientRect(), r = document.querySelector('.filo-play').getBoundingClientRect();
      return {display: getComputedStyle(w).display, h: Math.round(b.height), ink, clear: r.top >= b.bottom} }""")
    assert got["display"] == "block" and got["h"] == height, f"{what} shows a {height}px waveform, got {got}"
    assert got["ink"] > 200, f"{what} draws its waveform, got {got}"
    assert got["clear"], f"{what} keeps its controls below the waveform, got {got}"


def ready(pg, query=""):
    pg.goto(PAGE + query)
    pg.wait_for_function(f"window.player && {MEDIA}.readyState >= 1 && {MEDIA}.duration > 500")


def near(a, b, tol=0.6):
    return abs(a - b) <= tol


def settle(pg):
    pg.wait_for_timeout(500)


def at(pg, t):
    pg.evaluate(f"{MEDIA}.currentTime = {t}")
    pg.wait_for_function(f"Math.abs({MEDIA}.currentTime - {t}) < 0.5")
    pg.evaluate("seeks.length = 0")


def play(pg):
    pg.evaluate("player.toggle()")
    pg.wait_for_function(f"!{MEDIA}.paused")


def pause(pg):
    pg.evaluate(f"{MEDIA}.pause()")
    pg.wait_for_function(f"{MEDIA}.paused")


with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox", "--autoplay-policy=no-user-gesture-required"])
    pg = b.new_page(viewport={"width": 1000, "height": 760})
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    ready(pg)

    assert pg.evaluate(f"{MEDIA}.parentElement === {ROOT}"), "attach wraps the media element"
    assert not pg.evaluate(f"{MEDIA}.hasAttribute('controls')")
    assert pg.evaluate(f"{MEDIA}.paused"), "attaching never plays"
    assert has(pg, "filo-video") and has(pg, "filo-paused") and has(pg, "filo-active")
    assert opacity(pg, ".filo-center") == 1, "paused shows the centre cluster"
    first = pg.evaluate("""() => { const t = [...document.querySelectorAll('.filo [tabindex], .filo button, .filo input')]
      .filter(n => n.tabIndex >= 0 && n.offsetParent); return t[0] && t[0].className }""")
    assert "filo-track" in first, f"the scrubber is the first stop, got {first}"
    assert pg.evaluate("document.querySelector('.filo-track').getAttribute('role')") == "slider"
    text = pg.evaluate("document.querySelector('.filo-track').getAttribute('aria-valuetext')")
    assert text == "0:00 of 10:00, Sinfonia", text
    assert pg.locator(".filo-tick").count() == 3

    pg.keyboard.press("l")
    assert near(now(pg), 0), "a key previews before it seeks"
    fill = pg.evaluate("document.querySelector('.filo-played').style.transform")
    assert fill.startswith("scaleX(0.016"), f"the fill follows the held target, got {fill}"
    settle(pg)
    assert near(now(pg), 10) and seeks(pg) == 1

    at(pg, 100)
    for _ in range(6):
        pg.keyboard.press("l")
    settle(pg)
    assert near(now(pg), 160) and seeks(pg) == 1, f"six presses commit once: {now(pg)}, {seeks(pg)}"

    for key, start, want in [
        ("h", 100, 90), ("H", 100, 70), ("L", 100, 130),
        ("ArrowLeft", 100, 90), ("ArrowRight", 100, 110), ("Shift+ArrowRight", 100, 130),
        ("Alt+l", 100, 101), ("Alt+h", 100, 99), ("Control+l", 100, 101), ("Control+h", 100, 99),
    ]:
        at(pg, start)
        pg.keyboard.press(key)
        settle(pg)
        assert near(now(pg), want), f"{key} from {start}: {now(pg)}, want {want}"

    for key, start, want in [
        ("5", 100, 300), ("0", 100, 0), ("Shift+Digit6", 300, 0), ("Shift+Digit4", 100, 600),
        ("Home", 300, 0), ("End", 100, 600),
        ("]", 100, 120), ("]", 130, 300), ("[", 130, 120), ("[", 121, 0),
        ("PageDown", 100, 120), ("PageUp", 130, 120),
    ]:
        at(pg, start)
        pg.keyboard.press(key)
        assert near(now(pg), want), f"{key} from {start}: {now(pg)}, want {want}"
        assert seeks(pg) == 1

    for key, want in [("MediaRewind", 70), ("MediaFastForward", 130)]:
        at(pg, 100)
        pg.evaluate(f"document.body.dispatchEvent(new KeyboardEvent('keydown', {{key: '{key}', bubbles: true}}))")
        settle(pg)
        assert near(now(pg), want), f"{key}: {now(pg)}"

    pg.keyboard.press("m")
    assert pg.evaluate(f"{MEDIA}.muted")
    assert pg.evaluate("document.querySelector('.filo-mute').getAttribute('aria-label')") == "Unmute"
    pg.keyboard.press("m")
    assert not pg.evaluate(f"{MEDIA}.muted")

    pg.keyboard.press(">")
    assert pg.evaluate(f"{MEDIA}.playbackRate") == 1.25
    pg.keyboard.press("<")
    pg.keyboard.press("<")
    assert pg.evaluate(f"{MEDIA}.playbackRate") == 0.75
    assert [e["rate"] for e in events(pg, "filo:rate")] == [1.25, 1, 0.75]
    pg.evaluate("player.rate(1)")

    pg.keyboard.press("Space")
    pg.wait_for_function(f"!{MEDIA}.paused")
    pg.wait_for_function("document.querySelector('.filo-play').getAttribute('aria-label') === 'Pause'", timeout=2000)
    pg.keyboard.press("Space")
    pg.wait_for_function(f"{MEDIA}.paused")
    pg.evaluate("""() => { const e = new KeyboardEvent('keydown', {key: 'Unidentified', bubbles: true});
      Object.defineProperty(e, 'keyCode', {value: 179}); document.body.dispatchEvent(e); }""")
    pg.wait_for_function(f"!{MEDIA}.paused")
    pause(pg)

    at(pg, 100)
    pg.locator("#field").focus()
    pg.keyboard.type("hl5$ f?m")
    settle(pg)
    assert near(now(pg), 100) and seeks(pg) == 0, "typing in a field is never a seek"
    assert pg.evaluate("document.getElementById('field').value") == "hl5$ f?m"
    assert not pg.evaluate("player.open")

    ready(pg, "?autohide=300")
    box = pg.locator(".filo").bounding_box()
    pg.mouse.move(box["x"] + 200, box["y"] + 100)
    play(pg)
    pg.wait_for_function(f"!{ROOT}.classList.contains('filo-active')", timeout=3000)
    pg.wait_for_timeout(400)
    assert opacity(pg, ".filo-chrome") == 0, "idle while playing hides the chrome"
    pg.mouse.move(box["x"] + 260, box["y"] + 140)
    assert has(pg, "filo-active"), "the pointer brings the chrome back"
    pg.wait_for_timeout(400)
    assert opacity(pg, ".filo-center") == 0, "but not the centre cluster while playing"
    pg.wait_for_function(f"!{ROOT}.classList.contains('filo-active')", timeout=3000)
    pg.mouse.move(box["x"] + 300, box["y"] + 140)
    assert has(pg, "filo-active")
    pg.mouse.move(box["x"] + 300, box["y"] + box["height"] + 120)
    assert not has(pg, "filo-active"), "the pointer leaving hides it at once"
    pg.locator(".filo-track").focus()
    pg.keyboard.press("l")
    assert has(pg, "filo-active"), "a key brings it back"
    settle(pg)
    pg.locator("#field").focus()
    assert not has(pg, "filo-active"), "focus leaving hides it at once"
    pause(pg)
    assert has(pg, "filo-active"), "pausing shows it"
    pg.wait_for_timeout(700)
    assert has(pg, "filo-active") and opacity(pg, ".filo-center") == 1, "and it stays while paused"

    pg.evaluate("player.focus()")
    pg.keyboard.press("ArrowDown")
    assert not pg.evaluate("player.shown")
    pg.keyboard.press("ArrowUp")
    assert pg.evaluate("player.shown")
    pg.evaluate("player.focus()")
    pg.keyboard.press("ArrowDown")
    assert pg.evaluate("document.activeElement.className") == "filo-track", "hiding keeps focus on the stop"
    ring = "getComputedStyle(document.querySelector('.filo-rail')).outlineStyle"
    assert pg.evaluate(ring) == "solid", "a keyboard user sees the focus ring"
    pg.mouse.click(5, 5)
    pg.evaluate("player.focus()")
    assert pg.evaluate(ring) == "none", "after a tap or click the ring stays away"
    pg.keyboard.press("Shift")
    assert pg.evaluate(ring) == "solid", "and a key brings it back"
    pg.keyboard.press("ArrowUp")

    ready(pg)
    rail = pg.locator(".filo-rail").bounding_box()
    y = rail["y"] + rail["height"] / 2
    at(pg, 100)
    pg.mouse.move(rail["x"] + rail["width"] * 0.25, y)
    pg.mouse.down()
    pg.mouse.move(rail["x"] + rail["width"] * 0.5, y, steps=5)
    pg.mouse.move(rail["x"] + rail["width"] * 0.75, y, steps=5)
    assert near(now(pg), 100), "dragging previews, it does not seek"
    fill = pg.evaluate("document.querySelector('.filo-played').style.transform")
    assert fill.startswith("scaleX(0.7"), f"the fill follows the drag, got {fill}"
    assert pg.evaluate("document.querySelector('.filo-flag-time').textContent") == "7:30"
    pg.mouse.up()
    assert near(now(pg), 450, 2) and seeks(pg) == 1, f"one drag, one seek: {now(pg)}, {seeks(pg)}"

    pg.mouse.move(rail["x"] + rail["width"] * 0.1, y)
    assert has(pg, "filo-previewing"), "hover shows the flag"
    fill = pg.evaluate("document.querySelector('.filo-played').style.transform")
    assert fill.startswith("scaleX(0.75"), "hover does not move the fill"

    pg.locator(".filo-more").click()
    assert pg.evaluate("player.open")
    items = pg.locator(".filo-menu-item").all_text_contents()
    assert [i.split("\n")[0] for i in items][0].startswith("Speed"), items
    assert any(i.startswith("Quality") for i in items) and any(i.startswith("Chapters") for i in items), items
    pg.locator(".filo-menu-item", has_text="Speed").click()
    pg.locator(".filo-menu-item", has_text="1.5").click()
    assert pg.evaluate(f"{MEDIA}.playbackRate") == 1.5 and not pg.evaluate("player.open")
    pg.locator(".filo-more").click()
    pg.locator(".filo-menu-item", has_text="Quality").click()
    pg.locator(".filo-menu-item", has_text="720p").click()
    assert events(pg, "filo:quality") == [{"value": "720"}]
    pg.locator(".filo-more").click()
    pg.locator(".filo-menu-item", has_text="Quality").click()
    assert pg.locator(".filo-menu-item[aria-checked='true']").text_content() == "720p"
    pg.keyboard.press("Escape")
    assert pg.evaluate("player.open"), "Escape steps back to the top of the menu first"
    pg.keyboard.press("Escape")
    assert not pg.evaluate("player.open")
    pg.locator(".filo-more").click()
    pg.locator(".filo-menu-item", has_text="Chapters").click()
    pg.locator(".filo-menu-item", has_text="Temporale").click()
    assert near(now(pg), 480)
    pg.locator(".filo-more").click()
    pg.keyboard.press("ArrowDown")
    at_now = now(pg)
    pg.keyboard.press("ArrowRight")
    pg.keyboard.press("ArrowLeft")
    assert near(now(pg), at_now), "arrows inside the menu move through it, they do not seek"
    pg.mouse.click(box["x"] + 200, box["y"] + 100)
    assert not pg.evaluate("player.open"), "a click outside closes the menu"
    assert pg.evaluate(f"{MEDIA}.paused"), "and that click does not also play"

    pg.keyboard.press("?")
    assert pg.evaluate("player.open")
    rows = pg.locator(".filo-keys dt").count()
    assert rows == pg.evaluate("zanni.filo.shortcuts({step:10,big:30,fine:1}).length") and rows >= 12
    assert "Fullscreen" in pg.locator(".filo-help").text_content()
    pg.keyboard.press("Escape")
    assert not pg.evaluate("player.open")

    pg.keyboard.press("f")
    pg.wait_for_function("document.fullscreenElement === document.querySelector('.filo')", timeout=3000)
    assert has(pg, "filo-fullscreen")
    assert pg.evaluate("document.querySelector('.filo-full').getAttribute('aria-label')") == "Exit fullscreen"
    pg.keyboard.press("f")
    pg.wait_for_function("!document.fullscreenElement", timeout=3000)
    assert [e["on"] for e in events(pg, "filo:fullscreen")] == [True, False]

    ready(pg)
    at(pg, 118)
    pg.locator(".filo-more").click()
    pg.locator(".filo-menu-item", has_text="Sleep").click()
    pg.locator(".filo-menu-item", has_text="End of chapter").click()
    play(pg)
    pg.wait_for_function(f"{MEDIA}.paused", timeout=6000)
    assert now(pg) >= 120, "the sleep timer stops at the chapter's end"

    ready(pg, "?thumbs=1")
    pg.wait_for_timeout(300)
    rail = pg.locator(".filo-rail").bounding_box()
    pg.mouse.move(rail["x"] + rail["width"] * 0.5, rail["y"] + 2)
    assert has(pg, "filo-framed"), "a thumbnail cue shows in the flag"
    frame = pg.evaluate("[document.querySelector('.filo-frame').style.backgroundPosition, document.querySelector('.filo-frame').style.width]")
    assert frame == ["0px -270px", "160px"], frame

    ready(pg, "?keys=focus")
    pg.keyboard.press("l")
    settle(pg)
    assert near(now(pg), 0) and seeks(pg) == 0, "without global keys the page keeps its keys"
    pg.evaluate("player.focus()")
    pg.keyboard.press("l")
    settle(pg)
    assert near(now(pg), 10)

    pg.evaluate("player.stop()")
    assert pg.evaluate(f"{MEDIA}.paused") and not pg.evaluate("player.shown")
    assert len(events(pg, "filo:stop")) == 1
    parent = pg.evaluate(f"{MEDIA}.parentElement.id")
    pg.evaluate("player.detach()")
    assert pg.evaluate(f"{MEDIA}.parentElement.id") == "stage", "detach puts the media element back"
    assert pg.evaluate("document.querySelectorAll('.filo, .filo-chrome').length") == 0
    assert parent == "", parent

    pg.goto(PAGE)
    pg.evaluate("""() => { const s = document.getElementById('stage'); s.textContent = '';
      const box = document.createElement('section'); box.id = 'cast'; box.className = 'cast'; box.setAttribute('data-filo', '');
      const v = document.createElement('video'); box.appendChild(v); s.appendChild(box);
      window.h2 = zanni.filo.attach(v, {fill: true}); }""")
    assert pg.evaluate("h2.root.id") == "cast", "a data-filo parent is the box"
    pg.evaluate("""() => { const st = document.createElement('style');
      st.textContent = '#stage{height:600px} .cast{position:fixed;inset:0}'; document.head.prepend(st); }""")
    pos = pg.evaluate("[getComputedStyle(h2.root).position, h2.media.getBoundingClientRect().top]")
    assert pos == ["fixed", 0], f"the page's own position for its box wins over filo's, got {pos}"
    pg.evaluate("h2.detach()")
    assert pg.evaluate("document.querySelector('#cast > video') !== null && !document.querySelector('#cast').classList.contains('filo')")

    ready(pg, "?kind=audio")
    assert has(pg, "filo-audio") and pg.evaluate("player.shown")
    for sel, want in [(".filo-back-big", 70), (".filo-fwd-big", 130)]:
        at(pg, 100)
        assert pg.evaluate(f"getComputedStyle(document.querySelector('{sel}')).display") != "none", f"the audio card shows {sel}"
        pg.locator(sel).click()
        settle(pg)
        assert near(now(pg), want), f"{sel}: {now(pg)}"
    pg.evaluate("player.toggle()")
    pg.wait_for_function(f"!{MEDIA}.paused")
    pg.wait_for_timeout(3000)
    assert pg.evaluate("player.shown"), "the audio card never hides itself"
    stops = pg.evaluate("""() => [...document.querySelectorAll('.filo button, .filo [tabindex]')]
      .filter(n => n.tabIndex >= 0 && n.offsetParent).map(n => n.className.replace('filo-button ', ''))""")
    assert stops[0] == "filo-track" and "filo-play" in stops and "filo-full" not in stops, stops
    pause(pg)

    ready(pg)
    pg.evaluate("player.root.style.top = '5px'")
    play(pg)
    pg.evaluate("player.dock(true)")
    assert pg.evaluate("player.docked") and has(pg, "filo-docked")
    geo = pg.evaluate("""() => { const r = player.root.getBoundingClientRect(); const cs = getComputedStyle(player.root);
      return [cs.position, Math.round(r.bottom), Math.round(r.height), getComputedStyle(document.documentElement).getPropertyValue('--filo-dock-height').trim(),
        player.root.style.zIndex] }""")
    assert geo == ["fixed", 760, 72, "72px", "var(--filo-dock-z, 50)"], f"docked is a 72px bar on the bottom edge, got {geo}"
    assert events(pg, "filo:dock") == [{"on": True}]
    t0 = now(pg)
    pg.wait_for_timeout(700)
    assert not pg.evaluate(f"{MEDIA}.paused") and now(pg) > t0, "docking keeps playing the same element"
    tile = pg.evaluate(f"{MEDIA}.getBoundingClientRect().height")
    assert 60 <= tile <= 72, f"the video is a tile in the bar, got {tile}"
    pg.wait_for_timeout(3000)
    assert pg.evaluate("player.shown"), "the bar never hides itself"
    pg.evaluate("document.activeElement && document.activeElement.blur()")
    at(pg, 100)
    pg.keyboard.press("l")
    settle(pg)
    assert seeks(pg) == 0, "docked, filo takes no global keys"
    esc = pg.evaluate("""() => { const e = new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true});
      document.body.dispatchEvent(e); return e.defaultPrevented }""")
    assert esc is False, "docked, Escape is the page's"
    pg.evaluate("player.focus()")
    pg.keyboard.press("l")
    settle(pg)
    assert seeks(pg) == 1, "focus inside the bar still seeks"
    pg.locator(".filo-expand").click()
    pg.locator("#media").click()
    assert len(events(pg, "filo:expand")) == 2, "expand and a tap on the tile both ask the page to expand"
    assert not pg.evaluate(f"{MEDIA}.paused"), "a tap on the tile does not pause"
    pg.evaluate("player.setItem({title: 'Next', chapters: []})")
    assert pg.evaluate("player.docked"), "a new item loads in place"
    pg.evaluate("player.dock(false)")
    after = pg.evaluate("[player.root.style.top, player.root.style.position, getComputedStyle(document.documentElement).getPropertyValue('--filo-dock-height')]")
    assert after == ["5px", "", ""], f"undocking restores the page's inline style, got {after}"
    pg.evaluate("player.dock(true)")
    pg.locator(".filo-close").click()
    assert len(events(pg, "filo:stop")) == 1 and pg.evaluate(f"{MEDIA}.paused")
    pg.evaluate("player.detach()")
    assert pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--filo-dock-height')") == ""

    ready(pg, "?kind=audio&wave=1")
    assert has(pg, "filo-waved") and pg.evaluate("getComputedStyle(document.querySelector('.filo-wave')).display") == "block"
    ink = pg.evaluate("""() => { const c = document.querySelector('.filo-wave-lit'); const g = c.getContext('2d');
      const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n }""")
    assert ink > 1000, f"the waveform is drawn, {ink} lit pixels"
    h = pg.evaluate("Math.round(document.querySelector('.filo-rail').getBoundingClientRect().height)")
    assert h == 48, f"the audio card's waveform is 48px tall, got {h}"
    at(pg, 300)
    pg.wait_for_timeout(200)
    clip = pg.evaluate("document.querySelector('.filo-wave-lit').style.clipPath")
    assert clip.startswith("inset(0px 50%") or clip.startswith("inset(0 50%"), f"the lit half follows the time, got {clip}"
    rail = pg.locator(".filo-rail").bounding_box()
    pg.mouse.move(rail["x"] + rail["width"] * 0.75, rail["y"] + rail["height"] / 2)
    assert pg.evaluate("document.querySelector('.filo-flag-time').textContent") == "7:30", "the flag reads the waveform's time"
    pg.evaluate("player.dock(true)")
    pg.wait_for_timeout(250)
    assert pg.evaluate("getComputedStyle(document.querySelector('.filo-wave')).display") == "none", "the docked bar keeps its thin line"
    assert pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--filo-dock-height')") == "72px"
    pg.evaluate("player.dock(false)")

    ready(pg, "?bar=1&wave=1")
    assert pg.evaluate("getComputedStyle(document.querySelector('.filo-wave')).display") == "none", "video never shows the waveform"
    assert not has(pg, "filo-theater") and has(pg, "filo-barred"), "video keeps its bar"

    ready(pg, "?kind=audio&bar=1&wave=1&kicker=cs7641&title=OL%20overview")
    assert has(pg, "filo-theater") and not has(pg, "filo-barskin"), "audio under bar: true is the theater panel, not a bar"
    wave_shown(pg, 72, "the theater")
    lay = pg.evaluate("""() => { const r = s => document.querySelector(s).getBoundingClientRect();
      const art = r('.filo-art'), title = r('.filo-title'), wave = r('.filo-wave'), play = r('.filo-play'), chips = r('.filo-extras');
      return { artLeft: art.right <= title.left, artSquare: Math.round(art.width) === Math.round(art.height) && Math.round(art.width) === 220,
        order: title.bottom <= wave.top && wave.bottom <= play.top && play.bottom <= chips.top,
        playCentered: Math.abs((play.left + play.right) / 2 - (wave.left + wave.right) / 2) < 3,
        kicker: document.querySelector('.filo-kicker').textContent, face: getComputedStyle(document.querySelector('.filo-title')).fontFamily,
        speed: document.querySelector('.filo-speed').textContent, sleep: document.querySelector('.filo-sleep').textContent,
        more: document.querySelector('.filo-more').parentElement.className, mark: document.querySelector('.filo-art').textContent } }""")
    assert lay["artLeft"] and lay["artSquare"], f"a 220px square of artwork sits left of the text, got {lay}"
    assert lay["order"] and lay["playCentered"], f"title, waveform, transport, chips stack in order, play under the waveform's middle, got {lay}"
    assert lay["kicker"] == "cs7641" and "Jacquard" in lay["face"] and lay["mark"] == "OL", f"kicker, display title, and a mark without artwork, got {lay}"
    assert lay["speed"] == "1\u00d7" and lay["sleep"] == "sleep \u00b7 off" and lay["more"] == "filo-extras", f"speed and sleep chips, then the menu, got {lay}"
    pg.locator(".filo-speed").click()
    assert pg.evaluate("player.open") and "Speed" in pg.evaluate("document.querySelector('.filo-menu').textContent"), "the speed chip opens the speed list"
    pg.keyboard.press("Escape")
    pg.evaluate("player.rate(1.25)")
    pg.wait_for_function("document.querySelector('.filo-speed').textContent === '1.25\u00d7'", timeout=3000)
    pg.locator(".filo-collapse").click()
    assert pg.evaluate("player.docked") and not has(pg, "filo-theater"), "the collapse button docks the player"
    assert pg.evaluate("getComputedStyle(document.querySelector('.filo-wave')).display") == "none", "and the docked bar has no waveform"
    assert pg.evaluate("document.querySelector('.filo-more').parentElement.className") == "filo-row", "the menu goes back to the bar"
    pg.evaluate("player.dock(false)")
    assert has(pg, "filo-theater"), "undocked, the theater returns"

    ph2 = b.new_page(viewport={"width": 390, "height": 800})
    ready(ph2, "?kind=audio&bar=1&wave=1&title=OL%20overview")
    ph2.wait_for_timeout(250)
    narrow = ph2.evaluate("""() => { const r = s => document.querySelector(s).getBoundingClientRect(); const box = r('.filo');
      return { art: Math.round(r('.filo-art').width), above: r('.filo-art').bottom <= r('.filo-title').top, h: Math.round(r('.filo-wave').height),
        inside: [...document.querySelectorAll('.filo-wave, .filo-remaining, .filo-fwd-big, .filo-extras')].every(n => { const q = n.getBoundingClientRect(); return q.right <= box.right + 0.5 && q.left >= box.left - 0.5 }) } }""")
    assert narrow == {"art": 140, "above": True, "h": 56, "inside": True}, f"a phone stacks a 140px art over the text and fits the box, got {narrow}"
    ph2.close()
    pg.evaluate("player.setItem({title: 'next', waveform: null})")
    assert not has(pg, "filo-waved"), "an item without a waveform gets the plain bar"

    ready(pg, "?kind=audio&tag=video&docked=1")
    assert pg.evaluate(f"getComputedStyle({MEDIA}).display") == "none", "docked audio in a <video> element draws no tile"
    ready(pg, "?kind=audio&docked=1")
    assert pg.evaluate("player.docked"), "audio can start docked"
    assert pg.evaluate("events.filter(e => e[0] === 'filo:dock').length") == 1
    assert pg.evaluate("getComputedStyle(document.querySelector('.filo-play')).display") != "none"
    assert pg.evaluate("player.root.getBoundingClientRect().height") == 72

    ready(pg, "?bar=1")
    assert has(pg, "filo-barred") and has(pg, "filo-barskin") and not has(pg, "filo-docked")
    geo = pg.evaluate("""() => { const v = player.media.getBoundingClientRect(), r = player.root.getBoundingClientRect(),
      row = document.querySelector('.filo-row').getBoundingClientRect(); return [Math.round(r.bottom - v.bottom), row.top >= v.bottom - 1] }""")
    assert geo[0] in (70, 72) and geo[1], f"the watch layout puts the bar under the picture, got {geo}"
    assert opacity(pg, ".filo-center") == 0 or pg.evaluate("getComputedStyle(document.querySelector('.filo-center')).display") == "none"
    play(pg)
    pg.wait_for_timeout(3000)
    assert pg.evaluate("player.shown"), "the watch bar never hides"
    pg.locator("#media").click()
    pg.wait_for_function(f"{MEDIA}.paused")
    pg.evaluate("player.dock(true)")
    assert has(pg, "filo-docked") and not has(pg, "filo-barred")
    pg.evaluate("player.dock(false)")
    assert has(pg, "filo-barred"), "undocking returns to the watch layout"

    ready(pg, "?bar=1&autohide=300")
    play(pg)
    pg.keyboard.press("f")
    pg.wait_for_function("document.fullscreenElement === document.querySelector('.filo')", timeout=3000)
    assert not has(pg, "filo-barred") and not has(pg, "filo-barskin"), "fullscreen from the watch layout is the overlay player"
    assert pg.evaluate("getComputedStyle(document.querySelector('.filo-chrome')).position") == "absolute"
    v = pg.evaluate("[player.media.getBoundingClientRect().height, innerHeight]")
    assert v[0] == v[1], f"the picture takes the whole screen, got {v}"
    pg.wait_for_function(f"!{ROOT}.classList.contains('filo-active')", timeout=3000)
    pg.keyboard.press("f")
    pg.wait_for_function("!document.fullscreenElement", timeout=3000)
    assert has(pg, "filo-barred") and pg.evaluate("player.shown"), "leaving fullscreen returns to the watch layout, bar showing"
    pause(pg)

    ctx = b.new_context(has_touch=True, viewport={"width": 390, "height": 800})
    ph = ctx.new_page()
    ready(ph, "?autohide=300")
    ph.evaluate("player.toggle()")
    ph.wait_for_function(f"!{MEDIA}.paused")
    ph.wait_for_function(f"!{ROOT}.classList.contains('filo-active')", timeout=3000)
    assert ph.evaluate("getComputedStyle(document.querySelector('.filo-chrome')).pointerEvents") == "none", "a hidden bar takes no pointer"
    box = ph.locator(".filo").bounding_box()
    ph.touchscreen.tap(box["x"] + 100, box["y"] + 40)
    assert ph.evaluate(f"{ROOT}.classList.contains('filo-active')") and not ph.evaluate(f"{MEDIA}.paused"), "a tap shows the chrome and does not pause"
    rail = ph.locator(".filo-rail").bounding_box()
    ph.evaluate("seeks.length = 0")
    ph.touchscreen.tap(rail["x"] + rail["width"] * 0.5, rail["y"] + rail["height"] / 2)
    ph.wait_for_function(f"Math.abs({MEDIA}.currentTime - 300) < 3")
    assert ph.evaluate("seeks.length") == 1
    assert ph.evaluate("getComputedStyle(document.querySelector('.filo-track')).touchAction") == "pan-y"
    ph.evaluate("player.dock(true)")
    assert ph.evaluate("player.root.getBoundingClientRect().height") == 64, "a phone gets a 64px bar"
    ctx.close()

    lk = b.new_page(viewport={"width": 1000, "height": 760})
    lk.on("pageerror", lambda e: errors.append(str(e)))
    lk.add_init_script("""
      window.vis = 'visible';
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.vis });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.vis === 'hidden' });
      window.lockScreen = {};
      if (navigator.mediaSession) {
        const set = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);
        navigator.mediaSession.setActionHandler = (a, fn) => { window.lockScreen[a] = fn; set(a, fn); };
        window.positions = [];
        const pos = navigator.mediaSession.setPositionState.bind(navigator.mediaSession);
        navigator.mediaSession.setPositionState = (s) => { window.positions.push(s); pos(s); };
      }
    """)

    def flip(page, state):
        page.evaluate(f"window.vis = '{state}'; document.dispatchEvent(new Event('visibilitychange'))")

    ready(lk, "?background=1&session=1")
    assert lk.evaluate("navigator.mediaSession.metadata.title") == "Il barbiere di Siviglia", "the lock screen gets the title"
    assert lk.evaluate("navigator.mediaSession.metadata.artist") == "Sinfonia", "and the chapter"
    assert lk.evaluate("Object.keys(lockScreen).filter(a => lockScreen[a]).sort()") == sorted(
        ["play", "pause", "seekbackward", "seekforward", "seekto", "previoustrack", "nexttrack"]), "every lock screen action is wired"
    at(lk, 100)
    lk.locator(".filo-play").click()
    lk.wait_for_function(f"!{MEDIA}.paused")
    lk.wait_for_function("navigator.mediaSession.playbackState === 'playing'", timeout=3000)
    assert lk.evaluate("document.querySelector('audio.filo-background') && document.querySelector('audio.filo-background').paused"), \
        "the tap that starts playback unlocks a paused background audio element"
    lk.wait_for_timeout(400)
    t0 = lk.evaluate(f"{MEDIA}.currentTime")
    flip(lk, "hidden")
    lk.wait_for_function("player.background && !player.media.paused", timeout=5000)
    got = lk.evaluate(f"""() => ({{ tag: player.media.tagName, video: {MEDIA}.paused, at: player.media.currentTime,
      state: navigator.mediaSession.playbackState, playing: document.querySelector('.filo').classList.contains('filo-paused') }})""")
    assert got["tag"] == "AUDIO" and got["video"], f"hidden, the audio element plays and the video rests, got {got}"
    assert abs(got["at"] - t0) <= 1, f"the sound picks up where the picture was, {t0} vs {got}"
    assert got["state"] == "playing" and not got["playing"], f"one playing state through the handoff, got {got}"
    lk.evaluate("lockScreen.seekto({ seekTime: 300 })")
    lk.wait_for_function("Math.abs(player.media.currentTime - 300) < 1")
    assert lk.evaluate("document.querySelector('.filo-track').getAttribute('aria-valuenow')") in ("300", "301"), "the bar follows the sound"
    assert near(lk.evaluate("positions[positions.length - 1].position"), 300, 1.2), "the lock screen's position follows the seek"
    lk.evaluate("lockScreen.nexttrack()")
    lk.wait_for_function("Math.abs(player.media.currentTime - 480) < 1")
    flip(lk, "visible")
    lk.wait_for_function(f"!player.background && !{MEDIA}.paused", timeout=5000)
    back = lk.evaluate(f"[{MEDIA}.currentTime, document.querySelector('audio.filo-background').paused, navigator.mediaSession.playbackState]")
    assert abs(back[0] - 480) <= 1 and back[1] and back[2] == "playing", f"visible again, the picture resumes from the sound's place, got {back}"
    assert [e["on"] for e in events(lk, "filo:background")] == [True, False]

    lk.evaluate("lockScreen.pause()")
    lk.wait_for_function(f"{MEDIA}.paused")
    flip(lk, "hidden")
    lk.wait_for_timeout(400)
    assert not lk.evaluate("player.background"), "a paused player stays where it is when hidden"
    flip(lk, "visible")

    ready(lk, "?background=broken")
    lk.locator(".filo-play").click()
    lk.wait_for_function(f"!{MEDIA}.paused")
    flip(lk, "hidden")
    lk.wait_for_timeout(800)
    assert not lk.evaluate("player.background") and not lk.evaluate(f"{MEDIA}.paused"), "a background that cannot play leaves the video as it was"
    flip(lk, "visible")

    ready(lk, "")
    lk.locator(".filo-play").click()
    flip(lk, "hidden")
    lk.wait_for_timeout(300)
    assert not lk.evaluate("document.querySelector('audio.filo-background')") and not lk.evaluate("player.background"), "no background, no handoff"
    flip(lk, "visible")
    lk.close()

    assert not errors, errors
    b.close()
print("filo: ok")
