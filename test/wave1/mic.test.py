"""C1, live transcription capture: what the page sends the speech gateway.

Chromium runs with a fake capture device that loops a 48 kHz file holding a
1 kHz tone and a 12 kHz tone (a 12 kHz tone folds to 4 kHz when 48 kHz is
decimated to 16 kHz without a low-pass). Every binary frame the page sends on
/stt/stream is collected and analysed: frame size and count against wall
time, level, and the energy at 1 kHz and at the 4 kHz alias.
"""
import math
import os
import struct
import tempfile
import time

from kit import Door, Report, bundle_arg, draft, until, voice_on

from playwright.sync_api import sync_playwright

MAIN = "c0ffee01" * 4
RATE = 48000

TAP = """
(() => {
  window.__frames = [];
  const send = WebSocket.prototype.send;
  WebSocket.prototype.send = function (d) {
    if (/stt\\/stream/.test(this.url) && typeof d !== 'string') window.__frames.push({ t: performance.now(), pcm: Array.from(new Int16Array(d.buffer ? d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) : d)) });
    return send.call(this, d);
  };
})();
"""


def wav(path, seconds=6):
    n = RATE * seconds
    body = b"".join(struct.pack("<h", int(9000 * math.sin(2 * math.pi * 1000 * i / RATE) + 9000 * math.sin(2 * math.pi * 12000 * i / RATE))) for i in range(n))
    hdr = b"RIFF" + struct.pack("<I", 36 + len(body)) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, RATE, RATE * 2, 2, 16) + b"data" + struct.pack("<I", len(body))
    with open(path, "wb") as fh:
        fh.write(hdr + body)


def goertzel(samples, hz, rate=16000):
    k = 2 * math.cos(2 * math.pi * hz / rate)
    a = b = 0.0
    for v in samples:
        a, b = v + k * a - b, a
    power = a * a + b * b - k * a * b
    return math.sqrt(max(power, 0)) / len(samples)


def main():
    bundle = bundle_arg()
    rep = Report("wave1 mic capture")
    door = Door(bundle, 15)
    path = os.path.join(tempfile.mkdtemp(), "tones.wav")
    wav(path)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--use-file-for-fake-audio-capture=" + path])
            ctx = browser.new_context(viewport={"width": 1280, "height": 800}, permissions=["microphone"])
            ctx.add_init_script(TAP)
            pg = ctx.new_page()

            def run():
                pg.goto(door.url + "#/gluck/" + MAIN)
                until(pg, "document.querySelector('.fw') && document.querySelector('.fw').dataset.link === 'live'", 15000)
                voice_on(pg)
                pg.wait_for_timeout(600)
                pg.locator(".fw-mic").click()
                until(pg, "document.querySelector('.fw').dataset.mic === 'recording'", 10000)
                t0 = time.time()
                pg.wait_for_timeout(3000)
                wall = time.time() - t0
                frames = pg.evaluate("window.__frames")
                pg.locator(".fw-mic").click()
                rep.check(len(frames) > 0, "frames reached the gateway")
                rep.check(all(len(f["pcm"]) == 640 for f in frames), "every frame is 640 samples (40 ms at 16 kHz)")
                rep.check(abs(len(frames) * 0.04 - wall) < 0.6, "audio time %.2f s tracks wall time %.2f s" % (len(frames) * 0.04, wall))
                samples = [v / 32768.0 for f in frames[10:] for v in f["pcm"]]
                low, alias = goertzel(samples, 1000), goertzel(samples, 4000)
                rep.note("1 kHz %.4f, 4 kHz alias %.4f over %d frames" % (low, alias, len(frames)))
                rep.check(low > 0.02, "the 1 kHz tone arrives: %.4f" % low)
                rep.check(alias < low * 0.05, "a 12 kHz tone does not fold into 4 kHz: %.4f against %.4f" % (alias, low))

            rep.run("fake 48 kHz capture", run)
            ctx.close()
            browser.close()
    finally:
        door.stop()
    rep.finish()


main()
