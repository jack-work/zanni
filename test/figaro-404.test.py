"""pages/figaro-404.html is the edge's denied-page 404: rebuilt it is the same
bytes; it holds one style block, one script block, no style attribute, no
handler attribute and nothing but data: URIs; it names no person, site or host;
in Chromium it makes no request, starts on a random remark and moves to the
next on a tap; under reduced motion the bubble is still."""
import json
import os
import re
import subprocess
import sys
import tempfile

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = os.path.join(ROOT, "pages", "figaro-404.html")
LINES = json.load(open(os.path.join(ROOT, "assets", "parla", "not-here.json")))
html = open(PAGE, encoding="utf-8").read()


def breaches(doc):
    found = []
    if len(re.findall(r"<style\b", doc)) != 1:
        found.append("not exactly one style block")
    if len(re.findall(r"<script\b", doc)) != 1:
        found.append("not exactly one script block")
    if re.search(r"<script\b[^>]*\bsrc=", doc):
        found.append("a script from elsewhere")
    if re.search(r"\sstyle=", doc):
        found.append("a style attribute")
    if re.search(r"\son[a-z]+\s*=", doc):
        found.append("a handler attribute")
    for ref in re.findall(r"\s(?:src|href|srcset|poster|action)=\"([^\"]*)\"", doc) + re.findall(r"url\(\s*['\"]?([^'\")]*)", doc):
        if not ref.startswith("data:"):
            found.append("a reference that is not data: " + ref[:40])
    bare = re.sub(r"data:[^\"')]*", "data:", doc)
    if re.search(r"https?:|//[a-z]", bare, re.I):
        found.append("an address")
    if re.search(r"gluck|kelliher", bare, re.I):
        found.append("a name")
    return found


with tempfile.TemporaryDirectory() as d:
    fresh = os.path.join(d, "figaro-404.html")
    subprocess.run([sys.executable, os.path.join(ROOT, "bin", "zanni-404"), fresh], check=True)
    assert open(fresh, encoding="utf-8").read() == html, "pages/figaro-404.html is stale: run bin/zanni-404"

assert breaches(html) == [], breaches(html)
assert len(html.encode()) < 40_000, len(html.encode())
for name, bad in [
    ("second style", html.replace("</style>", "</style><style>p{}</style>", 1)),
    ("second script", html.replace("</script>", "</script><script>1</script>", 1)),
    ("style attribute", html.replace("<main>", '<main style="color:red">', 1)),
    ("handler", html.replace('class="back"', 'class="back" onclick="history.back()"', 1)),
    ("served image", html.replace('src="data:image/png', 'src="/figaro-head.png" data-x="', 1)),
    ("font by url", html.replace("url(data:font/woff2", "url(/f.woff2) url(data:font/woff2", 1)),
    ("a host", html.replace("<title>", "<title>bootystats.kelliher.info ", 1)),
]:
    assert breaches(bad), "the contract check misses a " + name

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    pg = b.new_page()
    asked = []
    pg.on("request", lambda r: asked.append(r.url) if not r.url.startswith("data:") else None)
    pg.add_init_script("Math.random = () => 0.5")
    pg.goto("file://" + PAGE)
    pg.wait_for_load_state("load")
    assert asked == ["file://" + PAGE], asked
    bubble = pg.locator(".parla-bubble")
    start = len(LINES) // 2
    assert bubble.text_content() == LINES[start], bubble.text_content()
    bubble.click(force=True)
    assert bubble.text_content() == LINES[start + 1]
    for _ in range(len(LINES) - 1):
        bubble.click(force=True)
    assert bubble.text_content() == LINES[start], "a full round of taps comes back to the first remark"
    assert "parla-teeter" in pg.evaluate("getComputedStyle(document.querySelector('.parla-bubble')).animationName")

    calm = b.new_page(reduced_motion="reduce")
    calm.goto("file://" + PAGE)
    assert calm.evaluate("getComputedStyle(document.querySelector('.parla-bubble')).animationName") == "none"
    b.close()
print("figaro-404 ok")
