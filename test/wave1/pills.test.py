"""Bug 2, the composer pills: each pill does its pager action when clicked or tapped.

Pager equivalents (figaro 0.80.0):
  send     `>` then alt+enter, ctrl+enter or ctrl+s sends the draft as a qua
           (internal/cli/compose.go:51)
  command  `:` opens the command line in the footer, Escape leaves it
  attach   the pager has no interactive attach; `figaro send --image <file>
           -- <text>` carries images on the qua (internal/cli/prompt_image.go)
Run in Chromium with a mouse and in WebKit as an iPhone with touch taps.
"""
import os
import tempfile

from kit import Door, Report, bundle_arg, until

from playwright.sync_api import sync_playwright

MAIN = "c0ffee01" * 4
PNG = bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010806000000" "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082")


def main():
    bundle = bundle_arg()
    rep = Report("wave1 pills")
    door = Door(bundle, 15)
    img = os.path.join(tempfile.mkdtemp(), "dot.png")
    with open(img, "wb") as fh:
        fh.write(PNG)
    try:
        with sync_playwright() as p:
            setups = [
                ("chromium 1280", p.chromium, {"viewport": {"width": 1280, "height": 800}}, False),
                ("webkit iphone", p.webkit, dict(p.devices["iPhone 13"]), True),
            ]
            for name, engine, opts, touch in setups:
                browser = engine.launch()
                ctx = browser.new_context(**opts)
                pg = ctx.new_page()

                def press(sel):
                    loc = pg.locator(sel)
                    if touch:
                        loc.tap(timeout=3000)
                    else:
                        loc.click(timeout=3000)

                def ready():
                    pg.goto(door.url + "#/gluck/" + MAIN)
                    until(pg, "document.querySelector('.fw') && document.querySelector('.fw').dataset.link === 'live'", 15000)
                    pg.wait_for_selector(".zr-composer .zr-input")
                    pg.wait_for_timeout(800)

                def send():
                    ready()
                    text = "pill send from " + name
                    pg.locator(".zr-input").fill(text)
                    press(".zr-send")
                    end = 0
                    for _ in range(60):
                        if any(s["text"] == text for s in door.state()["sent"]):
                            end = 1
                            break
                        pg.wait_for_timeout(100)
                    rep.check(end == 1, "%s: the send pill puts a figaro.qua with the draft on the door" % name)
                    rep.check(pg.locator(".zr-input").input_value() == "", "%s: the draft clears after the send pill" % name)

                rep.run("%s: send pill sends" % name, send)

                def command():
                    ready()
                    pill = pg.locator(".zr-command")
                    rep.check(pill.count() == 1, "%s: the command pill is rendered" % name)
                    rep.check(pill.is_enabled(), "%s: the command pill is enabled (a rendered pill must act)" % name)
                    press(".zr-command")
                    pg.wait_for_timeout(200)
                    rep.check(pg.locator(".zr-composer[data-mode='command']").count() == 1, "%s: the command pill puts the composer in command mode (data-mode=command)" % name)
                    rep.check(pill.get_attribute("aria-pressed") == "true", "%s: the command pill reads pressed in command mode" % name)
                    rep.check(pg.evaluate("document.activeElement && document.activeElement.classList.contains('zr-input')"), "%s: command mode focuses the input" % name)
                    press(".zr-command")
                    pg.wait_for_timeout(200)
                    rep.check(pg.locator(".zr-composer[data-mode='command']").count() == 0, "%s: a second press leaves command mode" % name)
                    rep.check(pill.get_attribute("aria-pressed") == "false", "%s: the command pill reads unpressed after the second press" % name)

                rep.run("%s: command pill toggles command mode" % name, command)

                def attach():
                    ready()
                    pill = pg.locator(".zr-attach")
                    rep.check(pill.count() == 1 and pill.is_enabled(), "%s: the attach pill is rendered and enabled" % name)
                    with pg.expect_file_chooser(timeout=3000) as fc:
                        press(".zr-attach")
                    fc.value.set_files(img)
                    text = "with a picture from " + name
                    pg.locator(".zr-input").fill(text)
                    press(".zr-send")
                    for _ in range(60):
                        hit = [s for s in door.state()["sent"] if s["text"] == text]
                        if hit:
                            break
                        pg.wait_for_timeout(100)
                    rep.check(hit and hit[0].get("images") == 1, "%s: the chosen picture rides the qua as one image: %s" % (name, hit))

                rep.run("%s: attach pill opens the picker and the picture is sent" % name, attach)
                ctx.close()
                browser.close()
    finally:
        door.stop()
    rep.finish()


main()
