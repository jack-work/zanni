import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request

from playwright.sync_api import sync_playwright

example = os.path.abspath(sys.argv[1])
root = os.path.dirname(os.path.dirname(example))
page_url = "file://" + example

EVIL = '<img src=x onerror="window.__pwned=1">'


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
      const host = document.querySelector('#app, .placet');
      for (const n of host.querySelectorAll('script, img:not(.placet-head), iframe, object, embed, svg, style, link')) found.push('element ' + n.tagName);
      for (const n of host.querySelectorAll('*')) for (const a of n.attributes) if (/^on/i.test(a.name)) found.push('handler ' + a.name);
      if (document.body.innerText.includes('\\u202e') || document.body.innerText.includes('\\u200b')) found.push('control char lives in the text');
      return found;
    }""")


def go(pg, suffix, base=None):
    pg.goto("about:blank")
    pg.goto((base or page_url) + suffix)


with sync_playwright() as p:
    browser = p.chromium.launch(args=["--no-sandbox"])

    def fresh(scheme="light", width=390, height=844):
        ctx = browser.new_context(viewport={"width": width, "height": height}, color_scheme=scheme, is_mobile=True, has_touch=True)
        pg = ctx.new_page()
        pg.errors = []
        pg.on("pageerror", lambda e: pg.errors.append(str(e)))
        pg.on("console", lambda m: pg.errors.append(m.text) if m.type == "error" else None)
        return pg

    page = fresh()
    go(page, "?poll=150")
    page.wait_for_selector(".placet-row")

    rows = page.locator(".placet-link")
    ids = [re.sub(r"\s+", " ", t) for t in rows.all_text_contents()]
    hrefs = [rows.nth(i).get_attribute("href") for i in range(rows.count())]
    assert [h.rsplit("/", 1)[1] for h in hrefs] == ["k2m9x", "r7f3a", "q9z", "w1", "ttl4"], "soonest expiry first: " + str(hrefs)
    assert "Ministro de TV asks: role.model on Il Zanni" in ids[0]
    assert page.locator(".placet-link[data-state=ready] .placet-word").all_text_contents() == ["ready", "ready", "ready"]
    assert page.locator(".placet-link[data-state=refused] .placet-word").text_content() == "deny only"
    assert page.locator(".placet-link[data-state=applied] .placet-word").text_content() == "already applied"
    assert page.locator(".placet-state").text_content() == "Live"
    assert page.title() == "(5) Approvals"
    assert not page.errors, page.errors

    page.locator(".placet-link", has_text="figaro.model").tap()
    page.wait_for_selector(".placet-patch")
    assert page.evaluate("document.activeElement.className") == "placet-h1", "opening a request moves focus to its heading"
    lines = page.locator(".placet-line")
    assert lines.count() == 2
    assert re.sub(r"\s+", " ", lines.nth(0).inner_text()).replace("\n", " ") .startswith("SET system.model =")
    assert lines.nth(0).locator(".placet-value").text_content() == '"claude-opus-4-5"'
    assert lines.nth(0).locator(".placet-was").text_content() == '"gpt-6.1"'
    assert lines.nth(0).locator(".placet-was").evaluate("e => getComputedStyle(e).textDecorationLine") == "line-through", "current is struck, new is not"
    assert lines.nth(0).locator(".placet-value").evaluate("e => getComputedStyle(e).textDecorationLine") == "none"
    assert lines.nth(1).locator(".placet-op").text_content() == "remove" and lines.nth(1).locator(".placet-key").text_content() == "elicit.r7f3a"
    assert "closes this request" in lines.nth(1).inner_text()
    full = page.locator(".placet-full").text_content()
    assert re.fullmatch(r"[0-9a-f]{64}", full) and page.locator(".placet-hash strong").text_content() == full[:12]
    assert page.locator(".placet-quote-label").text_content() == "Filer\u2019s reason, unverified"
    assert page.locator(".placet-rawbox pre").count() == 1 and not page.locator(".placet-rawbox").evaluate("e => e.open")
    box = page.locator(".placet-actions button").first.bounding_box()
    assert box["height"] >= 48, "phone hit target"
    foot = page.locator(".placet-foot").bounding_box()
    assert abs(foot["y"] + foot["height"] - 844) < 2, "the decision bar sits at the bottom edge"

    mock_req = page.evaluate("(() => { const r = mock.find('@96447061', 'r7f3a'); return { hash: r.hash, version: r.version, token: r.token }; })()")
    page.locator("button[data-act=approve]").tap()
    page.wait_for_selector(".placet-result.placet-ok")
    assert page.locator(".placet-result").text_content().startswith("Approved.")
    posts = page.evaluate("mock.state.posts")
    assert len(posts) == 1 and posts[0]["kind"] == "approve" and posts[0]["body"] == mock_req, "one POST echoing exactly the rendered hash, version and token"
    assert page.locator(".placet-actions").count() == 0, "a decided request offers no second decision"
    page.locator(".placet-linkbutton").tap()
    page.wait_for_selector(".placet-row")
    assert page.locator(".placet-row").count() == 4

    page.locator(".placet-link", has_text="figaro.ttl").tap()
    page.wait_for_selector(".placet-patch")
    assert "Already applied: approving only removes the request." in page.locator(".placet-main").inner_text()
    page.locator("button[data-act=deny]").tap()
    page.wait_for_selector(".placet-result.placet-ok")
    assert page.locator(".placet-result").text_content().startswith("Denied.")
    assert page.evaluate("mock.state.posts.length") == 2 and page.evaluate("mock.state.posts[1].kind") == "deny"

    go(page, "?poll=150#/r/%4096447061/w1")
    page.wait_for_selector(".placet-patch")
    assert page.locator("button[data-act=approve]").count() == 0, "a refused request cannot be approved"
    assert page.locator("button[data-act=deny]").count() == 1
    assert "Approve is unavailable: unknown verb" in page.locator(".placet-result").text_content()
    assert "Deny only: unknown verb" in page.locator(".placet-refusal").text_content()

    go(page, "?poll=150#/r/%40ee927149/q9z")
    page.wait_for_selector(".placet-patch")
    assert page.locator(".placet-delta").all_text_contents() == ['4 to 8', 'adds "fanout"; removes "box"', 'closes this request']

    go(page, "?poll=150#/r/%4096447061/r7f3a")
    page.wait_for_selector(".placet-patch")
    page.evaluate("mock.bump('@96447061', 'r7f3a')")
    page.wait_for_function("document.querySelector('.placet-hash strong')")
    page.wait_for_timeout(500)
    assert page.locator(".placet-changed").count() == 0, "a busy board bumping the version is not a changed patch"
    page.locator("button[data-act=approve]").tap()
    page.wait_for_selector(".placet-result.placet-ok")
    posted = page.evaluate("mock.state.posts.at(-1).body")
    assert posted["token"].endswith("-" + str(posted["version"])) and posted["version"] == 42, "the refreshed token travels, not the one rendered at open"

    go(page, "?poll=150#/r/%4096447061/r7f3a")
    page.wait_for_selector(".placet-patch")
    page.evaluate("mock.edit('@96447061', 'r7f3a', { lines: [{ op: 'set', key: 'system.model', current: '\"gpt-6.1\"', new: '\"something-else\"' }, { op: 'remove', key: 'elicit.r7f3a' }] })")
    page.wait_for_selector(".placet-changed", timeout=5000)
    assert page.locator(".placet-changed").get_attribute("role") == "alert"
    assert page.locator(".placet-value").first.text_content() == '"something-else"', "the new patch is what is shown"
    assert page.locator("button[data-act=approve]").is_disabled(), "approval is blocked until the changed patch is acknowledged"
    assert page.locator("button[data-act=deny]").is_enabled()
    page.wait_for_timeout(600)
    assert page.locator(".placet-changed").count() == 1 and page.locator("button[data-act=approve]").is_disabled(), "polling does not clear the block"
    page.get_by_role("button", name="I have read the new patch").tap()
    assert page.locator("button[data-act=approve]").is_enabled()
    new_hash = page.evaluate("mock.find('@96447061', 'r7f3a').hash")
    page.locator("button[data-act=approve]").tap()
    page.wait_for_selector(".placet-result.placet-ok")
    assert page.evaluate("mock.state.posts.at(-1).body.hash") == new_hash

    go(page, "?poll=150#/r/%4096447061/ttl4")
    page.wait_for_selector(".placet-patch")
    page.evaluate("mock.remove('@96447061', 'ttl4')")
    page.wait_for_selector("text=This request is gone", timeout=5000)
    assert page.locator("button[data-act]").count() == 0

    go(page, "?poll=150#/r/%4096447061/w1")
    page.wait_for_selector(".placet-patch")
    page.evaluate("mock.state.down = true")
    page.wait_for_function("document.querySelector('.placet-state').textContent === 'Offline'", timeout=8000)
    assert page.locator("button[data-act=deny]").is_disabled(), "no decision while the connection is down"
    assert "last seen" in page.locator(".placet-age").text_content()
    page.evaluate("mock.state.down = false")
    page.wait_for_function("document.querySelector('.placet-state').textContent === 'Live'", timeout=12000)
    assert page.locator("button[data-act=deny]").is_enabled()

    go(page, "?poll=150")
    page.wait_for_selector(".placet-row")
    page.evaluate("mock.state.down = true")
    page.wait_for_function("document.querySelector('.placet-state').textContent === 'Offline'", timeout=8000)
    assert page.locator(".placet-rows").evaluate("e => getComputedStyle(e).opacity") == "0.55", "stale rows are greyed"
    assert page.locator(".placet-link").first.is_visible()
    page.evaluate("mock.state.down = false")

    go(page, "?poll=150#/r/%4096447061/r7f3a")
    page.wait_for_selector(".placet-patch")
    page.evaluate("mock.state.refuse = 'target version moved'")
    page.locator("button[data-act=approve]").tap()
    page.wait_for_selector(".placet-result.placet-warn")
    assert "Refused: target version moved" in page.locator(".placet-result").text_content()
    assert page.locator("button[data-act=approve]").is_enabled() or page.locator("button[data-act=approve]").count() == 1
    page.evaluate("mock.state.refuse = null")
    page.evaluate("mock.state.postStatus = 403")
    page.locator("button[data-act=approve]").tap()
    page.wait_for_selector(".placet-result.placet-warn")
    assert "stale or the session ended" in page.locator(".placet-result").text_content() and "nothing was changed" in page.locator(".placet-result").text_content()
    assert page.locator("button[data-act=approve]").is_enabled(), "after a refusal the page offers the decision again"
    page.evaluate("mock.state.postStatus = 415")
    page.locator("button[data-act=approve]").tap()
    page.wait_for_function("document.querySelector('.placet-result').textContent.startsWith('Not sent')")
    page.evaluate("mock.state.postStatus = 0")
    assert not page.errors, page.errors

    go(page, "?set=empty")
    page.wait_for_selector(".placet-empty")
    assert page.locator(".placet-empty").text_content() == "Nothing waiting."
    assert page.title() == "Approvals"

    go(page, "?poll=150")
    page.wait_for_selector(".placet-row")
    page.evaluate("mock.state.status = 502")
    page.wait_for_function("document.querySelector('.placet-state').textContent === 'Offline'", timeout=8000)
    page.evaluate("mock.state.status = 0")

    h = fresh()
    go(h, "?set=hostile&poll=150")
    h.wait_for_selector(".placet-row")
    assert hostile_findings(h) == [], hostile_findings(h)
    h.locator(".placet-link").first.tap()
    h.wait_for_selector(".placet-patch")
    assert hostile_findings(h) == [], hostile_findings(h)
    h.locator(".placet-rawbox summary").tap()
    text = h.locator(".placet-main").inner_text()
    assert EVIL in text, "the filer's markup is shown as text"
    assert "U+202E" in text and "U+200B" in text and "U+0000" in text, "control characters are named, not obeyed"
    assert h.evaluate("document.documentElement.scrollWidth") <= 390 and h.evaluate("document.body.scrollWidth") <= 390, "hostile 6000 character text does not widen the page"
    h.locator("button[data-act=approve]").tap()
    h.wait_for_selector(".placet-result.placet-ok")
    go(h, "?set=hostile&poll=150#/r/%4096447061/h2")
    h.wait_for_selector(".placet-refusal")
    assert hostile_findings(h) == [], hostile_findings(h)
    assert EVIL in h.locator(".placet-refusal").inner_text() and EVIL in h.locator(".placet-result").inner_text()
    h.evaluate("mock.state.refuse = " + json.dumps(EVIL))
    h.evaluate("mock.add(placetMock.seal({ filing: '@96447061', id: 'h3', verb: 'figaro.ttl', target: '', expires: new Date(Date.now()+3600000).toISOString(), version: 1, lines: [{ op: 'remove', key: 'elicit.h3' }], reason: '', applied: false, at_succession: false }))")
    go(h, "?set=hostile&poll=150#/r/%4096447061/h1")
    h.wait_for_selector(".placet-patch")
    h.evaluate("mock.state.refuse = " + json.dumps(EVIL))
    h.locator("button[data-act=approve]").tap()
    h.wait_for_selector(".placet-result.placet-warn")
    assert EVIL in h.locator(".placet-result").inner_text(), "a server error string is text too"
    assert hostile_findings(h) == [], hostile_findings(h)

    for width in (320, 360):
        n = fresh(width=width, height=700)
        go(n, "?set=hostile&poll=150#/r/%4096447061/h1")
        n.wait_for_selector(".placet-patch")
        assert n.evaluate("document.documentElement.scrollWidth") <= width, "no sideways scroll at %d" % width
        n.close()

    for scheme in ("light", "dark"):
        c = fresh(scheme)
        go(c, "?poll=150")
        c.wait_for_selector(".placet-row")
        rgb = lambda s: [int(float(x)) for x in re.findall(r"[\d.]+", s)[:3]]
        ground = rgb(c.evaluate("getComputedStyle(document.querySelector('.placet')).backgroundColor"))
        checks = {
            "sentence": ".placet-sentence", "meta": ".placet-meta", "ready": ".placet-link[data-state=ready] .placet-word",
            "applied": ".placet-link[data-state=applied] .placet-word", "soon": ".placet-expiry.placet-soon",
        }
        for name, sel in checks.items():
            ratio = contrast(rgb(c.evaluate("s => getComputedStyle(document.querySelector(s)).color", sel)), ground)
            assert ratio >= 4.5, "%s %s contrast %.2f" % (scheme, name, ratio)
        refused = c.locator(".placet-link[data-state=refused]")
        col = rgb(refused.locator(".placet-word").evaluate("e => getComputedStyle(e).color"))
        op = float(refused.evaluate("e => getComputedStyle(e).opacity"))
        blended = [round(ground[i] + (col[i] - ground[i]) * op) for i in range(3)]
        assert contrast(blended, ground) >= 3, "%s muted deny-only word %.2f" % (scheme, contrast(blended, ground))
        c.locator(".placet-link", has_text="figaro.model").tap()
        c.wait_for_selector(".placet-patch")
        foot_bg = rgb(c.evaluate("getComputedStyle(document.querySelector('.placet-foot')).backgroundColor"))
        ap = c.locator(".placet-approve")
        assert contrast(rgb(ap.evaluate("e => getComputedStyle(e).color")), rgb(ap.evaluate("e => getComputedStyle(e).backgroundColor"))) >= 4.5, scheme + " approve"
        dn = c.locator(".placet-deny")
        assert contrast(rgb(dn.evaluate("e => getComputedStyle(e).color")), foot_bg) >= 4.5, scheme + " deny"
        for sel in (".placet-was", ".placet-quote-label", ".placet-facts"):
            assert contrast(rgb(c.evaluate("s => getComputedStyle(document.querySelector(s)).color", sel)), ground) >= 4.5, scheme + " " + sel
        c.close()

    tmp = tempfile.mkdtemp(prefix="placet-sabotage-")
    try:
        shutil.copytree(os.path.join(root, "assets"), os.path.join(tmp, "assets"))
        shutil.copytree(os.path.join(root, "examples"), os.path.join(tmp, "examples"))
        target = os.path.join(tmp, "assets/placet/placet.js")
        src = open(target).read()
        needle = "n.appendChild(doc.createTextNode(p.plain))"
        assert src.count(needle) == 1, "the one text sink is still where the sabotage expects it"
        open(target, "w").write(src.replace(needle, "n.insertAdjacentHTML('beforeend', p.plain)"))
        s = fresh()
        s.goto("file://" + os.path.join(tmp, "examples/placet.html") + "?set=hostile&poll=150")
        s.wait_for_selector(".placet-row")
        s.wait_for_timeout(300)
        assert hostile_findings(s) != [], "negative control: with the text sink swapped for HTML the hostile check must fire"
        s.close()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    bundle = tempfile.mkdtemp(prefix="placet-bundle-")
    server = None
    try:
        subprocess.run([os.path.join(root, "bin/placet-bundle"), bundle], check=True, capture_output=True)
        server = subprocess.Popen(["node", os.path.join(root, "test/placet-server.js"), bundle], stdout=subprocess.PIPE, text=True)
        port = int(server.stdout.readline())
        origin = "http://127.0.0.1:%d" % port
        csp = fresh()
        violations = []
        csp.on("console", lambda m: violations.append(m.text) if "Content Security Policy" in m.text or "Refused to" in m.text else None)
        csp.add_init_script("document.addEventListener('securitypolicyviolation', e => (window.__csp = window.__csp || []).push(e.violatedDirective))")
        csp.goto(origin + "/app/")
        csp.wait_for_selector(".placet-row")
        assert csp.evaluate("window.__csp || []") == [] and not violations, (csp.evaluate("window.__csp"), violations)
        assert csp.evaluate("document.fonts.check('16px Inter')"), "Inter loads from the bundle under font-src self"
        assert csp.locator(".placet-head").evaluate("e => e.naturalWidth") > 0, "the mark loads under img-src self"
        csp.locator(".placet-link", has_text="figaro.model").tap()
        csp.wait_for_selector(".placet-patch")
        csp.locator("button[data-act=approve]").tap()
        csp.wait_for_selector(".placet-result.placet-ok")
        posts = json.loads(urllib.request.urlopen(origin + "/__posts").read())
        assert len(posts) == 1 and posts[0]["kind"] == "approve", posts
        assert csp.evaluate("window.__csp || []") == []
        csp.close()
    finally:
        if server:
            server.terminate()
        shutil.rmtree(bundle, ignore_errors=True)

    browser.close()

print("placet: list, detail, decide, changed baseline, offline, hostile text, contrast, sabotage and CSP pass")
