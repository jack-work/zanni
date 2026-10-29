"""The grants page in a real browser against the fixture backend, with a
virtual passkey: answering per item, narrowing, widening through spain's own
suggestions, the seal sheet printing spain's lines verbatim with every signed
field, a stale review, revoke, deny all, requester text kept as text, the
edge's name and not the requester's, a strict CSP with no violations, and a
phone width that never scrolls sideways."""
import json
import os
import re
import sys
import urllib.error
import urllib.request

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import grants_fixture  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS = ["examples/grants/grants.js", "assets/licenza/licenza.js",
           "assets/clessidra/clessidra.js", "assets/sigillo/sigillo.js"]

httpd, store = grants_fixture.serve()
BASE = store.origin


def post(path, body=None):
    req = urllib.request.Request(BASE + path, data=json.dumps(body or {}).encode(), method="POST",
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def card(pg, item):
    return pg.locator(f".g-items > .licenza[data-item='{item}']").first


def choose(pg, item, label):
    card(pg, item).locator(".licenza-choice", has_text=re.compile(f"^{re.escape(label)}$")).click()


def text(pg, sel):
    return pg.locator(sel).first.inner_text()


for path in SCRIPTS:
    with open(os.path.join(ROOT, path)) as f:
        src = f.read()
    for bad in ("innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval(", "new Function"):
        assert bad not in src, f"{path} writes markup or code from a string: {bad}"

status, body = post("/api/requests/r-80c2/review", {"items": [{"item_id": "i-1", "verdict": "yes", "duration_s": 3600, "actions": ["write"]}]})
assert status == 400 and "actions" in body["error"], f"spain refuses a widened action, got {status} {body}"
status, body = post("/api/requests/r-80c2/review", {"items": [{"item_id": "i-1", "verdict": "yes", "duration_s": 604800}]})
assert status == 400, f"spain refuses a length past the catalog's cap, got {status} {body}"
status, body = post("/api/requests/r-80c2/review", {"items": [{"item_id": "i-1", "verdict": "yes", "duration_s": 3600}], "extra": [{"suggestion_id": "s-9", "verdict": "yes", "duration_s": 900}]})
assert status == 400, f"spain refuses an extra it never suggested, got {status} {body}"

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True)
    pg = ctx.new_page()
    errors, csp = [], []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: csp.append(m.text) if "Content Security Policy" in m.text else None)

    cdp = ctx.new_cdp_session(pg)
    cdp.send("WebAuthn.enable")
    cdp.send("WebAuthn.addVirtualAuthenticator", {"options": {
        "protocol": "ctap2", "transport": "internal", "hasResidentKey": True,
        "hasUserVerification": True, "isUserVerified": True, "automaticPresenceSimulation": True}})

    resp = pg.goto(BASE + "/r/r-7f3a19")
    assert "script-src 'self'" in resp.headers["content-security-policy"]
    pg.wait_for_selector(".g-live")
    pg.evaluate("""() => navigator.credentials.create({ publicKey: {
        challenge: new Uint8Array(32), rp: { id: 'localhost', name: 'grants' },
        user: { id: new Uint8Array([1]), name: 'gluck', displayName: 'gluck' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' } } })""")

    assert text(pg, ".g-name") == "box0", "the name shown is the edge's"
    assert "Gluck's own laptop" not in pg.inner_text("body"), "a name the requester chose is never shown"
    assert text(pg, "#pending-chip") == "3 pending"
    assert pg.locator(".g-items > .licenza").count() == 4, "three asked, one suggested"
    assert card(pg, "i-3").locator(".licenza-choice").all_inner_texts() == ["no", "15m", "1h"], "lengths stop at the item's cap"
    review = pg.locator(".g-review")
    assert review.is_disabled() and review.inner_text() == "review 0 of 3", "nothing is chosen for Gluck"

    card(pg, "i-1").locator(".licenza-choice").first.focus()
    pg.keyboard.press("ArrowRight")
    assert card(pg, "i-1").locator("[aria-checked='true']").inner_text() == "15m", "arrows move the answer"
    widen = card(pg, "i-1").locator(".licenza-widen")
    assert widen.is_visible(), "widen opens under a yes"
    choose(pg, "i-1", "1h")
    widen.locator("input").check()
    choose(pg, "i-2", "1d")
    card(pg, "i-3").locator("button.licenza-chip", has_text="draft").click()
    choose(pg, "i-3", "15m")
    assert review.inner_text() == "review 3 of 3" and review.is_enabled()

    card(pg, "s-2").locator(".licenza-add").click()
    assert review.inner_text() == "review 3 of 4" and review.is_disabled(), "an added suggestion needs its own answer"
    choose(pg, "s-2", "1d")

    with pg.expect_response(lambda r: r.url.endswith("/review")) as rr:
        review.click()
    sent = json.loads(rr.value.request.post_data)
    got = rr.value.json()
    assert sent["items"][2]["actions"] == ["send"], f"narrowed actions reach spain, got {sent['items'][2]}"
    assert {e["suggestion_id"] for e in sent["extra"]} == {"s-1", "s-2"}, f"widening travels as spain's suggestions, got {sent['extra']}"

    sheet = pg.locator("dialog.sigillo")
    sheet.wait_for()
    assert sheet.evaluate("d => d.scrollTop") == 0 and pg.evaluate("document.activeElement.className") == "sigillo-receipt", "the sheet opens on the receipt, not on the seal"
    shown = sheet.locator(".sigillo-line").all_text_contents()
    assert shown == got["receipt_lines"], "the sheet prints spain's lines verbatim"
    payload = store.s["reviews"][got["review_id"]]["payload"]
    receipt = "\n".join(shown)
    must = [payload["request_id"], payload["principal"], payload["nonce"], payload["issued_at"]]
    for it in payload["items"]:
        must += [it["item_id"], it["type"], it["resource"], it["path"], " ".join(it["actions"]), it["verdict"]]
        if it["expires_at"]:
            must.append(it["expires_at"])
    missing = [m for m in must if m not in receipt]
    assert not missing, f"every signed field is on the sheet, missing {missing}"
    assert text(pg, ".sigillo-digest-value") == got["digest"]

    sheet.locator(".sigillo-seal").click()
    pg.wait_for_selector(".g-banner")
    assert text(pg, ".g-banner") == "sealed r-7f3a19"
    assert store.s["requests"]["r-7f3a19"]["state"] == "decided"
    assert len(store.s["sealed"]) == 1
    assert pg.locator(".g-live").count() == 7, "two live before, five yeses after"
    assert text(pg, "#pending-chip") == "2 pending"
    assert pg.locator("dialog").count() == 0 and "sigillo-open" not in pg.evaluate("document.documentElement.className")

    dial = pg.locator(".g-live[data-grant='g-zanni'] .clessidra")
    assert dial.inner_text() == "4m", f"the dial reads spain's remaining time, got {dial.inner_text()}"
    f = float(dial.evaluate("d => d.style.getPropertyValue('--clessidra-f')"))
    assert 0.05 < f < 0.08, f"the dial's fill is the remaining fraction, got {f}"
    assert dial.get_attribute("aria-label") == "4 minutes left"
    before = dial.evaluate("d => d.style.getPropertyValue('--clessidra-f')")
    pg.wait_for_timeout(1100)
    assert dial.evaluate("d => d.style.getPropertyValue('--clessidra-f')") != before, "the dial counts down in place"

    pg.locator(".g-live[data-grant='g-aws'] .g-button").click()
    sheet.wait_for()
    assert text(pg, ".sigillo-title") == "You are about to revoke"
    assert any("g-aws" in l for l in sheet.locator(".sigillo-line").all_text_contents())
    sheet.locator(".sigillo-seal").click()
    pg.wait_for_selector(".g-banner:has-text('revoked')")
    assert pg.locator(".g-live[data-grant='g-aws']").count() == 0 and "g-aws" not in store.s["grants"]

    pg.goto(BASE + "/r/r-80c2")
    pg.wait_for_selector(".g-live")
    assert text(pg, ".g-note") == "box0 says <b>trust me</b>", "the requester's note stays text"
    assert pg.locator(".g-note b").count() == 1
    assert "<script>alert(1)</script>" in text(pg, ".licenza-why")
    assert pg.locator("script").count() == 5, "no script arrives with the requester's words"
    choose(pg, "i-1", "1h")
    pg.locator(".g-review").click()
    sheet.wait_for()
    post("/api/_fixture/age")
    sheet.locator(".sigillo-seal").click()
    pg.wait_for_selector(".sigillo-error:not([hidden])")
    assert "stale" in text(pg, ".sigillo-error") and text(pg, ".sigillo-seal") == "try again"
    assert store.s["requests"]["r-80c2"]["state"] == "pending", "a stale seal approves nothing"
    sheet.locator(".sigillo-back").click()
    pg.locator(".g-review").click()
    sheet.wait_for()
    sheet.locator(".sigillo-seal").click()
    pg.wait_for_selector(".g-banner")
    assert store.s["requests"]["r-80c2"]["state"] == "decided"

    pg.goto(BASE + "/r/r-80c9")
    pg.wait_for_selector(".g-live")
    live = pg.locator(".g-live").count()
    pg.locator(".g-foot .g-button", has_text="deny all").click()
    assert text(pg, ".g-review") == "review 1 of 1"
    pg.locator(".g-review").click()
    sheet.wait_for()
    assert any(l.strip().startswith("expires_at never") for l in sheet.locator(".sigillo-line").all_text_contents())
    sheet.locator(".sigillo-seal").click()
    pg.wait_for_selector(".g-banner")
    assert pg.locator(".g-live").count() == live, "deny all grants nothing"
    assert pg.locator("#pending-chip").is_hidden(), "nothing pending, no chip"

    for path in ("/r/r-7f3a19", "/p/sandbox:box0@grants"):
        pg.goto(BASE + path)
        pg.wait_for_selector(".g-live, .g-quiet")
        wide = pg.evaluate("document.documentElement.scrollWidth - innerWidth")
        assert wide <= 0, f"{path} never scrolls sideways on a phone, overflow {wide}px"

    assert not errors, errors
    assert not csp, f"the page runs under its CSP with no violation: {csp}"
    b.close()

httpd.shutdown()
print("grants: ok")
